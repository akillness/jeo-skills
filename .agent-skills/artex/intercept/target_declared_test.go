package intercept

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// The declared forms of a call decide first: the URL block rules on the URLs
// the call writes, then the block rules on every name, IP literal and range as
// written. Nothing is resolved before that, so a hit costs no lookup.

func TestExtractDeclaredURLs(t *testing.T) {
	raw := func(v any) []byte {
		b, _ := json.Marshal(v)
		return b
	}
	for _, c := range []struct {
		name  string
		tool  string
		input []byte
		want  []string
	}{
		{"WebFetch", "WebFetch", raw(map[string]string{"url": " https://app.example.com/admin?x=1 "}), []string{"https://app.example.com/admin?x=1"}},
		{"WebFetch without a target", "WebFetch", raw(map[string]string{"url": "http:///path"}), nil},
		{"Bash, query kept", "Bash", raw(command("curl -s 'https://a.example.com/admin?x=1'")), []string{"https://a.example.com/admin?x=1"}},
		{"Bash, two URLs", "Bash", raw(command("curl http://a.example.com/x && curl https://b.example.com:8443/y")),
			[]string{"http://a.example.com/x", "https://b.example.com:8443/y"}},
		{"shell_send", "shell_send", raw(map[string]string{"text": "curl http://a.example.com/x\n"}), []string{"http://a.example.com/x"}},
		{"Monitor", "Monitor", raw(command("watch curl http://198.51.100.9:8080/status")), []string{"http://198.51.100.9:8080/status"}},
		{"MCP string leaves", "mcp__scan__run", []byte(`{"target":"http://a.example.com/p","opts":{"list":["https://b.example.com/q"]}}`),
			[]string{"http://a.example.com/p", "https://b.example.com/q"}},
		{"ExecuteExtraTool unwrap", executeExtraTool, raw(map[string]any{"tool_name": "WebFetch", "params": map[string]string{"url": "https://a.example.com/z"}}),
			[]string{"https://a.example.com/z"}},
		{"tool without a target", "web_search", raw(map[string]string{"query": "https://a.example.com/admin"}), nil},
		{"wrapped tool without a target", executeExtraTool, raw(map[string]any{"tool_name": "web_search", "params": map[string]string{"query": "https://a.example.com/admin"}}), nil},
		{"authority that names no host", "Bash", raw(command("curl http://$HOST/x https://${H}:8443/admin")), nil},
	} {
		d := extractDeclared(c.tool, c.input)
		if !slices.Equal(d.urls, c.want) {
			t.Errorf("%s: urls = %q, want %q", c.name, d.urls, c.want)
		}
		// The targets are those ExtractTargets returns.
		if !slices.Equal(d.targets, ExtractTargets(c.tool, c.input)) {
			t.Errorf("%s: targets differ from ExtractTargets", c.name)
		}
		if len(d.urls) > 0 && len(d.targets) == 0 {
			t.Errorf("%s: a URL without a target", c.name)
		}
	}
}

// A name that a name rule blocks is blocked on the name as written: no lookup
// is made for it, nor for another name of the same call that no rule blocks.
func TestBlockRuleOnDeclaredNameNeedsNoLookup(t *testing.T) {
	for _, rule := range []db.AssetInterceptRule{
		{Enabled: true, Kind: "exact_domain", Pattern: "blocked.example.com"},
		{Enabled: true, Kind: "fuzzy_domain", Pattern: "blocked.example"},
	} {
		g := newGate(t)
		g.res.set("ok.example.com", "203.0.113.7")
		g.res.set("blocked.example.com", "203.0.113.8")
		g.store.rules = []db.AssetInterceptRule{rule}
		for name, v := range map[string]verdict{
			"WebFetch": g.fetch("https://blocked.example.com/"),
			// The unblocked name comes first in the call.
			"two names": g.check("Bash", `{"command":"curl https://ok.example.com/ https://blocked.example.com/"}`),
		} {
			res := g.blocked(rule.Kind+", "+name, TargetRuleBlocked, v)
			if res.Host != "blocked.example.com" || !strings.Contains(res.Reason, rule.Pattern) {
				t.Fatalf("%s, %s: result = %+v", rule.Kind, name, res)
			}
		}
		if n := g.res.total(); n != 0 {
			t.Fatalf("%s: %d lookups, want none", rule.Kind, n)
		}
		for _, row := range g.store.logged {
			if a := row.Audit.Targets[0]; a.Outcome != "rule_blocked" || len(a.ResolvedIPs) != 0 {
				t.Fatalf("%s: logged target = %+v, want rule_blocked with no address", rule.Kind, a)
			}
		}
	}
}

// URL rules apply at dispatch, on the URLs the call declares, before anything
// is resolved. A hit blocks with the code of every block rule, opens no
// request, and wins over a pin and an exemption.
func TestURLBlockRuleAtDispatch(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.res.set("pypi.org", "151.101.0.223")
	g.store.exempt = []db.TargetExemption{{Host: "pypi.org", Port: 443}}
	g.store.approve(TargetRequest{Host: "app.example.com", Port: 443, ResolvedIPs: []string{"203.0.113.7"}})
	g.passes("pinned", g.fetch("https://app.example.com/admin"))
	g.passes("exempt", g.fetch("https://pypi.org/admin"))

	rule := func(kind, pattern string, enabled bool) []db.AssetInterceptRule {
		return []db.AssetInterceptRule{{Enabled: enabled, Kind: kind, Pattern: pattern}}
	}
	// A disabled URL rule blocks nothing.
	g.store.rules = rule("exact_url", "https://app.example.com/admin", false)
	g.passes("disabled rule", g.fetch("https://app.example.com/admin"))

	lookups, rows := g.res.total(), len(g.store.logged)
	for _, c := range []struct {
		name       string
		rules      []db.AssetInterceptRule
		v          func() verdict
		host       string
		port       int
		matchedURL string
	}{
		{"exact_url, WebFetch of a pinned host", rule("exact_url", "https://app.example.com/admin", true),
			func() verdict { return g.fetch("https://app.example.com/admin") }, "app.example.com", 443, "https://app.example.com/admin"},
		{"fuzzy_url, exempt host", rule("fuzzy_url", "/admin", true),
			func() verdict { return g.fetch("https://pypi.org/admin") }, "pypi.org", 443, "https://pypi.org/admin"},
		{"fuzzy_url, Bash with a query", rule("fuzzy_url", "/admin", true),
			func() verdict { return g.check("Bash", `{"command":"curl -s 'https://app.example.com/admin?x=1'"}`) }, "app.example.com", 443, "https://app.example.com/admin?x=1"},
		{"fuzzy_url, second URL of the call", rule("fuzzy_url", "/admin", true),
			func() verdict {
				return g.check("Bash", `{"command":"curl https://app.example.com/ && curl http://198.51.100.9:8080/admin"}`)
			}, "198.51.100.9", 8080, "http://198.51.100.9:8080/admin"},
		{"fuzzy_url, MCP input", rule("fuzzy_url", "/ADMIN", true),
			func() verdict { return g.check("mcp__scan__run", `{"target":"https://app.example.com/admin/users"}`) }, "app.example.com", 443, "https://app.example.com/admin/users"},
		{"exact_url, wrapped WebFetch", rule("exact_url", "https://app.example.com/admin", true),
			func() verdict {
				return g.check(executeExtraTool, `{"tool_name":"WebFetch","params":{"url":"https://app.example.com/admin"}}`)
			}, "app.example.com", 443, "https://app.example.com/admin"},
	} {
		g.store.rules = c.rules
		g.res.set("app.example.com", "198.51.100.200") // a lookup would make a pinned host ask
		res := g.blocked(c.name, TargetRuleBlocked, c.v())
		if res.Host != c.host || res.Port != c.port || !strings.Contains(res.Reason, c.matchedURL+" is blocked by an asset rule") ||
			!strings.Contains(res.Reason, c.rules[0].Pattern) {
			t.Errorf("%s: result = %+v", c.name, res)
		}
	}
	if n := g.res.total() - lookups; n != 0 {
		t.Fatalf("%d lookups for calls a URL rule blocks, want none", n)
	}
	if got := g.store.outcomes()[rows:]; len(got) != 6 || slices.ContainsFunc(got, func(o string) bool { return o != "denied/rule_blocked" }) {
		t.Fatalf("logged rows = %v, want 6 rule_blocked rows", got)
	}

	// The rendered URL of a custom http tool and the URLs of a rendered command
	// meet the same rules, with no lookup.
	g.store.rules = rule("exact_url", "https://app.example.com/admin", true)
	if res := GateRenderedURL(g.ctx(), "probe_http", "https://app.example.com/admin"); res.Code != TargetRuleBlocked || res.Host != "app.example.com" {
		t.Fatalf("rendered URL: %+v", res)
	}
	g.store.rules = rule("fuzzy_url", "/admin", true)
	if res := GateRenderedCommand(g.ctx(), "probe_cmd", "curl 'https://app.example.com/admin'"); res.Code != TargetRuleBlocked {
		t.Fatalf("rendered command: %+v", res)
	}
	if n := g.res.total() - lookups; n != 0 {
		t.Fatalf("%d lookups for rendered calls a URL rule blocks, want none", n)
	}
}

// Documents the known limit of URL rules: they match the URL as the call
// writes it. Another spelling of the same URL is not blocked. For a host, a
// domain, IP or CIDR rule is the one to write.
func TestExactURLRuleMatchesOnlyAsWritten(t *testing.T) {
	g := newGate(t)
	g.res.set("app.example.com", "203.0.113.7")
	g.store.approve(TargetRequest{Host: "app.example.com", Port: 443, ResolvedIPs: []string{"203.0.113.7"}})

	g.store.rules = []db.AssetInterceptRule{{Enabled: true, Kind: "exact_url", Pattern: "https://app.example.com/admin"}}
	g.blocked("as written", TargetRuleBlocked, g.fetch("https://app.example.com/admin"))
	for _, u := range []string{
		"https://APP.example.com/admin",     // case of the host
		"https://app.example.com/Admin",     // case of the path
		"https://app.example.com/admin/",    // trailing slash
		"https://app.example.com/admin?x=1", // added query
		"https://app.example.com/%61dmin",   // percent-encoding
		"https://app.example.com/./admin",   // dot segment
		"https://app.example.com:443/admin", // default port written out
	} {
		g.passes("exact_url, "+u, g.fetch(u))
	}

	g.store.rules = []db.AssetInterceptRule{{Enabled: true, Kind: "fuzzy_url", Pattern: "/admin"}}
	g.blocked("fuzzy, as written", TargetRuleBlocked, g.fetch("https://app.example.com/x/admin"))
	for _, u := range []string{"https://app.example.com/%61dmin", "https://app.example.com/adm%69n", "https://app.example.com//%2fadmin"} {
		if strings.Contains(strings.ToLower(u), "/admin") {
			t.Fatalf("%s contains the pattern; the case documents an encoded form", u)
		}
		g.passes("fuzzy_url, "+u, g.fetch(u))
	}
}
