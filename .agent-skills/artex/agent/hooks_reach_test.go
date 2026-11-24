package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/guard"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/llm"
)

// Every agent kind hands its tool calls to the hooks it is given, on the context
// it was started with. The target gate depends on both: a session without hooks
// is ungated, and a hook that cannot see the scope cannot decide.

// recordingHooks blocks every tool call (so nothing executes) and records the
// tool name and the target scope carried by the hook's context.
type recordingHooks struct {
	mu    sync.Mutex
	calls []recordedHookCall
}

type recordedHookCall struct {
	tool   string
	scope  intercept.TargetScope
	scoped bool
}

func (h *recordingHooks) PreToolUse(ctx context.Context, name string, _ []byte) (bool, string, []byte) {
	scope, ok := intercept.TargetScopeFromContext(ctx)
	h.mu.Lock()
	h.calls = append(h.calls, recordedHookCall{tool: name, scope: scope, scoped: ok})
	h.mu.Unlock()
	return true, "blocked by the recording test hooks", nil
}

func (h *recordingHooks) PostToolUse(context.Context, string, []byte, []byte, bool) {}

func (h *recordingHooks) Stop(context.Context, []llm.Message) (bool, []string, string) {
	return false, nil, ""
}

// assertOneScopedCall checks that the hooks saw exactly one call of tool, on a
// context carrying the task scope taskID.
func (h *recordingHooks) assertOneScopedCall(t *testing.T, tool, taskID string) {
	t.Helper()
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.calls) != 1 {
		t.Fatalf("hooks saw %d tool calls, want 1: %+v", len(h.calls), h.calls)
	}
	c := h.calls[0]
	if c.tool != tool {
		t.Fatalf("hooks saw tool %q, want %q", c.tool, tool)
	}
	if !c.scoped || c.scope.TaskID != taskID || c.scope.ConversationID != 0 {
		t.Fatalf("hook context scope = %+v (present=%v), want task %s", c.scope, c.scoped, taskID)
	}
	if c.scope.WaitBound != intercept.DefaultTargetWaitBound {
		t.Fatalf("hook context wait bound = %v, want %v", c.scope.WaitBound, intercept.DefaultTargetWaitBound)
	}
}

// toolCallThenStop scripts a model that calls one tool on its first turn and ends
// the run on the next.
func toolCallThenStop(tool, input string) captureUsageProvider {
	var turn atomic.Int64
	return captureUsageProvider{stream: func(_ context.Context, yield func(llm.StreamEvent, error) bool) {
		events := []llm.StreamEvent{{Type: llm.SETextDelta, Text: "done"}, {Type: llm.SEMessageDelta, StopReason: "end_turn"}}
		if turn.Add(1) == 1 {
			events = []llm.StreamEvent{
				{Type: llm.SEToolUseStart, ToolID: "call-1", ToolName: tool},
				{Type: llm.SEToolInputJSON, Text: input},
				{Type: llm.SEMessageDelta, StopReason: "tool_use"},
			}
		}
		for _, event := range events {
			if !yield(event, nil) {
				return
			}
		}
	}}
}

// hookReachFixture is one exploration on the test database plus a Bash call whose
// only effect would be to create marker — which the blocking hooks must prevent.
type hookReachFixture struct {
	expID   int64
	taskID  string
	ts      *db.ExplorationStore
	workDir string
	marker  string
	bash    string
	ctx     context.Context
}

func newHookReachFixture(t *testing.T) hookReachFixture {
	t.Helper()
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	expID, err := d.CreateExploration("hook reach probe", "prove tool calls reach the hooks")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM explorations WHERE id=$1`, expID) })
	f := hookReachFixture{expID: expID, taskID: fmt.Sprint(expID), ts: d.Exploration(expID), workDir: t.TempDir()}
	f.marker = filepath.Join(f.workDir, "tool-ran")
	input, _ := json.Marshal(map[string]string{"command": "touch " + f.marker})
	f.bash = string(input)
	f.ctx = intercept.WithTargetScope(t.Context(), intercept.TargetScope{TaskID: f.taskID, WaitBound: intercept.DefaultTargetWaitBound})
	return f
}

func (f hookReachFixture) assertToolDidNotRun(t *testing.T) {
	t.Helper()
	if _, err := os.Stat(f.marker); err == nil {
		t.Fatal("the blocked tool call was executed")
	}
}

func TestPlannerToolCallReachesHooks(t *testing.T) {
	f := newHookReachFixture(t)
	hooks := &recordingHooks{}
	planner := NewPlanner(toolCallThenStop("Bash", f.bash), "test-model", f.workDir, nil, 0, 3)
	if _, _, err := planner.Plan(f.ctx, f.expID, nil, f.ts, "probe goal", nil, hooks, nil); err != nil {
		t.Fatal(err)
	}
	hooks.assertOneScopedCall(t, "Bash", f.taskID)
	f.assertToolDidNotRun(t)
}

func TestMainAgentToolCallReachesHooks(t *testing.T) {
	f := newHookReachFixture(t)
	hooks := &recordingHooks{}
	main := NewMainAgent(toolCallThenStop("Bash", f.bash), "test-model", f.workDir, nil, 0, 3)
	if _, err := main.Chat(f.ctx, f.expID, 0, nil, f.ts, "probe goal", "status?", hooks, nil, nil, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	hooks.assertOneScopedCall(t, "Bash", f.taskID)
	f.assertToolDidNotRun(t)
}

func TestWorkerToolCallReachesHooks(t *testing.T) {
	f := newHookReachFixture(t)
	payload := map[string]any{"summary": "probe intent"}
	intentID, err := f.ts.AddNode("intent", payload, 0, "running", "planner", nil)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(payload)
	hooks := &recordingHooks{}
	worker := NewWorker(toolCallThenStop("Bash", f.bash), "test-model", f.workDir, nil, 0, 3)
	if _, _, err := worker.Execute(f.ctx, "work#1", f.expID, nil, f.ts, &db.Node{ID: intentID, Payload: raw}, hooks, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	hooks.assertOneScopedCall(t, "Bash", f.taskID)
	f.assertToolDidNotRun(t)
}

// The chat agent takes a Guard rather than a hook runner, so the Guard's own
// audit ring is the recorder here. The scripted call is a read-only directory
// listing of the session's empty work dir: no command runs. No database.
func TestChatToolCallReachesHooks(t *testing.T) {
	g := guard.New()
	chat := NewChatAgent(toolCallThenStop("LS", `{}`), "test-model", t.TempDir(), nil, 0)
	chat.SetGuard(g)
	if _, err := chat.Chat(t.Context(), "assistant", "conv-hook-reach", "list the work dir", 3, 0, false, nil); err != nil {
		t.Fatal(err)
	}
	audit := g.Audit()
	if len(audit) != 1 || audit[0].Tool != "LS" {
		t.Fatalf("guard audit = %+v, want one LS call", audit)
	}
}
