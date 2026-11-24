package intercept

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// The gate inside the custom tools: GateRenderedURL and GateRenderedCommand
// read what the tool is about to run. Without a database: the cases that reach
// a request are covered by the server tests.

func (g *gateFixture) ctx() context.Context {
	return WithTargetScope(context.Background(), g.scope)
}

// With the gate off, or without a scope (the operator's test endpoint), the
// rendered target is not even parsed: nothing is read, resolved or logged, and
// a URL the gate could not read passes too, as it did before the gate.
func TestRenderedGateOffTouchesNothing(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	for name, ctx := range map[string]context.Context{
		"no scope": context.Background(),
		"no flag":  WithTargetScope(context.Background(), TargetScope{TaskID: "7", WaitBound: time.Minute, Interceptor: g.ic}),
		"flag off": WithTargetScope(context.Background(), TargetScope{TaskID: "7", Enabled: func() bool { return false }, Interceptor: g.ic}),
	} {
		for _, res := range []TargetResult{
			GateRenderedURL(ctx, "probe", appURL),
			GateRenderedURL(ctx, "probe", "http://a b/"),
			GateRenderedCommand(ctx, "probe", "curl "+appURL),
		} {
			if res != (TargetResult{}) {
				t.Errorf("%s: %+v, want nothing", name, res)
			}
		}
	}
	if g.store.reads != 0 || len(g.store.logged) != 0 || g.res.total() != 0 {
		t.Errorf("gate off: %d store reads, %d rows, %d lookups, want none", g.store.reads, len(g.store.logged), g.res.total())
	}
}

// The target of a rendered URL is read as net/http dials it: the host of the
// parsed URL, the explicit port, else the default of the scheme.
func TestRenderedURLTarget(t *testing.T) {
	for _, c := range []struct {
		raw  string
		want Target
	}{
		{"https://App.Example.COM./x?next=http://other.example/", Target{TargetDomain, "app.example.com", 443}},
		{"http://user:pw@203.0.113.7:8080/a", Target{TargetIP, "203.0.113.7", 8080}},
		{"http://[::ffff:203.0.113.7]/", Target{TargetIP, "203.0.113.7", 80}},
		{"http://[2001:db8::1]:8443/", Target{TargetIP, "2001:db8::1", 8443}},
		{"http://2130706433/", Target{TargetIP, "127.0.0.1", 80}},
		{"HTTPS://bücher.example/", Target{TargetDomain, "xn--bcher-kva.example", 443}},
		// The client's reading of the authority, not the shell's: a.example; is userinfo.
		{"http://a.example;@b.example/", Target{TargetDomain, "b.example", 80}},
	} {
		got, err := urlTarget(c.raw)
		if err != nil || got != c.want {
			t.Errorf("%q: %+v, %v; want %+v", c.raw, got, err, c.want)
		}
	}
	for _, raw := range []string{
		"http://a b/",                    // not a URL the client accepts
		`http://a.example\@b.example/`,   // idem
		"http://[::1/",                   // idem
		"http:///path",                   // no host
		"app.example.com/path",           // no scheme: no host
		"http://app.example.com:99999/x", // no valid port
	} {
		if got, err := urlTarget(raw); err == nil {
			t.Errorf("%q: %+v, want no target", raw, got)
		}
	}
}

// A rendered URL whose target cannot be read is blocked: no lookup, no
// request, one decided row that records the URL.
func TestRenderedURLWithoutTargetFailsClosed(t *testing.T) {
	g := newGate(t)
	for n, raw := range []string{"http://a b/", "http:///path", "app.example.com/path", "http://app.example.com:99999/"} {
		res := GateRenderedURL(g.ctx(), "probe_http", raw)
		if res.Code != TargetGateUnavailable || !strings.Contains(res.Reason, "could not be read") {
			t.Fatalf("%q: %+v, want %s", raw, res, TargetGateUnavailable)
		}
		if len(g.store.logged) != n+1 {
			t.Fatalf("%q: %d rows, want %d", raw, len(g.store.logged), n+1)
		}
		row := g.store.logged[n]
		var input map[string]string
		_ = json.Unmarshal(row.ToolInput, &input)
		if row.Status != "denied" || row.ToolName != "probe_http" || input["url"] != raw || row.Audit.Targets[0].Outcome != "gate_unavailable" {
			t.Fatalf("%q: row = %+v (input %s)", raw, row, row.ToolInput)
		}
	}
	if g.res.total() != 0 {
		t.Fatalf("%d lookups, want none", g.res.total())
	}
}

// A gated scope without the interceptor that owns the gate cannot decide: the
// call is blocked, never let through.
func TestRenderedGateWithoutInterceptorFailsClosed(t *testing.T) {
	ctx := WithTargetScope(context.Background(), TargetScope{TaskID: "7", Enabled: func() bool { return true }})
	for name, res := range map[string]TargetResult{
		"url":            GateRenderedURL(ctx, "probe", appURL),
		"unreadable url": GateRenderedURL(ctx, "probe", "http://a b/"),
		"command":        GateRenderedCommand(ctx, "probe", "curl "+appURL),
	} {
		if res.Code != TargetGateUnavailable {
			t.Errorf("%s: %+v, want %s", name, res, TargetGateUnavailable)
		}
	}
	// A command that names no target needs no gate.
	if res := GateRenderedCommand(ctx, "probe", "ls -la"); res != (TargetResult{}) {
		t.Errorf("no target: %+v, want nothing", res)
	}
}

// The rendered target goes through the same decision as a target at the hook:
// block rules, resolution, pins. A pinned target passes, a blocked one is
// blocked without a request.
func TestRenderedTargetUsesTheGateDecision(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.store.approve(TargetRequest{Host: "app.example.com", Port: 443, ResolvedIPs: []string{"203.0.113.7"}})
	g.store.approve(TargetRequest{Host: "198.51.100.9", Port: 8080, ResolvedIPs: []string{"198.51.100.9"}})

	for name, res := range map[string]TargetResult{
		"url":                 GateRenderedURL(g.ctx(), "probe", appURL),
		"url, ip and port":    GateRenderedURL(g.ctx(), "probe", "http://198.51.100.9:8080/x"),
		"command":             GateRenderedCommand(g.ctx(), "probe", "curl -s '"+appURL+"'"),
		"command, no target":  GateRenderedCommand(g.ctx(), "probe", "nmap -sV app.example.com"),
		"command, ip literal": GateRenderedCommand(g.ctx(), "probe", "nc 198.51.100.9:8080"),
	} {
		if res != (TargetResult{}) {
			t.Errorf("%s: %+v, want the call to pass", name, res)
		}
	}

	g.res.errs["down.example"] = context.DeadlineExceeded
	if res := GateRenderedURL(g.ctx(), "probe", "https://down.example/"); res.Code != TargetResolveFailed || res.Host != "down.example" {
		t.Fatalf("unresolvable: %+v", res)
	}
	g.store.rules = []db.AssetInterceptRule{{Enabled: true, Kind: "exact_domain", Pattern: "app.example.com"}}
	for name, res := range map[string]TargetResult{
		"url":     GateRenderedURL(g.ctx(), "probe", appURL),
		"command": GateRenderedCommand(g.ctx(), "probe", "curl "+appURL),
	} {
		if res.Code != TargetRuleBlocked || res.Host != "app.example.com" || res.Port != 443 {
			t.Errorf("%s: %+v, want %s on the pinned host", name, res, TargetRuleBlocked)
		}
	}
	if !strings.Contains(strings.Join(g.store.outcomes(), " "), "denied/rule_blocked") {
		t.Fatalf("rows = %v, want the block logged", g.store.outcomes())
	}
}

// The shell quoting of a parameter inside a host name hides the name from the
// command-string rules; the reading without the quoting is read as well.
func TestRenderedCommandReadsTheUnquotedRendering(t *testing.T) {
	g := newGate(t)
	g.store.rules = []db.AssetInterceptRule{{Enabled: true, Kind: "exact_domain", Pattern: "api.example.com"}}
	quoted := "curl http://'api'.example.com:8080/"
	if res := GateRenderedCommand(g.ctx(), "probe", quoted); res != (TargetResult{}) {
		t.Fatalf("quoted only: %+v; the rules were expected to miss the name", res)
	}
	res := GateRenderedCommand(g.ctx(), "probe", quoted, "curl http://api.example.com:8080/")
	if res.Code != TargetRuleBlocked || res.Host != "api.example.com" || res.Port != 8080 {
		t.Fatalf("with the unquoted reading: %+v, want %s on api.example.com:8080", res, TargetRuleBlocked)
	}
}
