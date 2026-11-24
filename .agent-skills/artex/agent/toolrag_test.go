package agent

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"

	actool "github.com/Autumn-27/norma/tool"
)

func ragTool(name, desc string, params ...string) actool.CoreTool {
	props := map[string]any{}
	for _, p := range params {
		props[p] = map[string]any{"type": "string"}
	}
	return actool.Build(actool.Spec{Name: name, Description: desc, Schema: map[string]any{"type": "object", "properties": props}})
}

// ragCatalog: two core tools, three meaningful fixtures, and filler up to n tools.
func ragCatalog(n int) []actool.CoreTool {
	tools := []actool.CoreTool{
		ragTool("record_fact", "Record a fact"),
		ragTool("port_scan", "Scan TCP ports on a host, nmap-like service discovery", "host", "ports"),
		ragTool("sqli_probe", "Probe web parameters for SQL injection", "url", "param"),
		ragTool("http_request", "Send an HTTP request to a web endpoint", "url", "method"),
		ragTool("list_assets", "List assets"),
	}
	for i := len(tools); i < n; i++ {
		tools = append(tools, ragTool(fmt.Sprintf("filler_%02d", i), "Unrelated helper"))
	}
	return tools
}

func ragNames(tools []actool.CoreTool) (out []string) {
	for _, t := range tools {
		out = append(out, t.Name())
	}
	return out
}

const ragQuery = "Find SQL injection in the web login form"

func TestToolRAGRanksInjectionAboveScan(t *testing.T) {
	ranked, err := rankTools(ragQuery, ragCatalog(5), bm25Score)
	if err != nil {
		t.Fatal(err)
	}
	n := ragNames(ranked)
	if scan := slices.Index(n, "port_scan"); slices.Index(n, "sqli_probe") > scan || slices.Index(n, "http_request") > scan {
		t.Fatalf("ranking = %v, want sqli_probe and http_request above port_scan", n)
	}
	if n[0] != "sqli_probe" {
		t.Fatalf("top = %s, want sqli_probe", n[0])
	}
}

func TestToolRAGCoreKeptAndKRespected(t *testing.T) {
	keep := toolRAGKeep(nil)
	for _, k := range []int{1, 3} {
		out, projected, err := projectTools(ragQuery, ragCatalog(25), keep, k, bm25Score)
		if err != nil || !projected {
			t.Fatalf("k=%d: projected=%v err=%v", k, projected, err)
		}
		n := ragNames(out)
		if !slices.Contains(n, "record_fact") || !slices.Contains(n, "list_assets") {
			t.Fatalf("k=%d: core tool hidden: %v", k, n)
		}
		if slices.Contains(n, "goal_met") {
			t.Fatalf("k=%d: unbound core tool added: %v", k, n)
		}
		if nonCore := len(out) - 2; nonCore > k {
			t.Fatalf("k=%d: %d non-core tools selected: %v", k, nonCore, n)
		}
		if !slices.Contains(n, "sqli_probe") {
			t.Fatalf("k=%d: best match missing: %v", k, n)
		}
	}
}

// The projection runs after ToolResolve, so a tool the binding/enabled filter
// dropped is never selected even when it is the best lexical match.
func TestToolRAGNeverSelectsUnboundOrDisabled(t *testing.T) {
	oldResolve, oldAugment, oldPolicy := ToolResolve(), ToolAugment(), FindingTrafficBindingEnabled()
	t.Cleanup(func() {
		SetToolResolve(oldResolve)
		SetToolAugment(oldAugment)
		SetFindingTrafficBindingEnabled(oldPolicy)
	})
	SetToolAugment(nil)
	SetFindingTrafficBindingEnabled(nil)
	t.Setenv(toolRAGEnv, "on")
	t.Setenv(toolRAGTopKEnv, "2")
	SetToolResolve(func(_ context.Context, _ string, in []actool.CoreTool) []actool.CoreTool {
		var out []actool.CoreTool
		for _, tool := range in {
			if tool.Name() != "sql_injection_exploit" {
				out = append(out, tool)
			}
		}
		return out
	})
	base := append(ragCatalog(25), ragTool("sql_injection_exploit", "Exploit SQL injection in web login form", "url"))
	out, _, cleanup := AugmentTools(WithToolQuery(t.Context(), ragQuery), "worker", base)
	defer cleanup()
	n := ragNames(out)
	if slices.Contains(n, "sql_injection_exploit") {
		t.Fatalf("unbound tool selected: %v", n)
	}
	if len(out) != 4 || !slices.Contains(n, "sqli_probe") {
		t.Fatalf("got %v, want 2 core + top 2", n)
	}
}

func TestToolRAGFallbacks(t *testing.T) {
	keep := toolRAGKeep(nil)
	failing := func(string, []actool.CoreTool) ([]float64, error) { return nil, errors.New("boom") }
	for name, c := range map[string]struct {
		query string
		n     int
		score ToolScorer
	}{"empty query": {"  ", 25, bm25Score}, "catalog under 20": {ragQuery, 19, bm25Score}, "scoring error": {ragQuery, 25, failing}} {
		in := ragCatalog(c.n)
		out, projected, err := projectTools(c.query, in, keep, 1, c.score)
		if projected || (err != nil) != (name == "scoring error") || !slices.Equal(ragNames(out), ragNames(in)) {
			t.Errorf("%s: projected=%v err=%v out=%v", name, projected, err, ragNames(out))
		}
	}
}

func TestToolRAGDeterministic(t *testing.T) {
	keep := toolRAGKeep(nil)
	// "zzz" matches nothing: every candidate ties at 0 and the name tie-break decides.
	for _, q := range []string{ragQuery, "zzz"} {
		first, _, _ := projectTools(q, ragCatalog(30), keep, 4, bm25Score)
		for i := 0; i < 20; i++ {
			again, _, _ := projectTools(q, ragCatalog(30), keep, 4, bm25Score)
			if !slices.Equal(ragNames(first), ragNames(again)) {
				t.Fatalf("%q: run %d = %v, want %v", q, i, ragNames(again), ragNames(first))
			}
		}
	}
	ranked, _ := rankTools("zzz", ragCatalog(8), bm25Score)
	if n := ragNames(ranked); !slices.IsSorted(n) {
		t.Fatalf("ties not ordered by name: %v", n)
	}
}

// Pins the keep set beyond the core list: harness tools, Skill and deferred names
// are never hidden, even when the query matches something else.
func TestToolRAGKeepsHarnessSkillAndDeferred(t *testing.T) {
	in := append(ragCatalog(15), actool.DefaultTools()...)
	in = append(in, ragTool("Skill", "Load a skill"), ragTool("mcp__srv__crawl", "Crawl pages"))
	out, projected, err := projectTools(ragQuery, in, toolRAGKeep([]string{"mcp__srv__crawl"}), 1, bm25Score)
	if err != nil || !projected || len(in) <= 20 {
		t.Fatalf("projected=%v err=%v n=%d", projected, err, len(in))
	}
	n := ragNames(out)
	for _, want := range append(ragNames(actool.DefaultTools()), "Skill", "mcp__srv__crawl", "sqli_probe") {
		if !slices.Contains(n, want) {
			t.Fatalf("%s hidden: %v", want, n)
		}
	}
	if slices.Contains(n, "http_request") {
		t.Fatalf("k=1 exceeded: %v", n)
	}
}
