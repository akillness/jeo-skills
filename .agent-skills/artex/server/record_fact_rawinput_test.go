package server

import (
	"context"
	"strings"
	"testing"

	"github.com/Autumn-27/norma/harness"
	"github.com/Autumn-27/norma/llm"
	actool "github.com/Autumn-27/norma/tool"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

// acceptsRawInput is the assertion norma's harness makes before its schema
// check: only a tool that reports AcceptsRawInput skips it.
func acceptsRawInput(t actool.CoreTool) bool {
	r, ok := t.(interface{ AcceptsRawInput() bool })
	return ok && r.AcceptsRawInput()
}

// record_fact opts out of the harness schema check and validates its own
// input. Every wrapper between the handler and the harness has to forward
// that opt-out: an embedded CoreTool alone hides it from the harness's type
// assertion, and the stricter published schema then rejects the calls the
// handler exists to answer.
func TestFix410AcceptsRawInputSurvivesWrappers(t *testing.T) {
	oldAugment, oldResolve := agent.ToolAugment(), agent.ToolResolve()
	t.Cleanup(func() {
		agent.SetToolAugment(oldAugment)
		agent.SetToolResolve(oldResolve)
	})
	ctx := context.Background()
	probe := func(raw bool) actool.CoreTool {
		return actool.Build(actool.Spec{Name: "fix410_probe", Schema: map[string]any{"type": "object"}, RawInput: raw})
	}

	// AugmentTools without hooks applies guardPanic and nothing else.
	t.Run("guardedTool", func(t *testing.T) {
		agent.SetToolAugment(nil)
		agent.SetToolResolve(nil)
		for _, raw := range []bool{true, false} {
			out, _, cleanup := agent.AugmentTools(ctx, "worker", []actool.CoreTool{probe(raw)})
			cleanup()
			if len(out) != 1 {
				t.Fatalf("AugmentTools returned %d tools, want 1", len(out))
			}
			if got := acceptsRawInput(out[0]); got != raw {
				t.Errorf("%T: AcceptsRawInput = %v, wrapped tool reports %v", out[0], got, raw)
			}
		}
	})

	t.Run("meteredTool", func(t *testing.T) {
		for _, raw := range []bool{true, false} {
			wrapped := meterTool(probe(raw), &recordingToolUsage{}, "fix410_probe", "worker", agent.RunInfo{})
			if got := acceptsRawInput(wrapped); got != raw {
				t.Errorf("%T: AcceptsRawInput = %v, wrapped tool reports %v", wrapped, got, raw)
			}
		}
	})

	// The chain a worker's record_fact goes through on the server: the catalog
	// decorator and the usage meter (ToolResolve, wireTools), then guardPanic
	// (AugmentTools), then the harness itself.
	t.Run("server chain", func(t *testing.T) {
		dsn, _, err := db.DSN()
		if err != nil {
			db.SkipPGUnavailable(t, err)
		}
		pg, err := db.Open(dsn)
		if err != nil {
			db.SkipPGUnavailable(t, err)
		}
		t.Cleanup(func() { _ = pg.Close() })
		agent.SetToolAugment(nil)
		wireTools(pg, nil)
		task, err := pg.CreateTaskWithOptions("fix410", "record_fact through the wrapper chain", db.TaskCreateOptions{})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = pg.DeleteTask(task.ID) })
		ts := agent.NewToolSet(pg.Exploration(task.ExplorationID), "worker")
		tools, _, cleanup := agent.AugmentTools(ctx, "worker", ts.WorkerTools())
		defer cleanup()
		recordFact := names(tools)["record_fact"]
		if recordFact == nil {
			t.Fatal("worker has no record_fact")
		}
		if !acceptsRawInput(recordFact) {
			t.Errorf("record_fact lost the harness opt-out behind %T", recordFact)
		}

		// The first call is malformed (facts is not an array): the harness
		// schema check answers it with its generic error unless the tool opted
		// out. The second is the legacy single fact, which the published
		// schema does not describe and the handler still accepts.
		p := &toolScript{results: make(chan string, 4), calls: []scriptedCall{
			{"record_fact", `{"facts":{"summary":"not an array"}}`},
			{"record_fact", `{"summary":"legacy single fact"}`},
		}}
		for _, err := range harness.Query(ctx, harness.QueryInput{
			Provider: p,
			Tools:    actool.NewRegistry(recordFact),
			Messages: []llm.Message{llm.UserText("record the facts")},
		}, harness.QueryDeps{}) {
			if err != nil {
				t.Fatal(err)
			}
		}
		if refusal := p.next(t); !strings.Contains(refusal, "invalid record_fact input: facts must be an array") {
			t.Errorf("malformed call: want the handler's own refusal, not the SDK schema error, got: %s", refusal)
		}
		if legacy := p.next(t); strings.HasPrefix(legacy, "[error]") || ts.Writes().Facts != 1 {
			t.Errorf("legacy single fact not written (facts=%d): %s", ts.Writes().Facts, legacy)
		}
	})
}
