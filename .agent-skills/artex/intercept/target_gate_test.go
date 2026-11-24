package intercept

import (
	"context"
	"errors"
	"fmt"
	"net/netip"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// fakeStore is the gate's store without a database. approve and revoke do what
// the decide endpoint and the revoke route do to the pins.
type fakeStore struct {
	mu     sync.Mutex
	rules  []db.AssetInterceptRule
	pins   []*db.TargetPin
	exempt []db.TargetExemption
	fail   map[string]error // by method name
	reads  int
	logged []db.TargetDecision
}

func (s *fakeStore) read(method string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reads++
	return s.fail[method]
}

func (s *fakeStore) BlockRules(db.TargetScopeRef) ([]db.AssetInterceptRule, error) {
	return s.rules, s.read("BlockRules")
}

func (s *fakeStore) ActivePins(_ db.TargetScopeRef, host string, port int) ([]*db.TargetPin, error) {
	if err := s.read("ActivePins"); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []*db.TargetPin
	for _, p := range s.pins {
		if p.Status == db.TargetPinActive && p.Host == host && (p.Port == port || p.Port == 0) {
			out = append(out, p)
		}
	}
	slices.SortFunc(out, func(a, b *db.TargetPin) int { return b.Port - a.Port })
	return out, nil
}

func (s *fakeStore) Exemptions() ([]db.TargetExemption, string, error) {
	return s.exempt, fmt.Sprintf("digest-%d", len(s.exempt)), s.read("Exemptions")
}

func (s *fakeStore) LogDecision(r db.TargetDecision) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logged = append(s.logged, r)
	return nil
}

// approve pins what the request displays: a new version that holds the
// addresses of the active pin of the key plus the displayed ones.
func (s *fakeStore) approve(r TargetRequest) *db.TargetPin {
	s.mu.Lock()
	defer s.mu.Unlock()
	pin := &db.TargetPin{ID: int64(len(s.pins) + 1), Host: r.Host, Port: r.Port, Version: 1, Status: db.TargetPinActive,
		PinnedIPs: slices.Clone(r.ResolvedIPs)}
	for _, p := range s.pins {
		if p.Host != r.Host || p.Port != r.Port {
			continue
		}
		pin.Version++
		if p.Status == db.TargetPinActive {
			p.Status = db.TargetPinSuperseded
			pin.PinnedIPs = append(pin.PinnedIPs, p.PinnedIPs...)
		}
	}
	slices.Sort(pin.PinnedIPs)
	pin.PinnedIPs = slices.Compact(pin.PinnedIPs)
	s.pins = append(s.pins, pin)
	return pin
}

func (s *fakeStore) revoke(host string, port int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.pins {
		if p.Host == host && p.Port == port && p.Status == db.TargetPinActive {
			p.Status = db.TargetPinRevoked
		}
	}
}

func (s *fakeStore) active(host string, port int) *db.TargetPin {
	pins, _ := s.ActivePins(db.TargetScopeRef{}, host, port)
	for _, p := range pins {
		if p.Port == port {
			return p
		}
	}
	return nil
}

// outcomes returns the outcome of the first target of every logged row.
func (s *fakeStore) outcomes() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []string
	for _, r := range s.logged {
		out = append(out, r.Status+"/"+r.Audit.Targets[0].Outcome)
	}
	return out
}

// fakeResolver answers from a table and counts the lookups per host.
type fakeResolver struct {
	mu      sync.Mutex
	answers map[string][]string
	errs    map[string]error
	calls   map[string]int
	hold    chan struct{} // when set, a lookup waits until it is closed
}

func newFakeResolver() *fakeResolver {
	return &fakeResolver{answers: map[string][]string{}, errs: map[string]error{}, calls: map[string]int{}}
}

func (r *fakeResolver) Name() string { return "fake" }

func (r *fakeResolver) LookupIPs(ctx context.Context, host string) ([]netip.Addr, error) {
	r.mu.Lock()
	r.calls[host]++
	hold, err := r.hold, r.errs[host]
	ips := r.answers[host]
	r.mu.Unlock()
	if hold != nil {
		select {
		case <-hold:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	if err != nil {
		return nil, err
	}
	out := make([]netip.Addr, len(ips))
	for n, ip := range ips {
		out[n] = netip.MustParseAddr(ip)
	}
	return out, nil
}

func (r *fakeResolver) set(host string, ips ...string) {
	r.mu.Lock()
	r.answers[host] = ips
	delete(r.errs, host)
	r.mu.Unlock()
}

func (r *fakeResolver) lookups(host string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.calls[host]
}

func (r *fakeResolver) total() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, c := range r.calls {
		n += c
	}
	return n
}

// gateFixture is a gate with a fake store, a fake resolver and a clock.
type gateFixture struct {
	t     *testing.T
	ic    *Interceptor
	store *fakeStore
	res   *fakeResolver
	clock time.Time
	scope TargetScope
}

func newGate(t *testing.T) *gateFixture {
	t.Helper()
	g := &gateFixture{t: t, ic: New(nil), store: &fakeStore{fail: map[string]error{}}, res: newFakeResolver(), clock: time.Now().UTC()}
	g.ic.targets = g.store
	g.ic.SetResolver(g.res)
	g.ic.resolve.now = func() time.Time { return g.clock }
	g.scope = TargetScope{TaskID: "7", Enabled: func() bool { return true }, WaitBound: time.Minute, Interceptor: g.ic}
	return g
}

// expire lets every cached answer run out.
func (g *gateFixture) expire() { g.clock = g.clock.Add(resolveCacheTTL + time.Second) }

// verdict is what CheckTargets returned for one call.
type verdict struct {
	reqs []TargetRequest
	res  TargetResult
}

func (g *gateFixture) check(tool, input string) verdict {
	reqs, res := g.ic.CheckTargets(context.Background(), g.scope, tool, []byte(input))
	return verdict{reqs, res}
}

func (g *gateFixture) fetch(url string) verdict {
	return g.check("WebFetch", `{"url":"`+url+`"}`)
}

// passes asserts that the call may run: no block and nothing to request.
func (g *gateFixture) passes(what string, v verdict) {
	g.t.Helper()
	reqs, res := v.reqs, v.res
	if res.Code != "" || len(reqs) != 0 {
		g.t.Fatalf("%s: requests=%+v result=%+v, want the call to pass", what, reqs, res)
	}
}

// requests asserts that the call is not blocked and needs exactly one approval.
func (g *gateFixture) requests(what string, v verdict) TargetRequest {
	g.t.Helper()
	reqs, res := v.reqs, v.res
	if res.Code != "" || len(reqs) != 1 {
		g.t.Fatalf("%s: requests=%+v result=%+v, want one request and no block", what, reqs, res)
	}
	return reqs[0]
}

// blocked asserts a block with code that opens no request.
func (g *gateFixture) blocked(what, code string, v verdict) TargetResult {
	g.t.Helper()
	reqs, res := v.reqs, v.res
	if res.Code != code || len(reqs) != 0 {
		g.t.Fatalf("%s: requests=%+v result=%+v, want a block with %s and no request", what, reqs, res, code)
	}
	return res
}

const appURL = "https://app.example.com/login"

// With the gate off nothing is looked up, read or written. The interceptor of
// the second half has no database: a read through it would panic.
func TestGateOffTouchesNothing(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	bare := New(nil)
	for name, scope := range map[string]TargetScope{
		"no flag":  {TaskID: "7", WaitBound: time.Minute},
		"flag off": {TaskID: "7", Enabled: func() bool { return false }, WaitBound: time.Minute},
		"no scope": {},
	} {
		for _, ic := range []*Interceptor{g.ic, bare} {
			reqs, res := ic.CheckTargets(context.Background(), scope, "WebFetch", []byte(`{"url":"`+appURL+`"}`))
			if len(reqs) != 0 || res != (TargetResult{}) {
				t.Errorf("%s: requests=%+v result=%+v, want nothing", name, reqs, res)
			}
		}
	}
	if g.store.reads != 0 || len(g.store.logged) != 0 || g.res.total() != 0 {
		t.Errorf("gate off: %d store reads, %d rows, %d lookups, want none", g.store.reads, len(g.store.logged), g.res.total())
	}
	// A gated call without a target stops after the extraction.
	g.passes("no target", g.check("Bash", `{"command":"ls -la"}`))
	if g.store.reads != 0 || g.res.total() != 0 {
		t.Errorf("call without a target: %d store reads, %d lookups, want none", g.store.reads, g.res.total())
	}
}

func TestGateStateMachine(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")

	// No pin: a request for the addresses that were resolved.
	req := g.requests("no pin", g.fetch(appURL))
	if req.Host != "app.example.com" || req.Port != 443 || req.Kind != TargetDomain || req.Reason != "no_pin" || req.Pin != nil ||
		!slices.Equal(req.ResolvedIPs, []string{"203.0.113.7"}) || req.Resolver != "fake" || req.ResolvedAt.IsZero() {
		t.Fatalf("first request = %+v", req)
	}
	// A request alone pins nothing: the next call asks again.
	g.requests("still no pin", g.fetch(appURL))

	// Approved: version 1, and the call passes.
	if pin := g.store.approve(req); pin.Version != 1 {
		t.Fatalf("pin = %+v, want version 1", pin)
	}
	g.passes("pinned", g.fetch(appURL))

	// A new address: a request with reason new_ip that names the pin to extend.
	g.res.set("app.example.com", "203.0.113.7", "203.0.113.8")
	g.expire()
	req = g.requests("new address", g.fetch(appURL))
	if req.Reason != "new_ip" || req.Pin == nil || req.Pin.Version != 1 || !slices.Equal(req.ResolvedIPs, []string{"203.0.113.7", "203.0.113.8"}) {
		t.Fatalf("new_ip request = %+v", req)
	}

	// Approved: version 2 holds the old addresses and the new one.
	if pin := g.store.approve(req); pin.Version != 2 || !slices.Equal(pin.PinnedIPs, []string{"203.0.113.7", "203.0.113.8"}) {
		t.Fatalf("pin = %+v, want version 2 with both addresses", pin)
	}
	g.passes("extended pin", g.fetch(appURL))

	// A subset of the pinned addresses passes.
	g.res.set("app.example.com", "203.0.113.8")
	g.expire()
	g.passes("subset", g.fetch(appURL))

	// An IP literal is never resolved: the address is the literal.
	req = g.requests("IP literal", g.fetch("http://198.51.100.9:8080/"))
	if req.Kind != TargetIP || req.Host != "198.51.100.9" || req.Port != 8080 || !slices.Equal(req.ResolvedIPs, []string{"198.51.100.9"}) || req.Resolver != literalResolver {
		t.Fatalf("literal request = %+v", req)
	}
	g.store.approve(req)
	g.passes("pinned literal", g.fetch("http://198.51.100.9:8080/"))
	req = g.requests("CIDR", g.check("Bash", `{"command":"nmap 198.51.100.0/24"}`))
	if req.Kind != TargetCIDR || req.Host != "198.51.100.0/24" || !slices.Equal(req.ResolvedIPs, []string{"198.51.100.0/24"}) {
		t.Fatalf("CIDR request = %+v", req)
	}
	if n := g.res.lookups("198.51.100.9") + g.res.lookups("198.51.100.0/24"); n != 0 {
		t.Fatalf("%d lookups for an IP literal and a CIDR, want none", n)
	}

	// Revoked: the host asks again, from version 1's successor.
	g.store.revoke("app.example.com", 443)
	req = g.requests("revoked", g.fetch(appURL))
	if req.Reason != "no_pin" || req.Pin != nil {
		t.Fatalf("request after the revocation = %+v", req)
	}
	if pin := g.store.approve(req); pin.Version != 3 || !slices.Equal(pin.PinnedIPs, []string{"203.0.113.8"}) {
		t.Fatalf("pin after the revocation = %+v, want version 3 with the current address only", pin)
	}
}

func TestSubset(t *testing.T) {
	cases := []struct {
		name             string
		resolved, pinned []string
		want             bool
	}{
		{"equal", []string{"203.0.113.7"}, []string{"203.0.113.7"}, true},
		{"subset", []string{"203.0.113.7"}, []string{"203.0.113.7", "203.0.113.8"}, true},
		{"superset", []string{"203.0.113.7", "203.0.113.8"}, []string{"203.0.113.7"}, false},
		{"disjoint", []string{"203.0.113.9"}, []string{"203.0.113.7"}, false},
		{"mixed families, all pinned", []string{"203.0.113.7", "2001:db8::7"}, []string{"2001:db8::7", "203.0.113.7"}, true},
		{"mixed families, one family pinned", []string{"203.0.113.7", "2001:db8::7"}, []string{"203.0.113.7"}, false},
		{"empty answer", nil, []string{"203.0.113.7"}, false},
		{"empty answer, empty pin", nil, nil, false},
		{"empty pin", []string{"203.0.113.7"}, nil, false},
	}
	for _, c := range cases {
		if got := subset(c.resolved, c.pinned); got != c.want {
			t.Errorf("%s: subset(%v, %v) = %v, want %v", c.name, c.resolved, c.pinned, got, c.want)
		}
	}
}

// A name that does not resolve blocks the call, pinned or not, and opens no
// request: there is no address to show, and nothing an approval could pin.
func TestResolveFailureBlocksWithoutRequest(t *testing.T) {
	g := newGate(t)
	g.res.errs["app.example.com"] = errors.New("no such host")
	res := g.blocked("lookup error", TargetResolveFailed, g.fetch(appURL))
	if res.Host != "app.example.com" || res.Port != 443 || !strings.Contains(res.Reason, "could not resolve app.example.com (no such host)") {
		t.Fatalf("result = %+v", res)
	}

	// An empty answer is a failure too.
	g.res.set("app.example.com")
	res = g.blocked("empty answer", TargetResolveFailed, g.fetch(appURL))
	if !strings.Contains(res.Reason, "no address") {
		t.Fatalf("empty answer: reason = %q", res.Reason)
	}

	// With a pin the failure still blocks, and the text names the pin.
	g.res.set("app.example.com", "203.0.113.7")
	g.store.approve(g.requests("resolves again", g.fetch(appURL)))
	g.passes("pinned", g.fetch(appURL))
	g.res.errs["app.example.com"] = context.DeadlineExceeded
	g.expire()
	res = g.blocked("pinned host", TargetResolveFailed, g.fetch(appURL))
	if !strings.Contains(res.Reason, "approved pin (v1: 203.0.113.7)") {
		t.Fatalf("pinned host: reason = %q", res.Reason)
	}

	// Every block is a decided row: denied by the system, outcome resolve_failed.
	want := []string{"denied/resolve_failed", "denied/resolve_failed", "allowed/pin_match", "denied/resolve_failed"}
	if got := g.store.outcomes(); !slices.Equal(got, want) {
		t.Fatalf("logged rows = %v, want %v", got, want)
	}
	if row := g.store.logged[0]; !strings.HasPrefix(row.Reason, TargetResolveFailed+": ") || row.Audit.EffectiveAction != "deny" ||
		row.Audit.ExecutionStatus != "not_executed" || row.ToolName != "WebFetch" || row.Scope.TaskID != 7 {
		t.Fatalf("logged row = %+v audit=%+v", row, row.Audit)
	}
	// A request without an address is refused before any row is written (the
	// interceptor has no database: a write would panic).
	out := g.ic.RequestTargets(context.Background(), g.scope, "WebFetch", []byte(`{"url":"`+appURL+`"}`),
		[]TargetRequest{{Host: "app.example.com", Port: 443, Kind: TargetDomain, Reason: "no_pin"}}, nil)
	if out.Code != TargetResolveFailed || out.PendingID != 0 {
		t.Fatalf("request without an address: %+v, want %s and no row", out, TargetResolveFailed)
	}
}

func TestResolverCacheTTLAndCollapse(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.res.set("other.example.com", "203.0.113.9")
	cache := g.ic.resolve

	// Concurrent lookups for one host collapse into one.
	g.res.hold = make(chan struct{})
	var wg sync.WaitGroup
	for n := 0; n < 8; n++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if res, err := cache.lookup(context.Background(), "app.example.com", false); err != nil || !slices.Equal(res.ips, []string{"203.0.113.7"}) {
				t.Errorf("lookup = %+v, %v", res, err)
			}
		}()
	}
	eventually(t, "the shared lookup", func() bool { return g.res.lookups("app.example.com") == 1 })
	time.Sleep(20 * time.Millisecond)
	close(g.res.hold)
	wg.Wait()
	g.res.mu.Lock()
	g.res.hold = nil
	g.res.mu.Unlock()
	if n := g.res.lookups("app.example.com"); n != 1 {
		t.Fatalf("%d lookups for 8 concurrent calls, want 1", n)
	}

	// Within the TTL the answer is reused, per host.
	g.res.set("app.example.com", "203.0.113.8")
	g.clock = g.clock.Add(resolveCacheTTL - time.Second)
	if res, _ := cache.lookup(context.Background(), "app.example.com", false); !slices.Equal(res.ips, []string{"203.0.113.7"}) {
		t.Fatalf("within the TTL: %v, want the cached answer", res.ips)
	}
	if _, err := cache.lookup(context.Background(), "other.example.com", false); err != nil || g.res.lookups("other.example.com") != 1 {
		t.Fatalf("another host must have its own lookup: err=%v lookups=%d", err, g.res.lookups("other.example.com"))
	}
	// After the TTL it is resolved again.
	g.clock = g.clock.Add(2 * time.Second)
	if res, _ := cache.lookup(context.Background(), "app.example.com", false); !slices.Equal(res.ips, []string{"203.0.113.8"}) || g.res.lookups("app.example.com") != 2 {
		t.Fatalf("after the TTL: %v after %d lookups, want the new answer from a second lookup", res.ips, g.res.lookups("app.example.com"))
	}
	// Answers are canonical: unmapped, sorted, unique.
	g.res.set("mapped.example.com", "::ffff:203.0.113.7", "2001:db8::1", "203.0.113.7")
	if res, _ := cache.lookup(context.Background(), "mapped.example.com", false); !slices.Equal(res.ips, []string{"2001:db8::1", "203.0.113.7"}) {
		t.Fatalf("canonical answer = %v", res.ips)
	}
}

func TestResolverNeverCachesFailure(t *testing.T) {
	g := newGate(t)
	cache := g.ic.resolve
	g.res.errs["app.example.com"] = errors.New("server misbehaving")
	for n := 1; n <= 2; n++ {
		if _, err := cache.lookup(context.Background(), "app.example.com", false); err == nil || g.res.lookups("app.example.com") != n {
			t.Fatalf("failing lookup %d: err=%v lookups=%d", n, err, g.res.lookups("app.example.com"))
		}
	}
	// An empty answer is not kept either.
	g.res.set("app.example.com")
	for n := 3; n <= 4; n++ {
		if _, err := cache.lookup(context.Background(), "app.example.com", false); err == nil || g.res.lookups("app.example.com") != n {
			t.Fatalf("empty lookup %d: err=%v lookups=%d", n, err, g.res.lookups("app.example.com"))
		}
	}
	// The next call gets the answer as soon as there is one.
	g.res.set("app.example.com", "203.0.113.7")
	if res, err := cache.lookup(context.Background(), "app.example.com", false); err != nil || !slices.Equal(res.ips, []string{"203.0.113.7"}) {
		t.Fatalf("after the failure: %v, %v", res.ips, err)
	}
	// A lookup that does not answer in time is a failure, and is not kept.
	g.res.hold = make(chan struct{})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := cache.lookup(ctx, "slow.example.com", false); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("slow lookup: err=%v, want the caller's deadline", err)
	}
	close(g.res.hold)
}

// The addresses of a new request are resolved when it is raised, never taken
// from the cache: a human reads and pins them.
func TestRequestCreationResolvesFresh(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.store.approve(g.requests("first", g.fetch(appURL)))
	g.passes("pinned", g.fetch(appURL))
	before := g.res.lookups("app.example.com")

	// Within the TTL the pinned host is checked against the cached answer.
	g.res.set("app.example.com", "203.0.113.7")
	g.passes("cached", g.fetch(appURL))
	if n := g.res.lookups("app.example.com"); n != before {
		t.Fatalf("%d lookups, want the cached answer (%d)", n, before)
	}

	// The cache still says .7; the name now answers .9. Another port of the host
	// has no pin, so a request is raised, and it shows what the name answers now.
	g.res.set("app.example.com", "203.0.113.9")
	req := g.requests("unpinned port", g.fetch("https://app.example.com:8443/"))
	if !slices.Equal(req.ResolvedIPs, []string{"203.0.113.9"}) {
		t.Fatalf("request shows %v, want the fresh answer 203.0.113.9", req.ResolvedIPs)
	}
	if n := g.res.lookups("app.example.com"); n != before+1 {
		t.Fatalf("%d lookups, want one fresh lookup for the request (%d)", n, before+1)
	}
	// A cached answer that no pin covers is checked again before asking: when
	// the fresh answer is pinned, nothing is requested.
	g.res.set("app.example.com", "203.0.113.7")
	g.passes("fresh answer is pinned", g.fetch(appURL))
}

func TestExemptHostNeedsNoPin(t *testing.T) {
	g := newGate(t)
	g.store.exempt = []db.TargetExemption{{Host: "pypi.org", Port: 443}}
	g.res.set("pypi.org", "151.101.0.223")
	g.passes("exempt", g.check("Bash", `{"command":"pip download -i https://pypi.org/simple requests"}`))
	g.passes("exempt again", g.fetch("https://pypi.org/simple/"))
	if len(g.store.pins) != 0 {
		t.Fatalf("an exemption created pins: %+v", g.store.pins)
	}
	// The first use is logged once per process, with the digest of the list.
	if got := g.store.outcomes(); !slices.Equal(got, []string{"allowed/exempt"}) {
		t.Fatalf("logged rows = %v, want one first-use row", got)
	}
	if row := g.store.logged[0]; row.Audit.ConfigDigest != "digest-1" || row.Audit.EffectiveAction != "allow" || row.Audit.ExecutionStatus != "unknown" {
		t.Fatalf("first-use row audit = %+v", row.Audit)
	}
	// Exact host and port: another port, a subdomain and a parent are not exempt.
	for _, url := range []string{"http://pypi.org/", "https://files.pypi.org/", "https://org/"} {
		host := strings.TrimSuffix(strings.SplitN(url, "//", 2)[1], "/")
		g.res.set(host, "151.101.0.223")
		g.requests(url, g.fetch(url))
	}
}

// Block rules come before exemptions and pins, and match the name and the
// addresses it resolves to.
func TestBlockRuleBeatsExemptionAndPin(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.res.set("pypi.org", "151.101.0.223")
	g.store.exempt = []db.TargetExemption{{Host: "pypi.org", Port: 443}}
	g.store.approve(g.requests("pin", g.fetch(appURL)))
	g.passes("pinned", g.fetch(appURL))
	g.passes("exempt", g.fetch("https://pypi.org/"))
	rows := len(g.store.logged)

	rule := func(kind, pattern string, enabled bool) db.AssetInterceptRule {
		return db.AssetInterceptRule{Enabled: enabled, Kind: kind, Pattern: pattern}
	}
	// A disabled rule blocks nothing.
	g.store.rules = []db.AssetInterceptRule{rule("exact_domain", "pypi.org", false)}
	g.passes("disabled rule", g.fetch("https://pypi.org/"))

	cases := []struct {
		name string
		rule db.AssetInterceptRule
		url  string
	}{
		{"exempt host, rule on the name", rule("exact_domain", "pypi.org", true), "https://pypi.org/"},
		{"exempt host, rule on its address", rule("exact_ip", "151.101.0.223", true), "https://pypi.org/"},
		{"pinned host, rule on the name", rule("fuzzy_domain", ".example.com", true), appURL},
		{"pinned host, rule on its address range", rule("cidr", "203.0.113.0/24", true), appURL},
		{"IP literal", rule("cidr", "203.0.113.0/24", true), "http://203.0.113.50/"},
	}
	for _, c := range cases {
		g.store.rules = []db.AssetInterceptRule{c.rule}
		res := g.blocked(c.name, TargetRuleBlocked, g.fetch(c.url))
		if !strings.Contains(res.Reason, "blocked by an asset rule") || !strings.Contains(res.Reason, c.rule.Pattern) {
			t.Errorf("%s: reason = %q", c.name, res.Reason)
		}
	}
	// A range is matched as written and by its network address.
	g.store.rules = []db.AssetInterceptRule{rule("cidr", "10.0.0.0/8", true)}
	g.blocked("range inside a blocked range", TargetRuleBlocked, g.check("Bash", `{"command":"nmap 10.20.0.0/16"}`))

	if got := g.store.outcomes()[rows:]; len(got) != len(cases)+1 || slices.ContainsFunc(got, func(o string) bool { return o != "denied/rule_blocked" }) {
		t.Fatalf("logged rows = %v, want %d rule_blocked rows", got, len(cases)+1)
	}
}

// Port precedence. A (host, 0) pin covers every port. A (host, 443) pin covers
// port 443 only, and never a target whose port is not declared. The address
// sets of two pins are never merged.
func TestPinPortPrecedence(t *testing.T) {
	const a, b = "203.0.113.7", "203.0.113.8"
	urls := map[int]string{0: "ssh://app.example.com/", 80: "http://app.example.com/", 443: "https://app.example.com/", 8443: "https://app.example.com:8443/"}
	pin := func(g *gateFixture, port int, ips ...string) *db.TargetPin {
		return g.store.approve(TargetRequest{Host: "app.example.com", Port: port, ResolvedIPs: ips})
	}

	t.Run("a (host, 0) pin covers every port", func(t *testing.T) {
		g := newGate(t)
		g.res.set("app.example.com", a)
		pin(g, 0, a)
		for port, url := range urls {
			g.passes(fmt.Sprintf("port %d", port), g.fetch(url))
		}
	})

	t.Run("a (host, 443) pin covers port 443 only", func(t *testing.T) {
		g := newGate(t)
		g.res.set("app.example.com", a)
		pin443 := pin(g, 443, a)
		g.passes("port 443", g.fetch(urls[443]))
		for _, port := range []int{0, 80, 8443} {
			req := g.requests(fmt.Sprintf("port %d", port), g.fetch(urls[port]))
			if req.Host != "app.example.com" || req.Port != port || req.Reason != "no_pin" || req.Pin != nil {
				t.Fatalf("port %d: request = %+v, want it keyed on the target's own port with no pin to extend", port, req)
			}
		}
		// The request of the (host, 0) target is keyed (host, 0); approving it
		// leaves the (host, 443) pin active and untouched.
		req := g.requests("port 0", g.fetch(urls[0]))
		pin0 := g.store.approve(req)
		if pin0.Port != 0 || pin0.Version != 1 {
			t.Fatalf("pin of the port-0 request = %+v", pin0)
		}
		if got := g.store.active("app.example.com", 443); got != pin443 || got.Version != 1 || !slices.Equal(got.PinnedIPs, []string{a}) {
			t.Fatalf("the (host, 443) pin changed: %+v", got)
		}
		g.passes("port 0, pinned", g.fetch(urls[0]))
	})

	t.Run("two pins are never merged", func(t *testing.T) {
		g := newGate(t)
		pin443, pin0 := pin(g, 443, a), pin(g, 0, b)

		g.res.set("app.example.com", a)
		g.passes("covered by the (host, 443) pin alone", g.fetch(urls[443]))
		g.res.set("app.example.com", b)
		g.expire()
		g.passes("covered by the (host, 0) pin alone", g.fetch(urls[443]))

		// Each address is in one pin, both are in neither: not covered.
		g.res.set("app.example.com", a, b)
		g.expire()
		req := g.requests("union of the two pins", g.fetch(urls[443]))
		if req.Port != 443 || req.Reason != "new_ip" || req.Pin != pin443 {
			t.Fatalf("request = %+v, want it on the exact-port pin (host, 443)", req)
		}
		// On another port only the (host, 0) pin is a candidate.
		req = g.requests("port 80", g.fetch(urls[80]))
		if req.Port != 0 || req.Reason != "new_ip" || req.Pin != pin0 {
			t.Fatalf("request = %+v, want it on the (host, 0) pin", req)
		}
		// A port-0 target never looks at the (host, 443) pin.
		g.res.set("app.example.com", a)
		g.expire()
		req = g.requests("port 0", g.fetch(urls[0]))
		if req.Port != 0 || req.Pin != pin0 {
			t.Fatalf("request = %+v, want it on the (host, 0) pin", req)
		}
	})
}

func TestTooManyTargetsBlocked(t *testing.T) {
	g := newGate(t)
	ips := func(n int) string {
		var b strings.Builder
		for i := 1; i <= n; i++ {
			fmt.Fprintf(&b, " 198.51.100.%d", i)
		}
		return `{"command":"nmap -sn` + b.String() + `"}`
	}
	v := g.check("Bash", ips(maxUnpinnedTargets))
	reqs, res := v.reqs, v.res
	if res.Code != "" || len(reqs) != maxUnpinnedTargets {
		t.Fatalf("%d targets: requests=%d result=%+v, want %d requests", maxUnpinnedTargets, len(reqs), res, maxUnpinnedTargets)
	}
	res = g.blocked("six targets", TargetTooMany, g.check("Bash", ips(maxUnpinnedTargets+1)))
	if !strings.Contains(res.Reason, "6 targets") || !strings.Contains(res.Reason, "198.51.100.6") {
		t.Fatalf("reason = %q", res.Reason)
	}
	if got := g.store.outcomes(); !slices.Equal(got, []string{"denied/too_many"}) || len(g.store.logged[0].Audit.Targets) != 6 {
		t.Fatalf("logged rows = %v", got)
	}
	// Only the targets no pin covers count, and each key counts once.
	g.store.approve(TargetRequest{Host: "198.51.100.1", Port: 0, ResolvedIPs: []string{"198.51.100.1"}})
	v = g.check("Bash", `{"command":"nmap 198.51.100.1 198.51.100.2 198.51.100.3 198.51.100.4 198.51.100.5 198.51.100.2:80 198.51.100.2:80"}`)
	reqs, res = v.reqs, v.res
	if res.Code != "" || len(reqs) != maxUnpinnedTargets {
		t.Fatalf("seven targets, one pinned, one repeated: requests=%d result=%+v, want %d requests", len(reqs), res, maxUnpinnedTargets)
	}
}

// What the gate cannot read, it does not allow.
func TestStoreFailureBlocks(t *testing.T) {
	for _, method := range []string{"BlockRules", "Exemptions", "ActivePins"} {
		g := newGate(t)
		g.res.set("app.example.com", "203.0.113.7")
		g.store.fail[method] = errors.New("connection refused")
		res := g.blocked(method, TargetGateUnavailable, g.fetch(appURL))
		if !strings.Contains(res.Reason, "could not be read: connection refused") {
			t.Errorf("%s: reason = %q", method, res.Reason)
		}
	}
	// A scope that names no valid task cannot be checked either.
	g := newGate(t)
	g.scope.TaskID = "not-a-number"
	g.blocked("bad scope", TargetGateUnavailable, g.fetch(appURL))
}

// The platform's own endpoints are exempt because the configuration names
// them. They are computed on every call, so they follow the configuration.
func TestDerivedExemptionsFollowConfig(t *testing.T) {
	g := newGate(t)
	config := []string{"https://llm.example.net/v1", "http://user:secret@proxy.example.net:3128", "", "not a url", "https://html.duckduckgo.com"}
	g.ic.SetDerivedExemptions(func() []string { return config })

	want := []db.TargetExemption{{Host: "llm.example.net", Port: 443}, {Host: "proxy.example.net", Port: 3128}, {Host: "html.duckduckgo.com", Port: 443}}
	if got := g.ic.DerivedExemptions(); !slices.Equal(got, want) {
		t.Fatalf("derived = %+v, want %+v", got, want)
	}
	g.passes("gateway", g.check("Bash", `{"command":"curl https://llm.example.net/v1/models"}`))
	g.passes("proxy on a command line", g.check("Bash", `{"command":"curl -x http://proxy.example.net:3128 https://html.duckduckgo.com/html/"}`))
	if n := g.res.total(); n != 0 {
		t.Fatalf("%d lookups for derived exemptions, want none", n)
	}
	if got := g.store.outcomes(); !slices.Equal(got, []string{"allowed/exempt", "allowed/exempt", "allowed/exempt"}) {
		t.Fatalf("logged rows = %v, want one first-use row per endpoint", got)
	}

	// The configuration changes: the old gateway is a target like any other.
	config = []string{"https://llm.other.example/v1"}
	g.res.set("llm.example.net", "203.0.113.20")
	g.requests("old gateway", g.check("Bash", `{"command":"curl https://llm.example.net/v1/models"}`))
	g.passes("new gateway", g.fetch("https://llm.other.example/v1/models"))

	// Exact host and port, as for a stored entry.
	g.res.set("llm.other.example", "203.0.113.21")
	g.requests("other port of the gateway", g.fetch("http://llm.other.example/"))
}

// A stored exemption (a seeded package source, or one an operator added) is
// void when any address of the name is private, loopback, link-local,
// unspecified, unique-local or a metadata address. One such address is enough.
func TestStoredExemptionVoidOnPrivateOrLoopback(t *testing.T) {
	seeded := []db.TargetExemption{{Host: "pypi.org", Port: 443}, {Host: "deb.debian.org", Port: 80}}
	void := map[string][]string{
		"loopback":               {"127.0.0.1"},
		"loopback, other":        {"127.8.8.8"},
		"loopback v6":            {"::1"},
		"private 10/8":           {"10.0.0.5"},
		"private 172.16/12":      {"172.16.0.1"},
		"private 192.168/16":     {"192.168.1.1"},
		"unique local fd00::/8":  {"fd00::1"},
		"unique local fc00::/8":  {"fc00::1"},
		"link-local, metadata":   {"169.254.169.254"},
		"link-local":             {"169.254.0.1"},
		"link-local v6":          {"fe80::1"},
		"unspecified":            {"0.0.0.0"},
		"unspecified v6":         {"::"},
		"mapped loopback":        {"::ffff:127.0.0.1"},
		"metadata outside":       {"100.100.100.200"},
		"metadata v6":            {"fd00:ec2::254"},
		"one public one private": {"151.101.0.223", "10.0.0.5"},
		"one public one v6 ULA":  {"151.101.0.223", "2a04:4e42::223", "fd12:3456::1"},
	}
	for name, ips := range void {
		for _, e := range seeded {
			g := newGate(t)
			g.store.exempt = seeded
			g.res.set(e.Host, ips...)
			url := fmt.Sprintf("http://%s:%d/", e.Host, e.Port)
			req := g.requests(name+" "+e.Host, g.fetch(url))
			if !req.ExemptVoid || req.Reason != "no_pin" {
				t.Errorf("%s %s: request = %+v, want a void exemption", name, e.Host, req)
			}
			if len(g.store.logged) != 0 {
				t.Errorf("%s %s: a void exemption logged %v", name, e.Host, g.store.outcomes())
			}
		}
	}
	for name, ips := range map[string][]string{
		"public":            {"151.101.0.223"},
		"public, dual":      {"151.101.0.223", "2a04:4e42::223"},
		"shared space":      {"100.64.0.1"},
		"documentation net": {"203.0.113.7"},
	} {
		g := newGate(t)
		g.store.exempt = seeded
		g.res.set("pypi.org", ips...)
		g.passes(name, g.fetch("https://pypi.org/simple/"))
	}
	// A stored name that does not resolve is void as well; the call then fails
	// on the resolution like any other target.
	g := newGate(t)
	g.store.exempt = seeded
	g.res.errs["pypi.org"] = errors.New("no such host")
	g.blocked("unresolvable", TargetResolveFailed, g.fetch("https://pypi.org/simple/"))
	if t0 := g.store.logged[0].Audit.Targets[0]; !t0.ExemptVoid {
		t.Errorf("unresolvable exempt name: audit target = %+v, want exempt_void", t0)
	}
}

// A stored exemption written as an IP literal is not resolved. A private
// unicast literal holds. A literal that can never be exempt does not, even if
// it reached the stored list without passing the API.
func TestStoredExemptionOnIPLiteral(t *testing.T) {
	g := newGate(t)
	never := []string{"169.254.169.254", "fe80::1", "fd00:ec2::254", "100.100.100.200", "127.0.0.1", "::1", "0.0.0.0", "::", "224.0.0.1", "ff02::1"}
	g.store.exempt = []db.TargetExemption{{Host: "10.0.0.5", Port: 8080}, {Host: "fd12:3456::5", Port: 8080}, {Host: "203.0.113.7", Port: 8080}}
	for _, ip := range never {
		g.store.exempt = append(g.store.exempt, db.TargetExemption{Host: ip, Port: 8080})
	}
	for _, url := range []string{"http://10.0.0.5:8080/", "http://[fd12:3456::5]:8080/", "http://203.0.113.7:8080/"} {
		g.passes(url, g.fetch(url))
	}
	for _, ip := range never {
		host := ip
		if strings.Contains(ip, ":") {
			host = "[" + ip + "]"
		}
		req := g.requests(ip, g.fetch("http://"+host+":8080/"))
		if !req.ExemptVoid {
			t.Errorf("%s: request = %+v, want a void exemption", ip, req)
		}
	}
	if n := g.res.total(); n != 0 {
		t.Fatalf("%d lookups for IP literals, want none", n)
	}
	// The API refuses them before anything is stored (no database behind g.ic).
	for _, ip := range never {
		if _, _, err := g.ic.SetExemptions([]db.TargetExemption{{Host: ip, Port: 8080}}, "ARTEX"); !errors.Is(err, ErrInvalidExemption) {
			t.Errorf("SetExemptions(%s) = %v, want it refused", ip, err)
		}
	}
	for _, bad := range []db.TargetExemption{
		{Host: "*.example.com", Port: 443}, {Host: ".example.com", Port: 443}, {Host: "10.0.0.0/8", Port: 443}, {Host: "", Port: 443},
		{Host: "https://pypi.org", Port: 443}, {Host: "pypi.org:443", Port: 443}, {Host: "pypi.org/simple", Port: 443},
		{Host: "pypi.org", Port: 0}, {Host: "pypi.org", Port: 65536}, {Host: "pypi.org", Port: -1},
		{Host: "2130706433", Port: 80}, {Host: "0x7f.1", Port: 80}, {Host: "::ffff:127.0.0.1", Port: 80},
	} {
		if _, _, err := g.ic.SetExemptions([]db.TargetExemption{{Host: "pypi.org", Port: 443}, bad}, "ARTEX"); !errors.Is(err, ErrInvalidExemption) {
			t.Errorf("SetExemptions(%+v) = %v, want it refused", bad, err)
		}
	}
}

// An exemption derived from the configuration is never voided: an internal
// relay for a platform service is a normal deployment. It is not resolved.
func TestDerivedExemptionNotVoidedByPrivateAddress(t *testing.T) {
	g := newGate(t)
	g.ic.SetDerivedExemptions(func() []string {
		return []string{"http://10.0.0.5:8080/v1", "https://gateway.internal/v1", "http://127.0.0.1:8080", "http://localhost:3128", "http://169.254.10.10:8888"}
	})
	// If the gate resolved the names, these answers would void a stored entry.
	g.res.set("gateway.internal", "10.0.0.5")
	g.res.set("localhost", "127.0.0.1")
	for _, cmd := range []string{
		"curl http://10.0.0.5:8080/v1/models",
		"curl https://gateway.internal/v1/models",
		"curl -x http://127.0.0.1:8080 -x http://localhost:3128 https://gateway.internal/",
		"curl http://169.254.10.10:8888/",
	} {
		g.passes(cmd, g.check("Bash", `{"command":"`+cmd+`"}`))
	}
	if n := g.res.total(); n != 0 {
		t.Fatalf("%d lookups, want none: a derived exemption is never resolved", n)
	}
}

// A void exemption is not a block: the target asks for approval like any other
// and passes once it is pinned.
func TestVoidExemptionFallsThroughToRequest(t *testing.T) {
	g := newGate(t)
	g.store.exempt = []db.TargetExemption{{Host: "mirror.example.org", Port: 443}}
	g.res.set("mirror.example.org", "192.168.1.10")
	req := g.requests("void", g.fetch("https://mirror.example.org/pkg"))
	if !req.ExemptVoid || !slices.Equal(req.ResolvedIPs, []string{"192.168.1.10"}) {
		t.Fatalf("request = %+v", req)
	}
	g.store.approve(req)
	g.passes("pinned by a human", g.fetch("https://mirror.example.org/pkg"))
	if got := g.store.outcomes(); !slices.Equal(got, []string{"allowed/pin_match"}) {
		t.Fatalf("logged rows = %v, want the pin match and no exemption use", got)
	}
	// The name answers a public address again: the exemption applies again.
	g.res.set("mirror.example.org", "151.101.0.223")
	g.expire()
	g.passes("exempt again", g.fetch("https://mirror.example.org/pkg"))
	if got := g.store.outcomes(); !slices.Equal(got, []string{"allowed/pin_match", "allowed/exempt"}) {
		t.Fatalf("logged rows = %v", got)
	}
}

// An entry that is both stored and derived counts as derived, so adding a
// platform host to the list can never break a platform service.
func TestEntryInBothOriginsIsDerived(t *testing.T) {
	g := newGate(t)
	g.store.exempt = []db.TargetExemption{{Host: "gateway.internal", Port: 443}}
	g.res.set("gateway.internal", "10.0.0.5")
	g.requests("stored only: void", g.fetch("https://gateway.internal/v1"))
	lookups := g.res.total()

	g.ic.SetDerivedExemptions(func() []string { return []string{"https://gateway.internal/v1"} })
	g.passes("stored and derived", g.fetch("https://gateway.internal/v1"))
	if n := g.res.total(); n != lookups {
		t.Fatalf("%d more lookups, want none once the entry is derived", n-lookups)
	}
}

// A pin covers the host as written. Approving an IP does not cover a name that
// resolves to it: the name selects the tenant.
func TestIPPinDoesNotCoverNameOnSameIP(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.store.approve(g.requests("the IP", g.fetch("https://203.0.113.7/")))
	g.passes("the IP, pinned", g.fetch("https://203.0.113.7/"))
	req := g.requests("a name on the same IP", g.fetch(appURL))
	if req.Host != "app.example.com" || req.Reason != "no_pin" || req.Pin != nil {
		t.Fatalf("request = %+v", req)
	}
	// And the other way round.
	g.store.approve(req)
	g.requests("another IP port", g.fetch("http://203.0.113.7/"))
}

// Behind the upstream egress proxy the proxy chooses the address. Every pin is
// name-only at call time, whatever its row says: a changed address neither
// blocks nor asks. A pin approved under the proxy stays name-only without it.
func TestUpstreamProxyMakesPinsNameOnlyAtCallTime(t *testing.T) {
	g := newGate(t)
	proxied := false
	g.ic.SetUpstreamProxyCheck(func() bool { return proxied })
	g.res.set("app.example.com", "203.0.113.7")
	pin := g.store.approve(g.requests("first", g.fetch(appURL)))
	if pin.NameOnlyEffective {
		t.Fatal("the pin was approved without the proxy and must not be name-only")
	}

	// The address changes. Without the proxy that asks.
	g.res.set("app.example.com", "198.51.100.99")
	g.expire()
	g.requests("changed address, no proxy", g.fetch(appURL))

	// With the proxy on, the same pin row covers the name.
	proxied = true
	g.passes("changed address, proxy on", g.fetch(appURL))
	if pin.NameOnlyEffective || !slices.Equal(pin.PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("the pin row changed: %+v", pin)
	}
	// The name still has to resolve, and block rules still apply.
	g.res.errs["app.example.com"] = errors.New("no such host")
	g.expire()
	g.blocked("unresolvable under the proxy", TargetResolveFailed, g.fetch(appURL))
	g.res.set("app.example.com", "198.51.100.99")
	g.store.rules = []db.AssetInterceptRule{{Enabled: true, Kind: "exact_ip", Pattern: "198.51.100.99"}}
	g.blocked("block rule under the proxy", TargetRuleBlocked, g.fetch(appURL))
	g.store.rules = nil
	// A host without a pin still asks under the proxy.
	g.res.set("other.example.com", "203.0.113.50")
	g.requests("no pin under the proxy", g.fetch("https://other.example.com/"))

	// Proxy off again: the address comparison is back.
	proxied = false
	g.requests("changed address, proxy off again", g.fetch(appURL))

	// A pin whose row is name-only stays name-only without the proxy.
	pin.NameOnlyEffective = true
	g.passes("name-only pin, no proxy", g.fetch(appURL))
}

// A custom tool that carries its own proxy cannot enforce an approved IP, so
// its pins are name-only at call time, the same as behind the upstream proxy.
func TestToolProxyMakesPinsNameOnlyAtCallTime(t *testing.T) {
	g := newGate(t)
	proxied := false
	g.ic.SetToolProxyCheck(func(string) bool { return proxied })
	const tool = "my_http_tool"
	const input = `{"url":"https://app.example.com/login"}`
	g.res.set("app.example.com", "203.0.113.7")
	g.pin("app.example.com", 443, "203.0.113.7")

	// The address changes. A direct call asks.
	g.res.set("app.example.com", "198.51.100.99")
	g.expire()
	g.requests("changed address, direct tool", g.check(tool, input))

	// The same pin covers the name for the proxied tool, and the first-use row
	// records that the connection was not bound.
	proxied = true
	g.passes("changed address, proxied tool", g.check(tool, input))
	if got := g.store.outcomes(); len(got) != 1 || got[0] != "allowed/pin_match" || !g.store.logged[0].Audit.Targets[0].NameOnlyEffective {
		t.Fatalf("rows %v, target %+v; want a name-only first use", got, g.store.logged[0].Audit.Targets[0])
	}
}

// The first call that a pin version covers is logged once per process.
func TestPinFirstUseLoggedOncePerVersion(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.store.approve(g.requests("first", g.fetch(appURL)))
	for n := 0; n < 3; n++ {
		g.passes("pinned", g.fetch(appURL))
	}
	if got := g.store.outcomes(); !slices.Equal(got, []string{"allowed/pin_match"}) {
		t.Fatalf("logged rows = %v, want one pin_match row", got)
	}
	if t0 := g.store.logged[0].Audit.Targets[0]; t0.PinVersion != 1 || !slices.Equal(t0.PinnedIPs, []string{"203.0.113.7"}) {
		t.Fatalf("pin_match target = %+v", t0)
	}
	g.res.set("app.example.com", "203.0.113.7", "203.0.113.8")
	g.expire()
	g.store.approve(g.requests("new address", g.fetch(appURL)))
	g.passes("version 2", g.fetch(appURL))
	g.passes("version 2 again", g.fetch(appURL))
	if got := g.store.outcomes(); !slices.Equal(got, []string{"allowed/pin_match", "allowed/pin_match"}) || g.store.logged[1].Audit.Targets[0].PinVersion != 2 {
		t.Fatalf("logged rows = %v, want one row per pin version", got)
	}
	// A call that still needs an approval logs no use: it has not passed.
	g.res.set("other.example.com", "203.0.113.50")
	g.requests("mixed", g.check("Bash", `{"command":"curl https://app.example.com/ https://other.example.com/"}`))
	if n := len(g.store.logged); n != 2 {
		t.Fatalf("%d rows after a call that did not pass, want 2", n)
	}
}

// The gate resolves through the system resolver unless a test injects another
// one: A and AAAA, one lookup bounded to 3 s, positive answers kept 10 s.
func TestSystemResolverAndLimits(t *testing.T) {
	if resolveTimeout != 3*time.Second || resolveCacheTTL != 10*time.Second || maxUnpinnedTargets != 5 {
		t.Fatalf("limits: lookup timeout %s, cache %s, %d targets per call; want 3s, 10s and 5", resolveTimeout, resolveCacheTTL, maxUnpinnedTargets)
	}
	if DefaultTargetWaitBound != 300*time.Second {
		t.Fatalf("wait bound = %s, want 300s", DefaultTargetWaitBound)
	}
	ic := New(nil)
	if name := ic.resolve.name(); name != "system" {
		t.Fatalf("default resolver = %q, want the system resolver", name)
	}
	// A resolver that does not answer is cut off after the timeout, whatever the
	// caller's own deadline, and the failure says so.
	g := newGate(t)
	g.res.hold = make(chan struct{})
	defer close(g.res.hold)
	start := time.Now()
	out := g.blocked("silent resolver", TargetResolveFailed, g.fetch(appURL))
	if took := time.Since(start); took < resolveTimeout || took > resolveTimeout+10*time.Second {
		t.Fatalf("the lookup was cut off after %s, want about %s", took, resolveTimeout)
	}
	if !strings.Contains(out.Reason, "could not resolve app.example.com (lookup timed out after 3s)") {
		t.Fatalf("reason = %q", out.Reason)
	}
	// localhost needs no network: it proves the lookup returns canonical addresses.
	res, err := ic.resolve.lookup(context.Background(), "localhost", true)
	if err != nil {
		t.Skipf("the system resolver does not know localhost here: %v", err)
	}
	if !slices.Contains(res.ips, "127.0.0.1") && !slices.Contains(res.ips, "::1") {
		t.Fatalf("localhost = %v, want a loopback address", res.ips)
	}
}
