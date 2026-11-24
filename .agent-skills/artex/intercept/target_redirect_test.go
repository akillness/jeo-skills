package intercept

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// Step 1.9: every redirect hop of a platform-owned client goes through the gate.
// Without a database: a hop that would open a request is covered by the
// PostgreSQL tests.

// hopServer counts its requests and answers a fixed page, or a redirect to
// location when it is set.
func hopServer(t *testing.T, location string) (srv *httptest.Server, hits *atomic.Int64, key string) {
	t.Helper()
	hits = &atomic.Int64{}
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if location != "" {
			http.Redirect(w, r, location, http.StatusFound)
			return
		}
		_, _ = w.Write([]byte("hop-reached"))
	}))
	t.Cleanup(srv.Close)
	u, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	return srv, hits, u.Host
}

// hop calls the redirect policy of tool on one hop, as the client does.
func hop(ctx context.Context, to string, from ...string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, to, nil)
	if err != nil {
		panic(err)
	}
	via := make([]*http.Request, len(from))
	for n, f := range from {
		if via[n], err = http.NewRequestWithContext(ctx, http.MethodGet, f, nil); err != nil {
			panic(err)
		}
	}
	return RedirectCheck("WebFetch")(req, via)
}

func gatedFetch(ctx context.Context, rawURL string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := (&http.Client{CheckRedirect: RedirectCheck("WebFetch")}).Do(req)
	if resp != nil {
		resp.Body.Close()
	}
	return resp, err
}

// With the gate off, or without a scope, the policy is net/http's default:
// every hop is followed, up to 10, with the same error after that. Nothing is
// parsed, resolved, read or logged, not even a hop whose target cannot be read.
func TestRedirectGateOffKeepsDefaultPolicy(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	chain := make([]string, maxRedirects)
	for n := range chain {
		chain[n] = "http://app.example.com/"
	}
	for name, ctx := range map[string]context.Context{
		"no scope": context.Background(),
		"no flag":  WithTargetScope(context.Background(), TargetScope{TaskID: "7", WaitBound: time.Minute, Interceptor: g.ic}),
		"flag off": WithTargetScope(context.Background(), TargetScope{TaskID: "7", Enabled: func() bool { return false }, Interceptor: g.ic}),
	} {
		if err := hop(ctx, "https://other.example.com/", chain[:1]...); err != nil {
			t.Errorf("%s: %v, want the hop followed", name, err)
		}
		if err := hop(ctx, "http:///no-host", chain[:1]...); err != nil {
			t.Errorf("%s, no host: %v, want the hop followed", name, err)
		}
		if err := hop(ctx, "https://other.example.com/", chain[:maxRedirects-1]...); err != nil {
			t.Errorf("%s, hop 9: %v", name, err)
		}
		if err := hop(ctx, "https://other.example.com/", chain...); err == nil || err.Error() != "stopped after 10 redirects" {
			t.Errorf("%s, hop 10: %v, want net/http's limit", name, err)
		}

		// Through a real client: a hop to another port, which the gate would ask
		// for, is followed.
		final, finalHits, _ := hopServer(t, "")
		start, _, _ := hopServer(t, final.URL+"/final")
		if resp, err := gatedFetch(ctx, start.URL+"/start"); err != nil || resp.StatusCode != http.StatusOK || finalHits.Load() != 1 {
			t.Errorf("%s: chain not followed: %v, hits=%d", name, err, finalHits.Load())
		}
		loop := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, r.URL.Path+"x", http.StatusFound)
		}))
		_, gotErr := gatedFetch(ctx, loop.URL+"/l")
		_, wantErr := (&http.Client{}).Get(loop.URL + "/l")
		loop.Close()
		if gotErr == nil || wantErr == nil || gotErr.Error() != wantErr.Error() {
			t.Errorf("%s: redirect loop: %v, want the default policy's %v", name, gotErr, wantErr)
		}
	}
	if g.store.reads != 0 || len(g.store.logged) != 0 || g.res.total() != 0 {
		t.Errorf("gate off: %d store reads, %d rows, %d lookups, want none", g.store.reads, len(g.store.logged), g.res.total())
	}
	// Gate on, the limit holds as well, before anything is read.
	if err := hop(g.ctx(), "https://app.example.com/", chain...); err == nil || err.Error() != "stopped after 10 redirects" || g.store.reads != 0 {
		t.Errorf("gate on, hop 10: %v, %d store reads", err, g.store.reads)
	}
}

// A hop to a pinned target is followed, through a real client: the redirected
// request keeps the context of the call, so the policy finds the scope. The
// first use of the pin is logged with the origin of the redirect.
func TestRedirectToPinnedHostFollowed(t *testing.T) {
	g := newGate(t)
	final, finalHits, finalKey := hopServer(t, "")
	start, startHits, startKey := hopServer(t, final.URL+"/final")
	host, port, _ := net.SplitHostPort(finalKey)
	pin := &db.TargetPin{ID: 1, Host: host, Port: atoiPort(t, port), Version: 1, Status: db.TargetPinActive, PinnedIPs: []string{host}}
	g.store.pins = []*db.TargetPin{pin}

	resp, err := gatedFetch(g.ctx(), start.URL+"/start")
	if err != nil || resp.StatusCode != http.StatusOK || startHits.Load() != 1 || finalHits.Load() != 1 {
		t.Fatalf("pinned hop: %v, hits start=%d final=%d", err, startHits.Load(), finalHits.Load())
	}
	if got := g.store.outcomes(); len(got) != 1 || got[0] != "allowed/pin_match" {
		t.Fatalf("rows = %v, want the first use of the pin", got)
	}
	row := g.store.logged[0]
	if tgt := row.Audit.Targets[0]; tgt.Host != host || tgt.RedirectFrom != startKey || tgt.PinID != pin.ID {
		t.Fatalf("logged target = %+v, want %s from %s", tgt, finalKey, startKey)
	}
	if !strings.Contains(string(row.ToolInput), final.URL+"/final") || !strings.Contains(string(row.ToolInput), start.URL+"/start") {
		t.Fatalf("logged input = %s, want the hop and its origin", row.ToolInput)
	}
	if g.res.total() != 0 {
		t.Fatalf("%d lookups for an IP literal", g.res.total())
	}
}

// A (host, 0) pin covers every port: http -> https on that host is followed.
func TestRedirectToPortZeroPinnedHostFollowed(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.store.pins = []*db.TargetPin{{ID: 1, Host: "app.example.com", Port: 0, Version: 1, Status: db.TargetPinActive, PinnedIPs: []string{"203.0.113.7"}}}
	if err := hop(g.ctx(), "https://app.example.com/login", "http://app.example.com/login"); err != nil {
		t.Fatalf("http -> https under a (host, 0) pin: %v", err)
	}
}

// A block rule stops a hop before anything is resolved, whether it names the
// hop's host or its URL, and even when the hop stays on a pinned host. No
// request is opened.
func TestRedirectToBlockedNameNotResolved(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.res.set("evil.example", "198.51.100.9")
	g.store.pins = []*db.TargetPin{{ID: 1, Host: "app.example.com", Port: 443, Version: 1, Status: db.TargetPinActive, PinnedIPs: []string{"203.0.113.7"}}}
	g.store.rules = []db.AssetInterceptRule{
		{Enabled: true, Kind: "exact_domain", Pattern: "evil.example"},
		{Enabled: true, Kind: "exact_url", Pattern: "https://app.example.com/admin"},
	}

	err := hop(g.ctx(), "http://evil.example/x", "https://app.example.com/")
	if err == nil || !strings.Contains(err.Error(), TargetRuleBlocked) || !strings.Contains(err.Error(), "https://app.example.com/ redirects to evil.example:80") {
		t.Fatalf("hop to a blocked name: %v", err)
	}
	if n := g.res.lookups("evil.example"); n != 0 {
		t.Fatalf("the blocked name was resolved %d times", n)
	}
	err = hop(g.ctx(), "https://app.example.com/admin", "https://app.example.com/")
	if err == nil || !strings.Contains(err.Error(), TargetRuleBlocked) {
		t.Fatalf("hop to a blocked URL on a pinned host: %v", err)
	}
	if got := g.store.outcomes(); len(got) != 2 || got[0] != "denied/rule_blocked" || got[1] != "denied/rule_blocked" {
		t.Fatalf("rows = %v, want two blocks", got)
	}
	if from := g.store.logged[0].Audit.Targets[0].RedirectFrom; from != "app.example.com:443" {
		t.Fatalf("redirect_from = %q", from)
	}
	if g.res.total() != 0 {
		t.Fatalf("%d lookups, want none", g.res.total())
	}
}

// A hop whose target cannot be read is blocked with TARGET_GATE_UNAVAILABLE, as
// a rendered URL is, and opens no request.
func TestRedirectUnreadableHopBlocked(t *testing.T) {
	g := newGate(t)
	for _, to := range []*url.URL{
		{Scheme: "http", Path: "/no-host"},
		{Scheme: "http", Host: "app.example.com:99999", Path: "/"},
	} {
		req, _ := http.NewRequestWithContext(g.ctx(), http.MethodGet, "http://placeholder.example/", nil)
		req.URL = to
		via, _ := http.NewRequestWithContext(g.ctx(), http.MethodGet, "https://app.example.com/", nil)
		err := RedirectCheck("WebFetch")(req, []*http.Request{via})
		if err == nil || !strings.Contains(err.Error(), TargetGateUnavailable) {
			t.Errorf("%s: %v, want TARGET_GATE_UNAVAILABLE", to, err)
		}
	}
	if got := g.store.outcomes(); len(got) != 2 || got[0] != "denied/gate_unavailable" {
		t.Fatalf("rows = %v", got)
	}
	if g.res.total() != 0 {
		t.Fatalf("%d lookups, want none", g.res.total())
	}
}

func atoiPort(t *testing.T, s string) int {
	t.Helper()
	p := validPort(s)
	if p == 0 {
		t.Fatalf("port %q", s)
	}
	return p
}
