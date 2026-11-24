package db_test

import (
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
)

// The judge writer (package intercept) and the decision_source readers (package
// db) must agree on the reason prefix; this pins them together without Postgres.
func TestInterceptSourceMatchesJudgeWriter(t *testing.T) {
	for _, tc := range []struct{ action, message string }{
		{"allow", ""},
		{"deny", "destructive command outside the workspace"},
		{"ask", db.ModelReasonPrefix + " already prefixed"},
	} {
		reason := intercept.JudgeReason(tc.action, tc.message)
		if got := db.InterceptSource(0, reason); got != "model" {
			t.Fatalf("JudgeReason(%q, %q) = %q classified as %q, want model", tc.action, tc.message, reason, got)
		}
	}
}

func TestInterceptSourceLegacyModelPrefix(t *testing.T) {
	for _, reason := range []string{"[模型] 允许", "[Model] fixture"} {
		if got := db.InterceptSource(0, reason); got != "model" {
			t.Fatalf("%q classified as %q, want model", reason, got)
		}
	}
	if got := db.InterceptSource(0, "legacy reason"); got != "unknown" {
		t.Fatalf("plain reason classified as %q, want unknown", got)
	}
	if got := db.InterceptSource(7, "[model] rule wins"); got != "rule" {
		t.Fatalf("rule row classified as %q, want rule", got)
	}
}
