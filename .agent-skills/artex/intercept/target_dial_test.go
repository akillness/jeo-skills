package intercept

import (
	"context"
	"crypto/tls"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// Step 2.1: the pinned dialer of the platform-owned HTTP clients. Without a
// database: a dial that would open a request is covered by the PostgreSQL
// tests in target_dial_pg_test.go.

// dialRecorder is a base dialer for tests. It records every address it is
// asked to connect to, connects the routed ones (TEST-NET addresses) to local
// listeners and loopback addresses to themselves, and refuses the rest.
type dialRecorder struct {
	mu     sync.Mutex
	routes map[string]string
	refuse map[string]bool
	dialed []string
}

func newDialRecorder() *dialRecorder {
	return &dialRecorder{routes: map[string]string{}, refuse: map[string]bool{}}
}

func (d *dialRecorder) route(addr, to string) {
	d.mu.Lock()
	d.routes[addr] = to
	d.mu.Unlock()
}

func (d *dialRecorder) dial(ctx context.Context, network, addr string) (net.Conn, error) {
	d.mu.Lock()
	d.dialed = append(d.dialed, addr)
	to, ok := d.routes[addr]
	refused := d.refuse[addr]
	d.mu.Unlock()
	if !ok && strings.HasPrefix(addr, "127.0.0.1:") {
		to, ok = addr, true
	}
	if refused || !ok {
		return nil, &net.OpError{Op: "dial", Net: network, Err: errors.New("connection refused by the test dialer")}
	}
	return (&net.Dialer{}).DialContext(ctx, network, to)
}

func (d *dialRecorder) calls() []string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return slices.Clone(d.dialed)
}

// pinnedServer is a listener that counts its requests; port is its port.
func pinnedServer(t *testing.T, body string) (srv *httptest.Server, hits *atomic.Int64, port string) {
	t.Helper()
	hits = &atomic.Int64{}
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	_, port, _ = net.SplitHostPort(srv.Listener.Addr().String())
	return srv, hits, port
}

// dialGate is a gate fixture whose base dialer is a dialRecorder.
func dialGate(t *testing.T) (*gateFixture, *dialRecorder) {
	t.Helper()
	g := newGate(t)
	rec := newDialRecorder()
	g.ic.SetBaseDialer(rec.dial)
	return g, rec
}

func (g *gateFixture) pin(host string, port int, ips ...string) *db.TargetPin {
	g.store.mu.Lock()
	defer g.store.mu.Unlock()
	p := &db.TargetPin{ID: int64(len(g.store.pins) + 1), Host: host, Port: port, Version: 1, Status: db.TargetPinActive, PinnedIPs: ips}
	g.store.pins = append(g.store.pins, p)
	return p
}

// pinnedClient is a client built like the platform's: the redirect policy and
// the pinned dialer, keep-alive off.
func pinnedClient(scoped bool) *http.Client {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.Proxy = nil
	tr.DialContext = PinnedDialer("WebFetch", scoped)
	tr.DisableKeepAlives = true
	return &http.Client{Transport: tr, CheckRedirect: RedirectCheck("WebFetch")}
}

func get(ctx context.Context, client *http.Client, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	return string(b), err
}

// With the gate off, or with no scope in a client built without one, the dial
// is the dial of today: the address as received, no lookup, no store access.
func TestPinnedDialGateOffIsPlainDial(t *testing.T) {
	g, rec := dialGate(t)
	srv, hits, port := pinnedServer(t, "plain")
	rec.route("app.example.com:"+port, srv.Listener.Addr().String())
	g.res.set("app.example.com", "203.0.113.7")

	conn, err := PinnedDialer("WebFetch", false)(context.Background(), "tcp", srv.Listener.Addr().String())
	if err != nil {
		t.Fatalf("no scope: %v", err)
	}
	conn.Close()
	for name, scope := range map[string]TargetScope{
		"no flag":  {TaskID: "7", WaitBound: time.Minute, Interceptor: g.ic},
		"flag off": {TaskID: "7", Enabled: func() bool { return false }, WaitBound: time.Minute, Interceptor: g.ic},
	} {
		if body, err := get(WithTargetScope(context.Background(), scope), pinnedClient(true), "http://app.example.com:"+port+"/"); err != nil || body != "plain" {
			t.Fatalf("%s: %q, %v", name, body, err)
		}
	}
	if got := rec.calls(); len(got) != 2 || got[0] != "app.example.com:"+port || got[1] != got[0] {
		t.Fatalf("dialled %v, want the address as received", got)
	}
	if hits.Load() != 2 || g.store.reads != 0 || len(g.store.logged) != 0 || g.res.total() != 0 {
		t.Fatalf("hits=%d, %d store reads, %d rows, %d lookups; want none but the hits", hits.Load(), g.store.reads, len(g.store.logged), g.res.total())
	}
}

// A client built for a scope never dials without one: a lost context value
// fails closed, nothing is dialled.
func TestPinnedDialScopeLostFailsClosed(t *testing.T) {
	srv, hits, _ := pinnedServer(t, "unbound")
	_, err := PinnedDialer("WebFetch", true)(context.Background(), "tcp", srv.Listener.Addr().String())
	if err == nil || !strings.Contains(err.Error(), TargetGateUnavailable) || !strings.Contains(err.Error(), "did not reach the connection") {
		t.Fatalf("dial without the scope: %v", err)
	}
	if _, err := get(context.Background(), pinnedClient(true), srv.URL); err == nil || !strings.Contains(err.Error(), TargetGateUnavailable) {
		t.Fatalf("fetch without the scope: %v", err)
	}
	if hits.Load() != 0 {
		t.Fatalf("%d requests reached the server", hits.Load())
	}
}

// Every way the gate cannot decide fails closed with TARGET_GATE_UNAVAILABLE,
// dials nothing, and logs one decided row where there is a store and a scope.
func TestPinnedDialScopeUnreadableFailsClosed(t *testing.T) {
	for _, tc := range []struct {
		name          string
		setup         func(g *gateFixture)
		network, addr string
		rows          int
	}{
		{"nil interceptor", func(g *gateFixture) { g.scope.Interceptor = nil }, "tcp", "app.example.com:443", 0},
		{"task id", func(g *gateFixture) { g.scope.TaskID = "seven" }, "tcp", "app.example.com:443", 0},
		{"rules", func(g *gateFixture) { g.store.fail["BlockRules"] = errors.New("down") }, "tcp", "app.example.com:443", 1},
		{"pins", func(g *gateFixture) { g.store.fail["ActivePins"] = errors.New("down") }, "tcp", "app.example.com:443", 1},
		{"exemptions", func(g *gateFixture) { g.store.fail["Exemptions"] = errors.New("down") }, "tcp", "app.example.com:443", 1},
		{"address", nil, "tcp", "app.example.com", 1},
		{"port", nil, "tcp", "app.example.com:0", 1},
		{"network", nil, "udp", "app.example.com:443", 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g, rec := dialGate(t)
			g.res.set("app.example.com", "203.0.113.7")
			g.pin("app.example.com", 443, "203.0.113.7")
			if tc.setup != nil {
				tc.setup(g)
			}
			_, err := PinnedDialer("WebFetch", true)(g.ctx(), tc.network, tc.addr)
			if err == nil || !strings.Contains(err.Error(), TargetGateUnavailable) {
				t.Fatalf("dial: %v, want TARGET_GATE_UNAVAILABLE", err)
			}
			if got := rec.calls(); len(got) != 0 {
				t.Fatalf("dialled %v", got)
			}
			if got := g.store.outcomes(); len(got) != tc.rows || tc.rows == 1 && got[0] != "denied/gate_unavailable" {
				t.Fatalf("rows = %v, want %d gate_unavailable", got, tc.rows)
			}
		})
	}
}

// A pinned name is dialled at the address the lookup returned and the pin
// holds, never by the name.
func TestPinnedDialConnectsOnlyToPinnedAddresses(t *testing.T) {
	g, rec := dialGate(t)
	srv, hits, port := pinnedServer(t, "pinned")
	rec.route("203.0.113.7:"+port, srv.Listener.Addr().String())
	g.res.set("app.example.com", "203.0.113.7")
	g.pin("app.example.com", atoiPort(t, port), "203.0.113.7")

	if body, err := get(g.ctx(), pinnedClient(true), "http://app.example.com:"+port+"/"); err != nil || body != "pinned" {
		t.Fatalf("pinned fetch: %q, %v", body, err)
	}
	if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.7:" + port}) || hits.Load() != 1 {
		t.Fatalf("dialled %v, hits %d; want the pinned address only", got, hits.Load())
	}
}

// A name that does not resolve at the dial is blocked without a request (the
// fixture has no database: a request would fail the test), nothing is dialled.
func TestPinnedDialResolveFailureBlocksWithoutRequest(t *testing.T) {
	g, rec := dialGate(t)
	g.pin("app.example.com", 443, "203.0.113.7")
	g.res.mu.Lock()
	g.res.errs["app.example.com"] = errors.New("no such host")
	g.res.mu.Unlock()
	_, err := PinnedDialer("WebFetch", true)(g.ctx(), "tcp", "app.example.com:443")
	if err == nil || !strings.Contains(err.Error(), TargetResolveFailed) || !strings.Contains(err.Error(), "app.example.com:443") {
		t.Fatalf("dial: %v", err)
	}
	if got := g.store.outcomes(); len(got) != 1 || got[0] != "denied/resolve_failed" || len(rec.calls()) != 0 {
		t.Fatalf("rows %v, dialled %v", got, rec.calls())
	}
}

// An asset block rule on an address the dial resolves wins over the pin.
func TestPinnedDialBlockRuleOnDialAddress(t *testing.T) {
	g, rec := dialGate(t)
	g.pin("app.example.com", 443, "203.0.113.7", "203.0.113.8")
	g.res.set("app.example.com", "203.0.113.8")
	g.store.rules = []db.AssetInterceptRule{{Enabled: true, Kind: "exact_ip", Pattern: "203.0.113.8"}}
	_, err := PinnedDialer("WebFetch", true)(g.ctx(), "tcp", "app.example.com:443")
	if err == nil || !strings.Contains(err.Error(), TargetRuleBlocked) {
		t.Fatalf("dial: %v", err)
	}
	if got := g.store.outcomes(); len(got) != 1 || got[0] != "denied/rule_blocked" || len(rec.calls()) != 0 {
		t.Fatalf("rows %v, dialled %v", got, rec.calls())
	}
}

// A derived exemption is dialled as received and never resolved, wherever its
// name points: an LLM gateway on an internal address, the recording proxy on
// loopback.
func TestPinnedDialDerivedExemptionDialsByName(t *testing.T) {
	g, rec := dialGate(t)
	srv, hits, port := pinnedServer(t, "gateway")
	rec.route("llm.example:"+port, srv.Listener.Addr().String())
	g.res.set("llm.example", "10.0.0.5")
	proxy := srv.Listener.Addr().String()
	g.ic.SetDerivedExemptions(func() []string { return []string{"https://llm.example:" + port, "http://" + proxy} })

	for _, addr := range []string{"llm.example:" + port, proxy} {
		conn, err := PinnedDialer("WebFetch", true)(g.ctx(), "tcp", addr)
		if err != nil {
			t.Fatalf("%s: %v", addr, err)
		}
		conn.Close()
	}
	if got := rec.calls(); !slices.Equal(got, []string{"llm.example:" + port, proxy}) || g.res.total() != 0 || hits.Load() != 0 {
		t.Fatalf("dialled %v, %d lookups; want the addresses as received and no lookup", got, g.res.total())
	}
}

// A pin that is name-only for this connection, by its mark or because the
// upstream proxy is set now, is dialled by name: the platform does not bind it.
func TestPinnedDialNameOnlyPinDialsByName(t *testing.T) {
	for _, tc := range []struct {
		name    string
		marked  bool
		proxied bool
	}{{"marked pin", true, false}, {"upstream proxy now", false, true}} {
		t.Run(tc.name, func(t *testing.T) {
			g, rec := dialGate(t)
			srv, _, port := pinnedServer(t, "name-only")
			rec.route("app.example.com:"+port, srv.Listener.Addr().String())
			g.res.set("app.example.com", "203.0.113.9")
			g.pin("app.example.com", atoiPort(t, port), "203.0.113.7").NameOnlyEffective = tc.marked
			g.ic.SetUpstreamProxyCheck(func() bool { return tc.proxied })
			if body, err := get(g.ctx(), pinnedClient(true), "http://app.example.com:"+port+"/"); err != nil || body != "name-only" {
				t.Fatalf("fetch: %q, %v", body, err)
			}
			if got := rec.calls(); !slices.Equal(got, []string{"app.example.com:" + port}) {
				t.Fatalf("dialled %v, want the name", got)
			}
		})
	}
}

// The dial reads its address as the check reads the URL: same key for case,
// trailing dot, Unicode, IPv6 brackets and IPv4-mapped IPv6. net/http dials the
// ASCII form of a Unicode name with the scheme's port written (S3).
func TestPinnedDialNormalisesLikeTheCheck(t *testing.T) {
	for _, tc := range []struct{ rawURL, addr string }{
		{"https://App.Example.COM./x", "App.Example.COM.:443"},
		{"http://bücher.example/", "xn--bcher-kva.example:80"},
		{"https://[2001:DB8::1]:8443/", "[2001:db8::1]:8443"},
		{"http://[::ffff:192.0.2.1]/", "[::ffff:192.0.2.1]:80"},
	} {
		want, err := urlTarget(tc.rawURL)
		if err != nil {
			t.Fatal(err)
		}
		got, err := addrTarget("tcp", tc.addr)
		if err != nil || got != want {
			t.Errorf("%s: dial key %+v (%v), check key %+v", tc.addr, got, err, want)
		}
	}
	var dialled string
	tr := &http.Transport{DialContext: func(_ context.Context, _, addr string) (net.Conn, error) {
		dialled = addr
		return nil, errors.New("recorded")
	}}
	_, _ = (&http.Client{Transport: tr}).Get("http://bücher.example/")
	if dialled != "xn--bcher-kva.example:80" {
		t.Fatalf("net/http dialled %q, want the ASCII name and the scheme's port", dialled)
	}
}

// Concurrent dials of one host share one lookup; the cached answer is not
// used, and the cache holds the new answer afterwards.
func TestPinnedDialFreshLookupCollapsed(t *testing.T) {
	g, rec := dialGate(t)
	srv, _, port := pinnedServer(t, "fresh")
	rec.route("203.0.113.7:"+port, srv.Listener.Addr().String())
	g.pin("app.example.com", atoiPort(t, port), "203.0.113.7")
	g.res.set("app.example.com", "203.0.113.9")
	if _, err := g.ic.resolve.lookup(context.Background(), "app.example.com", false); err != nil {
		t.Fatal(err)
	}
	// The cache now holds 203.0.113.9, which no pin covers: a dial that used it
	// would open a request, which this fixture cannot.
	g.res.set("app.example.com", "203.0.113.7")
	hold := make(chan struct{})
	g.res.mu.Lock()
	g.res.hold = hold
	g.res.mu.Unlock()
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Go(func() {
			conn, err := PinnedDialer("WebFetch", true)(g.ctx(), "tcp", "app.example.com:"+port)
			if err == nil {
				conn.Close()
			}
			errs <- err
		})
	}
	eventually(t, "the shared lookup", func() bool { return g.res.lookups("app.example.com") == 2 })
	time.Sleep(100 * time.Millisecond)
	close(hold)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("dial: %v", err)
		}
	}
	if n := g.res.lookups("app.example.com"); n != 2 {
		t.Fatalf("%d lookups, want the cached one and one shared by both dials", n)
	}
	g.ic.resolve.mu.Lock()
	cached := g.ic.resolve.entries["app.example.com"].ips
	g.ic.resolve.mu.Unlock()
	if !slices.Equal(cached, []string{"203.0.113.7"}) || !slices.Equal(rec.calls(), []string{"203.0.113.7:" + port, "203.0.113.7:" + port}) {
		t.Fatalf("cache %v, dialled %v", cached, rec.calls())
	}
}

// The compared addresses are tried in canonical order, the first that accepts
// wins; tcp4 skips the IPv6 ones.
func TestPinnedDialTriesAddressesInOrder(t *testing.T) {
	g, rec := dialGate(t)
	srv, _, port := pinnedServer(t, "second")
	rec.refuse["203.0.113.7:"+port] = true
	rec.route("203.0.113.8:"+port, srv.Listener.Addr().String())
	g.pin("app.example.com", atoiPort(t, port), "203.0.113.7", "203.0.113.8")
	g.res.set("app.example.com", "203.0.113.8", "203.0.113.7")
	if body, err := get(g.ctx(), pinnedClient(true), "http://app.example.com:"+port+"/"); err != nil || body != "second" {
		t.Fatalf("fetch: %q, %v", body, err)
	}
	if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.7:" + port, "203.0.113.8:" + port}) {
		t.Fatalf("dialled %v", got)
	}

	g, rec = dialGate(t)
	rec.route("203.0.113.8:"+port, srv.Listener.Addr().String())
	g.pin("app.example.com", atoiPort(t, port), "2001:db8::1", "203.0.113.8")
	g.res.set("app.example.com", "2001:db8::1", "203.0.113.8")
	conn, err := PinnedDialer("WebFetch", true)(g.ctx(), "tcp4", "app.example.com:"+port)
	if err != nil {
		t.Fatalf("tcp4: %v", err)
	}
	conn.Close()
	if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.8:" + port}) {
		t.Fatalf("tcp4 dialled %v, want the IPv4 address only", got)
	}
}

// S1: the context net/http passes to DialContext carries the values of the
// request's context. The client is built without a scope (scoped=false), so
// only the request's context can send the dial down the pinned path.
func TestPinnedDialSeesScopeInDialContext(t *testing.T) {
	g, rec := dialGate(t)
	srv, _, port := pinnedServer(t, "scoped")
	rec.route("203.0.113.7:"+port, srv.Listener.Addr().String())
	g.pin("app.example.com", atoiPort(t, port), "203.0.113.7")
	g.res.set("app.example.com", "203.0.113.7")
	if body, err := get(g.ctx(), pinnedClient(false), "http://app.example.com:"+port+"/"); err != nil || body != "scoped" {
		t.Fatalf("fetch: %q, %v", body, err)
	}
	if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.7:" + port}) || g.res.lookups("app.example.com") != 1 {
		t.Fatalf("dialled %v after %d lookups, want the pinned path", got, g.res.lookups("app.example.com"))
	}
}

// S4: dialling the pinned address keeps HTTPS verified against the name of
// the request. A name the certificate does not hold fails verification.
func TestPinnedDialHTTPSVerifiesName(t *testing.T) {
	g, rec := dialGate(t)
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("verified")) }))
	t.Cleanup(srv.Close)
	_, port, _ := net.SplitHostPort(srv.Listener.Addr().String())
	rec.route("203.0.113.7:"+port, srv.Listener.Addr().String())
	// httptest's certificate holds example.com.
	for _, host := range []string{"example.com", "other.example"} {
		g.pin(host, atoiPort(t, port), "203.0.113.7")
		g.res.set(host, "203.0.113.7")
	}
	client := pinnedClient(true)
	client.Transport.(*http.Transport).TLSClientConfig = &tls.Config{RootCAs: srv.Client().Transport.(*http.Transport).TLSClientConfig.RootCAs}
	if body, err := get(g.ctx(), client, "https://example.com:"+port+"/"); err != nil || body != "verified" {
		t.Fatalf("https by the pinned address: %q, %v", body, err)
	}
	_, err := get(g.ctx(), client, "https://other.example:"+port+"/")
	var verr *tls.CertificateVerificationError
	if !errors.As(err, &verr) {
		t.Fatalf("a name the certificate does not hold: %v, want a verification error", err)
	}
	if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.7:" + port, "203.0.113.7:" + port}) {
		t.Fatalf("dialled %v", got)
	}
}

// S6: with keep-alive off (as Norma sets it on a transport with a dialer, and
// the custom tool on its own), a second fetch of one client dials again: a pin
// changed in between applies to it.
func TestPinnedDialNoReuseAcrossCalls(t *testing.T) {
	g, rec := dialGate(t)
	srv, _, port := pinnedServer(t, "again")
	rec.route("203.0.113.7:"+port, srv.Listener.Addr().String())
	rec.route("203.0.113.8:"+port, srv.Listener.Addr().String())
	p := atoiPort(t, port)
	g.pin("app.example.com", p, "203.0.113.7")
	g.res.set("app.example.com", "203.0.113.7")
	client := pinnedClient(true)
	u := "http://app.example.com:" + port + "/"
	if _, err := get(g.ctx(), client, u); err != nil {
		t.Fatal(err)
	}
	g.store.revoke("app.example.com", p)
	g.pin("app.example.com", p, "203.0.113.8")
	g.res.set("app.example.com", "203.0.113.8")
	if _, err := get(g.ctx(), client, u); err != nil {
		t.Fatal(err)
	}
	if got := rec.calls(); !slices.Equal(got, []string{"203.0.113.7:" + port, "203.0.113.8:" + port}) {
		t.Fatalf("dialled %v, want a new dial under the new pin", got)
	}
}

// S5: the redirected request keeps the original request's context, so the
// hop's redirect check and the hop's dial read the same target scope.
func TestRedirectContextCarriesScope(t *testing.T) {
	g, rec := dialGate(t)
	final, finalHits, finalKey := hopServer(t, "")
	start, _, startKey := hopServer(t, final.URL+"/final")
	for _, key := range []string{startKey, finalKey} {
		host, port, _ := net.SplitHostPort(key)
		g.pin(host, atoiPort(t, port), host)
	}
	var hopScope TargetScope
	var hopOK bool
	client := pinnedClient(true)
	policy := client.CheckRedirect
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		hopScope, hopOK = TargetScopeFromContext(req.Context())
		return policy(req, via)
	}
	if body, err := get(g.ctx(), client, start.URL+"/start"); err != nil || body != "hop-reached" || finalHits.Load() != 1 {
		t.Fatalf("redirect: %q, %v", body, err)
	}
	if !hopOK || hopScope.TaskID != g.scope.TaskID || hopScope.Interceptor != g.ic {
		t.Fatalf("hop context scope = %+v (%v), want the scope of the call", hopScope, hopOK)
	}
	if got := rec.calls(); !slices.Equal(got, []string{startKey, finalKey}) {
		t.Fatalf("dialled %v, want the origin then the hop through the pinned path", got)
	}
}

// D-2: a request raised while the upstream proxy is set says the platform does
// not bind the connection.
func TestNameOnlyReasonSaysConnectionNotBound(t *testing.T) {
	scope := TargetScope{TaskID: "7"}
	r := target("app.example.com", 443, "203.0.113.7")
	const sentence = "This approval is name-only. The platform does not bind the connection to these addresses."
	if got := targetReason(scope, r, nil, true); !strings.Contains(got, sentence) {
		t.Fatalf("name-only reason = %q", got)
	}
	if got := targetReason(scope, r, nil, false); strings.Contains(got, "does not bind") {
		t.Fatalf("reason without the upstream proxy = %q", got)
	}
}

// D-2: the first-use row of an unmarked pin used while the upstream proxy is
// set records the pin as name-only.
func TestPinUsedRecordsEffectiveNameOnly(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.pin("app.example.com", 443, "203.0.113.7")
	g.ic.SetUpstreamProxyCheck(func() bool { return true })
	g.passes("pinned", g.fetch(appURL))
	if got := g.store.outcomes(); len(got) != 1 || got[0] != "allowed/pin_match" || !g.store.logged[0].Audit.Targets[0].NameOnlyEffective {
		t.Fatalf("rows %v, target %+v; want a name-only first use", got, g.store.logged[0].Audit.Targets[0])
	}
}
