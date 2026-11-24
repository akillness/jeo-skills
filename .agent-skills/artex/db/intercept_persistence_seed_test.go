package db

import "testing"

// A start that stopped after the rule inserts and before the settings flag runs the
// seed again on the next start: it must succeed and must not duplicate a rule.
func TestSeedPersistenceApprovalRulesIsIdempotent(t *testing.T) {
	d := openTargetDB(t) // Open already ran the seed once
	names := []string{
		"[built-in] Persistent change: custom tool",
		"[built-in] Persistent change: MCP server",
		"[built-in] Persistent change: skill",
	}
	for range 2 {
		if _, err := d.Exec(`DELETE FROM settings WHERE key = 'intercept_persistence_rules_v1'`); err != nil {
			t.Fatal(err)
		}
		if err := d.seedPersistenceApprovalRules(); err != nil {
			t.Fatalf("seed re-run failed: %v", err)
		}
	}
	for _, name := range names {
		var n int
		if err := d.QueryRow(`SELECT count(*) FROM intercept_rules WHERE name = $1`, name).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Errorf("%q: %d rows, want 1", name, n)
		}
	}
	if v, _, _ := d.GetSetting("intercept_persistence_rules_v1"); v != "done" {
		t.Errorf("settings flag = %q, want done", v)
	}
}
