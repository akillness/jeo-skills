package server

import (
	"context"
	"log"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/llmrec"
)

// Hierarchical run budgets (agent/budget.go), off unless an ARTEX_*_BUDGET_* env
// var is set. Every helper here is a no-op when budgetFor returns nil.

// budgetFor returns the task's budget ledger, created on first use from the env;
// nil when no budget is configured (passthrough).
func (e *Engine) budgetFor(taskID string) *agent.BudgetLedger {
	if v, ok := e.budgets.Load(taskID); ok {
		return v.(*agent.BudgetLedger)
	}
	created := agent.NewBudgetLedger(agent.BudgetsFromEnv())
	e.seedBudget(taskID, created)
	v, loaded := e.budgets.LoadOrStore(taskID, created)
	if loaded {
		return v.(*agent.BudgetLedger)
	}
	return created
}

// seedBudget rebuilds spent tokens and turns from llm_usage for every new
// ledger. budgetFor calls it on first use, and again after resetSettledRun or
// StopTask deletes the ledger in this same process. The in-memory sink runs
// before the row is inserted, so a call that happens after this seed is
// counted once. A nil ledger means no budget is configured and nothing is read.
// The restore does not rebuild per-worker averages, so the next worker estimate
// starts from the defaults until a worker finishes against this ledger.
func (e *Engine) seedBudget(taskID string, ledger *agent.BudgetLedger) {
	if ledger == nil || e == nil || e.m == nil || e.m.pg == nil || taskID == "" {
		return
	}
	tokens, turns, err := e.m.pg.TaskLLMSpend(taskID)
	if err != nil {
		log.Printf("[budget] task %s: cannot restore spend from llm_usage: %v", taskID, err)
		return
	}
	if tokens == 0 && turns == 0 {
		return
	}
	ledger.RestoreSpend(agent.Spend{Tokens: tokens, Turns: turns})
	log.Printf("[budget] task %s restored %d tokens / %d turns from llm_usage", taskID, tokens, turns)
}

// budgetStop is the enforcement point of a planner round: it logs the remaining
// budget and, once no worker can be dispatched any more, starts the forced
// wrap-up (exactly once: the settle sequence with the budget words) and reports
// that the normal round must not run. ctx is the planner loop's context.
func (e *Engine) budgetStop(ctx context.Context, t *Task) bool {
	l := e.budgetFor(t.ID)
	if l == nil {
		return false
	}
	st := l.State()
	log.Printf("[budget] task %s planner round: %s", t.ID, st.Line())
	if st.Dispatch {
		return false
	}
	if l.BeginWrapup() {
		log.Printf("[budget] task %s cannot afford another worker (estimate %d tokens / %d turns), forced wrap-up",
			t.ID, st.Estimate.Tokens, st.Estimate.Turns)
		e.settleTask(ctx, t, true)
	}
	return true
}

// budgetRoundCtx attaches a planner round's budget (the one-line remaining
// budget, the wrap-up flag) and meters the round's own calls into the task.
func (e *Engine) budgetRoundCtx(ctx context.Context, t *Task, wrapup bool) context.Context {
	l := e.budgetFor(t.ID)
	if l == nil {
		return ctx
	}
	ctx = agent.WithBudgetRound(ctx, agent.BudgetRound{Line: l.State().Line(), WrapUp: wrapup})
	return llmrec.WithUsageSink(ctx, l.Record)
}

// budgetBlocksClaim reports whether a worker must not claim a new intent: the
// remaining task budget is below one worker's cost estimate, or the wrap-up started.
func (e *Engine) budgetBlocksClaim(taskID string) bool {
	l := e.budgetFor(taskID)
	return l != nil && !l.State().Dispatch
}

// budgetIntent opens the meter of one worker run: ctx meters its calls and
// clamps its turns; the returned meter feeds the tool hook. nil = no budget.
func (e *Engine) budgetIntent(ctx context.Context, taskID string) (context.Context, *agent.IntentMeter) {
	l := e.budgetFor(taskID)
	if l == nil {
		return ctx, nil
	}
	m := l.StartIntent()
	return llmrec.WithUsageSink(agent.WithIntentMeter(ctx, m), m.Record), m
}
