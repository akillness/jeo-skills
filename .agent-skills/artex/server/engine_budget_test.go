package server

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	pgdb "github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
)

// With the budget env vars unset the engine decides exactly as before (no round
// stopped, no claim blocked, contexts untouched, every tool call let through);
// a task budget flips the same decisions once the task cannot afford a worker.
func TestEngineBudgetPassthroughAndGate(t *testing.T) {
	for _, k := range []string{"ARTEX_TASK_BUDGET_TOKENS", "ARTEX_TASK_BUDGET_TURNS", "ARTEX_INTENT_BUDGET_TOKENS", "ARTEX_INTENT_BUDGET_TURNS"} {
		t.Setenv(k, "")
	}
	ctx, task := context.Background(), &Task{ID: "7"}
	noSteer := func() (string, bool) { return "", false }
	e := NewEngine(nil)
	wctx, meter := e.budgetIntent(ctx, task.ID)
	if e.budgetStop(ctx, task) || e.budgetBlocksClaim(task.ID) || e.budgetRoundCtx(ctx, task, false) != ctx || wctx != ctx || meter != nil {
		t.Fatal("no budget: a decision or a context changed")
	}
	if block, _, _ := (steerHooks{drain: noSteer}).PreToolUse(ctx, "Bash", nil); block {
		t.Fatal("no budget: a tool call was refused")
	}

	t.Setenv("ARTEX_TASK_BUDGET_TOKENS", "100000")
	e = NewEngine(nil)
	_, meter = e.budgetIntent(ctx, task.ID)
	meter.Record(llm.Usage{InputTokens: 60_000}) // remaining 40k < default worker estimate 50k
	h := steerHooks{drain: noSteer, budget: meter}
	if block, _, _ := h.PreToolUse(ctx, "Bash", nil); !e.budgetBlocksClaim(task.ID) || block {
		t.Fatal("budget: claim must be blocked, the running worker (above the reserve) not")
	}
	meter.Record(llm.Usage{OutputTokens: 20_000}) // reaches the 20k reserve
	if block, msg, _ := h.PreToolUse(ctx, "Bash", nil); !block || msg != agent.WorkerBudgetWrapup {
		t.Fatalf("budget: exhausted run not sent to wrap-up (block=%v msg=%q)", block, msg)
	}
	if block, _, _ := h.PreToolUse(ctx, "record_fact", nil); block {
		t.Fatal("budget: write-back tool refused during the wrap-up")
	}
}

// A finished run that settled with the budget wrap-up must not gate its revive:
// after resetSettledRun the task plans and claims again, with a fresh ledger.
func TestResetSettledRunRestartsBudget(t *testing.T) {
	t.Setenv("ARTEX_TASK_BUDGET_TOKENS", "100000")
	t.Setenv("ARTEX_TASK_BUDGET_TURNS", "")
	t.Setenv("ARTEX_INTENT_BUDGET_TOKENS", "")
	t.Setenv("ARTEX_INTENT_BUDGET_TURNS", "")
	ctx, task := context.Background(), &Task{ID: "9"}
	e := NewEngine(nil)
	e.settling.Store(task.ID, true)
	l := e.budgetFor(task.ID)
	l.Record(llm.Usage{InputTokens: 90_000})
	l.BeginWrapup()
	if !e.isSettling(task.ID) || !e.budgetStop(ctx, task) || !e.budgetBlocksClaim(task.ID) {
		t.Fatal("settled run: wrap-up must gate the planner and the workers before the revive")
	}
	e.resetSettledRun(task.ID)
	if e.isSettling(task.ID) || e.budgetStop(ctx, task) || e.budgetBlocksClaim(task.ID) {
		t.Fatal("revived run: planner or workers still gated by the previous run")
	}
	if got := e.budgetFor(task.ID).State().Spent.Tokens; got != 0 {
		t.Fatalf("revived run: ledger not fresh, spent %d tokens", got)
	}
}

// With Postgres, resetSettledRun drops the ledger and the next one is seeded
// again from llm_usage. In-memory spend that was never written does not come
// back. A restore that lands on the wrap-up reserve leaves only that reserve,
// and the worker estimate starts from the defaults.
func TestResetSettledRunReseedsBudgetFromUsage(t *testing.T) {
	for _, k := range []string{"ARTEX_TASK_BUDGET_TURNS", "ARTEX_INTENT_BUDGET_TOKENS", "ARTEX_INTENT_BUDGET_TURNS"} {
		t.Setenv(k, "")
	}
	t.Setenv("ARTEX_TASK_BUDGET_TOKENS", "100000")
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		pgdb.SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { _ = m.Close() })

	taskID := strconv.FormatInt(time.Now().UnixNano(), 10)
	t.Cleanup(func() {
		_, _ = m.pg.Exec(`DELETE FROM llm_usage WHERE task_id=$1`, taskID)
	})
	// 100000 - wrap-up reserve (max(5%, 20000)) = 80000. One planner row.
	if err := m.pg.InsertLLMUsage(&pgdb.LLMUsage{
		TaskID: taskID, Worker: "planner", InputTokens: 80_000, Status: "ok",
	}); err != nil {
		t.Fatal(err)
	}
	e := NewEngine(m)
	task := &Task{ID: taskID}
	l := e.budgetFor(task.ID)
	st := l.State()
	if st.Spent.Tokens != 80_000 || st.Spent.Turns != 1 {
		t.Fatalf("seed spent=%+v, want 80000 tokens and 1 turn", st.Spent)
	}
	if st.Remaining.Tokens != st.Margin.Tokens || !st.AtMargin || st.Dispatch {
		t.Fatalf("restored task near the cap: remaining=%d margin=%d at=%v dispatch=%v",
			st.Remaining.Tokens, st.Margin.Tokens, st.AtMargin, st.Dispatch)
	}
	if st.Estimate.Tokens != agent.DefaultWorkerEstimateTokens || st.Estimate.Turns != agent.DefaultWorkerEstimateTurns {
		t.Fatalf("estimate=%+v, want the defaults (worker history is not restored)", st.Estimate)
	}

	l.Record(llm.Usage{InputTokens: 1000})
	l.BeginWrapup()
	e.settling.Store(task.ID, true)
	e.resetSettledRun(task.ID)
	if e.isSettling(task.ID) {
		t.Fatal("revived run is still marked settling")
	}
	again := e.budgetFor(task.ID)
	if again == l {
		t.Fatal("revive reused the deleted ledger")
	}
	got := again.State()
	if got.Spent.Tokens != 80_000 || got.Spent.Turns != 1 {
		t.Fatalf("reseed spent=%+v, want the usage row and not the in-memory extra", got.Spent)
	}
	if got.Remaining.Tokens != got.Margin.Tokens || got.Dispatch {
		t.Fatalf("reseed still past the wrap-up margin: remaining=%d margin=%d dispatch=%v",
			got.Remaining.Tokens, got.Margin.Tokens, got.Dispatch)
	}
}
