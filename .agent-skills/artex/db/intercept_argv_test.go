package db

import "testing"

// A database created before argv rules has the old CHECK constraint on
// match_type. Applying the schema again replaces it, idempotently, so an argv
// rule can be stored; an unknown match_type is still refused.
func TestInterceptRulesArgvConstraintMigration(t *testing.T) {
	d := openTargetDB(t)
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM intercept_rules WHERE name LIKE 'argv migration test%'`)
		_, _ = d.Exec(schemaSQL) // leave the current constraint in place
	})
	insert := func(name, matchType string) error {
		_, err := d.CreateInterceptRule(name, "tool_input", matchType, `["git","push"]`, "allow", "", -1000, true, false, 60, "deny")
		return err
	}
	// The constraint of an existing database, before this change.
	if _, err := d.Exec(`ALTER TABLE intercept_rules DROP CONSTRAINT IF EXISTS intercept_rules_match_type_check;
ALTER TABLE intercept_rules ADD CONSTRAINT intercept_rules_match_type_check CHECK (match_type IN ('string', 'regex'))`); err != nil {
		t.Fatal(err)
	}
	if err := insert("argv migration test old", "argv"); err == nil {
		t.Fatal("the old constraint accepted an argv rule")
	}
	for range 2 { // idempotent
		if _, err := d.Exec(schemaSQL); err != nil {
			t.Fatalf("apply schema: %v", err)
		}
	}
	if err := insert("argv migration test new", "argv"); err != nil {
		t.Fatalf("argv rule refused after the migration: %v", err)
	}
	if err := insert("argv migration test bad", "glob"); err == nil {
		t.Fatal("an unknown match_type was accepted")
	}
}
