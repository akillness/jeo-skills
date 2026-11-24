package server

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

// Task-level timeout coordinator (see docs/task-timeout-and-settle-design.md §4/§8.5).
// Absolute wall clock: one timer goroutine per task with a timeout; when it fires it drives
// the ordered settle sequence:
//   ① settling → ② workers stop claiming new intents / ③ planner drops normal notifies
//   ④ wait for running workers to drain (bounded by grace) → ⑤ one final planner round → ⑥ set the terminal state (guarded)

const (
	settleDrainGrace     = 90 * time.Second // upper bound for running workers to finish gracefully; beyond it, hard cancel
	deadlinePollInterval = 2 * time.Second  // poll interval while the deadline is unstamped / the LLM is not ready
	deadlineMaxSleep     = 30 * time.Second // longest single sleep (allows periodic terminal-state re-checks)
)

// ---------- settling state ----------

func (e *Engine) isSettling(taskID string) bool {
	v, _ := e.settling.Load(taskID)
	b, _ := v.(bool)
	return b
}

// markSettling flips settling on; returns true only for the first caller.
func (e *Engine) markSettling(taskID string) bool {
	_, loaded := e.settling.LoadOrStore(taskID, true)
	return !loaded
}

// ---------- in-flight count (worker.Execute + planner.Plan), used for drain ----------

func (e *Engine) inflightCounter(taskID string) *int64 {
	v, _ := e.inflight.LoadOrStore(taskID, new(int64))
	return v.(*int64)
}

// beginTaskOperation atomically registers a task-owned operation unless deletion
// has already installed its barrier, or the engine is draining for shutdown.
// The delete handler and Wait can therefore wait for inflight==0 without a
// check-then-start race admitting work that outlives the drain.
func (e *Engine) beginTaskOperation(taskID string) bool {
	e.deleteMu.RLock()
	defer e.deleteMu.RUnlock()
	if e.IsDeleting(taskID) {
		return false
	}
	e.runtimeMu.Lock()
	defer e.runtimeMu.Unlock()
	if e.draining {
		return false
	}
	atomic.AddInt64(e.inflightCounter(taskID), 1)
	return true
}

func (e *Engine) decInflight(taskID string) { atomic.AddInt64(e.inflightCounter(taskID), -1) }
func (e *Engine) inflightCount(taskID string) int64 {
	return atomic.LoadInt64(e.inflightCounter(taskID))
}

// inflightTotal is the sum of every task's admitted operations, including
// detached chat runs that are not members of a task WaitGroup.
func (e *Engine) inflightTotal() int64 {
	var n int64
	e.inflight.Range(func(_, v any) bool {
		n += atomic.LoadInt64(v.(*int64))
		return true
	})
	return n
}

// ---------- deadline ----------

// taskDeadline returns the task's absolute deadline (unix). Prefers the in-process
// map (stamped this session); falls back to the DB-loaded value (restart), seeding
// the map. 0 = no timeout / not yet stamped.
func (e *Engine) taskDeadline(t *Task) int64 {
	if v, ok := e.deadline.Load(t.ID); ok {
		return v.(int64)
	}
	deadlineAt := t.lifecycleSnapshot().DeadlineAt
	if deadlineAt > 0 {
		e.deadline.Store(t.ID, deadlineAt)
		return deadlineAt
	}
	return 0
}

// resetTimeoutRevival clears only the per-run timeout state after PostgreSQL has
// atomically committed timeout -> running and reset first_run_at/deadline_at. The
// configured TimeoutSeconds remains on Task, so the next real Planner/Worker run
// stamps a fresh full budget. coordStarted is reset because the coordinator that
// produced the timeout has already completed (or is in its final return path).
func (e *Engine) resetTimeoutRevival(taskID string) {
	e.resetSettledRun(taskID)
	e.deadline.Delete(taskID)
	e.stamped.Delete(taskID)
	e.coordStarted.Delete(taskID)
}

// resetSettledRun clears the settle state of a finished run (settling and the
// budget ledger) so a revived task can plan and claim again. The next ledger
// is seeded from llm_usage, so the spend already recorded still counts.
// It also clears the persisted end_reason of the previous run (ApplyTaskAdmission
// already did in the same UPDATE as the revive; this is idempotent and never
// touches a task that is terminal again).
func (e *Engine) resetSettledRun(taskID string) {
	e.settling.Delete(taskID)
	e.budgets.Delete(taskID)
	if e.m != nil && e.m.pg != nil {
		if n, err := strconv.ParseInt(taskID, 10, 64); err == nil {
			if err := e.m.pg.ClearRunEndReason(n); err != nil {
				log.Printf("[budget] task %s failed to clear end_reason: %v", taskID, err)
			}
		}
	}
}

// stampFirstRun records first_run_at + deadline_at on the FIRST real run (LLM ready)
// of a timeout task, once per process. No-op when the task has no timeout.
func (e *Engine) stampFirstRun(t *Task) {
	if t.TimeoutSeconds <= 0 {
		return
	}
	if _, loaded := e.stamped.LoadOrStore(t.ID, true); loaded {
		return
	}
	dl, err := e.m.StampTaskFirstRun(t.ID)
	if err != nil {
		log.Printf("[deadline] task %s failed to stamp first_run: %v", t.ID, err)
		e.stamped.Delete(t.ID) // allow the next attempt to retry
		return
	}
	if dl > 0 {
		e.deadline.Store(t.ID, dl)
		log.Printf("[deadline] task %s first run, deadline at %s", t.ID, time.Unix(dl, 0).Format("2006-01-02 15:04:05"))
	}
}

// clockCtx layers the task's TaskClock (absolute deadline) onto a run's context so
// worker/planner can clamp their wall-clock budget and pick per-run vs task-timeout
// wrap-up words. final marks the coordinator-driven terminal planner round.
func (e *Engine) clockCtx(base context.Context, t *Task, final bool) context.Context {
	dl := e.taskDeadline(t)
	if dl <= 0 && !final {
		return base // no timeout → unchanged behavior
	}
	return agent.WithTaskClock(base, agent.TaskClock{DeadlineUnix: dl, Final: final})
}

// ---------- coordinator ----------

// startDeadlineCoordinator launches the per-task deadline timer once (idempotent).
// Called from Run() and from the restart reload path, so non-active timeout tasks
// still get settled after their deadline even without live planner/worker loops.
func (e *Engine) startDeadlineCoordinator(ctx context.Context, t *Task) {
	if t == nil || t.TimeoutSeconds <= 0 {
		return
	}
	e.deleteMu.RLock()
	if e.IsDeleting(t.ID) {
		e.deleteMu.RUnlock()
		return
	}
	if _, loaded := e.coordStarted.LoadOrStore(t.ID, true); loaded {
		e.deleteMu.RUnlock()
		return
	}
	rt := e.registerTaskRoutines(ctx, t.ID, 1)
	e.deleteMu.RUnlock()
	if rt == nil {
		e.coordStarted.Delete(t.ID)
		return
	}
	runTaskRoutine(rt, func(loopCtx context.Context) { e.deadlineCoordinator(loopCtx, t) })
}

// deadlineCoordinator waits until the task's absolute deadline, then runs the settle
// sequence. Absolute wall clock: it keeps counting through pauses.
func (e *Engine) deadlineCoordinator(ctx context.Context, t *Task) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		if isTerminalStatus(e.m.TaskStatus(t.ID)) {
			return // already finished (goals met / failed) — nothing to time out
		}
		dl := e.taskDeadline(t)
		if dl <= 0 {
			if sleepCtx(ctx, deadlinePollInterval) { // not yet stamped (task hasn't really run)
				return
			}
			continue
		}
		if remaining := time.Until(time.Unix(dl, 0)); remaining > 0 {
			nap := remaining
			if nap > deadlineMaxSleep {
				nap = deadlineMaxSleep
			}
			if sleepCtx(ctx, nap) {
				return
			}
			continue
		}
		e.settleTask(ctx, t, false)
		return
	}
}

// settleTask runs the ordered settle sequence once (§4 steps ①–⑥). budget = the
// task run budget is exhausted (budget.go) instead of the deadline: same sequence,
// the final round carries the budget wrap-up words.
func (e *Engine) settleTask(ctx context.Context, t *Task, budget bool) {
	if !e.markSettling(t.ID) {
		return
	}
	if budget {
		log.Printf("[budget] task %s run budget exhausted, entering the settle sequence", t.ID)
	} else {
		log.Printf("[deadline] task %s reached the timeout limit, entering the settle sequence", t.ID)
	}

	// ④ wait for running workers/planners to drain (running runs enter wrap-up on their own
	// via the clamped MaxDuration); if not drained within the grace period, hard-cancel the
	// task's exec ctx (the settling-aware branches classify it correctly).
	hardStop := time.Now().Add(settleDrainGrace)
	for e.inflightCount(t.ID) > 0 {
		if time.Now().After(hardStop) {
			log.Printf("[deadline] task %s drain timed out (%s), hard-cancelling running runs", t.ID, settleDrainGrace)
			e.cancelExec(t.ID, agent.AbortSettleDrainTimeout)
			_ = sleepCtx(ctx, 3*time.Second) // give the worker branches a moment to persist/classify
			break
		}
		if sleepCtx(ctx, 500*time.Millisecond) {
			return // whole engine shutting down
		}
	}

	// ⑤ one final planner round (task-timeout words, final goal judgment, no new intents).
	met := e.runFinalPlannerRound(ctx, t, budget)
	if !e.beginTaskOperation(t.ID) {
		return
	}
	defer e.decInflight(t.ID)

	// ⑥ set the terminal state (guarded): met → done (completed); otherwise timeout. If the
	// normal path already settled done first, the guard (SetTaskStatusGuarded) rejects the
	// overwrite, preserving the completed semantics. A budget-exhausted run reuses the
	// timeout state (a resource limit ended it; no new task status), is marked by an
	// activity record, and stores tasks.end_reason=budget with the status (read back by
	// the coverage ledger's completeness; cleared when a revive starts a new run).
	status := "timeout"
	if met {
		status = "done"
	}
	endReason := ""
	if budget {
		endReason = db.EndReasonBudget
		e.emitActivity(t, db.Activity{Worker: "system", Kind: "text",
			Summary: "Task run budget exhausted: forced wrap-up done, task stopped (final state " + status + ")"})
	}
	won, err := e.m.SetTaskStatusGuarded(t.ID, status, endReason)
	switch {
	case err != nil:
		log.Printf("[deadline] task %s failed to settle the terminal state: %v", t.ID, err)
	case won:
		log.Printf("[deadline] task %s settle complete, terminal state=%s", t.ID, status)
	default:
		log.Printf("[deadline] task %s was already terminal when settling, keeping the original state", t.ID)
	}
}

// runFinalPlannerRound drives exactly ONE terminal planner round with the
// task-timeout planner words (final goal judgment; no new intents). Waits for the
// LLM to be ready (bounded by ctx) so a completable task isn't mis-judged timeout.
func (e *Engine) runFinalPlannerRound(ctx context.Context, t *Task, budget bool) (met bool) {
	if e.IsDeleting(t.ID) {
		return false
	}
	planner, _ := e.snapshotFor(t)
	for planner == nil {
		if sleepCtx(ctx, deadlinePollInterval) {
			return false
		}
		if isTerminalStatus(e.m.TaskStatus(t.ID)) {
			return false
		}
		if e.IsDeleting(t.ID) {
			return false
		}
		planner, _ = e.snapshotFor(t)
	}
	// Independent ctx (not wired to execCancel, so a pause/hard cancel cannot interrupt this
	// final round), with Final injecting the task-timeout words.
	fctx := e.clockCtx(ctx, t, !budget)
	label := "task timeout settle"
	if budget {
		fctx = e.budgetRoundCtx(fctx, t, true)
		label = "task budget settle"
	}
	if !e.beginTaskOperation(t.ID) {
		return false
	}
	defer e.decInflight(t.ID)
	emit := func(r db.Activity) { e.emitActivity(t, r) }
	e.emitActivity(t, db.Activity{Worker: "planner", Kind: "round",
		Summary: fmt.Sprintf("%s · final judgment (round %d)", label, e.nextPlannerRound(t.ID))})
	tTaskID, _ := strconv.ParseInt(t.ID, 10, 64)
	// The final round judges, it does not explore: a gated call never waits here.
	fctx = e.plannerGateContext(fctx, t, 0)
	e.BeginLLMCall(t.ID)
	met, reason, err := planner.Plan(fctx, tTaskID, e.m.assets, t.Store, t.Goal, t.drainTriggers(), t.TargetGuard.Hooks(), emit)
	e.EndLLMCall(t.ID)
	if err != nil {
		log.Printf("[deadline] task %s final planning error: %v", t.ID, err)
	} else if met {
		log.Printf("[deadline] task %s final judgment: goal met: %s", t.ID, reason)
	}
	return met
}
