package server

import (
	"context"
	"iter"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/guard"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/llm"
)

// Target-gate wiring: every platform-owned session starts on a context that
// carries the approval scope of its task or conversation, and the planner and
// the main agent run with the task's target-only hooks. The gate is off, so
// none of this changes what a session does.

// innerHooksProbe is a programmable inner HookRunner that records what
// steerHooks hands it.
type innerHooksProbe struct {
	block   bool
	msg     string
	updated []byte

	pre, post int
	tool      string
	input     string
	scoped    bool
}

func (p *innerHooksProbe) PreToolUse(ctx context.Context, name string, input []byte) (bool, string, []byte) {
	p.pre++
	p.tool, p.input = name, string(input)
	_, p.scoped = intercept.TargetScopeFromContext(ctx)
	return p.block, p.msg, p.updated
}

func (p *innerHooksProbe) PostToolUse(context.Context, string, []byte, []byte, bool) { p.post++ }

func (p *innerHooksProbe) Stop(context.Context, []llm.Message) (bool, []string, string) {
	return false, nil, ""
}

// The worker's hooks are the task Guard wrapped in steerHooks. The wrapper must
// hand the call, on the caller's context, to the inner hooks and return their
// decision unchanged — a block decided by the Guard must not be lost on the way.
func TestSteerHooksForwardInnerBlock(t *testing.T) {
	ctx := intercept.WithTargetScope(context.Background(), intercept.TargetScope{TaskID: "7"})
	noSteer := func() (string, bool) { return "", false }
	input := []byte(`{"command":"curl https://app.example.com/"}`)

	inner := &innerHooksProbe{block: true, msg: "inner refused"}
	h := steerHooks{inner: inner, drain: noSteer, nudges: &atomic.Int64{}}
	block, msg, updated := h.PreToolUse(ctx, "Bash", input)
	if !block || msg != "inner refused" || updated != nil {
		t.Fatalf("inner block not forwarded: block=%v msg=%q updated=%q", block, msg, updated)
	}
	if inner.pre != 1 || inner.tool != "Bash" || inner.input != string(input) || !inner.scoped {
		t.Fatalf("inner hooks saw pre=%d tool=%q input=%q scoped=%v", inner.pre, inner.tool, inner.input, inner.scoped)
	}

	// An inner pass (with a rewritten input) is forwarded just the same.
	inner = &innerHooksProbe{updated: []byte(`{"command":"true"}`)}
	h = steerHooks{inner: inner, drain: noSteer, nudges: &atomic.Int64{}}
	if block, msg, updated := h.PreToolUse(ctx, "Bash", input); block || msg != "" || string(updated) != `{"command":"true"}` {
		t.Fatalf("inner pass not forwarded: block=%v msg=%q updated=%q", block, msg, updated)
	}
	h.PostToolUse(ctx, "Bash", input, []byte(`"ok"`), false)
	if inner.post != 1 {
		t.Fatalf("PostToolUse reached the inner hooks %d times, want 1", inner.post)
	}

	// A queued steer message is delivered first; the inner hooks are not asked.
	inner = &innerHooksProbe{}
	h = steerHooks{inner: inner, drain: func() (string, bool) { return "change course", true }, nudges: &atomic.Int64{}}
	if block, msg, _ := h.PreToolUse(ctx, "Bash", input); !block || !strings.Contains(msg, "change course") || inner.pre != 0 {
		t.Fatalf("steer message: block=%v msg=%q inner.pre=%d", block, msg, inner.pre)
	}
}

// scopeProbe is the target scope a session's context carried.
type scopeProbe struct {
	scope intercept.TargetScope
	ok    bool
}

// scopeProbeProvider is a model that lists its work dir (a read-only LS call) on
// its first turn and ends the run on the next, recording the target scope of the
// context it is called with. The harness calls the model and the tool hooks on
// the same session context.
type scopeProbeProvider struct {
	seen chan scopeProbe
	turn atomic.Int64
}

func newScopeProbeProvider() *scopeProbeProvider {
	return &scopeProbeProvider{seen: make(chan scopeProbe, 16)}
}

func (p *scopeProbeProvider) Stream(ctx context.Context, _ llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	scope, ok := intercept.TargetScopeFromContext(ctx)
	select {
	case p.seen <- scopeProbe{scope, ok}:
	default:
	}
	events := []llm.StreamEvent{{Type: llm.SETextDelta, Text: "done"}, {Type: llm.SEMessageDelta, StopReason: "end_turn"}}
	if p.turn.Add(1) == 1 {
		events = []llm.StreamEvent{
			{Type: llm.SEToolUseStart, ToolID: "call-1", ToolName: "LS"},
			{Type: llm.SEToolInputJSON, Text: `{}`},
			{Type: llm.SEMessageDelta, StopReason: "tool_use"},
		}
	}
	return func(yield func(llm.StreamEvent, error) bool) {
		for _, event := range events {
			if !yield(event, nil) {
				return
			}
		}
	}
}

func (p *scopeProbeProvider) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return accumulateStreamForTest(ctx, p.Stream, req)
}

// first returns the scope of the first model call, failing if none arrives.
func (p *scopeProbeProvider) first(t *testing.T) scopeProbe {
	t.Helper()
	select {
	case s := <-p.seen:
		return s
	case <-time.After(30 * time.Second):
		t.Fatal("the session never called the model")
		return scopeProbe{}
	}
}

// targetScopeFixture is a manager, engine and server on the test database.
type targetScopeFixture struct {
	m *Manager
	e *Engine
	s *Server
}

func newTargetScopeFixture(t *testing.T) *targetScopeFixture {
	t.Helper()
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	e := NewEngine(m)
	s := &Server{m: m, engine: e, ctx: ctx, chatBusy: map[string]bool{},
		chatCancel: map[string]context.CancelCauseFunc{}, taskAgents: map[string]*taskAgentBundle{}}
	t.Cleanup(func() {
		cancel()
		_ = m.Close()
	})
	return &targetScopeFixture{m: m, e: e, s: s}
}

// newTask creates a task with one open goal (so the planner loop plans).
func (f *targetScopeFixture) newTask(t *testing.T) *Task {
	t.Helper()
	created, err := f.m.CreateTaskWithOptions("target scope probe", "probe goal", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = f.m.DeleteTask(created.ID, DeleteTaskOptions{}) })
	task, ok := f.m.Task(created.ID)
	if !ok {
		t.Fatal("task not found after creation")
	}
	if _, err := task.Store.AddGoal(map[string]any{"summary": "probe goal"}, "seed"); err != nil {
		t.Fatal(err)
	}
	return task
}

// usePlanner makes the engine resolve every task to agents driven by p.
func (f *targetScopeFixture) usePlanner(p llm.Provider) {
	planner := agent.NewPlanner(p, "test-model", f.m.dir, nil, 0, 3)
	worker := agent.NewWorker(p, "test-model", f.m.dir, nil, 0, 3)
	f.e.SetAuthoritativeAgentResolver(func(*Task) (*agent.Planner, *agent.Worker) { return planner, worker })
}

// waitUntil polls cond until it holds, failing after 30 seconds.
func waitUntil(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// plannerLoopRound runs the planner loop until its first round has finished and
// returns the scope that round's session carried.
func (f *targetScopeFixture) plannerLoopRound(t *testing.T, task *Task) scopeProbe {
	t.Helper()
	probe := newScopeProbeProvider()
	f.usePlanner(probe)
	ctx, stop := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		f.e.plannerLoop(ctx, task)
	}()
	task.Notify()
	got := probe.first(t)
	waitUntil(t, "the planning round to finish", func() bool { return f.e.inflightCount(task.ID) == 0 })
	stop()
	<-done
	return got
}

// finalPlannerRound runs the task-timeout settlement round and returns the scope
// its session carried.
func (f *targetScopeFixture) finalPlannerRound(t *testing.T, task *Task) scopeProbe {
	t.Helper()
	probe := newScopeProbeProvider()
	f.usePlanner(probe)
	f.e.runFinalPlannerRound(context.Background(), task, false)
	return probe.first(t)
}

func (f *targetScopeFixture) mainAgentTurn(t *testing.T, task *Task) scopeProbe {
	t.Helper()
	probe := newScopeProbeProvider()
	f.s.cfgMu.Lock()
	f.s.llmOn, f.s.llmProv = true, probe
	f.s.cfgMu.Unlock()
	f.s.taskAgentMu.Lock()
	f.s.taskAgents[task.ID] = &taskAgentBundle{main: agent.NewMainAgent(probe, "test-model", f.m.dir, nil, 0, 3)}
	f.s.taskAgentMu.Unlock()
	rec := httptest.NewRecorder()
	f.s.chat(rec, httptest.NewRequest("POST", "/api/chat?task="+task.ID, strings.NewReader(`{"message":"status?"}`)))
	if rec.Code != 202 {
		t.Fatalf("chat status = %d, want 202: %s", rec.Code, rec.Body.String())
	}
	got := probe.first(t)
	waitUntil(t, "the main-agent turn to finish", func() bool {
		f.s.chatMu.Lock()
		defer f.s.chatMu.Unlock()
		return !f.s.chatBusy[task.ID]
	})
	return got
}

func (f *targetScopeFixture) workerIntent(t *testing.T, task *Task) scopeProbe {
	t.Helper()
	probe := newScopeProbeProvider()
	if _, err := task.Store.AddIntent(map[string]any{"summary": "scope probe"}, 1, nil, "planner"); err != nil {
		t.Fatal(err)
	}
	intent, token := f.e.claimNext(task, "work#1")
	if intent == nil {
		t.Fatal("no intent claimed")
	}
	worker := agent.NewWorker(probe, "test-model", f.m.dir, nil, 0, 3)
	f.e.runIntent(context.Background(), task, "work#1", worker, intent, token, "", "")
	return probe.first(t)
}

func (f *targetScopeFixture) conversationTurn(t *testing.T) (scopeProbe, int64) {
	t.Helper()
	probe := newScopeProbeProvider()
	conv, err := f.m.pg.CreateConversation("assistant", "target scope probe", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = f.m.pg.DeleteConversation(conv.ID) })
	f.s.cfgMu.Lock()
	f.s.chatAgent = agent.NewChatAgent(probe, "test-model", f.m.dir, nil, 10000)
	f.s.cfgMu.Unlock()
	busyKey := f.s.convBusyKey(conv.ID)
	ctx, cancel := f.s.conversationRunContext(conv.ID, busyKey)
	f.s.runConversationTurn(ctx, cancel, conv, "hello", busyKey)
	return probe.first(t), conv.ID
}

// auditedTools lists the tool names in a guard's audit ring.
func auditedTools(g *guard.Guard) []string {
	var tools []string
	for _, e := range g.Audit() {
		tools = append(tools, e.Tool)
	}
	return tools
}

// The five session entry points — planner round, final planner round, main-agent
// turn, worker intent, conversation turn (chat and retester share it) — each run
// on a context carrying the scope the gate will decide on, with the gate off.
// The planner and the main agent hand their tool calls to Task.TargetGuard, the
// worker to Task.Guard. The target-only guard keeps no record, so the test puts
// a recording guard in its place.
func TestEveryAgentKindCarriesTargetScope(t *testing.T) {
	f := newTargetScopeFixture(t)
	taskSites := []struct {
		name       string
		run        func(*testing.T, *Task) scopeProbe
		wait       time.Duration
		targetOnly bool // the session runs on Task.TargetGuard, not Task.Guard
	}{
		{"planner round", f.plannerLoopRound, intercept.DefaultTargetWaitBound, true},
		{"final planner round", f.finalPlannerRound, 0, true},
		{"main-agent turn", f.mainAgentTurn, intercept.DefaultTargetWaitBound, true},
		{"worker intent", f.workerIntent, intercept.DefaultTargetWaitBound, false},
	}
	for _, site := range taskSites {
		t.Run(site.name, func(t *testing.T) {
			task := f.newTask(t)
			recorder := guard.New()
			task.TargetGuard = recorder
			got := site.run(t, task)
			onTarget, onMain := auditedTools(recorder), auditedTools(task.Guard)
			if site.targetOnly && (len(onTarget) != 1 || onTarget[0] != "LS" || len(onMain) != 0) {
				t.Fatalf("tool calls seen by TargetGuard=%v Guard=%v, want one LS on TargetGuard only", onTarget, onMain)
			}
			if !site.targetOnly && (len(onMain) != 1 || onMain[0] != "LS" || len(onTarget) != 0) {
				t.Fatalf("tool calls seen by TargetGuard=%v Guard=%v, want one LS on Guard only", onTarget, onMain)
			}
			if !got.ok || got.scope.TaskID != task.ID || got.scope.ConversationID != 0 {
				t.Fatalf("scope = %+v (present=%v), want task %s", got.scope, got.ok, task.ID)
			}
			if got.scope.WaitBound != site.wait {
				t.Fatalf("wait bound = %v, want %v", got.scope.WaitBound, site.wait)
			}
			if got.scope.Enabled == nil || got.scope.Enabled() {
				t.Fatal("the gate must be off: the task did not opt in")
			}
			if got.scope.Interceptor != f.m.interceptor {
				t.Fatal("the scope does not carry the interceptor that owns the gate")
			}
		})
	}
	t.Run("conversation turn", func(t *testing.T) {
		got, convID := f.conversationTurn(t)
		if !got.ok || got.scope.ConversationID != convID || got.scope.TaskID != "" {
			t.Fatalf("scope = %+v (present=%v), want conversation %d", got.scope, got.ok, convID)
		}
		if got.scope.WaitBound != intercept.DefaultTargetWaitBound {
			t.Fatalf("wait bound = %v, want %v", got.scope.WaitBound, intercept.DefaultTargetWaitBound)
		}
		if got.scope.Enabled == nil || got.scope.Enabled() {
			t.Fatal("the gate must be off: the conversation did not opt in")
		}
		if got.scope.Interceptor != f.m.interceptor {
			t.Fatal("the scope does not carry the interceptor that owns the gate")
		}
	})
}

// The final settlement round runs on a context a pause cannot cancel and is
// meant to judge, not to explore: a gated call must never wait there. A regular
// round of the same task keeps the default bound.
func TestFinalPlannerRoundHasZeroWait(t *testing.T) {
	f := newTargetScopeFixture(t)
	task := f.newTask(t)
	regular := f.plannerLoopRound(t, task)
	final := f.finalPlannerRound(t, task)
	if !regular.ok || !final.ok {
		t.Fatalf("scope missing: regular=%v final=%v", regular.ok, final.ok)
	}
	if regular.scope.WaitBound <= 0 {
		t.Fatalf("regular round wait bound = %v, want a positive bound", regular.scope.WaitBound)
	}
	if final.scope.WaitBound != 0 {
		t.Fatalf("final round wait bound = %v, want 0", final.scope.WaitBound)
	}
	if final.scope.TaskID != task.ID {
		t.Fatalf("final round scope task = %q, want %s", final.scope.TaskID, task.ID)
	}
}

// With the gate off (the task default) the target-only hooks are a no-op: a call is
// allowed and nothing is written — no intercept row, no audit-ring entry. The
// control runs the same call through the task's full Guard, where a deny rule
// blocks it and logs a row, so the rule and the row count are known to be live.
func TestTargetGateSeamAllowsWithoutDBWrite(t *testing.T) {
	f := newTargetScopeFixture(t)
	task := f.newTask(t)
	ic := f.m.interceptor
	priorTools, err := ic.GetEnabledTools()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ic.SetEnabledTools(priorTools) })
	if err := ic.SetEnabledTools([]string{"Bash"}); err != nil {
		t.Fatal(err)
	}
	const sentinel = "ARTEX_TARGET_SEAM_PROBE"
	rule, err := f.m.pg.CreateInterceptRule("target seam probe", "tool_input", "string", sentinel, "deny", "", 1000000, true, false, 0, "deny")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = f.m.pg.DeleteInterceptRule(rule.ID)
		_, _ = f.m.pg.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, task.ID)
		ic.Invalidate()
	})
	ic.Invalidate()
	rows := func() int {
		t.Helper()
		var n int
		if err := f.m.pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE task_id=$1`, task.ID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	ctx := intercept.WithTaskContext(context.Background(), task.ID, "planner", nil)
	ctx = intercept.WithTargetScope(ctx, task.targetScope(intercept.DefaultTargetWaitBound))
	input := []byte(`{"command":"echo ` + sentinel + `"}`)

	if block, _, _ := task.Guard.Hooks().PreToolUse(ctx, "Bash", input); !block {
		t.Fatal("control: the full guard was expected to deny the call")
	}
	if n := rows(); n != 1 {
		t.Fatalf("control: the full guard logged %d intercept rows, want 1", n)
	}
	ring := len(task.Guard.Audit())

	block, msg, updated := task.TargetGuard.Hooks().PreToolUse(ctx, "Bash", input)
	if block || msg != "" || updated != nil {
		t.Fatalf("target-only hooks: block=%v msg=%q updated=%q, want the call allowed untouched", block, msg, updated)
	}
	task.TargetGuard.Hooks().PostToolUse(ctx, "Bash", input, []byte(`"ok"`), false)
	if n := rows(); n != 1 {
		t.Fatalf("target-only hooks changed the intercept rows: %d, want 1", n)
	}
	if n := len(task.TargetGuard.Audit()); n != 0 {
		t.Fatalf("target-only guard wrote %d audit entries, want none", n)
	}
	if n := len(task.Guard.Audit()); n != ring {
		t.Fatalf("the task's audit ring grew from %d to %d entries", ring, n)
	}
}
