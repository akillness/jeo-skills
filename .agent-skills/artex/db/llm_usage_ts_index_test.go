package db

import (
	"database/sql"
	"errors"
	"strings"
	"testing"
)

// Migration 0004 leaves a valid, ready btree index on llm_usage(ts) for the
// time-window queries (UsageDaily, JudgeUsageStats).
func TestLLMUsageTsIndex(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	var valid, ready bool
	var def string
	err = d.QueryRow(`
SELECT i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid)
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname='idx_llm_usage_ts'`).Scan(&valid, &ready, &def)
	if errors.Is(err, sql.ErrNoRows) {
		t.Fatal("index public.idx_llm_usage_ts does not exist after Open")
	}
	if err != nil {
		t.Fatal(err)
	}
	if !valid || !ready {
		t.Fatalf("idx_llm_usage_ts indisvalid=%v indisready=%v, want both true (%s)", valid, ready, def)
	}
	if !strings.Contains(def, "USING btree (ts)") {
		t.Fatalf("idx_llm_usage_ts definition %q does not index ts with a btree", def)
	}
}
