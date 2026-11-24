package agent

import (
	"context"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/Autumn-27/norma/llm"
)

// Hierarchical run budgets (off by default). Levels: task -> intent (one worker
// run) -> planner round (counted inside the task). A child's effective budget is
// min(its own budget, the parent's remaining above the wrap-up reserve). When the
// task can no longer afford a worker, dispatch stops and the run settles through
// one forced wrap-up planner round (same pattern as the task-timeout endgame).
// Wall-clock stays in taskclock/endgame. Counting matches the llm_usage ledger:
// one turn per metered call (one row), tokens = input + output; norma's Usage
// already folds the cache buckets into InputTokens, so they are not added again.

// Unlimited is the cap of a dimension with no budget (env value 0 or unset).
const Unlimited int64 = math.MaxInt64

const (
	BudgetMarginPercent         = 5      // wrap-up reserve = max(5% of the task budget, floor)
	BudgetMarginMinTokens       = 20_000 // token floor of the reserve
	BudgetMarginMinTurns        = 2      // turn floor of the reserve
	DefaultWorkerEstimateTokens = 50_000 // one worker run, until a worker of this task finished
	DefaultWorkerEstimateTurns  = 10
)

// Budget caps tokens and turns; a dimension equal to Unlimited has no cap.
type Budget struct{ Tokens, Turns int64 }

// Spend is what a level has consumed.
type Spend struct{ Tokens, Turns int64 }

// NewBudget builds a budget from configured values: <=0 means Unlimited.
func NewBudget(tokens, turns int64) Budget { return Budget{budgetCap(tokens), budgetCap(turns)} }

func budgetCap(n int64) int64 {
	if n <= 0 {
		return Unlimited
	}
	return n
}

// EffectiveBudget is the hierarchical calculator: per dimension, a child never
// gets more than its parent has left.
func EffectiveBudget(own, parentRemaining Budget) Budget {
	return Budget{min(own.Tokens, parentRemaining.Tokens), min(own.Turns, parentRemaining.Turns)}
}

// Remaining is the budget left after s (never negative; Unlimited stays Unlimited).
func (b Budget) Remaining(s Spend) Budget {
	return Budget{left(b.Tokens, s.Tokens), left(b.Turns, s.Turns)}
}

func left(capacity, spent int64) int64 {
	if capacity == Unlimited {
		return Unlimited
	}
	return max(capacity-spent, 0)
}

// WrapupMargin is the reserve kept for the forced wrap-up (0 when unlimited).
func WrapupMargin(task Budget) Budget {
	m := func(capacity, floor int64) int64 {
		if capacity == Unlimited {
			return 0
		}
		return max(capacity*BudgetMarginPercent/100, floor)
	}
	return Budget{m(task.Tokens, BudgetMarginMinTokens), m(task.Turns, BudgetMarginMinTurns)}
}

func addUsage(s Spend, u llm.Usage) Spend {
	return Spend{s.Tokens + int64(u.InputTokens+u.OutputTokens), s.Turns + 1}
}

// BudgetsFromEnv reads ARTEX_TASK_BUDGET_{TOKENS,TURNS} and
// ARTEX_INTENT_BUDGET_{TOKENS,TURNS}. Unset, 0 or invalid = Unlimited.
func BudgetsFromEnv() (task, intent Budget) {
	env := func(k string) int64 {
		n, _ := strconv.ParseInt(strings.TrimSpace(os.Getenv(k)), 10, 64)
		return n
	}
	return NewBudget(env("ARTEX_TASK_BUDGET_TOKENS"), env("ARTEX_TASK_BUDGET_TURNS")),
		NewBudget(env("ARTEX_INTENT_BUDGET_TOKENS"), env("ARTEX_INTENT_BUDGET_TURNS"))
}

// BudgetLedger meters one task. The total is restored from llm_usage when the
// ledger is created, including after a restart. Per-worker averages are not.
type BudgetLedger struct {
	task, intent Budget
	mu           sync.Mutex
	spent        Spend // planner rounds + worker runs
	workerRuns   int64
	workerSpent  Spend
	wrapup       bool // the forced wrap-up has started
}

// NewBudgetLedger returns nil when no budget is set: callers then change nothing.
func NewBudgetLedger(task, intent Budget) *BudgetLedger {
	if task == NewBudget(0, 0) && intent == NewBudget(0, 0) {
		return nil
	}
	return &BudgetLedger{task: task, intent: intent}
}

// RestoreSpend adds usage that was already recorded before this ledger existed.
// It only adds to the task total. Per-worker averages stay at the defaults
// until a worker finishes against this ledger, because llm_usage rows do not
// mark where one worker run ends and the next begins. A nil ledger (no budget
// configured) is a no-op.
func (l *BudgetLedger) RestoreSpend(spent Spend) {
	if l == nil || (spent.Tokens == 0 && spent.Turns == 0) {
		return
	}
	l.mu.Lock()
	l.spent.Tokens += spent.Tokens
	l.spent.Turns += spent.Turns
	l.mu.Unlock()
}

// Record meters one task-level call (the planner's own rounds).
func (l *BudgetLedger) Record(u llm.Usage) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.spent = addUsage(l.spent, u)
}

// BudgetState is one decision snapshot of the task level.
type BudgetState struct {
	Task, Remaining, Margin Budget
	Spent, Estimate         Spend
	AtMargin                bool // remaining is at or under the wrap-up reserve
	Dispatch                bool // a new worker may start
}

// State reports the remaining budget and whether a worker may be dispatched:
// not once the wrap-up started or the reserve is reached, and not when the
// remaining budget is below one worker's estimated cost (the average of this
// task's finished worker runs, else the defaults; never above the intent cap).
func (l *BudgetLedger) State() BudgetState {
	l.mu.Lock()
	defer l.mu.Unlock()
	rem, m := l.task.Remaining(l.spent), WrapupMargin(l.task)
	est := Spend{DefaultWorkerEstimateTokens, DefaultWorkerEstimateTurns}
	if l.workerRuns > 0 {
		est = Spend{l.workerSpent.Tokens / l.workerRuns, l.workerSpent.Turns / l.workerRuns}
	}
	est = Spend{min(est.Tokens, l.intent.Tokens), min(est.Turns, l.intent.Turns)}
	at := (rem.Tokens != Unlimited && rem.Tokens <= m.Tokens) || (rem.Turns != Unlimited && rem.Turns <= m.Turns)
	return BudgetState{Task: l.task, Remaining: rem, Margin: m, Spent: l.spent, Estimate: est, AtMargin: at,
		Dispatch: !l.wrapup && !at && rem.Tokens >= est.Tokens && rem.Turns >= est.Turns}
}

// BeginWrapup marks the forced wrap-up; true only for the first caller, so the
// wrap-up runs exactly once. Running workers see an exhausted budget from here on.
func (l *BudgetLedger) BeginWrapup() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	first := !l.wrapup
	l.wrapup = true
	return first
}

// Line is the one-line remaining budget shown to the planner and logged.
func (s BudgetState) Line() string {
	of := func(rem, capacity int64) string {
		if capacity == Unlimited {
			return "unlimited"
		}
		return fmt.Sprintf("%d of %d", rem, capacity)
	}
	return fmt.Sprintf("[Task budget] remaining: tokens %s, turns %s (wrap-up reserve: %d tokens, %d turns)",
		of(s.Remaining.Tokens, s.Task.Tokens), of(s.Remaining.Turns, s.Task.Turns), s.Margin.Tokens, s.Margin.Turns)
}

// IntentMeter meters one worker run against min(intent budget, task remaining
// above the reserve).
type IntentMeter struct {
	l     *BudgetLedger
	spent Spend // guarded by l.mu
}

// StartIntent opens the meter of one worker run.
func (l *BudgetLedger) StartIntent() *IntentMeter { return &IntentMeter{l: l} }

// Record meters one worker call into the intent and the task.
func (m *IntentMeter) Record(u llm.Usage) {
	m.l.mu.Lock()
	defer m.l.mu.Unlock()
	m.spent, m.l.spent = addUsage(m.spent, u), addUsage(m.l.spent, u)
}

// Remaining is the run's effective remaining budget; zero once the wrap-up started.
func (m *IntentMeter) Remaining() Budget {
	l := m.l
	l.mu.Lock()
	defer l.mu.Unlock()
	parent := Budget{}
	if !l.wrapup {
		rem, res := l.task.Remaining(l.spent), WrapupMargin(l.task)
		parent = Budget{left(rem.Tokens, res.Tokens), left(rem.Turns, res.Turns)}
	}
	return EffectiveBudget(l.intent.Remaining(m.spent), parent)
}

// Exhausted reports whether the run has no budget left in some dimension.
func (m *IntentMeter) Exhausted() bool {
	r := m.Remaining()
	return r.Tokens == 0 || r.Turns == 0
}

// Finish folds the run into the task's per-worker average.
func (m *IntentMeter) Finish() {
	m.l.mu.Lock()
	defer m.l.mu.Unlock()
	m.l.workerRuns++
	m.l.workerSpent = Spend{m.l.workerSpent.Tokens + m.spent.Tokens, m.l.workerSpent.Turns + m.spent.Turns}
}

// BudgetWrapupBlocks reports whether a worker tool is refused once its budget is
// exhausted: all but the write-back tools, so the run records facts and stops.
func BudgetWrapupBlocks(tool string) bool {
	return tool != "record_fact" && tool != "insert_assets" && tool != "report_finding" && tool != "update_finding_report" && tool != "record_coverage"
}

// WorkerBudgetWrapup is returned in place of a refused tool call.
const WorkerBudgetWrapup = "[Budget reached] This intent's token/turn budget is used up; the tool call was not executed. Do not run any more commands or probes. Write back what you identified but have not persisted yet (insert_assets, record_fact, report_finding), then, in a single standalone sentence of plain text, summarize what you did and your key conclusions."

const plannerBudgetWrapup = "**The task's token/turn budget is exhausted and the task is about to end** (a normal end, not an error). Based on the current facts and findings, make the final goal judgment: call prove_goal for goals proven met by evidence. **Do not generate any new intents** (they will not be executed). Then, in a single standalone sentence of plain text, summarize where the task stands."

// BudgetRound carries one planner round's budget on ctx (zero = no budget).
type BudgetRound struct {
	Line   string // one-line remaining budget for the planner context
	WrapUp bool   // the forced wrap-up round
}

type budgetRoundKey struct{}
type intentMeterKey struct{}

// WithBudgetRound attaches a planner round's budget to ctx.
func WithBudgetRound(ctx context.Context, r BudgetRound) context.Context {
	return context.WithValue(ctx, budgetRoundKey{}, r)
}

// WithIntentMeter attaches a worker run's meter to ctx (turn clamp).
func WithIntentMeter(ctx context.Context, m *IntentMeter) context.Context {
	return context.WithValue(ctx, intentMeterKey{}, m)
}

// plannerBudgetBlock is the code-owned budget text appended to the planner's
// situational block (same pattern as the endgame words); empty without a budget.
func plannerBudgetBlock(ctx context.Context) string {
	r, _ := ctx.Value(budgetRoundKey{}).(BudgetRound)
	s := ""
	if r.Line != "" {
		s += "\n\n" + r.Line
	}
	if r.WrapUp {
		s += "\n\n[Task budget wrap-up (special instruction for this round, overriding the normal planning flow above)]: " + plannerBudgetWrapup
	}
	return s
}

// turnCap is the worker's MaxTurns for this run: its own, clamped by the
// intent's effective remaining turns (never 0, which harness reads as unlimited).
func (w *Worker) turnCap(ctx context.Context) int {
	m, _ := ctx.Value(intentMeterKey{}).(*IntentMeter)
	if m == nil {
		return w.maxTurns
	}
	rem := m.Remaining().Turns
	if rem == Unlimited {
		return w.maxTurns
	}
	if c := int(max(rem, 1)); w.maxTurns <= 0 || c < w.maxTurns {
		return c
	}
	return w.maxTurns
}
