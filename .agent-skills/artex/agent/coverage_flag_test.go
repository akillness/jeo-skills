package agent

import (
	"bytes"
	"fmt"
	"log"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// A failed coverage-flag read stays enabled: the log says so, the worker keeps
// record_coverage and list_untested_assets, and AddAutoScope still writes. That
// write happens even when the stored flag is off, which is the outage behaviour.
func TestCoverageReadFailureKeepsToolsAndWritesAutoScope(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	off := false
	task, err := d.CreateTaskWithOptions("coverage outage", "goal", db.TaskCreateOptions{CoverageEnabled: &off})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })

	live := d.Assets()
	stored, err := live.CoverageEnabled(task.ID)
	if err != nil || stored {
		t.Fatalf("stored flag enabled=%v err=%v, want off", stored, err)
	}
	if coverageOn(live, task.ID) {
		t.Fatal("a readable off flag was treated as on")
	}

	dsn, _, err := db.DSN()
	if err != nil {
		t.Fatal(err)
	}
	broken, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := broken.Close(); err != nil {
		t.Fatal(err)
	}
	var logged bytes.Buffer
	prev := log.Default().Writer()
	log.SetOutput(&logged)
	t.Cleanup(func() { log.SetOutput(prev) })
	if !coverageOn(broken.Assets(), task.ID) {
		t.Fatal("a failed coverage read turned the feature off")
	}
	if !strings.Contains(logged.String(), "leaving coverage on") {
		t.Fatalf("coverage read failure was not logged: %q", logged.String())
	}

	// record_coverage is the worker's coverage tool; list_untested_assets is the
	// planner's, so each is checked on the tool set that actually carries it.
	hasPlannerTool := func(ts *ToolSet, name string) bool {
		for _, tool := range ts.DropCoverageTools(ts.PlannerTools()) {
			if tool.Name() == name {
				return true
			}
		}
		return false
	}
	offWorker := NewToolSet(nil, "worker-off")
	offWorker.SetCoverageEnabled(false)
	if hasTool(offWorker, "record_coverage") {
		t.Fatal("record_coverage stayed available to a worker with coverage off")
	}
	offPlanner := NewToolSet(nil, "planner-off")
	offPlanner.SetCoverageEnabled(false)
	if hasPlannerTool(offPlanner, "list_untested_assets") {
		t.Fatal("list_untested_assets stayed available to the planner with coverage off")
	}
	outage := coverageOn(broken.Assets(), task.ID)
	outWorker := NewToolSet(nil, "worker-outage")
	outWorker.SetCoverageEnabled(outage)
	if !hasTool(outWorker, "record_coverage") {
		t.Fatal("record_coverage dropped from the worker when the coverage read failed")
	}
	outPlanner := NewToolSet(nil, "planner-outage")
	outPlanner.SetCoverageEnabled(outage)
	if !hasPlannerTool(outPlanner, "list_untested_assets") {
		t.Fatal("list_untested_assets dropped from the planner when the coverage read failed")
	}

	keptOff := fmt.Sprintf("off-%d.invalid", time.Now().UnixNano())
	writeIntentAutoScope(live, task.ID, []*db.Asset{{Type: "root_domain", Domain: keptOff}}, false)
	wrote := fmt.Sprintf("outage-%d.invalid", time.Now().UnixNano())
	writeIntentAutoScope(live, task.ID, []*db.Asset{{Type: "root_domain", Domain: wrote}}, coverageOn(broken.Assets(), task.ID))
	scope, err := live.ListTaskScope(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	var sawKept, sawWrote bool
	for _, row := range scope {
		if row.Domain == keptOff {
			sawKept = true
		}
		if row.Domain == wrote {
			sawWrote = true
		}
	}
	if sawKept {
		t.Fatal("auto scope was written while coverage was off")
	}
	if !sawWrote {
		t.Fatal("auto scope was not written when the coverage read failed")
	}
}
