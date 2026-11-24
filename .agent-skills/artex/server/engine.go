package server

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/harness"
	"github.com/Autumn-27/norma/llm"
	"github.com/jackc/pgx/v5/pgconn"
)

// isFKViolation reports whether err is a Postgres foreign-key violation (SQLSTATE
// 23503) — e.g. an activity insert whose exploration_id has no parent row.
func isFKViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

// dropReason classifies why an activity write was dropped, so the log can be
// grouped/analysed by cause rather than by raw error text.
func dropReason(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23503":
			return "fk_violation(23503, parent exploration does not exist)"
		case "23505":
			return "unique_violation(23505)"
		default:
			return "pg_error(" + pgErr.Code + ")"
		}
	}
	return "write_error"
}

// bumpDrop increments and returns the running count of dropped (unpersistable)
// activity records for a task. Concurrent planner + worker emits race here, so the
// counter is an atomic behind sync.Map. The count in the log shows loss scale at a
// glance instead of forcing a grep-and-count.
func (e *Engine) bumpDrop(taskID string) int64 {
	v, _ := e.dropCnt.LoadOrStore(taskID, new(int64))
	return atomic.AddInt64(v.(*int64), 1)
}

// preview collapses newlines and trims s to a short rune-safe snippet for one-line
// log output (avoids dumping a multi-KB summary/detail into the log).
func preview(s string, n int) string {
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	r := []rune(s)
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return string(r)
}

// model_error (provider/API failure: LLM-layer transient retries exhausted, or the
// stream broke midway after starting). A work that ends this way is neither
// "tried but unfinished" nor a real failure — it is external jitter, so permanently blocking it
// would waste an intent; this terminal state gets a few extra reruns with backoff, and a pause/kill/cancel arriving mid-retry yields to its branch at once.
const (
	modelErrorRetries      = 2               // extra reruns after a model_error finish
	modelErrorRetryBackoff = 3 * time.Second // backoff before each retry
	workControlWaitTimeout = 30 * time.Second
)

var errWorkControlConflict = errors.New("work control conflict")

// retryableWorkerModelError excludes errors already handled by the task router.
// In particular, a quota error after partial streaming advances the task cursor
// for the next LLM call but must not replay this whole intent on the backup.
// A NOA budget refusal is deterministic and never reached the provider, so a
// rerun would only fail the same way.
func retryableWorkerModelError(reason harness.TerminalReason, err error) bool {
	return reason == harness.ReasonModelError && !isTaskLLMRuntimeError(err) && !errors.Is(err, agent.ErrNoaBudget)
}

// Engine drives the event-driven exploration loop with real LLM agents
// (docs §4.3/§4.4): on asset/exploration-graph change (debounced) it wakes the
// planner, which reads the route, queries assets, judges goals and emits intents;
// N concurrent work agents claim intents and execute them. There is no
// simulation mode — an LLM provider is required. The planner/worker can be
// (re)installed at runtime (LLM configured from the UI); the loops always run
// but idle until an LLM is set.
type Engine struct {
	m        *Manager
	debounce time.Duration

	bc *Broadcaster // live activity pub/sub (SSE)

	started  sync.Map // taskID -> bool, so Run is idempotent per task
	lastAct  sync.Map // taskID -> int64 unix, last planner/worker activity (heartbeat)
	llmCalls sync.Map // taskID -> *int64, actual planner/worker/main-agent LLM calls
	// quiet-mode (#79): open-goal fingerprint recorded at the end of the last
	// completed planning round, per task. Edge-triggered rounds are skipped
	// while it is unchanged and work is still in flight.
	goalFP   sync.Map // taskID -> string (sorted open-goal ids joined)
	paused   sync.Map // taskID -> bool, user-paused (planner + workers idle but loops alive)
	deleting sync.Map // taskID -> bool, delete barrier (no new task-owned writes)
	dropCnt  sync.Map // taskID -> *int64, running count of dropped (unpersistable) activity records

	// deleteMu makes installing the delete barrier atomic with registering a new
	// task operation. Once BeginDelete returns, every admitted writer is reflected
	// in inflight and every later writer is rejected.
	deleteMu sync.RWMutex

	// Every long-lived task goroutine (planner, workers and deadline coordinator)
	// runs under one task-scoped context. Successful deletion cancels that context,
	// waits for all goroutines, then releases every task-level Engine reference.
	runtimeMu sync.Mutex
	draining  bool
	runtimes  map[string]*taskRuntime

	// per-task execution context: each planner.Plan / worker.Execute runs under it,
	// so pausing can CANCEL an in-flight run (not just skip the next one). Recreated
	// on resume since cancelling is one-shot. Every cancellation carries a named
	// cause so the activity trace can identify the initiating control path.
	execMu     sync.Mutex
	execCancel map[string]context.CancelCauseFunc
	execCtx    map[string]context.Context

	// Per-work control lets the planner kill a worker and lets the UI pause/cancel
	// one intent without pausing the whole task. The done channel closes only after
	// runWorkerStep has stopped writing and committed its final state.
	workMu sync.Mutex
	work   map[int64]*workExecution

	// steerBox queues planner course-corrections for a running work (keyed by intent
	// id). The worker's PreToolUse hook drains it before its next tool call and hands
	// the message to the model (blocking that call) so it re-plans — no kill needed.
	steerMu  sync.Mutex
	steerBox map[int64][]string

	plannerRound sync.Map // taskID -> int, planner round counter (for UI round separators)

	// Task-level timeout (see docs/task-timeout-and-settle-design.md):
	settling     sync.Map // taskID -> bool, the task has entered the settlement sequence (stop dispatching/claiming intents)
	deadline     sync.Map // taskID -> int64 unix, absolute deadline (stamped on first run; 0/missing = no limit)
	stamped      sync.Map // taskID -> bool, whether first_run_at has been stamped (once per process)
	inflight     sync.Map // taskID -> *int64, count of in-flight planner.Plan + worker.Execute (for drain)
	coordStarted sync.Map // taskID -> bool, whether the deadline coordinator has started (deduplicated across Run/reload)
	budgets      sync.Map // taskID -> *agent.BudgetLedger, run budget meter (nil = no budget configured; see engine_budget.go)

	// resolve returns a task's dedicated planner/worker (wired by the server as the
	// authoritative task-router). nil,nil means this task is deliberately unavailable
	// (for example an exhausted failover chain) — there is no global-pair fallback.
	resolve              func(t *Task) (*agent.Planner, *agent.Worker)
	resolveAuthoritative bool
	// readiness reports whether a global LLM provider is configured — the signal behind
	// Ready()/the llm_configured indicator. Wired once at startup; nil → not ready.
	readiness func() bool
}

type taskRuntime struct {
	ctx    context.Context
	cancel context.CancelCauseFunc
	wg     sync.WaitGroup
}

type workExecution struct {
	cancel context.CancelCauseFunc
	done   chan error
	action string // user action: pause | cancel
}

// nextPlannerRound returns the next planner round number for a task (1-based).
func (e *Engine) nextPlannerRound(taskID string) int {
	v, _ := e.plannerRound.LoadOrStore(taskID, 0)
	n := v.(int) + 1
	e.plannerRound.Store(taskID, n)
	return n
}

// Pause stops a task: marks it paused AND cancels any in-flight planner/worker run
// for it (a long worker.Execute would otherwise keep going until it finishes).
func (e *Engine) Pause(taskID string, cause error) {
	e.paused.Store(taskID, true)
	e.cancelExec(taskID, cause)
}

// BeginDelete installs an execution barrier before task data/files are removed.
// The temporary pause is not a user pause. The server serializes this transition
// with lifecycle admission and tells AbortDelete whether the persisted task is
// paused/queued if cleanup fails.
func (e *Engine) BeginDelete(taskID string) bool {
	e.deleteMu.Lock()
	if _, loaded := e.deleting.LoadOrStore(taskID, true); loaded {
		e.deleteMu.Unlock()
		return false
	}
	e.paused.Store(taskID, true)
	e.deleteMu.Unlock()
	e.cancelExec(taskID, agent.AbortTaskDeleted)
	return true
}

func (e *Engine) AbortDelete(taskID string, keepPaused bool) {
	e.deleteMu.Lock()
	if !e.IsDeleting(taskID) {
		e.deleteMu.Unlock()
		return
	}
	e.deleting.Delete(taskID)
	if !keepPaused {
		e.paused.Delete(taskID)
	}
	e.deleteMu.Unlock()
	if !keepPaused && e.m != nil {
		if t, ok := e.m.Task(taskID); ok {
			t.Notify()
		}
	}
}

func (e *Engine) IsDeleting(taskID string) bool {
	_, ok := e.deleting.Load(taskID)
	return ok
}

// registerTaskRoutines reserves count goroutines in the task runtime. Callers
// hold deleteMu for reading so StopTask cannot race WaitGroup.Add with Wait.
func (e *Engine) registerTaskRoutines(parent context.Context, taskID string, count int) *taskRuntime {
	e.runtimeMu.Lock()
	defer e.runtimeMu.Unlock()
	if e.draining {
		return nil
	}
	rt := e.runtimes[taskID]
	if rt == nil {
		ctx, cancel := context.WithCancelCause(parent)
		rt = &taskRuntime{ctx: ctx, cancel: cancel}
		e.runtimes[taskID] = rt
	}
	rt.wg.Add(count)
	return rt
}

func runTaskRoutine(rt *taskRuntime, fn func(context.Context)) {
	go func() {
		defer rt.wg.Done()
		fn(rt.ctx)
	}()
}

// Wait blocks until the task goroutines registered at the moment of the call,
// and every admitted task operation, have finished, or until ctx ends. It
// refuses new registrations and new beginTaskOperation calls first. Goroutines
// that were already running are cancelled with AbortShutdown. That cancel does
// not write a terminal task status, and an in-flight intent claim stays running
// so the next start can reset it to open. Detached chat runs are not in a task
// WaitGroup; they are counted in inflight and Wait stays until they return.
func (e *Engine) Wait(ctx context.Context) error {
	if e == nil {
		return nil
	}
	e.runtimeMu.Lock()
	e.draining = true
	groups := make([]*sync.WaitGroup, 0, len(e.runtimes))
	for _, rt := range e.runtimes {
		if rt == nil {
			continue
		}
		if rt.cancel != nil {
			rt.cancel(agent.AbortShutdown)
		}
		groups = append(groups, &rt.wg)
	}
	e.runtimeMu.Unlock()
	for _, wg := range groups {
		if err := waitGroup(ctx, wg); err != nil {
			return err
		}
	}
	for e.inflightTotal() > 0 {
		timer := time.NewTimer(20 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	return nil
}

func waitGroup(ctx context.Context, wg *sync.WaitGroup) error {
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// StopTask permanently stops every long-lived goroutine and removes all Engine
// state for a successfully deleted task. The delete barrier remains installed
// until cleanup finishes, so no new task operation can race the teardown.
func (e *Engine) StopTask(taskID string) {
	e.deleteMu.Lock()
	e.deleting.Store(taskID, true)
	e.deleteMu.Unlock()

	e.cancelExec(taskID, agent.AbortTaskDeleted)
	e.runtimeMu.Lock()
	rt := e.runtimes[taskID]
	if rt != nil {
		rt.cancel(agent.AbortTaskDeleted)
	}
	e.runtimeMu.Unlock()
	if rt != nil {
		rt.wg.Wait()
	}

	e.execMu.Lock()
	if cancel := e.execCancel[taskID]; cancel != nil {
		cancel(agent.AbortTaskDeleted)
	}
	delete(e.execCancel, taskID)
	delete(e.execCtx, taskID)
	e.execMu.Unlock()

	e.runtimeMu.Lock()
	if e.runtimes[taskID] == rt {
		delete(e.runtimes, taskID)
	}
	e.runtimeMu.Unlock()

	e.started.Delete(taskID)
	e.lastAct.Delete(taskID)
	e.llmCalls.Delete(taskID)
	e.paused.Delete(taskID)
	e.dropCnt.Delete(taskID)
	e.plannerRound.Delete(taskID)
	e.settling.Delete(taskID)
	e.deadline.Delete(taskID)
	e.stamped.Delete(taskID)
	e.inflight.Delete(taskID)
	e.coordStarted.Delete(taskID)
	e.budgets.Delete(taskID)
	e.deleteMu.Lock()
	e.deleting.Delete(taskID)
	e.deleteMu.Unlock()
}

// cancelExec cancels a task's current per-task exec context (any in-flight
// planner.Plan / worker.Execute), if present. Shared by Pause and the settle
// sequence's hard-drain backstop.
func (e *Engine) cancelExec(taskID string, cause error) {
	e.execMu.Lock()
	if cancel := e.execCancel[taskID]; cancel != nil {
		cancel(cause)
	}
	e.execMu.Unlock()
}

// Resume un-pauses a task and nudges a fresh planning round. The next exec under
// it gets a fresh (uncancelled) context.
func (e *Engine) Resume(t *Task) {
	// BeginDelete owns the pause barrier once deletion starts. A concurrent
	// resume must never clear it and let a planner/worker re-enter while cleanup
	// is waiting for task operations to drain.
	if t == nil {
		return
	}
	e.deleteMu.RLock()
	defer e.deleteMu.RUnlock()
	if e.IsDeleting(t.ID) {
		return
	}
	e.paused.Delete(t.ID)
	t.Notify()
}

// execContextFor returns a live per-task context derived from parent, recreating
// it if a prior pause cancelled it.
func (e *Engine) execContextFor(parent context.Context, taskID string) context.Context {
	e.execMu.Lock()
	defer e.execMu.Unlock()
	if e.IsPaused(taskID) {
		// never hand out a live context while paused (guards the claim→Execute race)
		c, cancel := context.WithCancelCause(parent)
		cancel(agent.AbortPausedRaceGuard)
		return c
	}
	if c := e.execCtx[taskID]; c != nil && c.Err() == nil {
		return c
	}
	c, cancel := context.WithCancelCause(parent)
	e.execCtx[taskID] = c
	e.execCancel[taskID] = cancel
	return c
}

// IsPaused reports whether a task is user-paused.
func (e *Engine) IsPaused(taskID string) bool {
	v, ok := e.paused.Load(taskID)
	return ok && v.(bool)
}

// Started reports whether the engine loops are running for a task.
func (e *Engine) Started(taskID string) bool {
	_, ok := e.started.Load(taskID)
	return ok
}

// LastActivity returns the unix time of the last planner/worker activity for a
// task (0 if none yet).
func (e *Engine) LastActivity(taskID string) int64 {
	if v, ok := e.lastAct.Load(taskID); ok {
		return v.(int64)
	}
	return 0
}

// BeginLLMCall/EndLLMCall track actual provider calls separately from the
// scheduler's task-operation counter. A task can have live loops while all of
// them are waiting for a trigger; that state must remain idle in the UI.
func (e *Engine) BeginLLMCall(taskID string) {
	v, _ := e.llmCalls.LoadOrStore(taskID, new(int64))
	atomic.AddInt64(v.(*int64), 1)
}

func (e *Engine) EndLLMCall(taskID string) {
	if v, ok := e.llmCalls.Load(taskID); ok {
		p := v.(*int64)
		if atomic.AddInt64(p, -1) <= 0 {
			atomic.StoreInt64(p, 0)
		}
	}
}

func (e *Engine) ActiveLLMCalls(taskID string) int64 {
	if v, ok := e.llmCalls.Load(taskID); ok {
		return atomic.LoadInt64(v.(*int64))
	}
	return 0
}

func (e *Engine) touch(taskID string) { e.lastAct.Store(taskID, time.Now().Unix()) }

func NewEngine(m *Manager) *Engine {
	return &Engine{m: m, debounce: 800 * time.Millisecond, bc: NewBroadcaster(),
		execCancel: map[string]context.CancelCauseFunc{}, execCtx: map[string]context.Context{},
		work: map[int64]*workExecution{}, steerBox: map[int64][]string{},
		runtimes: map[string]*taskRuntime{}}
}

// registerWork records the cancel for the work currently running intentID.
func (e *Engine) registerWork(intentID int64, cancel context.CancelCauseFunc) {
	e.workMu.Lock()
	e.work[intentID] = &workExecution{cancel: cancel, done: make(chan error, 1)}
	e.workMu.Unlock()
}

// detachWork removes the live control handle once Execute has returned. complete
// must be called after the final intent state write so a waiting cancel handler can
// safely delete the worker's blackboard output without racing a late write.
func (e *Engine) detachWork(intentID int64) (action string, complete func(error)) {
	e.workMu.Lock()
	run := e.work[intentID]
	if run != nil {
		delete(e.work, intentID)
		action = run.action
		run.cancel(agent.AbortWorkFinished) // release resources (no-op if already cancelled)
	}
	e.workMu.Unlock()
	e.steerMu.Lock()
	delete(e.steerBox, intentID) // drop any undelivered steering for a finished work
	e.steerMu.Unlock()
	if run == nil {
		return action, func(error) {}
	}
	return action, func(err error) { run.done <- err }
}

// ControlWork requests a user-visible pause or cancellation and waits until the
// worker has fully stopped writing. Cancellation cleanup is performed by the API
// handler after this returns; pause state is committed by runWorkerStep itself.
func (e *Engine) ControlWork(ctx context.Context, intentID int64, action string) error {
	if action != "pause" && action != "cancel" {
		return fmt.Errorf("unsupported work action %q", action)
	}
	if ctx == nil {
		ctx = context.Background()
	}
	e.workMu.Lock()
	run := e.work[intentID]
	if run == nil {
		e.workMu.Unlock()
		return fmt.Errorf("%w: intent %d currently has no running work (it may have finished or was never claimed)", errWorkControlConflict, intentID)
	}
	if run.action != "" {
		e.workMu.Unlock()
		return fmt.Errorf("%w: intent %d is executing the %s operation", errWorkControlConflict, intentID, run.action)
	}
	run.action = action
	done := run.done
	cause := error(agent.AbortWorkPausedByUser)
	if action == "cancel" {
		cause = agent.AbortWorkCancelledByUser
	}
	run.cancel(cause)
	e.workMu.Unlock()

	timer := time.NewTimer(workControlWaitTimeout)
	defer timer.Stop()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		e.releaseWorkControl(intentID, run, action)
		return fmt.Errorf("waiting for intent %d %s to settle: %w", intentID, action, ctx.Err())
	case <-timer.C:
		e.releaseWorkControl(intentID, run, action)
		return fmt.Errorf("waiting for intent %d %s to settle: %w", intentID, action, context.DeadlineExceeded)
	}
}

// releaseWorkControl drops only this caller's reservation after its wait is
// cancelled. The work context stays cancelled; runWorkerStep recognizes the
// named cancellation cause and settles the intent into the recoverable paused
// state even if the HTTP caller has gone away.
func (e *Engine) releaseWorkControl(intentID int64, run *workExecution, action string) {
	e.workMu.Lock()
	if current := e.work[intentID]; current == run && current.action == action {
		current.action = ""
	}
	e.workMu.Unlock()
}

// SteerWork queues a mid-run course-correction for the work running intentID (the
// planner's steer_work tool). The worker delivers it before its next tool call and
// re-plans — no kill. Errors if no work is currently running that intent.
func (e *Engine) SteerWork(intentID int64, msg string) error {
	if strings.TrimSpace(msg) == "" {
		return fmt.Errorf("steering message must not be empty")
	}
	e.workMu.Lock()
	running := e.work[intentID] != nil
	e.workMu.Unlock()
	if !running {
		return fmt.Errorf("intent %d currently has no running work (it may have finished or was never claimed)", intentID)
	}
	e.steerMu.Lock()
	e.steerBox[intentID] = append(e.steerBox[intentID], msg)
	e.steerMu.Unlock()
	return nil
}

// drainSteer pops the oldest queued steering message for intentID (FIFO), if any.
func (e *Engine) drainSteer(intentID int64) (string, bool) {
	e.steerMu.Lock()
	defer e.steerMu.Unlock()
	q := e.steerBox[intentID]
	if len(q) == 0 {
		return "", false
	}
	msg := q[0]
	if len(q) == 1 {
		delete(e.steerBox, intentID)
	} else {
		e.steerBox[intentID] = q[1:]
	}
	return msg, true
}

// steerHooks wraps the guard's hook runner so the planner can steer a running work:
// before each tool call it drains a queued course-correction (if any) and blocks the
// call, handing the message back to the model — which re-plans its next step instead
// of running the tool. No queued message → the guard behaves exactly as before.
// It also handles rerunning "idle turns"; see Stop.
type steerHooks struct {
	inner harness.HookRunner
	drain func() (string, bool)
	// nudges counts the idle-turn reruns already injected for this intent, capped by
	// limit. It is a pointer: the harness holds a copy of steerHooks, and the count must be shared.
	nudges *atomic.Int64
	// limit caps the number of idle-turn reruns; Engine.emptyTurnNudgeLimit() parses it
	// from the "empty response retry count". <=0 = do not intervene (the user explicitly disabled this layer).
	limit int
	// label looks like "worker-1 · #42"; used only for logging.
	label string
	// budget meters this intent's run (nil = no budget). Once exhausted, every tool
	// but the write-back ones is refused with the wrap-up instruction.
	budget *agent.IntentMeter
}

// Default number of reruns for idle turns (thinking only, neither body text nor tool
// calls), kept aligned with the SDK's built-in empty-response retry default
// (emptyResponseRetries in norma/llm/openai.go) — the two layers share one knob, so unconfigured behavior should match too. See Engine.emptyTurnNudgeLimit.
//
// Note this number is a per-intent total, not "how many in a row": the harness's own
// stopHookActive already limits consecutive idling to a single nudge — if the turn after
// that nudge is still idle, the Stop hook is not called again and the run just ends;
// only a real tool turn refreshes the quota (norma/harness/query.go:534). So this gate blocks the pathological "tool → idle → nudge → tool → idle" loop from burning the intent budget.
const defaultEmptyTurnNudges = 2

// emptyTurnNudge is the rerun instruction injected on an idle turn.
//
// Such a turn looks like a natural end to the harness (stop_reason=end_turn with no
// tool_use), and none of the five LLM retry layers applies — it is not an error, the
// model "finished thinking but never acted". The SDK's empty-response retry cannot
// reach it either: it judges emptiness by "did any event get yielded", and thinking
// deltas are themselves events (SEThinkingDelta in norma/llm/openai.go), so
// thinking-only is not empty. That layer also resends the whole prompt verbatim; for an idle turn dictated by the shape of the context, resending only makes the model think again. Here we append an instruction instead, letting it continue with the thinking it already produced — only a changed input gives reason for different behavior.
const emptyTurnNudge = "[Idle-turn reminder] Your last turn produced only thinking — no body reply and no tool calls — " +
	"so this turn yielded nothing. Execute the next step you just planned: either call a tool or write your conclusion. Do not repeat the thinking."

// isThinkingOnlyTurn reports whether the latest assistant turn produced neither
// text nor a tool call — i.e. the model spent the whole round thinking.
func isThinkingOnlyTurn(messages []llm.Message) bool {
	for i := len(messages) - 1; i >= 0; i-- {
		m := messages[i]
		if m.Role != llm.RoleAssistant {
			continue
		}
		return strings.TrimSpace(m.Text()) == "" && len(m.ToolUses()) == 0
	}
	return false
}

func (h steerHooks) PreToolUse(ctx context.Context, name string, input []byte) (bool, string, []byte) {
	if msg, ok := h.drain(); ok {
		return true, "[Planner real-time steering] " + msg +
			"\n(This is the planner's immediate instruction for this intent; the tool call was not executed — adjust your next step accordingly. If it conflicts with your current plan, this takes precedence.)", nil
	}
	if h.budget != nil && agent.BudgetWrapupBlocks(name) && h.budget.Exhausted() {
		return true, agent.WorkerBudgetWrapup, nil
	}
	if h.inner != nil {
		return h.inner.PreToolUse(ctx, name, input)
	}
	return false, "", nil
}

func (h steerHooks) PostToolUse(ctx context.Context, name string, input, result []byte, isErr bool) {
	if h.inner != nil {
		h.inner.PostToolUse(ctx, name, input, result, isErr)
	}
}

// Stop adds an "idle turn" rerun layer on top of guard's existing semantics: when
// the model emitted only thinking — neither body text nor tool calls — the harness
// treats it as a natural end and finishes with an empty summary (ReasonCompleted +
// asst.Text() in query.go), leaving an unfinished intent stranded mid-way. Inject a rerun instruction here so the model continues with the thinking it already produced.
func (h steerHooks) Stop(ctx context.Context, messages []llm.Message) (bool, []string, string) {
	var (
		prevent  bool
		blocking []string
		msg      string
	)
	if h.inner != nil {
		prevent, blocking, msg = h.inner.Stop(ctx, messages)
	}
	// inner has already decided to hard-stop, or is already injecting its own rerun message → respect it and add nothing.
	// limit<=0 = the user configured the "empty response retry count" as -1, i.e. explicitly disabled this layer.
	if prevent || len(blocking) > 0 || h.nudges == nil || h.limit <= 0 || !isThinkingOnlyTurn(messages) {
		return prevent, blocking, msg
	}
	// A refused turn is empty as well, but there the provider declined the request;
	// the model did not think and forget to act. A rerun resends the same
	// conversation and is refused again, so let the run end and be reported as a
	// refusal (terminalText) instead.
	if stop := agent.LastStopReason(ctx); agent.IsRefusalStop(stop) {
		log.Printf("[work %s] provider refused the turn (stop_reason=%s), not injecting an idle-turn rerun", h.label, stop)
		return prevent, blocking, msg
	}
	n := h.nudges.Add(1)
	if n > int64(h.limit) {
		log.Printf("[work %s] idle turns (thinking only, no body text, no tools) reached the rerun cap %d, letting it finish", h.label, h.limit)
		return prevent, blocking, msg
	}
	log.Printf("[work %s] idle turn (thinking only, no body text, no tools), injecting rerun instruction (%d/%d)", h.label, n, h.limit)
	return false, []string{emptyTurnNudge}, ""
}

// KillWork cancels the in-flight work running intentID (planner's kill_work tool).
// The work's agent-core session honors ctx cancellation and aborts promptly.
func (e *Engine) KillWork(intentID int64) error {
	e.workMu.Lock()
	run := e.work[intentID]
	e.workMu.Unlock()
	if run == nil {
		return fmt.Errorf("intent %d currently has no running work (it may have finished or was never claimed)", intentID)
	}
	run.cancel(agent.AbortKilledByPlanner)
	return nil
}

// Broadcaster exposes the engine's live activity pub/sub (used by the SSE handler).
func (e *Engine) Broadcaster() *Broadcaster { return e.bc }

// emitActivity persists one captured step AND fans it out to live subscribers,
// from a single point so storage and the SSE stream never diverge.
func (e *Engine) emitActivity(t *Task, r db.Activity) db.Activity {
	id, err := e.appendActivity(t, r)
	if err != nil {
		// NO LONGER SILENT: dropping a record breaks command↔result pairing in the
		// trace — a tool_use whose tool_result was lost shows as "Running" forever, and
		// a lost 'result'/'round' record leaves the session with no summary ("no summary").
		// Everything needed to analyze the root cause goes into ONE error-level line: reason class,
		// summary preview, running drop count for this task, and — on the FK case — a
		// live probe of WHY the parent exploration is unreachable.
		n := e.bumpDrop(t.ID)
		diag := ""
		// On the FK-parent failure (23503) probe the live DB so the log records WHY the
		// exploration is unreachable (row gone / wrong expID) instead of just that it is.
		if isFKViolation(err) {
			storeID := t.Store.ID()
			if exists, refs, maxID, dErr := e.m.pg.ExplorationDiag(storeID); dErr != nil {
				diag = fmt.Sprintf(" | FK diagnostic query failed (store.expID=%d task.ExpID=%d): %v", storeID, t.ExpID, dErr)
			} else {
				diag = fmt.Sprintf(" | FK diagnosis: store.expID=%d task.ExpID=%d exploration exists=%v tasks referencing it=%d MAX(exploration.id)=%d",
					storeID, t.ExpID, exists, refs, maxID)
			}
		}
		log.Printf("[activity] task %s dropping activity record (%d dropped for this task so far) worker=%s kind=%s tool=%s tuid=%s reason=%s summary=%q: %v%s",
			t.ID, n, r.Worker, r.Kind, r.Tool, r.ToolUseID, dropReason(err), preview(r.Summary, 80), err, diag)
		if t.Store != nil {
			if qerr := t.Store.EnqueueActivity(r, err.Error()); qerr != nil {
				log.Printf("[activity] task %s outbox: %v", t.ID, qerr)
			}
		}
		// The row has no database id. Publish an error copy so a live session
		// does not stay on "Running" while the original return value is unchanged.
		notice := r
		notice.IsError = true
		if notice.Summary == "" {
			notice.Summary = "activity was not stored"
		} else {
			notice.Summary += " (not stored)"
		}
		if e.bc != nil {
			e.bc.Publish(t.ID, notice)
		}
		e.touch(t.ID)
		return r
	}
	r.ID = id
	if r.CreatedAt.IsZero() {
		r.CreatedAt = time.Now()
	}
	e.bc.Publish(t.ID, r)
	e.touch(t.ID)
	return r
}

// appendActivity persists one activity row, retrying briefly on write failure.
// Concurrent planner + worker inserts into the same exploration's activity log
// occasionally fail; a couple of quick retries recover most. Crucially, every
// failure is now LOGGED (it used to be swallowed by an `if err == nil`), so the
// underlying DB error is finally visible for diagnosis.
func (e *Engine) appendActivity(t *Task, r db.Activity) (int64, error) {
	var id int64
	var err error
	for attempt := 1; attempt <= 3; attempt++ {
		if id, err = t.Store.AppendActivity(r); err == nil {
			if attempt > 1 {
				log.Printf("[activity] task %s write retry %d succeeded (worker=%s kind=%s tool=%s)",
					t.ID, attempt, r.Worker, r.Kind, r.Tool)
			}
			return id, nil
		}
		log.Printf("[activity] task %s write failed (attempt %d/3, worker=%s kind=%s tool=%s expID=%d): %v",
			t.ID, attempt, r.Worker, r.Kind, r.Tool, t.Store.ID(), err)
		time.Sleep(time.Duration(attempt) * 25 * time.Millisecond)
	}
	return 0, err
}

// SetReadiness wires the global "an LLM provider is configured" predicate (read by
// Ready() / the llm_configured indicator). Called once at startup.
func (e *Engine) SetReadiness(fn func() bool) { e.readiness = fn }

// SetAgentResolver installs a per-task planner/worker resolver (wired by the server).
// Called once at startup before any task loop runs, so no lock is needed on reads.
func (e *Engine) SetAgentResolver(fn func(t *Task) (*agent.Planner, *agent.Worker)) {
	e.resolve = fn
	e.resolveAuthoritative = false
}

// SetAuthoritativeAgentResolver installs a resolver whose nil result must not
// fall through to the global provider. Task-level failover chains use this so a
// fully exhausted chain cannot silently bypass its configured boundary.
func (e *Engine) SetAuthoritativeAgentResolver(fn func(t *Task) (*agent.Planner, *agent.Worker)) {
	e.resolve = fn
	e.resolveAuthoritative = true
}

// snapshotFor returns the planner/worker a task should run on, from the task-router
// resolver. nil,nil means the task is deliberately unavailable (e.g. an exhausted
// failover chain); there is no global-pair fallback.
func (e *Engine) snapshotFor(t *Task) (*agent.Planner, *agent.Worker) {
	if e.resolve != nil {
		p, w := e.resolve(t)
		if (p != nil && w != nil) || e.resolveAuthoritative {
			return p, w
		}
	}
	return nil, nil
}

// Ready reports whether a global LLM provider is configured (via the readiness
// predicate wired at startup).
func (e *Engine) Ready() bool {
	return e.readiness != nil && e.readiness()
}

// ReadyFor reports whether a specific task can resolve a planner/worker pair.
// An explicit task profile chain can be runnable even when no global default
// provider is configured, so task status must not rely on Ready alone.
func (e *Engine) ReadyFor(t *Task) bool {
	p, w := e.snapshotFor(t)
	return p != nil && w != nil
}

// Run starts the planner loop + N worker loops for a task. The loops always run
// but no-op until an LLM is configured (so a task created while idle picks up
// automatically once LLM is set from the UI).
func (e *Engine) Run(ctx context.Context, t *Task) {
	workers := e.m.Workers()
	e.deleteMu.RLock()
	if e.IsDeleting(t.ID) {
		e.deleteMu.RUnlock()
		return
	}
	if _, loaded := e.started.LoadOrStore(t.ID, true); loaded {
		e.deleteMu.RUnlock()
		t.Notify() // already running — just nudge a planning round
		return
	}
	rt := e.registerTaskRoutines(ctx, t.ID, 2+workers)
	e.deleteMu.RUnlock()
	if rt == nil {
		e.started.Delete(t.ID)
		return
	}
	e.touch(t.ID)
	runTaskRoutine(rt, func(loopCtx context.Context) { e.plannerLoop(loopCtx, t) })
	runTaskRoutine(rt, func(loopCtx context.Context) { e.claimSweepLoop(loopCtx, t) })
	for i := 0; i < workers; i++ {
		name := fmt.Sprintf("work#%d", i+1)
		runTaskRoutine(rt, func(loopCtx context.Context) { e.workerLoop(loopCtx, t, name) })
	}
	e.startDeadlineCoordinator(ctx, t) // task-level timeout timer (only when timeout>0; deduplicated)
	// Kick the first planning round only when there are no active intents at all
	// (open+running). For a task with seeded intents: the seed is already open, or the
	// worker just started above has claimed it as running first — both count as "work
	// exists", so skip the first planner round: the worker runs the seed intent directly and NotifyDone/heartbeat wakes the planner when done.
	// ⚠️ Do not use Frontier (counts only open): a worker claiming (open→running) races with this check and would kick spuriously. After a restart-driven auto-recovery only running intents may remain — skip then too.
	if has, _ := t.Store.HasActiveIntent(); !has {
		t.Notify() // kick the first planning round (acted on once LLM is ready)
	}
}

// plannerHeartbeatInterval parses a task's planner heartbeat interval.
// db.CreateTask already normalizes it (anything below 600 is raised to 600); this is one more safety net against abnormal in-memory values.
func plannerHeartbeatInterval(t *Task) time.Duration {
	sec := t.PlanHeartbeatSeconds
	if sec < db.MinPlanHeartbeatSeconds { // floor = default = 600 (10min)
		sec = db.MinPlanHeartbeatSeconds
	}
	return time.Duration(sec) * time.Second
}

// resetPlannerTimer safely re-arms a Timer that may already have fired (the standard Stop→drain→Reset pattern).
func resetPlannerTimer(timer *time.Timer, d time.Duration) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(d)
}

// quietSkipEdge reports whether an edge-triggered planning round should be
// dropped (#79): the open-goal set is unchanged since the last completed round
// AND active work exists (open or running intents). Fails open (false) on any
// store error: when in doubt, plan, preserving the pre-quiet-mode behavior.
func (e *Engine) quietSkipEdge(t *Task) bool {
	fp, err := t.Store.OpenGoalFingerprint()
	if err != nil {
		return false
	}
	if last, ok := e.goalFP.Load(t.ID); !ok || last != fp {
		return false
	}
	active, err := t.Store.HasActiveIntent()
	return err == nil && active
}

// plannerGateContext tags a planning round's context for the target gate: the
// task, the "planner" lane (so an approval request raised from the round shows
// inline in the planner transcript) and the approval scope. wait bounds how long
// a gated call may wait for a human decision.
func (e *Engine) plannerGateContext(ctx context.Context, t *Task, wait time.Duration) context.Context {
	emit := func(a db.Activity) {
		a.Worker = "planner"
		e.emitActivity(t, a)
	}
	ctx = intercept.WithTaskContext(ctx, t.ID, "planner", emit)
	return intercept.WithTargetScope(ctx, t.targetScope(wait))
}

func (e *Engine) plannerLoop(ctx context.Context, t *Task) {
	interval := plannerHeartbeatInterval(t)
	// Arming the heartbeat timer at loop entry = counting from the task start: even a
	// seed task that skips the first planner round (Run does not kick the first round
	// when the frontier is non-empty) and blocks here gets its first planning round at "task start + interval". Every later wake-up (edge/heartbeat) re-arms it = time since the last planning trigger of any kind.
	heartbeat := time.NewTimer(interval)
	defer heartbeat.Stop()

	// runRound runs one planning round (with debounce coalescing + the guards). src is only used to tell the trigger source apart in logs.
	runRound := func(src string) {
		// debounce: coalesce a burst of changes into one planning round
		timer := time.NewTimer(e.debounce)
	drain:
		for {
			select {
			case <-t.notify:
			case <-timer.C:
				break drain
			}
		}
		planner, _ := e.snapshotFor(t)
		if planner == nil {
			return // idle until LLM configured
		}
		if e.IsPaused(t.ID) {
			return // user-paused: don't plan
		}
		if e.IsDeleting(t.ID) {
			return
		}
		// terminal task (goals all met → done, or failed): the run is over. A
		// resume/nudge — e.g. auto-resume of the active task on restart — must NOT
		// re-plan (it would burn an LLM round and re-confirm a settled result).
		if isTerminalStatus(t.lifecycleSnapshot().Status) {
			return
		}
		// Task-level timeout settlement in progress: drop ordinary wake-ups — neither
		// worker settlement write-backs nor Resume's Notify trigger regular planning rounds; the final round is driven directly by the coordinator (settleTask), not here.
		if e.isSettling(t.ID) {
			return
		}
		// goalless (human direct-inject) branch: when the task has no open goals the
		// planner does not run — running it would re-judge met→cancelExec and kill intents
		// the user injected directly via the main agent. Whether to end is decided by the
		// frontier instead: open/running intents remain → stay running and wait silently; intents all drained → land in done. The whole branch is pure Go, triggers no LLM calls, and writes no planning-round marker.
		if open, err := t.Store.HasOpenGoal(); err == nil && !open {
			t.drainTriggers() // discard accumulated done/finding triggers to avoid unbounded growth in long goalless sessions
			if active, err := t.Store.HasActiveIntent(); err == nil && !active {
				// Frontier drained and no running intents → settle. Use the Guarded variant for
				// the CAS, to avoid stepping on concurrent pause/delete/timeout-settlement state transitions.
				if won, err := e.m.SetTaskStatusGuarded(t.ID, "done", ""); err != nil {
					log.Printf("[goalless] task %s failed to settle into done: %v", t.ID, err)
				} else if won {
					e.emitActivity(t, db.Activity{Worker: "system", Kind: "text",
						Summary: "All goals have been met, the direct-injected intents have finished executing, and the task is over"})
				}
			}
			return // the goalless branch never enters planner.Plan
		}
		// Run budget (off by default): no worker affordable any more → the forced
		// wrap-up (once) instead of a normal round.
		if e.budgetStop(ctx, t) {
			return
		}
		// quiet-mode (#79): an edge round is redundant while work is in flight
		// and the open-goal set is unchanged since the last completed round —
		// there is no new decision for the plan to make. Drain the triggers so
		// they do not accumulate and let the heartbeat supervise; the next edge
		// after a goal opens or closes, or once the frontier drains and all
		// workers are idle, plans for real.
		if src == "edge" && t.PlanQuietMode && e.quietSkipEdge(t) {
			t.drainTriggers()
			log.Printf("[planner] task %s quiet: work in flight, goals unchanged, edge round skipped", t.ID)
			return
		}
		if !e.beginTaskOperation(t.ID) {
			return
		}
		defer e.decInflight(t.ID)
		e.stampFirstRun(t) // first real planning round → stamp first_run_at + compute the deadline (only for tasks with a timeout)
		e.touch(t.ID)
		emit := func(r db.Activity) { e.emitActivity(t, r) }
		ectx := e.clockCtx(e.execContextFor(ctx, t.ID), t, false) // cancellable by Pause; carries the task deadline
		if ectx.Err() != nil || e.IsDeleting(t.ID) {
			return
		}
		log.Printf("[planner] task %s planning… (trigger: %s)", t.ID, src)
		// round marker: each Plan() is one planner round; emit a boundary so the
		// UI can separate rounds in the transcript (kind='round').
		e.emitActivity(t, db.Activity{Worker: "planner", Kind: "round",
			Summary: fmt.Sprintf("Planning round %d", e.nextPlannerRound(t.ID))})
		// what fired this round (worker done / finding; may be several — debounce
		// coalesces a burst; empty for time/heartbeat wakes).
		triggers := t.drainTriggers()
		taskIDInt, _ := strconv.ParseInt(t.ID, 10, 64)
		pctx := e.budgetRoundCtx(e.plannerGateContext(ectx, t, intercept.DefaultTargetWaitBound), t, false)
		e.BeginLLMCall(t.ID)
		met, reason, err := planner.Plan(pctx, taskIDInt, e.m.assets, t.Store, t.Goal, triggers, t.TargetGuard.Hooks(), emit)
		e.EndLLMCall(t.ID)
		switch {
		case err != nil && ectx.Err() == nil:
			log.Printf("[planner] task %s planning error: %v", t.ID, err)
		case met:
			log.Printf("[planner] task %s judged all goals met: %s", t.ID, reason)
			// All goals met → persist the task state as done (the frontend DTO shows this terminal state first).
			if err := e.m.SetTaskStatus(t.ID, "done"); err != nil {
				log.Printf("[planner] task %s failed to persist completion: %v", t.ID, err)
			}
			// Task judged complete → cancel the running workers at once: whatever their
			// in-flight intents produce no longer matters. The next worker-loop pass claims
			// nothing new at the terminal gate; the cancelled ones take the "task completed" branch below and end up stopped (not blocked).
			e.cancelExec(t.ID, agent.AbortGoalMet)
		default:
			log.Printf("[planner] task %s planning finished", t.ID)
		}
		// Record the post-round open-goal fingerprint for quiet-mode (#79):
		// goals opened or closed by this round change it, so a later edge can
		// tell "nothing changed" apart from "the plan input changed".
		if fp, err := t.Store.OpenGoalFingerprint(); err == nil {
			e.goalFP.Store(t.ID, fp)
		}
		if e.budgetBlocksClaim(t.ID) {
			t.Notify() // this round crossed the budget: settle on the next round, not at the next heartbeat
		}
		e.touch(t.ID)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.notify:
			runRound("edge") // worker finish / finding / kill / resume / seed first round
		case <-heartbeat.C:
			// Periodic safety net: deadlock fallback + wake up to supervise in-flight workers (steer/kill) + periodic recheck.
			runRound("heartbeat")
		}
		// Re-arm the heartbeat after every wake-up (edge or heartbeat): any planning trigger restarts this idle timer.
		resetPlannerTimer(heartbeat, interval)
	}
}

// claimSweepLoop periodically returns this task's expired intent claims (no
// heartbeat within db.IntentClaimTTL: the claiming worker crashed or its process
// is gone) to the frontier, where the worker loops re-claim them. The startup
// reset alone would miss a claim that was still live when this process started.
func (e *Engine) claimSweepLoop(ctx context.Context, t *Task) {
	ticker := time.NewTicker(db.IntentClaimHeartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		if !e.beginTaskOperation(t.ID) {
			return
		}
		n, err := t.Store.ResetRunningIntents()
		e.decInflight(t.ID)
		if err != nil {
			log.Printf("[engine] task %s expired-claim sweep failed: %v", t.ID, err)
		} else if n > 0 {
			log.Printf("[engine] task %s returned %d expired intent claims to open", t.ID, n)
		}
	}
}

// startClaimHeartbeat renews an intent claim every interval while its worker is
// busy. A heartbeat rejected with db.ErrIntentClaimLost means the claim expired
// and another worker took the intent over: the run is cancelled with
// AbortWorkClaimLost so the stale worker stops. Any other store error is logged
// and retried on the next tick; the claim survives until db.IntentClaimTTL
// passes without a heartbeat. stop blocks until the heartbeat has ended.
func startClaimHeartbeat(store *db.ExplorationStore, interval time.Duration, label string, intentID int64, token string, cancel context.CancelCauseFunc) (stop func()) {
	quit, done := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-quit:
				return
			case <-ticker.C:
			}
			err := store.HeartbeatIntentClaim(intentID, token)
			if errors.Is(err, db.ErrIntentClaimLost) {
				log.Printf("[worker %s] intent #%d heartbeat rejected, cancelling this run: %v", label, intentID, err)
				cancel(agent.AbortWorkClaimLost)
				return
			}
			if err != nil {
				log.Printf("[worker %s] intent #%d heartbeat failed, retrying: %v", label, intentID, err)
			}
		}
	}()
	return func() { close(quit); <-done }
}

func (e *Engine) workerLoop(ctx context.Context, t *Task, name string) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		_, worker := e.snapshotFor(t)
		if worker == nil {
			if sleepCtx(ctx, 1500*time.Millisecond) {
				return
			}
			continue
		}
		if e.IsPaused(t.ID) {
			if sleepCtx(ctx, 1000*time.Millisecond) {
				return
			}
			continue // user-paused: don't claim/execute intents
		}
		if e.IsDeleting(t.ID) {
			return
		}
		if e.isSettling(t.ID) {
			if sleepCtx(ctx, 1000*time.Millisecond) {
				return
			}
			continue // task timeout settlement in progress: claim no new intents (running ones settle themselves; the coordinator waits for them to drain)
		}
		if e.budgetBlocksClaim(t.ID) {
			if sleepCtx(ctx, 1000*time.Millisecond) {
				return
			}
			continue // run budget below one worker's estimate: dispatch no new worker (the planner loop settles the task)
		}
		if isTerminalStatus(e.m.TaskStatus(t.ID)) {
			if sleepCtx(ctx, 1000*time.Millisecond) {
				return
			}
			continue // task already terminal (done/failed/timeout): stop claiming leftover intents; do not churn the frontier after completion
		}
		if !e.beginTaskOperation(t.ID) {
			return
		}
		claimed := e.runWorkerStep(ctx, t, name, worker)
		e.decInflight(t.ID)
		if !claimed && sleepCtx(ctx, 800*time.Millisecond) {
			return
		}
	}
}

// runWorkerStep claims one intent from the frontier and fully settles it via
// runIntent. Returns false when nothing was claimable. The pool worker loop is its
// only caller.
func (e *Engine) runWorkerStep(ctx context.Context, t *Task, name string, worker *agent.Worker) bool {
	intent, token := e.claimNext(t, name)
	if intent == nil {
		return false
	}
	log.Printf("[worker %s] task %s claimed intent #%d", name, t.ID, intent.ID)
	return e.runIntent(ctx, t, name, worker, intent, token, "", "")
}

// intentWorkContext resolves the cached per-task exec context and returns a
// per-intent child context with the rotated LLM profile pin attached (#85,
// #376). Attaching the pin after execContextFor ensures a cached e.execCtx
// does not drop it; attaching it after the paused/deleting check ensures a
// rolled-back claim never advances the rotation counter.
func (e *Engine) intentWorkContext(ctx context.Context, t *Task) (ectx, workCtx context.Context, workCancel context.CancelCauseFunc, ok bool) {
	ectx = e.clockCtx(e.execContextFor(ctx, t.ID), t, false) // cancellable by Pause; carries the task deadline
	if ectx.Err() != nil || e.IsDeleting(t.ID) {
		return ectx, nil, nil, false
	}
	// per-work child context so the planner's kill_work can stop just this work.
	workCtx, workCancel = context.WithCancelCause(ectx)
	// Per-intent LLM rotation (#85): each claimed worker intent runs on the
	// next chain head. The pin travels through the run context into the
	// provider resolver; non-worker roles and failover keep the active head.
	if head, pinned := t.nextRotatedProfile(); pinned {
		workCtx = withLLMProfilePin(workCtx, head)
	}
	return ectx, workCtx, workCancel, true
}

// runIntent executes and fully settles one already-claimed (state=running) intent.
// Both the pool worker loop (via runWorkerStep) and the human-message handler (via
// runDetachedIntent, a dedicated goroutine outside the worker pool) call it, so the
// execute/retry/state-write logic lives in exactly one place. A non-empty message
// is injected as this turn's input through ExecuteWithMessage; requestID keys the
// transcript marker that dedups re-injection across model_error retries. The caller
// must already hold one task-operation admission for the whole sequence so a delete
// cannot observe quiescence between the LLM return and the final DB writes.
// token is the unclaim token of the caller's claim: a heartbeat renews the claim
// while the worker is busy, and every intent state write below is fenced on it,
// so a worker whose claim was taken over cannot overwrite the new claimer.
func (e *Engine) runIntent(ctx context.Context, t *Task, name string, worker *agent.Worker, intent *db.Node, token, requestID, message string) bool {
	hasChatMessage := message != ""
	e.stampFirstRun(t) // first real execution → stamp first_run_at + compute the deadline (only for tasks with a timeout)
	e.touch(t.ID)
	emit := func(r db.Activity) { e.emitActivity(t, r) }
	ectx, workCtx, workCancel, ok := e.intentWorkContext(ctx, t)
	if !ok {
		if err := t.Store.SettleIntentClaim(intent.ID, token, "open"); err != nil {
			log.Printf("[worker %s] task %s intent #%d claim rollback failed: %v", name, t.ID, intent.ID, err)
		}
		return true
	}
	e.registerWork(intent.ID, workCancel)
	stopHeartbeat := startClaimHeartbeat(t.Store, db.IntentClaimHeartbeatInterval, name, intent.ID, token, workCancel)
	// wrap the guard hooks so steer_work can inject a mid-run course-correction
	// for THIS intent (drained before the worker's next tool call).
	iid := intent.ID
	taskEmit := func(a db.Activity) {
		nid := iid
		a.NodeID, a.Worker = &nid, name
		emit(a)
	}
	label := fmt.Sprintf("%s · #%d", name, iid)
	workCtx = intercept.WithTaskContext(workCtx, t.ID, label, taskEmit)
	workCtx = intercept.WithTargetScope(workCtx, t.targetScope(intercept.DefaultTargetWaitBound))
	// Run budget (off by default): meter this run's calls; its effective budget is
	// min(intent budget, task remaining above the wrap-up reserve).
	workCtx, meter := e.budgetIntent(workCtx, t.ID)
	// nudges deliberately sits outside the model_error rerun loop: the idle-turn rerun
	// cap is a per-intent total, and one rerun round must not reset it back to zero.
	hooks := steerHooks{
		inner:  t.Guard.Hooks(),
		drain:  func() (string, bool) { return e.drainSteer(iid) },
		nudges: &atomic.Int64{},
		limit:  e.emptyTurnNudgeLimit(),
		label:  label,
		budget: meter,
	}
	wTaskID, _ := strconv.ParseInt(t.ID, 10, 64)
	e.BeginLLMCall(t.ID)
	var reason harness.TerminalReason
	var wrote agent.WriteCounts
	var err error
	if hasChatMessage {
		reason, wrote, err = worker.ExecuteWithMessage(workCtx, name, wTaskID, e.m.assets, t.Store, intent, hooks, emit, e.m.enrich, t.NotifyFinding, requestID, message)
	} else {
		reason, wrote, err = worker.Execute(workCtx, name, wTaskID, e.m.assets, t.Store, intent, hooks, emit, e.m.enrich, t.NotifyFinding)
	}
	e.EndLLMCall(t.ID)
	// model_error finish → a few extra reruns (retry after backoff). Retry only while
	// the intent still belongs to this work and the task is not paused/killed/cancelled
	// [and has not entered settlement]; otherwise yield to the matching branch (no retries during settlement, so backoff does not eat into other workers' graceful-settlement window).
	maxRetries, retryBackoff := e.modelErrorRetryPolicy()
	for attempt := 1; attempt <= maxRetries &&
		retryableWorkerModelError(reason, err) &&
		workCtx.Err() == nil && ectx.Err() == nil && !e.IsPaused(t.ID) && !e.isSettling(t.ID); attempt++ {
		log.Printf("[worker %s] task %s intent #%d finished with model_error, retrying after %v (%d/%d)",
			name, t.ID, intent.ID, retryBackoff, attempt, maxRetries)
		if sleepCtx(workCtx, retryBackoff) {
			break // cancelled during backoff (kill/pause) → handled by the branches below
		}
		e.BeginLLMCall(t.ID)
		if hasChatMessage {
			reason, wrote, err = worker.ExecuteWithMessage(workCtx, name, wTaskID, e.m.assets, t.Store, intent, hooks, emit, e.m.enrich, t.NotifyFinding, requestID, message)
		} else {
			reason, wrote, err = worker.Execute(workCtx, name, wTaskID, e.m.assets, t.Store, intent, hooks, emit, e.m.enrich, t.NotifyFinding)
		}
		e.EndLLMCall(t.ID)
	}
	stopHeartbeat() // no longer busy: the state writes below follow within the just-renewed claim
	if meter != nil {
		meter.Finish() // feeds the per-worker cost estimate
	}
	// Capture kill state before detachWork cancels workCtx. kill = this work's
	// ctx was cancelled (planner kill_work) while the TASK ctx kept running; a
	// pause cancels the task ctx (ectx) instead. Checking workCtx.Err() AFTER
	// unregister would always be true (unregister cancels it) → every completed
	// work would be wrongly marked stopped.
	workCause := context.Cause(workCtx)
	killed := workCtx.Err() != nil && ectx.Err() == nil
	action, completeWork := e.detachWork(intent.ID)
	// A caller may stop waiting and release its in-memory reservation before the
	// agent honors cancellation. The named context cause remains authoritative and
	// still settles the stopped run into a recoverable state.
	if action == "" {
		switch {
		case errors.Is(workCause, agent.AbortWorkPausedByUser):
			action = "pause"
		case errors.Is(workCause, agent.AbortWorkCancelledByUser):
			action = "cancel"
		}
	}
	var controlErr error
	defer func() { completeWork(controlErr) }()
	if action == "pause" {
		controlErr = t.Store.SettleIntentClaim(intent.ID, token, "paused")
		if controlErr != nil {
			log.Printf("[worker %s] task %s intent #%d failed to persist the paused state: %v", name, t.ID, intent.ID, controlErr)
			return true
		}
		log.Printf("[worker %s] task %s intent #%d paused", name, t.ID, intent.ID)
		e.touch(t.ID)
		return true
	}
	if action == "cancel" {
		// Park the stopped run in paused before handing cleanup to the API. If the
		// request disconnects after cancellation, the intent remains recoverable and
		// a later cancel can finish cleanup instead of leaving a phantom running row.
		controlErr = t.Store.SettleIntentClaim(intent.ID, token, "paused")
		if controlErr != nil {
			log.Printf("[worker %s] task %s intent #%d failed to persist the cancel barrier: %v", name, t.ID, intent.ID, controlErr)
			return true
		}
		log.Printf("[worker %s] task %s intent #%d stopped, waiting for cancel cleanup", name, t.ID, intent.ID)
		e.touch(t.ID)
		return true
	}
	// The heartbeat was rejected: the claim expired and another worker took the
	// intent over. This run's result is void and the intent state is not ours to
	// write (the fence would reject every write below).
	if errors.Is(workCause, agent.AbortWorkClaimLost) {
		log.Printf("[worker %s] task %s intent #%d claim lost to another worker, result discarded", name, t.ID, intent.ID)
		return true
	}
	// if a pause cancelled this run mid-flight, return the intent to the frontier
	// so it is re-claimed on resume — the worker will resume the prior LLM
	// conversation from its transcript instead of restarting from scratch.
	if ectx.Err() != nil && taskExecutionPaused(context.Cause(ectx)) {
		if err := t.Store.SettleIntentClaim(intent.ID, token, "open"); err != nil {
			log.Printf("[worker %s] task %s intent #%d task-pause rollback failed: %v", name, t.ID, intent.ID, err)
		}
		return true
	}
	// The hard-fallback cancel of task-timeout settlement (not pause, not kill) cancelled
	// this run → classify it as exhausted (settled), not mislabeled blocked. By then the worker has usually written its result back during the settlement phase.
	if ectx.Err() != nil && e.isSettling(t.ID) {
		if err := t.Store.SettleIntentClaim(intent.ID, token, "exhausted"); err != nil {
			log.Printf("[worker %s] task %s intent #%d failed to persist the timeout-settlement state: %v", name, t.ID, intent.ID, err)
		}
		log.Printf("[worker %s] task %s intent #%d ended by task-timeout settlement (exhausted), wrote back %s", name, t.ID, intent.ID, wrote)
		e.touch(t.ID)
		return true
	}
	// Task judged complete (done via the regular path) → cancelExec above cancelled this
	// run. The intent's result is meaningless now; mark it stopped (not blocked) and do not pollute the intent states of a completed task.
	if ectx.Err() != nil && isTerminalStatus(e.m.TaskStatus(t.ID)) {
		if err := t.Store.SettleIntentClaim(intent.ID, token, "stopped"); err != nil {
			log.Printf("[worker %s] task %s intent #%d failed to persist the terminal stop: %v", name, t.ID, intent.ID, err)
		}
		log.Printf("[worker %s] task %s intent #%d cancelled because the task completed (stopped)", name, t.ID, intent.ID)
		e.touch(t.ID)
		return true
	}
	// Process shutdown cancels the task context. Leave the claim running: AbortShutdown
	// says restart resets leftover running intents to open. Settling done or blocked
	// here would make that reset miss the intent, so the task would resume without it.
	if ectx.Err() != nil && errors.Is(context.Cause(ectx), agent.AbortShutdown) {
		log.Printf("[worker %s] task %s intent #%d shutdown: leaving the claim running", name, t.ID, intent.ID)
		return true
	}
	// killed by the planner: mark stopped (don't write back results, don't auto-reclaim).
	if killed {
		if err := t.Store.SettleIntentClaim(intent.ID, token, "stopped"); err != nil {
			log.Printf("[worker %s] task %s intent #%d failed to persist the planner stop: %v", name, t.ID, intent.ID, err)
		}
		log.Printf("[worker %s] task %s intent #%d killed (stopped)", name, t.ID, intent.ID)
		e.touch(t.ID)
		t.Notify()
		return true
	}
	if err != nil {
		log.Printf("[worker %s] intent %d: %v", name, intent.ID, err)
	}
	// Terminal routing: hitting the turn cap is not completion. max_turns → exhausted
	// (so the planner knows this direction was tried but not truly finished and needs a different angle, instead of skipping it forever as covered); error → blocked; normal → done.
	state := "done"
	switch {
	case err != nil:
		state = "blocked"
	case reason == harness.ReasonMaxTurns:
		state = "exhausted"
		log.Printf("[worker %s] intent %d hit the turn cap (exhausted), wrote back %s", name, intent.ID, wrote)
	case reason == harness.ReasonTimeout:
		state = "exhausted"
		log.Printf("[worker %s] intent %d ran out of time (exhausted), wrote back %s after settling", name, intent.ID, wrote)
	}
	var stateErr error
	if state == "blocked" && isTaskLLMChainExhausted(err) {
		stateErr = t.Store.SettleIntentClaimBlocked(intent.ID, token, db.IntentBlockedLLMQuota)
	} else {
		stateErr = t.Store.SettleIntentClaim(intent.ID, token, state)
	}
	if stateErr != nil {
		log.Printf("[worker %s] task %s intent #%d failed to persist terminal state %s: %v", name, t.ID, intent.ID, state, stateErr)
		if errors.Is(stateErr, db.ErrIntentClaimLost) {
			return true // taken over: the intent is not finished, its new claimer reports the result
		}
	}
	log.Printf("[worker %s] task %s intent #%d finished: %s (wrote back %s)", name, t.ID, intent.ID, state, wrote)
	e.touch(t.ID)
	t.NotifyDone(intent.ID) // results changed the graph -> wake the planner (with the just-finished intent id)
	return true
}

// runDetachedIntent runs one paused intent OUTSIDE the worker pool in its own
// goroutine — the human-message path. It transitions the intent paused->running
// itself (never through 'open'), so the pool, which only claims 'open', can never
// race it; the "at most one run per intent" invariant still holds because winning
// the CAS is the sole entry and work[intentID] was cleared when the pause settled.
// Because it does not compete for a frontier slot, a user message continues the
// worker immediately even when all pool slots are busy (mirroring how the
// main-agent chat handler starts its run directly). The spawned goroutine owns one
// task-operation admission for the whole run and roots its context at ctx (pass the
// server root, never the HTTP request, so a disconnect cannot strand the run while
// task pause/delete/shutdown still stops it). Returns an error if the run could not
// be started; the intent is left untouched in that case.
func (e *Engine) runDetachedIntent(ctx context.Context, t *Task, intentID int64, requestID, message, agentMessage string) error {
	if !e.beginTaskOperation(t.ID) {
		return fmt.Errorf("task is not accepting work")
	}
	release := true
	defer func() {
		if release {
			e.decInflight(t.ID)
		}
	}()
	_, worker := e.snapshotFor(t)
	if worker == nil {
		return fmt.Errorf("worker not ready yet")
	}
	node, err := t.Store.GetNode(intentID)
	if err != nil {
		return err
	}
	if node == nil || node.Kind != db.KindIntent {
		return fmt.Errorf("intent not found")
	}
	token, err := t.Store.ClaimPausedIntentToken(intentID)
	if err != nil {
		return err
	}
	if token == "" {
		return fmt.Errorf("%w: intent is no longer in the paused state", db.ErrIntentStateConflict)
	}
	node.State, node.Owner = "running", "chat"
	// Record the human turn as a visible activity BEFORE the run starts, so it is
	// ordered ahead of any worker step and never appears without the run happening.
	// Keep the UI copy concise; ExecuteWithMessage writes the server-resolved
	// reference snapshot into the intent transcript as the LLM input.
	uid := intentID
	e.emitActivity(t, db.Activity{NodeID: &uid, Worker: "user", Kind: "user", Summary: message, Detail: message})
	release = false // ownership of the admission passes to the goroutine
	go func() {
		defer e.decInflight(t.ID)
		e.runIntent(ctx, t, "chat", worker, node, token, requestID, agentMessage)
	}()
	return nil
}

func taskExecutionPaused(cause error) bool {
	var abort *agent.AbortCause
	if !errors.As(cause, &abort) {
		return false
	}
	switch abort.Code {
	case "paused_by_user", "paused_by_orchestrator", "paused_on_reload", "paused_race_guard",
		"queued_for_admission", "llm_unavailable_queued", "task_deleted":
		return true
	default:
		return false
	}
}

func sleepCtx(ctx context.Context, d time.Duration) (done bool) {
	select {
	case <-ctx.Done():
		return true
	case <-time.After(d):
		return false
	}
}

func (e *Engine) claimNext(t *Task, name string) (*db.Node, string) {
	fr, _ := t.Store.Frontier(20)
	for _, in := range fr {
		if token, _ := t.Store.ClaimIntentToken(in.ID, name); token != "" {
			return in, token
		}
	}
	return nil, ""
}
