package intercept

import (
	"testing"

	"github.com/Autumn-27/artex/db"
)

const customToolApproval = `^(?:create_custom_tool|update_custom_tool)$`

func builtinAsk(enabled bool) db.InterceptRule {
	return db.InterceptRule{
		ID: 1, Name: "[built-in] Persistent change: custom tool", Enabled: enabled, Priority: 95,
		MatchTarget: "tool_name", MatchType: "regex", Pattern: customToolApproval,
		Action: "ask", Message: "approve the custom tool",
	}
}

func TestPersistenceToolsAreSixNamedTools(t *testing.T) {
	if len(PersistenceTools) != 6 {
		t.Fatalf("got %d persistence tools, want 6", len(PersistenceTools))
	}
	for _, name := range PersistenceTools {
		if !IsPersistenceTool(name) {
			t.Fatalf("%s not recognised", name)
		}
	}
	if IsPersistenceTool("Bash") {
		t.Fatal("Bash is not a persistence tool")
	}
}

func TestBuiltinAskAnswersPersistenceCall(t *testing.T) {
	ic := New(nil)
	ic.SetRulesForTest([]db.InterceptRule{builtinAsk(true)})
	dec, ok := ic.MatchPersistence("create_custom_tool", []byte(`{"key":"x"}`))
	if !ok || dec.Action != "ask" {
		t.Fatalf("got %+v ok=%v, want an ask", dec, ok)
	}
	if dec.RuleName != "[built-in] Persistent change: custom tool" {
		t.Fatalf("rule name = %q", dec.RuleName)
	}
}

func TestPersistenceIgnoresOtherTools(t *testing.T) {
	ic := New(nil)
	ic.SetRulesForTest([]db.InterceptRule{builtinAsk(true)})
	if _, ok := ic.MatchPersistence("Bash", []byte(`{"command":"create_custom_tool"}`)); ok {
		t.Fatal("a tool outside PersistenceTools must not be answered here")
	}
}

// An operator-disabled built-in rule is not loaded, so nothing answers the call.
func TestDisabledBuiltinAskDoesNotApply(t *testing.T) {
	ic := New(nil)
	ic.SetRulesForTest([]db.InterceptRule{builtinAsk(false)})
	if _, ok := ic.MatchPersistence("create_custom_tool", nil); ok {
		t.Fatal("a disabled rule must not answer")
	}
}

// An allow rule at a higher priority cannot skip the built-in approval.
func TestUserAllowCannotBypassApproval(t *testing.T) {
	ic := New(nil)
	ic.SetRulesForTest([]db.InterceptRule{
		{ID: 2, Name: "user allow all", Enabled: true, Priority: 500,
			MatchTarget: "tool_name", MatchType: "regex", Pattern: `.*`, Action: "allow"},
		builtinAsk(true),
	})
	dec, ok := ic.MatchPersistence("update_custom_tool", nil)
	if !ok || dec.Action != "ask" {
		t.Fatalf("got %+v ok=%v, want the approval to stand", dec, ok)
	}
}

// A user deny that matches a persistence call wins over the built-in approval.
func TestUserDenyWinsOverApproval(t *testing.T) {
	ic := New(nil)
	ic.SetRulesForTest([]db.InterceptRule{
		{ID: 3, Name: "user deny custom tools", Enabled: true, Priority: 10,
			MatchTarget: "tool_name", MatchType: "regex", Pattern: `custom_tool`, Action: "deny"},
		builtinAsk(true),
	})
	dec, ok := ic.MatchPersistence("create_custom_tool", nil)
	if !ok || dec.Action != "deny" {
		t.Fatalf("got %+v ok=%v, want deny", dec, ok)
	}
}
