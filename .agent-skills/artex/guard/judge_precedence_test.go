package guard

import (
	"context"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
)

// Intercept rules run before the judge: a call a rule covers never reaches the
// closed-question judge or the freeform reviewer.
func TestRuleMatchDoesNotCallJudge(t *testing.T) {
	ic := intercept.New(nil)
	ic.SetRulesForTest([]db.InterceptRule{
		{ID: 1, Name: "deny marker", Enabled: true, Priority: 50, MatchTarget: "tool_input", MatchType: "string",
			Action: "deny", Pattern: "deny-marker", Message: "denied by rule"},
		{ID: 2, Name: "allow marker", Enabled: true, Priority: 40, MatchTarget: "tool_input", MatchType: "string",
			Action: "allow", Pattern: "allow-marker"},
	})
	calls := 0
	ic.SetCompleter(func(context.Context, int64, string, string) (string, int64, error) {
		calls++
		return "", 0, nil
	})
	ic.SetReviewer(func(context.Context, int64, string, intercept.ReviewInput) (intercept.Decision, error) {
		calls++
		return intercept.Decision{Action: "allow"}, nil
	})
	g := NewWithInterceptor(ic)
	if block, _ := pre(g, context.Background(), "Bash", `{"command":"echo deny-marker"}`); !block {
		t.Error("the deny rule did not block")
	}
	if block, msg := pre(g, context.Background(), "Bash", `{"command":"echo allow-marker"}`); block {
		t.Errorf("the allow rule blocked: %s", msg)
	}
	if calls != 0 {
		t.Fatalf("judge called %d times for calls a rule covered", calls)
	}
}
