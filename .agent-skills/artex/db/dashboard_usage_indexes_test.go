package db

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestDashboardUsageIndexesMigration0010(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { _ = d.Close() })

	wantIndexes := []struct {
		name  string
		table string
		pred  string
	}{
		{"idx_act_result_created", "activity", "kind = 'result'"},
		{"idx_conv_act_result", "conversation_activities", "kind = 'result'"},
		{"idx_llm_usage_judge_ts", "llm_usage", "worker = 'judge'"},
	}

	for _, want := range wantIndexes {
		var valid, ready bool
		var def string
		err := d.QueryRow(`
SELECT i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid)
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = $1`, want.name).Scan(&valid, &ready, &def)
		if err != nil {
			t.Fatalf("index public.%s missing after Open: %v", want.name, err)
		}
		if !valid || !ready {
			t.Fatalf("index %s indisvalid=%v indisready=%v, want both true (%s)", want.name, valid, ready, def)
		}
		if !strings.Contains(def, want.table) || !strings.Contains(def, want.pred) {
			t.Fatalf("index %s definition %q missing table %q or predicate %q", want.name, def, want.table, want.pred)
		}
	}

	// Verify sargable TokenByModel matches both specific task_id and empty task_id.
	taskID := fmt.Sprintf("idx-test-%d", time.Now().UnixNano())
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM llm_usage WHERE task_id = $1 OR profile_name = $2`, taskID, taskID)
	})
	if err := d.InsertLLMUsage(&LLMUsage{
		TaskID:       taskID,
		Worker:       "worker",
		Model:        "claude-sonnet-4",
		ProfileName:  taskID,
		InputTokens:  1000,
		OutputTokens: 200,
		Status:       "ok",
	}); err != nil {
		t.Fatal(err)
	}
	if err := d.InsertLLMUsage(&LLMUsage{
		TaskID:       "",
		Worker:       "chat",
		Model:        "gpt-5",
		ProfileName:  taskID,
		InputTokens:  500,
		OutputTokens: 100,
		Status:       "ok",
	}); err != nil {
		t.Fatal(err)
	}

	got, err := d.TokenByModel(taskID)
	if err != nil {
		t.Fatalf("TokenByModel(%q): %v", taskID, err)
	}
	if len(got) != 1 || got[0].Model != "claude-sonnet-4" || got[0].InputTokens != 1000 || got[0].OutputTokens != 200 {
		t.Fatalf("TokenByModel(%q) = %+v, want 1 claude-sonnet-4 row", taskID, got)
	}

	emptyGot, err := d.TokenByModel("")
	if err != nil {
		t.Fatalf("TokenByModel(\"\"): %v", err)
	}
	foundChat := false
	for _, m := range emptyGot {
		if m.Model == "gpt-5" && m.InputTokens >= 500 {
			foundChat = true
		}
	}
	if !foundChat {
		t.Fatalf("TokenByModel(\"\") did not include NULL/empty task_id row: %+v", emptyGot)
	}
}
