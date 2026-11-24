package agent

import (
	"context"
	"strings"
	"testing"

	"github.com/Autumn-27/norma/llm"
)

// spend records n tokens as one task-level call; finishWorker records one
// finished worker run of n tokens (it feeds the per-worker estimate).
func spend(l *BudgetLedger, n int) { l.Record(llm.Usage{InputTokens: n}) }

func finishWorker(l *BudgetLedger, n int) {
	m := l.StartIntent()
	m.Record(llm.Usage{OutputTokens: n})
	m.Finish()
}

func TestEffectiveBudgetNeverExceedsParent(t *testing.T) {
	for _, c := range []struct{ own, parent, want Budget }{
		{NewBudget(50, 5), NewBudget(100, 10), Budget{50, 5}},
		{NewBudget(200, 20), NewBudget(100, 10), Budget{100, 10}},
		{NewBudget(0, 0), NewBudget(100, 10), Budget{100, 10}}, // own unlimited
		{NewBudget(70, 7), NewBudget(0, 0), Budget{70, 7}},     // parent unlimited
		{NewBudget(0, 0), NewBudget(0, 0), Budget{Unlimited, Unlimited}},
		{NewBudget(70, 7), Budget{0, 0}, Budget{0, 0}}, // parent exhausted
	} {
		if got := EffectiveBudget(c.own, c.parent); got != c.want || got.Tokens > c.parent.Tokens || got.Turns > c.parent.Turns {
			t.Fatalf("EffectiveBudget(%+v, %+v) = %+v, want %+v", c.own, c.parent, got, c.want)
		}
	}
	// Through the meter: intent 100k is cut to the task's remaining above the
	// reserve (task 100k, reserve 20k, 70k spent → 10k); intent turns clamp MaxTurns.
	l := NewBudgetLedger(NewBudget(100_000, 0), NewBudget(100_000, 5))
	spend(l, 70_000)
	m := l.StartIntent()
	if got := m.Remaining(); got != (Budget{10_000, 5}) {
		t.Fatalf("intent remaining = %+v, want {10000 5}", got)
	}
	if got := (&Worker{maxTurns: 40}).turnCap(WithIntentMeter(context.Background(), m)); got != 5 {
		t.Fatalf("worker MaxTurns = %d, want the intent's 5", got)
	}
	if m.Record(llm.Usage{InputTokens: 10_000}); !m.Exhausted() {
		t.Fatal("intent not exhausted once the task's remaining above the reserve is spent")
	}
}

func TestWrapupMarginTriggersOnceAndStopsDispatch(t *testing.T) {
	if a, b := WrapupMargin(NewBudget(1_000_000, 100)), WrapupMargin(NewBudget(100_000, 10)); a != (Budget{50_000, 5}) || b != (Budget{20_000, 2}) {
		t.Fatalf("margins %+v %+v, want 5%% then the floors", a, b)
	}
	l := NewBudgetLedger(NewBudget(100_000, 0), NewBudget(0, 0))
	finishWorker(l, 10) // tiny estimate: only the reserve can stop dispatch here
	spend(l, 100_000-10-20_001)
	if st := l.State(); st.AtMargin || !st.Dispatch {
		t.Fatalf("one token above the reserve: %+v, want dispatch", st)
	}
	spend(l, 1) // remaining == reserve
	st := l.State()
	if !st.AtMargin || st.Dispatch {
		t.Fatalf("at the reserve: %+v, want AtMargin and no dispatch", st)
	}
	running, wrapups := l.StartIntent(), 0
	for i := 0; i < 3; i++ { // several planner wake-ups at the reserve
		if l.BeginWrapup() {
			wrapups++
		}
	}
	if wrapups != 1 || l.State().Dispatch {
		t.Fatalf("wrap-up started %d times (want 1), dispatch=%v", wrapups, l.State().Dispatch)
	}
	if !running.Exhausted() || !BudgetWrapupBlocks("Bash") || BudgetWrapupBlocks("record_fact") {
		t.Fatal("after the wrap-up a running worker must be held to its write-back tools")
	}
	block := plannerBudgetBlock(WithBudgetRound(context.Background(), BudgetRound{Line: st.Line(), WrapUp: true}))
	if strings.Count(block, plannerBudgetWrapup) != 1 || !strings.Contains(block, "[Task budget] remaining: tokens 20000 of 100000") {
		t.Fatalf("wrap-up block:\n%s", block)
	}
}

func TestDispatchStopsUnderOneWorkerEstimate(t *testing.T) {
	// No worker finished yet: the default estimate applies.
	l := NewBudgetLedger(NewBudget(200_000, 0), NewBudget(0, 0))
	spend(l, 200_000-DefaultWorkerEstimateTokens)
	if st := l.State(); !st.Dispatch {
		t.Fatalf("remaining == default estimate: %+v, want dispatch", st)
	}
	if spend(l, 1); l.State().Dispatch || l.State().AtMargin {
		t.Fatalf("below the default estimate, above the reserve: %+v, want no dispatch", l.State())
	}
	// Finished workers: their average spend is the estimate (90k, 30k → 60k).
	l = NewBudgetLedger(NewBudget(300_000, 0), NewBudget(0, 0))
	finishWorker(l, 90_000)
	finishWorker(l, 30_000)
	spend(l, 120_000) // remaining 60k
	if st := l.State(); st.Estimate.Tokens != 60_000 || !st.Dispatch {
		t.Fatalf("average estimate: %+v, want 60000 and dispatch", st)
	}
	if spend(l, 1); l.State().Dispatch || l.State().AtMargin {
		t.Fatalf("below the 60000 estimate, above the reserve: %+v, want no dispatch", l.State())
	}
}

func TestBudgetUnsetIsPassthrough(t *testing.T) {
	for _, v := range []string{"", "0", "abc"} {
		for _, k := range []string{"ARTEX_TASK_BUDGET_TOKENS", "ARTEX_TASK_BUDGET_TURNS", "ARTEX_INTENT_BUDGET_TOKENS", "ARTEX_INTENT_BUDGET_TURNS"} {
			t.Setenv(k, v)
		}
		if NewBudgetLedger(BudgetsFromEnv()) != nil {
			t.Fatalf("env %q: got a ledger, want nil (no budget)", v)
		}
	}
	// Without a budget on ctx the planner input and the worker turns are unchanged.
	ctx := context.Background()
	situational := plannerSituational(nil, triggerLookup{}, nil, newDataEnvelope())
	if plannerRoundInput("l", situational, "", "g", "") != plannerRoundInput("l", situational+plannerBudgetBlock(ctx), "", "g", "") {
		t.Fatal("planner input changed without a budget")
	}
	if got := (&Worker{maxTurns: 40}).turnCap(ctx); got != 40 {
		t.Fatalf("worker turns without budget = %d, want 40", got)
	}
}

func TestBudgetCountsMatchUsageFixture(t *testing.T) {
	// One entry per llm_usage row; InputTokens already includes the cache buckets.
	planner := []llm.Usage{
		{InputTokens: 12_000, OutputTokens: 800, CacheReadTokens: 9_000},
		{InputTokens: 15_500, OutputTokens: 1_200, CacheReadTokens: 12_000, CacheWriteTokens: 3_000},
	}
	worker := []llm.Usage{{InputTokens: 4_000, OutputTokens: 300}, {InputTokens: 6_100, CacheWriteTokens: 6_000}, {}} // {} = an errored call's row
	l := NewBudgetLedger(NewBudget(1_000_000, 1_000), NewBudget(0, 0))
	for _, u := range planner {
		l.Record(u)
	}
	m := l.StartIntent()
	for _, u := range worker {
		m.Record(u)
	}
	m.Finish()
	const want = 12_000 + 800 + 15_500 + 1_200 + 4_000 + 300 + 6_100
	if st := l.State(); st.Spent != (Spend{want, 5}) || st.Remaining != (Budget{1_000_000 - want, 995}) || st.Estimate != (Spend{10_400, 3}) {
		t.Fatalf("spent %+v remaining %+v estimate %+v, want {%d 5}, remaining, {10400 3}", st.Spent, st.Remaining, st.Estimate, want)
	}
}

func TestRestoreSpendCountsTowardCap(t *testing.T) {
	l := NewBudgetLedger(NewBudget(100, 10), NewBudget(0, 0))
	l.RestoreSpend(Spend{Tokens: 40, Turns: 4})
	st := l.State()
	if st.Spent != (Spend{40, 4}) || st.Remaining != (Budget{60, 6}) {
		t.Fatalf("spent=%+v remaining=%+v", st.Spent, st.Remaining)
	}
	var none *BudgetLedger
	none.RestoreSpend(Spend{Tokens: 1, Turns: 1})
}
