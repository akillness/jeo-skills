package server

import (
	"database/sql"
	"strconv"
	"testing"
	"time"
)

// Pausing a task must freeze its wall-clock timeout budget: the admission that
// ends the pause credits the paused interval back onto deadline_at, so a task
// paused overnight (or while the machine is off) resumes with its remaining
// time instead of immediately settling into the timeout terminal state (#1).
func TestPauseShiftsTaskDeadlineOnResume(t *testing.T) {
	s, _, _ := trafficEvidenceServer(t)
	m := s.m
	pg := s.m.pg

	task, err := m.CreateTask("pause deadline test", "verify the deadline is frozen while paused", nil, 3600, 0)
	if err != nil {
		t.Fatal(err)
	}
	id, err := strconv.ParseInt(task.ID, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.DeleteTask(id) })

	// A running task with a stamped deadline (first_run_at + 1h budget).
	if _, err := m.StampTaskFirstRun(task.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pg.Exec(`UPDATE tasks SET status='running' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	var before time.Time
	if err := pg.QueryRow(`SELECT deadline_at FROM tasks WHERE id=$1`, id).Scan(&before); err != nil {
		t.Fatal(err)
	}

	// Pause stamps paused_at alongside the user pause.
	if err := m.ApplyTaskPause(task.ID); err != nil {
		t.Fatal(err)
	}
	var pausedAt sql.NullTime
	if err := pg.QueryRow(`SELECT paused_at FROM tasks WHERE id=$1`, id).Scan(&pausedAt); err != nil {
		t.Fatal(err)
	}
	if !pausedAt.Valid || pausedAt.Time.After(time.Now()) {
		t.Fatalf("pause should stamp paused_at at the current time, got %v", pausedAt.Time)
	}

	// Keep the task parked long enough for the credited interval to be measurable.
	const paused = 1100 * time.Millisecond
	time.Sleep(paused)

	// Admission out of the paused state (a paused task keeps its lifecycle status).
	if err := m.ApplyTaskAdmission(task.ID, "running", "running", false, "resume", false); err != nil {
		t.Fatal(err)
	}

	var after time.Time
	var cleared sql.NullTime
	if err := pg.QueryRow(`SELECT deadline_at, paused_at FROM tasks WHERE id=$1`, id).Scan(&after, &cleared); err != nil {
		t.Fatal(err)
	}
	if shifted := after.Sub(before); shifted < paused-100*time.Millisecond {
		t.Fatalf("resume should credit the paused interval onto the deadline, got shift=%v (paused=%v)", shifted, paused)
	}
	if cleared.Valid {
		t.Fatalf("admission should clear paused_at, got %v", cleared.Time)
	}
	// The live handle must mirror the shifted deadline (the engine clock context
	// is built from it).
	if got := task.lifecycleSnapshot().DeadlineAt; got != after.Unix() {
		t.Fatalf("live handle deadline = %d, want the shifted %d", got, after.Unix())
	}
}
