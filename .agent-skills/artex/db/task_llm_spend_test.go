package db

import (
	"fmt"
	"testing"
	"time"
)

// Judge calls share the planner or worker sink and count toward the task cap.
// Chat rows for the same task do not, or a restart would tighten the cap.
func TestTaskLLMSpendCountsJudgeNotChat(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { _ = d.Close() })

	taskID := fmt.Sprintf("spend-%d", time.Now().UnixNano())
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM llm_usage WHERE task_id=$1`, taskID)
	})
	insert := func(worker string, in, out int) {
		t.Helper()
		if err := d.InsertLLMUsage(&LLMUsage{
			TaskID: taskID, Worker: worker, InputTokens: in, OutputTokens: out, Status: "ok",
		}); err != nil {
			t.Fatal(err)
		}
	}
	insert("judge", 30, 10)
	insert("chat", 1000, 1000)

	tokens, turns, err := d.TaskLLMSpend(taskID)
	if err != nil {
		t.Fatal(err)
	}
	if tokens != 40 || turns != 1 {
		t.Fatalf("tokens=%d turns=%d, want the judge row only (40 tokens, 1 turn)", tokens, turns)
	}
}
