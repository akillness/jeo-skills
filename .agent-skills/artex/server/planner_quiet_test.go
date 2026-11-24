package server

import (
	"testing"

	"github.com/Autumn-27/artex/db"
)

// Planner quiet-mode (#79): an edge round is dropped only when BOTH hold — the
// open-goal fingerprint is unchanged since the last completed round AND active
// work exists (open or running intents). Every other combination plans.
func TestPlannerQuietSkipEdge(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.Close() })
	if m.pg == nil {
		db.SkipNoPG(t)
	}

	created, err := m.CreateTaskWithOptions("quiet-mode probe", "probe goal", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.DeleteTask(created.ID, DeleteTaskOptions{}) })
	tt, ok := m.Task(created.ID)
	if !ok {
		t.Fatal("task not found after creation")
	}
	store := tt.Store
	e := NewEngine(m)

	gid, err := store.AddGoal(map[string]any{"summary": "g1"}, "seed")
	if err != nil {
		t.Fatal(err)
	}
	iid, err := store.AddIntent(map[string]any{"summary": "i1"}, 0, nil, "seed")
	if err != nil {
		t.Fatal(err)
	}
	fp, err := store.OpenGoalFingerprint()
	if err != nil {
		t.Fatal(err)
	}
	if fp == "" {
		t.Fatal("fingerprint must not be empty with an open goal")
	}
	e.goalFP.Store(tt.ID, fp)
	if !e.quietSkipEdge(tt) {
		t.Fatal("unchanged goals + active intent must skip the edge round")
	}

	// a goal closes -> the fingerprint changes -> plan
	if err := store.SetNodeState(gid, "met"); err != nil {
		t.Fatal(err)
	}
	if e.quietSkipEdge(tt) {
		t.Fatal("a closed goal must allow planning")
	}

	// goal back open, intent drained -> no active work -> plan
	if err := store.SetNodeState(gid, "open"); err != nil {
		t.Fatal(err)
	}
	fp2, err := store.OpenGoalFingerprint()
	if err != nil {
		t.Fatal(err)
	}
	e.goalFP.Store(tt.ID, fp2)
	if err := store.SetIntentState(iid, "done"); err != nil {
		t.Fatal(err)
	}
	if e.quietSkipEdge(tt) {
		t.Fatal("no active intent must allow planning")
	}
}

// The quiet-mode switch is editable mid-run (#86): PATCHing plan_quiet_mode
// updates both the stored row and the live Task the engine reads per round.
func TestPlannerQuietModeToggleMidRun(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.Close() })
	if m.pg == nil {
		db.SkipNoPG(t)
	}

	created, err := m.CreateTaskWithOptions("quiet-toggle probe", "goal", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.DeleteTask(created.ID, DeleteTaskOptions{}) })
	tt, ok := m.Task(created.ID)
	if !ok {
		t.Fatal("task not found")
	}
	if !tt.PlanQuietMode {
		t.Fatal("quiet mode must default on")
	}

	off := false
	updated, err := m.UpdateTaskMetadata(created.ID, db.TaskPatch{PlanQuietMode: &off})
	if err != nil || updated == nil {
		t.Fatalf("UpdateTaskMetadata: %v %v", updated, err)
	}
	live, ok := m.Task(created.ID)
	if !ok || live.PlanQuietMode {
		t.Fatal("mid-run toggle must turn the live flag off")
	}
	stored, err := m.pg.GetTask(mustTaskID(t, created.ID))
	if err != nil || stored == nil || stored.PlanQuietMode {
		t.Fatalf("stored row must reflect the toggle: %v %v", stored, err)
	}

	on := true
	if _, err := m.UpdateTaskMetadata(created.ID, db.TaskPatch{PlanQuietMode: &on}); err != nil {
		t.Fatal(err)
	}
	live, _ = m.Task(created.ID)
	if !live.PlanQuietMode {
		t.Fatal("toggle back on failed")
	}
}
