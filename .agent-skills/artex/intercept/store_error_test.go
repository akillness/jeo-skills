package intercept

import (
	"bytes"
	"database/sql"
	"log"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// closedStore returns a store whose every read fails. No server is contacted:
// the handle is closed before its first query.
func closedStore(t *testing.T) *db.DB {
	t.Helper()
	sqlDB, err := sql.Open("pgx", "postgres://u:p@127.0.0.1:1/unreachable")
	if err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}
	return &db.DB{DB: sqlDB}
}

// A rule store that cannot be read must not open the gate: every tool enters the
// rule path, and every matcher denies. The error is logged once, not per call.
func TestStoreErrorFailsClosed(t *testing.T) {
	var logged bytes.Buffer
	prev := log.Writer()
	log.SetOutput(&logged)
	t.Cleanup(func() { log.SetOutput(prev) })

	ic := New(closedStore(t))
	input := []byte(`{"command":"ls -la"}`)
	for _, tool := range []string{"Bash", "ExecuteExtraTool", "Monitor", "Read", "my_custom_tool"} {
		if !ic.IsToolEnabled(tool) {
			t.Errorf("IsToolEnabled(%q) = false with an unreadable store, want true", tool)
		}
	}
	for name, match := range map[string]func(string, []byte) (Decision, bool){
		"Match":            ic.Match,
		"MatchBuiltin":     ic.MatchBuiltin,
		"MatchPersistence": ic.MatchPersistence,
	} {
		tool := "Bash"
		if name == "MatchPersistence" {
			tool = "create_mcp"
		}
		dec, ok := match(tool, input)
		if !ok || dec.Action != "deny" || !strings.Contains(dec.Message, "could not be loaded") {
			t.Errorf("%s with an unreadable store = %+v, %v; want a deny that names the cause", name, dec, ok)
		}
	}
	if n := strings.Count(logged.String(), "rule store cannot be read"); n != 1 {
		t.Errorf("the store error was logged %d times, want once:\n%s", n, logged.String())
	}
	if !strings.Contains(logged.String(), "sql: database is closed") {
		t.Errorf("the log line does not carry the error:\n%s", logged.String())
	}
}

// A malformed intercept_enabled_tools value read from the store keeps the
// defaults: ExecuteExtraTool and Monitor stay gated, read-only tools stay out.
func TestMalformedEnabledToolsSettingKeepsDefaults(t *testing.T) {
	d := targetTestDB(t)
	const key = "intercept_enabled_tools"
	prev, had, err := d.GetSetting(key)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if had {
			_ = d.SetSetting(key, prev)
			return
		}
		_, _ = d.Exec(`DELETE FROM settings WHERE key=$1`, key)
	})
	for _, val := range []string{"{not json", `"Bash"`, `{"Bash":true}`} {
		if err := d.SetSetting(key, val); err != nil {
			t.Fatal(err)
		}
		ic := New(d)
		for _, tool := range defaultEnabledTools {
			if !ic.IsToolEnabled(tool) {
				t.Errorf("setting %q: default tool %q is not gated", val, tool)
			}
		}
		if ic.IsToolEnabled("Read") {
			t.Errorf("setting %q: Read is gated, want the defaults only", val)
		}
	}
}

// A deny or ask rule whose pattern does not compile cannot be evaluated; it
// matches as a deny instead of being skipped. A broken allow rule allows nothing.
func TestUncompilableRuleFailsClosed(t *testing.T) {
	d := targetTestDB(t)
	create := func(name, matchType, pattern, action string, priority int) db.InterceptRule {
		t.Helper()
		r, err := d.CreateInterceptRule(name, "tool_input", matchType, pattern, action, "", priority, true, false, 0, "deny")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = d.DeleteInterceptRule(r.ID) })
		return r
	}
	input := []byte(`{"command":"ls -la"}`)

	allow := create("broken allow", "regex", "(", "allow", 1000002)
	if dec, ok := New(d).Match("Bash", input); ok && dec.RuleID == allow.ID {
		t.Fatalf("a broken allow rule matched: %+v", dec)
	}
	for n, tc := range []struct{ matchType, pattern, action string }{
		{"regex", "(", "ask"},
		{"regex", "[z-a]", "deny"},
		{"argv", `"unterminated`, "deny"},
	} {
		r := create("broken "+tc.action, tc.matchType, tc.pattern, tc.action, 1000001-n)
		ic := New(d)
		dec, ok := ic.Match("Bash", input)
		if !ok || dec.Action != "deny" || dec.RuleID != r.ID || !strings.Contains(dec.Message, "does not compile") {
			t.Errorf("%s %s rule %q: Match = %+v, %v; want a deny by rule %d", tc.matchType, tc.action, tc.pattern, dec, ok, r.ID)
		}
		// A user rule, broken or not, is not a built-in rule.
		if dec, ok := ic.MatchBuiltin("Bash", input); ok {
			t.Errorf("MatchBuiltin matched a broken user rule: %+v", dec)
		}
		_ = d.DeleteInterceptRule(r.ID)
	}
}
