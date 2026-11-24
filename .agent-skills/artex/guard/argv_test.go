package guard

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
)

// An argv allow rule is an allow like any other: a higher-priority deny rule
// still wins, and the target gate still runs after it.
func TestArgvAllowKeepsDenyAndTargetGate(t *testing.T) {
	ic := intercept.New(nil)
	ic.SetRulesForTest([]db.InterceptRule{
		{ID: 1, Name: "no force flag", Enabled: true, Priority: 50, MatchTarget: "tool_input", MatchType: "string",
			Pattern: "--force", Action: "deny", Message: "force push is forbidden"},
		{ID: 2, Name: "argv allow curl", Enabled: true, Priority: -1000, MatchTarget: "tool_input", MatchType: "argv",
			Pattern: `["curl"]`, Action: "allow"},
		{ID: 3, Name: "argv allow nmap", Enabled: true, Priority: -1000, MatchTarget: "tool_input", MatchType: "argv",
			Pattern: `["nmap"]`, Action: "allow"},
	})
	g := NewWithInterceptor(ic)
	gate := &fakeGate{t: t, check: unpinnedOnce, request: func(int, []intercept.TargetRequest, *intercept.Decision) intercept.TargetResult {
		return intercept.TargetResult{Code: intercept.TargetDenied, Host: "app.example.com", Port: 443, Reason: "the request was denied"}
	}}
	g.gate = gate
	ctx := gateOn(context.Background(), "7", time.Minute)

	if block, msg := pre(g, ctx, "Bash", `{"command":"nmap --force 10.0.0.1"}`); !block || !strings.Contains(msg, "force push is forbidden") {
		t.Fatalf("deny over argv allow: block=%v msg=%q", block, msg)
	}
	if gate.checks != 0 {
		t.Fatalf("the gate was reached on a deny: %d checks", gate.checks)
	}
	block, msg := pre(g, ctx, "Bash", `{"command":"curl https://app.example.com/"}`)
	if !block || !strings.Contains(msg, "TARGET_DENIED") {
		t.Fatalf("argv allow bypassed the target gate: block=%v msg=%q", block, msg)
	}
	if gate.checks != 1 || len(gate.asked) != 1 || gate.asks[0] != nil {
		t.Fatalf("checks=%d requests=%d asks=%v, want one check and one request without an ask", gate.checks, len(gate.asked), gate.asks)
	}
}
