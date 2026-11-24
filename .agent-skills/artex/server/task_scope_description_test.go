package server

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
)

// PG: on an existing database whose add_task_scope row still holds the old
// "authorization boundary" text, the startup seeders replace it with the code
// description; an operator-edited description is preserved; a second run changes
// nothing; and ToolResolve then serves the new description to the model.
func TestTaskScopeDescriptionUpgrade(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	t.Cleanup(func() { agent.SetToolResolve(nil) })
	pg := m.pg

	var want string
	for _, seed := range agent.BuiltinToolSeeds() {
		if seed.Key == "add_task_scope" {
			want = seed.Desc
		}
	}
	if want == "" || want == oldTaskScopeDescription {
		t.Fatalf("precondition: code description must exist and differ from the old text: %q", want)
	}

	old, err := pg.GetTool("add_task_scope")
	if err != nil || old == nil {
		t.Fatal("missing add_task_scope", err)
	}
	bindings, _ := json.Marshal(old.Agents)
	t.Cleanup(func() { pg.UpdateTool(old.Key, old.Description, old.Schema, bindings, old.Enabled) })

	snapshot := func() (string, time.Time) {
		var desc string
		var upd time.Time
		if err := pg.QueryRow(`SELECT description, updated_at FROM tools WHERE key='add_task_scope'`).Scan(&desc, &upd); err != nil {
			t.Fatal(err)
		}
		return desc, upd
	}

	// An existing install still holding the old seeded text is upgraded.
	if err := pg.UpdateTool("add_task_scope", oldTaskScopeDescription, old.Schema, bindings, true); err != nil {
		t.Fatal(err)
	}
	s.seedOrchestrationTools()
	desc1, upd1 := snapshot()
	if desc1 != want {
		t.Fatalf("old description not replaced: %q", desc1)
	}
	s.seedOrchestrationTools()
	desc2, upd2 := snapshot()
	if desc2 != desc1 || !upd2.Equal(upd1) {
		t.Fatalf("second run changed the row: %q %v -> %q %v", desc1, upd1, desc2, upd2)
	}
	if got := resolvedTaskScopeDescription(t); got != want {
		t.Fatalf("ToolResolve serves %q, want the new description", got)
	}

	// An operator-edited description is left alone.
	if err := pg.UpdateTool("add_task_scope", "operator description", old.Schema, bindings, true); err != nil {
		t.Fatal(err)
	}
	s.seedOrchestrationTools()
	if desc, _ := snapshot(); desc != "operator description" {
		t.Fatalf("operator description overwritten: %q", desc)
	}
}

// resolvedTaskScopeDescription returns add_task_scope's description as
// ToolResolve serves it to the planner.
func resolvedTaskScopeDescription(t *testing.T) string {
	t.Helper()
	tools := agent.ToolResolve()(context.Background(), "planner", agent.NewToolSet(nil, "").PlannerTools())
	for _, tl := range tools {
		if tl.Name() == "add_task_scope" {
			return tl.Description()
		}
	}
	t.Fatal("planner lost add_task_scope")
	return ""
}
