package agent

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// TestTaskScopeLabelIsHonest pins the task_scope wording while the RoE is not
// back: the tool text and the goals tail call it coverage scope, not enforced, and
// no longer claim an authorization boundary.
func TestTaskScopeLabelIsHonest(t *testing.T) {
	texts := map[string]string{
		"add_task_scope": NewToolSet(nil, "").addTaskScope().Description(),
		"goalsScopeTail": goalsScopeTail,
	}
	for name, text := range texts {
		if !strings.Contains(text, taskScopeLabel) {
			t.Errorf("%s lacks %q", name, taskScopeLabel)
		}
		if strings.Contains(text, "authorization boundary") {
			t.Errorf("%s still claims an authorization boundary", name)
		}
	}
}

// TestAutoScopeOutsideDeclaredRootExcluded: a worker inserts one host under the
// declared root and one host outside it. Both get an auto scope row and an intent
// anchor, but only the host under the declared root enters the coverage
// denominator and list_untested_assets.
func TestAutoScopeOutsideDeclaredRootExcluded(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })

	stamp := time.Now().UnixNano()
	declared := fmt.Sprintf("app.f8-%d.invalid", stamp)
	inside := "v1." + declared
	outsideRoot := fmt.Sprintf("f8-planted-%d.invalid", stamp)
	outside := "x." + outsideRoot

	task, err := d.CreateTask("auto scope hygiene", "test "+declared, nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	assets := d.Assets()
	t.Cleanup(func() {
		_ = d.DeleteTask(task.ID)
		_, _ = d.Exec(`DELETE FROM assets WHERE domain IN ($1,$2,$3) OR root_domain IN ($4,$5)`,
			declared, inside, outside, fmt.Sprintf("f8-%d.invalid", stamp), outsideRoot)
	})
	// The goal target, as the goal decomposer registers it through add_task_scope.
	if _, err := assets.AddAgentScope(task.ID, "subdomain", declared, "goal target", "agent"); err != nil {
		t.Fatal(err)
	}
	store := d.Exploration(task.ExplorationID)
	intentID, err := store.AddNode(db.KindIntent, map[string]any{"summary": "recon"}, 0, "open", "planner", nil)
	if err != nil {
		t.Fatal(err)
	}

	worker := NewToolSet(store, "worker")
	worker.SetTaskID(task.ID)
	worker.SetAssetStore(assets, d.Companies())
	worker.SetOwnerNode(intentID)
	out := callInsertAssets(t, worker, map[string]any{"assets": []any{
		map[string]any{"type": "subdomain", "domain": inside},
		map[string]any{"type": "subdomain", "domain": outside},
	}})
	if errs, _ := out["errors"].([]any); len(errs) > 0 {
		t.Fatalf("insert_assets errors: %v", errs)
	}
	scope, err := assets.ListTaskScope(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	autoRows := map[string]bool{}
	for _, row := range scope {
		if row.Source == "auto" {
			autoRows[row.Domain] = true
		}
	}
	if !autoRows[inside] || !autoRows[outside] {
		t.Fatalf("both hosts should be auto-scoped: %+v", scope)
	}

	planner := NewToolSet(store, "planner")
	planner.SetTaskID(task.ID)
	planner.SetAssetStore(assets, d.Companies())
	coverage, ok := planner.graphOverviewData()["coverage"].(map[string]any)
	if !ok {
		t.Fatal("coverage block missing from graph overview")
	}
	if got := coverage["denominator"]; got != 1 {
		t.Fatalf("coverage denominator = %v, want 1 (only %s)", got, inside)
	}
	untested := fmt.Sprint(callReadJSON(t, planner.listUntestedAssets(), `{"page":1,"page_size":50}`))
	if !strings.Contains(untested, inside) {
		t.Fatalf("host under the declared root missing from list_untested_assets: %s", untested)
	}
	if strings.Contains(untested, outsideRoot) {
		t.Fatalf("host outside the declared root listed as untested: %s", untested)
	}
}
