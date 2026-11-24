package agent

import (
	"strings"
	"sync"

	"github.com/Autumn-27/norma/harness"
)

// Wrap-up prompts (settlement prompts): when an agent is terminated because of
// [turn budget exhausted (MaxTurns)] or [timeout (run_seconds/MaxDuration)], the
// SDK's settlement phase injects this prompt so the agent first persists what it
// has identified but not yet written back, then outputs a one-sentence summary —
// no unfinished tails.
//
// Each agent's wrap-up prompt can be overridden in the admin backend (stored in
// agents.wrapup_prompt); left empty, the built-in defaults here are used. Only the
// [prompt body] is editable; which tools are disabled and how many turns the
// wrap-up itself gets are code-fixed policy.

// wrapupHooksMu guards the four wrap-up hooks in this file: server wiring can run
// while agents build their settlement config on other goroutines.
var wrapupHooksMu sync.RWMutex

// wrapupOverride, if set, returns the stored wrap-up prompt for an agent key and
// whether a non-empty one exists. Wired by the server to the agents table (like
// PromptOverride for system prompts). nil / empty → the built-in default is used.
var wrapupOverride func(agentKey string) (string, bool)

// SetWrapupOverride installs (or, with nil, removes) the WrapupOverride hook.
func SetWrapupOverride(f func(agentKey string) (string, bool)) {
	wrapupHooksMu.Lock()
	wrapupOverride = f
	wrapupHooksMu.Unlock()
}

// WrapupOverride returns the current hook, or nil when none is set.
func WrapupOverride() func(agentKey string) (string, bool) {
	wrapupHooksMu.RLock()
	defer wrapupHooksMu.RUnlock()
	return wrapupOverride
}

// wrapupMaxTurnsOverride, if set, returns the admin-configured turn budget for the
// wrap-up phase of an agent and whether a positive one exists. Wired to the agents
// table. nil / ≤0 → the built-in per-agent default (wrapupTurnDefaults) is used.
var wrapupMaxTurnsOverride func(agentKey string) (int, bool)

// SetWrapupMaxTurnsOverride installs (or, with nil, removes) the WrapupMaxTurnsOverride hook.
func SetWrapupMaxTurnsOverride(f func(agentKey string) (int, bool)) {
	wrapupHooksMu.Lock()
	wrapupMaxTurnsOverride = f
	wrapupHooksMu.Unlock()
}

// WrapupMaxTurnsOverride returns the current hook, or nil when none is set.
func WrapupMaxTurnsOverride() func(agentKey string) (int, bool) {
	wrapupHooksMu.RLock()
	defer wrapupHooksMu.RUnlock()
	return wrapupMaxTurnsOverride
}

// Built-in default wrap-up prompts, keyed by agent key. worker reuses the
// historically hardcoded settleWrapUpPrompt (defined in worker.go); planner and
// mainagent each have their own; unmatched keys (custom agents) get the generic
// fallback.
var wrapupDefaults = map[string]string{
	"worker":    settleWrapUpPrompt,
	"planner":   plannerWrapUpDefault,
	"mainagent": mainAgentWrapUpDefault,
}

// wrapupTurnDefaults: the built-in default turn budget of each agent's own wrap-up
// phase (overridable in the admin backend with >0). All get 10 turns so the wrap-up
// phase has enough steps to persist. Unmatched keys use genericWrapupTurns.
var wrapupTurnDefaults = map[string]int{
	"worker":    10,
	"planner":   10,
	"mainagent": 10,
}

const genericWrapupTurns = 10

const plannerWrapUpDefault = "Your turn budget for THIS planning round is about to run out — note that only [this round] ends; the system will wake you again as the situation changes to keep planning, the task is not terminated, and you don't need to converge the whole plan here. Land the conclusions this round has already figured out — don't let this round go to waste — but [don't force intents just for the wrap-up] (0 intents this round is still a perfectly normal outcome): (1) if you've identified exploration directions [due for dispatch now], submit them with one add_intent batch call (don't sit on ones you've figured out); (2) for goals proven met by some finding/fact, call prove_goal to mark met (don't miss any); (3) if you've identified a serial exploit chain needing steps, record it with TodoWrite so you can continue dispatching at the next wake. Finish the round directly when done; no summary text needed."

const mainAgentWrapUpDefault = "Your turn budget is about to run out and this interaction is about to end. Do not start any new exploration/operation. Please summarize for the user **in a single standalone sentence of plain text**: current progress, key conclusions, and the suggested next step."

const genericWrapUpDefault = "You are about to be terminated because your budget is exhausted. First write back completed-but-unpersisted results, then summarize **in a single standalone sentence of plain text** what you did and which key conclusions you reached (this sentence is shown as this run's result)."

// WrapupDefault returns the built-in default wrap-up prompt for an agent key —
// used by the admin UI as the "restore default" value and empty-field placeholder.
func WrapupDefault(agentKey string) string {
	if d, ok := wrapupDefaults[agentKey]; ok {
		return d
	}
	return genericWrapUpDefault
}

// WrapupTurnsDefault returns the built-in wrap-up turn budget for an agent key —
// used by the admin UI as the "0 = default N" hint.
func WrapupTurnsDefault(agentKey string) int {
	if n, ok := wrapupTurnDefaults[agentKey]; ok {
		return n
	}
	return genericWrapupTurns
}

// resolveWrapup returns the effective wrap-up prompt: the DB override (if set and
// non-empty) over the built-in default.
func resolveWrapup(agentKey string) string {
	if override := WrapupOverride(); override != nil {
		if t, ok := override(agentKey); ok && strings.TrimSpace(t) != "" {
			return t
		}
	}
	return WrapupDefault(agentKey)
}

// resolveWrapupTurns returns the effective wrap-up turn budget: a positive DB
// override over the built-in per-agent default.
func resolveWrapupTurns(agentKey string) int {
	if override := WrapupMaxTurnsOverride(); override != nil {
		if v, ok := override(agentKey); ok && v > 0 {
			return v
		}
	}
	return WrapupTurnsDefault(agentKey)
}

// wrapupSettlement builds the settlement config for an agent's run. Prompt and the
// turn budget are admin-editable per agent; disabled tools are code-owned policy so
// a user can't edit away the "stop probing" guardrail. Resolved fresh each run
// (reads DB live), so edits apply on the next run without a restart.
func wrapupSettlement(agentKey string, disabledTools []string) *harness.Settlement {
	return &harness.Settlement{
		Prompt:        resolveWrapup(agentKey),
		DisabledTools: disabledTools,
		MaxTurns:      resolveWrapupTurns(agentKey),
	}
}

// ---------- Task-level timeout wrap-up prompts (see the task-level timeout and wrap-up design doc) ----------
//
// These are [two separate sets] from the per-run wrap-up prompts: per-run says
// "this run's budget is used up"; task timeout says "the whole task is out of time
// and about to end". The semantics are often opposite (especially for the planner:
// per-run says "don't stop, keep planning", task timeout says "stop planning at the
// deadline, make the final judgment"). Configured only for worker/planner.

// WrapupTaskTimeoutOverride / …TurnsOverride: DB overrides for the task-timeout
// wrap-up prompt and turns (wired to agents.task_timeout_wrapup_prompt /
// _max_turns, worker/planner only).
// Guarded by wrapupHooksMu, like the per-run hooks above.
var (
	wrapupTaskTimeoutOverride      func(agentKey string) (string, bool)
	wrapupTaskTimeoutTurnsOverride func(agentKey string) (int, bool)
)

// SetWrapupTaskTimeoutOverride installs (or, with nil, removes) the hook.
func SetWrapupTaskTimeoutOverride(f func(agentKey string) (string, bool)) {
	wrapupHooksMu.Lock()
	wrapupTaskTimeoutOverride = f
	wrapupHooksMu.Unlock()
}

// WrapupTaskTimeoutOverride returns the current hook, or nil when none is set.
func WrapupTaskTimeoutOverride() func(agentKey string) (string, bool) {
	wrapupHooksMu.RLock()
	defer wrapupHooksMu.RUnlock()
	return wrapupTaskTimeoutOverride
}

// SetWrapupTaskTimeoutTurnsOverride installs (or, with nil, removes) the hook.
func SetWrapupTaskTimeoutTurnsOverride(f func(agentKey string) (int, bool)) {
	wrapupHooksMu.Lock()
	wrapupTaskTimeoutTurnsOverride = f
	wrapupHooksMu.Unlock()
}

// WrapupTaskTimeoutTurnsOverride returns the current hook, or nil when none is set.
func WrapupTaskTimeoutTurnsOverride() func(agentKey string) (int, bool) {
	wrapupHooksMu.RLock()
	defer wrapupHooksMu.RUnlock()
	return wrapupTaskTimeoutTurnsOverride
}

var taskTimeoutWrapupDefaults = map[string]string{
	"worker":  workerTaskTimeoutDefault,
	"planner": plannerTaskTimeoutDefault,
}

const workerTaskTimeoutDefault = "**The entire task has reached its timeout limit and is about to end** (not your run's budget — the whole engagement is out of time). This is the last chance: (1) write back [ALL] content you've identified but not yet persisted — new assets with insert_assets, exploration conclusions/facts with record_fact, confirmed findings with report_finding; (2) do not start any new commands/probes; (3) **finally, in a single standalone sentence of plain text** summarize your key conclusions on this intent."

const plannerTaskTimeoutDefault = "**The entire task has reached its timeout limit and is about to end** (not this round — the whole task terminates). Based on the current [full] set of facts and findings, make the final goal judgment: for goals proven met by evidence, call prove_goal to mark met (don't miss any). **Do not generate any new intents** (any intent dispatched now won't be executed). Conclude once judged; no summary text needed."

// TaskTimeoutWrapupDefault returns an agent's built-in default task-timeout wrap-up
// prompt (for the admin placeholder / restore-default).
func TaskTimeoutWrapupDefault(agentKey string) string {
	return taskTimeoutWrapupDefaults[agentKey] // unconfigured agents (mainagent/chat) get an empty string
}

// resolveTaskTimeoutWrapup: DB override (non-empty) > built-in default. An empty
// string means this agent has no task-timeout prompt (not worker/planner) — the
// caller should then fall back to the per-run prompt.
func resolveTaskTimeoutWrapup(agentKey string) string {
	if override := WrapupTaskTimeoutOverride(); override != nil {
		if t, ok := override(agentKey); ok && strings.TrimSpace(t) != "" {
			return t
		}
	}
	return TaskTimeoutWrapupDefault(agentKey)
}

func resolveTaskTimeoutTurns(agentKey string) int {
	if override := WrapupTaskTimeoutTurnsOverride(); override != nil {
		if v, ok := override(agentKey); ok && v > 0 {
			return v
		}
	}
	return resolveWrapupTurns(agentKey) // by default inherit the per-run turns
}

// wrapupSettlementForTask builds settlement for a worker/planner run that is aware
// of the task deadline. See §5 of the design doc:
//   - clamped=true  → this run is clamped by the task deadline: settling on Timeout
//     = the task hit its deadline → task-timeout prompt; settling on MaxTurns = the
//     turn budget ran out inside the clamped window while the task still has minutes
//     left → fall back to the per-run prompt.
//   - clamped=false → the task is far from its deadline: both reasons use the
//     per-run prompt (i.e. degrades to wrapupSettlement).
//
// The PromptByReason handed to harness picks at settlement time by the [actual]
// reason — no mismatch at build time.
func wrapupSettlementForTask(agentKey string, disabledTools []string, clamped bool) *harness.Settlement {
	perRun := resolveWrapup(agentKey)
	st := &harness.Settlement{
		Prompt:        perRun, // fallback (also the value for both reasons when not clamped)
		DisabledTools: disabledTools,
		MaxTurns:      resolveWrapupTurns(agentKey),
	}
	if clamped {
		if tt := resolveTaskTimeoutWrapup(agentKey); tt != "" {
			st.PromptByReason = map[harness.TerminalReason]string{
				harness.ReasonTimeout:  tt,     // task hit its deadline
				harness.ReasonMaxTurns: perRun, // turns ran out first; the task still has time
			}
			st.MaxTurns = resolveTaskTimeoutTurns(agentKey)
		}
	}
	return st
}
