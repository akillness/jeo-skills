package server

import (
	"strconv"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// A budget wrap-up's end_reason belongs to that run: the revive (terminal ->
// running admission) clears it in the same UPDATE, and resetSettledRun clears it
// again idempotently, so a later normal run is never read as budget-ended.
func TestReviveClearsBudgetEndReason(t *testing.T) {
	s, _, _ := trafficEvidenceServer(t)
	m, pg := s.m, s.m.pg
	task, err := m.CreateTask("end reason revive", "revive clears the budget marker", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	id, err := strconv.ParseInt(task.ID, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.DeleteTask(id) })
	endReason := func() string {
		t.Helper()
		var r string
		if err := pg.QueryRow(`SELECT end_reason FROM tasks WHERE id=$1`, id).Scan(&r); err != nil {
			t.Fatal(err)
		}
		return r
	}
	if _, err := pg.Exec(`UPDATE tasks SET status='running' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if won, err := m.SetTaskStatusGuarded(task.ID, "timeout", db.EndReasonBudget); err != nil || !won {
		t.Fatalf("budget settle won=%v err=%v", won, err)
	}
	if r := endReason(); r != db.EndReasonBudget {
		t.Fatalf("after budget settle end_reason=%q", r)
	}
	// A same-status admission (no revive) keeps the reason.
	if err := m.ApplyTaskAdmission(task.ID, "timeout", "timeout", false, "resume", false); err != nil {
		t.Fatal(err)
	}
	if r := endReason(); r != db.EndReasonBudget {
		t.Fatalf("terminal admission dropped end_reason: %q", r)
	}
	if err := m.ApplyTaskAdmission(task.ID, "timeout", "running", false, "resume", false); err != nil {
		t.Fatal(err)
	}
	if r := endReason(); r != "" {
		t.Fatalf("revive kept end_reason=%q", r)
	}
	// resetSettledRun also clears a running task's reason, and leaves a terminal one alone.
	e := NewEngine(m)
	if _, err := pg.Exec(`UPDATE tasks SET end_reason='budget' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	e.resetSettledRun(task.ID)
	if r := endReason(); r != "" {
		t.Fatalf("resetSettledRun kept end_reason=%q on a running task", r)
	}
	if won, err := m.SetTaskStatusGuarded(task.ID, "done", ""); err != nil || !won {
		t.Fatalf("normal done won=%v err=%v", won, err)
	}
	if _, err := pg.Exec(`UPDATE tasks SET end_reason='budget' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	e.resetTimeoutRevival(task.ID)
	if r := endReason(); r != db.EndReasonBudget {
		t.Fatalf("reset cleared a terminal task's end_reason")
	}
}
