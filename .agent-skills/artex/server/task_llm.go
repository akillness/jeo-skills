package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"log"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/llmpool"
	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/transcript"
)

type taskAgentBundle struct {
	runtime        *taskLLMRuntime // goal decomposition runtime
	plannerRuntime *taskLLMRuntime
	workerRuntime  *taskLLMRuntime
	mainRuntime    *taskLLMRuntime
	pl             *agent.Planner
	wk             *agent.Worker
	main           *agent.MainAgent
}

type llmAuditProfile struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Format string `json:"format"`
	Model  string `json:"model"`
}

type llmTransitionAudit struct {
	Mode     string           `json:"mode"` // automatic | manual | exhausted
	Reason   string           `json:"reason"`
	Previous *llmAuditProfile `json:"previous,omitempty"`
	Next     *llmAuditProfile `json:"next,omitempty"`
}

type llmActivityMetadata struct {
	LLMTransition llmTransitionAudit `json:"llm_transition"`
}

type taskLLMRuntime struct {
	s        *Server
	taskID   string
	agentKey string
}

type taskLLMError struct {
	taskID         string
	chainExhausted bool
	cause          error
}

func (e *taskLLMError) Error() string {
	if e.chainExhausted {
		return fmt.Sprintf("task %s LLM profile chain exhausted: %v", e.taskID, e.cause)
	}
	return e.cause.Error()
}

func (e *taskLLMError) Unwrap() error { return e.cause }

func isTaskLLMRuntimeError(err error) bool {
	var target *taskLLMError
	return errors.As(err, &target)
}

func isTaskLLMChainExhausted(err error) bool {
	var target *taskLLMError
	return errors.As(err, &target) && target.chainExhausted
}

// isQuotaExhaustedError is intentionally strict. A generic 429, auth error,
// network failure, or 5xx does not rotate providers; the response must explicitly
// identify quota, credits, billing balance, or payment exhaustion.
func isQuotaExhaustedError(err error) bool {
	return err != nil && agent.IsQuotaExhaustedMessage(err.Error())
}

// Consecutive-failure escalation (ouroboros cost-tier take, #99): quota
// exhaustion already advances the chain, but a profile that keeps failing with
// plain runtime errors (bad key, persistent 5xx, broken model output) would
// otherwise burn the whole same-provider retry budget on every call. After
// llmFailStreakThreshold consecutive failed calls on the same chain profile
// the chain advances exactly like a quota exhaust, carrying the true reason.
// Deliberately escalation-only: no auto-downgrade (a mid-task model swap-down
// risks behavior drift and flapping; the operator can reset the chain).
const llmFailStreakThreshold = 3

var llmFailStreaks = struct {
	sync.Mutex
	m map[string]int
}{m: map[string]int{}}

func llmFailKey(taskID string, profileID int64) string {
	return taskID + ":" + strconv.FormatInt(profileID, 10)
}

// noteLLMCallFailure records one failed call on (task, profile) and reports
// whether the escalation threshold was just reached. The streak resets when it
// fires and on every success, so the counter tracks consecutive failures only.
func noteLLMCallFailure(taskID string, profileID int64) bool {
	llmFailStreaks.Lock()
	defer llmFailStreaks.Unlock()
	k := llmFailKey(taskID, profileID)
	llmFailStreaks.m[k]++
	if llmFailStreaks.m[k] >= llmFailStreakThreshold {
		delete(llmFailStreaks.m, k) // armed and consumed — next failure starts a fresh streak
		return true
	}
	return false
}

// resetLLMFailStreaksForTest clears every streak; test isolation only (the
// escalation counter is package-global in-memory state).
func resetLLMFailStreaksForTest() {
	llmFailStreaks.Lock()
	llmFailStreaks.m = map[string]int{}
	llmFailStreaks.Unlock()
}

func resetLLMFailStreak(taskID string, profileID int64) {
	llmFailStreaks.Lock()
	defer llmFailStreaks.Unlock()
	delete(llmFailStreaks.m, llmFailKey(taskID, profileID))
}

type taskLLMSelection struct {
	task      *Task
	profileID int64
	// healthProfileID is the llm_profiles row whose breaker state the calls on
	// this selection update. It equals profileID on the task-chain path; a bound
	// agent or the global provider carries its own id here while profileID stays
	// 0 (no chain semantics). 0 means "do not report": either there is no
	// profile (environment-only configuration) or the provider is already the
	// failover Pool, which updates the registry itself.
	healthProfileID int64
	revision        int64
	provider        llm.Provider
	// retry holds the retry parameters resolved for the profile selected this time (profile override → global policy → built-in default).
	// Same-provider safe-window retries follow it, so switching profiles switches the retry cadence.
	retry agent.RetryConfig
}

// llmProfilePin carries a per-run chain-head override through the call stack
// (#85 per-intent rotation). The engine sets it when launching a worker run;
// resolution stays within the task's chain and never bypasses failover state.
type llmProfilePinKey struct{}

func withLLMProfilePin(ctx context.Context, profileID int64) context.Context {
	return context.WithValue(ctx, llmProfilePinKey{}, profileID)
}

func llmProfilePinFrom(ctx context.Context) (int64, bool) {
	if ctx == nil {
		return 0, false
	}
	id, ok := ctx.Value(llmProfilePinKey{}).(int64)
	return id, ok
}

type taskLLMStreamHooks struct {
	current    func(context.Context) (taskLLMSelection, error)
	exhaust    func(taskLLMSelection, error) (db.TaskLLMTransition, error)
	transition func(taskLLMSelection, db.TaskLLMTransition, error)
	// recordHealth reports one physical provider attempt to the process-wide
	// breaker. It keeps /system/llm/ truthful for every selection whose provider
	// is not already the failover Pool (the chain, a bound agent, the global
	// profile). Optional: test literals leave it nil and the call sites skip it.
	recordHealth func(ctx context.Context, profileID int64, stream, committed bool, err error)
}

// healthIDFor returns the profile whose breaker state a call on this provider
// should update. It returns 0 when there is no profile, or when the provider is
// the failover Pool, which records every member attempt itself.
func healthIDFor(prov llm.Provider, profileID int64) int64 {
	if profileID == 0 {
		return 0
	}
	if _, pooled := prov.(*llmpool.Pool); pooled {
		return 0
	}
	return profileID
}

// currentFor resolves the provider this role runs on, by precedence:
// Agent binding → task LLM profile chain → global/environment configuration,
// honoring a per-run profile pin set by the engine for per-intent rotation (#85).
// Binding wins over the task chain: a role explicitly assigned a model keeps running
// on that model; only when the binding is missing or fails to build does it fall back
// to the task chain, and to the global configuration when the chain is empty.
// A pin is only a dispatch preference: the chain must still be in a ready state
// (an exhausted chain with no active head stays exhausted) and the pinned id must
// belong to the task's chain. The returned profile id is non-zero only on the
// task-chain path — streamTaskLLM uses it to decide whether a quota error should
// advance the task's failover state (binding/global paths leave the chain state
// untouched, preserving existing semantics).
func (r *taskLLMRuntime) currentFor(ctx context.Context) (taskLLMSelection, error) {
	taskNum, err := parseTaskID(r.taskID)
	if err != nil {
		return taskLLMSelection{}, err
	}
	pt, err := r.s.m.pg.GetTask(taskNum)
	if err != nil {
		return taskLLMSelection{}, err
	}
	if pt == nil {
		return taskLLMSelection{}, fmt.Errorf("task %s not found", r.taskID)
	}
	r.s.syncTaskLLMState(pt)
	t, _ := r.s.m.Task(r.taskID)
	sel := taskLLMSelection{task: t, revision: pt.LLMChainRevision}
	if prov, cfg, id, ok := r.s.agentBindingProvider(r.agentKey); ok {
		sel.provider, sel.retry = prov, cfg.Retry
		sel.healthProfileID = healthIDFor(prov, id)
		return sel, nil
	}
	if len(pt.LLMProfileIDs) > 0 {
		if pt.ActiveLLMProfileID == nil {
			return sel, &taskLLMError{taskID: r.taskID, chainExhausted: true, cause: errors.New("all selected profiles are quota exhausted")}
		}
		sel.profileID = *pt.ActiveLLMProfileID
		if pin, ok := llmProfilePinFrom(ctx); ok && pin != sel.profileID {
			for _, id := range pt.ReadyLLMProfileIDs {
				if id == pin {
					sel.profileID = pin
					break
				}
			}
		}
		prov, cfg, ok := r.s.providerForProfile(sel.profileID)
		if !ok {
			return sel, fmt.Errorf("LLM profile #%d is missing or invalid", sel.profileID)
		}
		sel.provider, sel.retry = prov, cfg.Retry
		sel.healthProfileID = sel.profileID // chain selections never go through the Pool
		return sel, nil
	}
	prov, cfg, id, ok := r.s.globalProviderWithProfile()
	if !ok {
		return sel, fmt.Errorf("task %s has no available fallback LLM provider", r.taskID)
	}
	sel.provider, sel.retry = prov, cfg.Retry
	sel.healthProfileID = healthIDFor(prov, id)
	return sel, nil
}

// activeCfg resolves the task's currently-active LLM config, mirroring current()'s
// source precedence (agent binding → active chain profile → global). Read-only and
// best-effort: ok=false when nothing resolves, leaving the per-setting fallback to
// the caller. If failover switches profiles, the change takes effect on the next
// agent run (a fresh Session is built per run in captureRun).
func (r *taskLLMRuntime) activeCfg() (agent.Config, bool) {
	taskNum, err := parseTaskID(r.taskID)
	if err != nil {
		return agent.Config{}, false
	}
	pt, err := r.s.m.pg.GetTask(taskNum)
	if err != nil || pt == nil {
		return agent.Config{}, false
	}
	if _, cfg, _, ok := r.s.agentBindingProvider(r.agentKey); ok {
		return cfg, true
	}
	if len(pt.LLMProfileIDs) > 0 && pt.ActiveLLMProfileID != nil {
		if _, cfg, ok := r.s.providerForProfile(*pt.ActiveLLMProfileID); ok {
			return cfg, true
		}
	}
	if _, cfg, ok := r.s.globalProvider(); ok {
		return cfg, true
	}
	return agent.Config{}, false
}

// nonStreaming reports whether the task's currently-active LLM source is set to
// non-streaming. Unresolvable → streaming (false), the safe default.
func (r *taskLLMRuntime) nonStreaming() bool {
	cfg, ok := r.activeCfg()
	return ok && !cfg.Stream
}

// maxTokens returns the currently-active source's per-reply output cap.
// Unresolvable → 0, i.e. send no cap, matching the pre-setting behaviour.
func (r *taskLLMRuntime) maxTokens() int {
	cfg, _ := r.activeCfg() // zero value 0 when no configuration resolves
	return cfg.MaxTokens
}

func parseTaskID(id string) (int64, error) {
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("invalid task id %q", id)
	}
	return n, nil
}

// streamHooks builds the failover/exhaustion callbacks shared by Stream and
// Complete: how to read the current profile selection, how to mark it quota
// exhausted, how to emit a failover transition, and how to report breaker
// health for providers that are not the failover Pool.
func (r *taskLLMRuntime) streamHooks() taskLLMStreamHooks {
	return taskLLMStreamHooks{
		current: func(ctx context.Context) (taskLLMSelection, error) { return r.currentFor(ctx) },
		recordHealth: func(ctx context.Context, profileID int64, stream, committed bool, err error) {
			if profileID == 0 || r.s == nil || r.s.llmHealth == nil {
				return
			}
			if tripped, msg := r.s.llmHealth.RecordCall(ctx, profileID, stream, committed, err); tripped {
				log.Printf("[task-llm] profile #%d breaker tripped: %s", profileID, msg)
			}
		},
		exhaust: func(selection taskLLMSelection, cause error) (db.TaskLLMTransition, error) {
			taskNum, _ := parseTaskID(r.taskID)
			transition, err := r.s.m.pg.MarkTaskLLMProfileQuotaExhaustedAtRevision(taskNum, selection.profileID, selection.revision, cause.Error())
			if err != nil {
				return transition, err
			}
			if pt, getErr := r.s.m.pg.GetTask(taskNum); getErr == nil && pt != nil {
				r.s.syncTaskLLMState(pt)
			}
			return transition, nil
		},
		transition: func(selection taskLLMSelection, transition db.TaskLLMTransition, cause error) {
			r.s.emitTaskLLMTransition(selection.task, transition, cause)
		},
	}
}

func (r *taskLLMRuntime) Stream(ctx context.Context, req llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	ctx = llmrec.WithTaskID(ctx, r.taskID)
	return streamTaskLLM(ctx, r.taskID, req, r.streamHooks())
}

// Complete is the non-streaming counterpart of Stream. A non-streaming call is
// atomic — it never delivers partial output — so every failure is safe to retry
// on the same provider or fail over to the next profile without risking
// duplicated model output or tool execution (the "committed" bookkeeping the
// streaming path needs is unnecessary here).
func (r *taskLLMRuntime) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	ctx = llmrec.WithTaskID(ctx, r.taskID)
	return completeTaskLLM(ctx, r.taskID, req, r.streamHooks())
}

func completeTaskLLM(ctx context.Context, taskID string, req llm.CompletionRequest, hooks taskLLMStreamHooks) (llm.Message, string, llm.Usage, error) {
	// total is the usage of the logical call: the sum of every physical attempt
	// (same-provider retries and profile failover). Each attempt is already billed
	// once by the recorder below; this sum only feeds the caller's accounting.
	var total llm.Usage
	for {
		selection, err := hooks.current(ctx)
		if err != nil {
			return llm.Message{}, "", total, err
		}
		var (
			msg     llm.Message
			sr      string
			usage   llm.Usage
			callErr error
		)
		// Same-provider safe-window retry: a non-streaming call either succeeds or
		// fails as a whole — no partially delivered output — so any transient failure can be retried verbatim.
		retries, backoffOf := sameProviderRetryPolicy(selection.retry)
		for attempt := 0; ; attempt++ {
			msg, sr, usage, callErr = selection.provider.Complete(ctx, req)
			total.Add(usage)
			if hooks.recordHealth != nil {
				hooks.recordHealth(ctx, selection.healthProfileID, false, false, callErr)
			}
			if callErr != nil && ctx.Err() == nil &&
				attempt < retries && isRetryableStreamError(callErr) {
				backoff := backoffOf(attempt)
				log.Printf("[task-llm] task %s non-streaming call failed, retrying on the same provider after %v (%d/%d): %v",
					taskID, backoff, attempt+1, retries, callErr)
				if sleepCtx(ctx, backoff) {
					return llm.Message{}, "", total, ctx.Err() // cancelled during backoff → stop
				}
				continue
			}
			break
		}
		if callErr == nil {
			resetLLMFailStreak(taskID, selection.profileID)
			return msg, sr, total, nil
		}
		// Non-quota failures on a chain profile escalate after a consecutive
		// streak (#99): same advance path as quota exhaust, truthful reason.
		if selection.profileID != 0 && !isQuotaExhaustedError(callErr) && ctx.Err() == nil {
			if noteLLMCallFailure(taskID, selection.profileID) {
				cause := fmt.Errorf("profile #%d failed %d consecutive calls (last: %w)", selection.profileID, llmFailStreakThreshold, callErr)
				transition, markErr := hooks.exhaust(selection, cause)
				if markErr != nil {
					return llm.Message{}, "", total, fmt.Errorf("mark profile exhausted after %v: %w", callErr, markErr)
				}
				if transition.Advanced && !transition.Stale && hooks.transition != nil {
					hooks.transition(selection, transition, callErr)
				}
				if !transition.Stale && transition.NextProfileID == nil {
					return llm.Message{}, "", total, &taskLLMError{taskID: taskID, chainExhausted: transition.ChainExhausted, cause: callErr}
				}
				continue // replay the same logical request on the next profile
			}
			return llm.Message{}, "", total, callErr
		}
		// profileID=0: the explicit chain was cleared; non-quota error: pass through. Neither changes the task failover state.
		if selection.profileID == 0 || !isQuotaExhaustedError(callErr) {
			return llm.Message{}, "", total, callErr
		}
		transition, markErr := hooks.exhaust(selection, callErr)
		if markErr != nil {
			return llm.Message{}, "", total, fmt.Errorf("mark profile quota exhausted after %v: %w", callErr, markErr)
		}
		if transition.Advanced && !transition.Stale && hooks.transition != nil {
			hooks.transition(selection, transition, callErr)
		}
		if !transition.Stale && transition.NextProfileID == nil {
			return llm.Message{}, "", total, &taskLLMError{taskID: taskID, chainExhausted: transition.ChainExhausted, cause: callErr}
		}
		// No output has been delivered to the caller, so replaying the same logical request on the next profile is safe.
	}
}

func streamTaskLLM(ctx context.Context, taskID string, req llm.CompletionRequest, hooks taskLLMStreamHooks) iter.Seq2[llm.StreamEvent, error] {
	return func(yield func(llm.StreamEvent, error) bool) {
		for {
			selection, err := hooks.current(ctx)
			if err != nil {
				yield(llm.StreamEvent{}, err)
				return
			}
			committed := false
			var pending []llm.StreamEvent
			var streamErr error
			// The caller's llm.Accumulator sums usage across the whole logical call
			// (every attempt and profile): message_start is added, message_delta is
			// folded with MergeEcho. Folding one attempt's echo against the sum of
			// earlier attempts would lose input/cache tokens, so each attempt's echoes
			// are normalized here against that attempt alone and only the increment
			// is passed on, as a message_start. The recorder below already billed the
			// physical attempt; this only shapes what the caller adds up.
			var attemptUsage llm.Usage
			forward := func(event llm.StreamEvent) bool {
				switch event.Type {
				case llm.SEMessageStart:
					attemptUsage.Add(event.Usage)
				case llm.SEMessageDelta:
					next := attemptUsage
					next.MergeEcho(event.Usage)
					inc := llm.Usage{
						InputTokens:      next.InputTokens - attemptUsage.InputTokens,
						OutputTokens:     next.OutputTokens - attemptUsage.OutputTokens,
						CacheReadTokens:  next.CacheReadTokens - attemptUsage.CacheReadTokens,
						CacheWriteTokens: next.CacheWriteTokens - attemptUsage.CacheWriteTokens,
					}
					attemptUsage = next
					if inc != (llm.Usage{}) && !yield(llm.StreamEvent{Type: llm.SEMessageStart, Usage: inc}, nil) {
						return false
					}
					event.Usage = llm.Usage{}
				}
				return yield(event, nil)
			}
			retries, backoffOf := sameProviderRetryPolicy(selection.retry)
			// Same-provider safe-window retry: a transient failure before committed
			// (nothing delivered to the caller yet) can be replayed verbatim without
			// duplicating model output or tool executions. After committed, on ctx cancellation, or on deterministic/quota errors it breaks out to the original pass-through/failover logic below.
			for attempt := 0; ; attempt++ {
				committed = false
				pending = nil
				streamErr = nil
				attemptUsage = llm.Usage{}
				for event, err := range selection.provider.Stream(ctx, req) {
					if err != nil {
						streamErr = err
						break
					}
					if !committed && !streamEventCommitsOutput(event) {
						pending = append(pending, event)
						continue
					}
					if !committed {
						for _, buffered := range pending {
							if !forward(buffered) {
								return
							}
						}
						pending = nil
						committed = true
					}
					if !forward(event) {
						return
					}
				}
				if hooks.recordHealth != nil {
					hooks.recordHealth(ctx, selection.healthProfileID, true, committed, streamErr)
				}
				if streamErr != nil && !committed {
					// A failed uncommitted attempt delivers none of its events (they are
					// never replayed), but the usage it reported survives as one
					// message_start so the logical call still counts it.
					if u := pendingUsage(pending); u != (llm.Usage{}) && !yield(llm.StreamEvent{Type: llm.SEMessageStart, Usage: u}, nil) {
						return
					}
					pending = nil
				}
				if streamErr != nil && !committed && ctx.Err() == nil &&
					attempt < retries && isRetryableStreamError(streamErr) {
					backoff := backoffOf(attempt)
					log.Printf("[task-llm] task %s pre-commit stream failure, retrying on the same provider after %v (%d/%d): %v",
						taskID, backoff, attempt+1, retries, streamErr)
					if sleepCtx(ctx, backoff) {
						yield(llm.StreamEvent{}, ctx.Err()) // cancelled during backoff → stop
						return
					}
					continue
				}
				break
			}
			if streamErr == nil {
				resetLLMFailStreak(taskID, selection.profileID)
				for _, buffered := range pending {
					if !forward(buffered) {
						return
					}
				}
				return
			}
			// Non-quota failures on a chain profile escalate after a consecutive
			// streak (#99), mirroring completeTaskLLM. Escalation only applies to
			// uncommitted streams: once events reached the caller, replaying on a
			// new profile could duplicate delivered output, so the error surfaces.
			if selection.profileID != 0 && !committed && !isQuotaExhaustedError(streamErr) && ctx.Err() == nil {
				if noteLLMCallFailure(taskID, selection.profileID) {
					cause := fmt.Errorf("profile #%d failed %d consecutive calls (last: %w)", selection.profileID, llmFailStreakThreshold, streamErr)
					transition, markErr := hooks.exhaust(selection, cause)
					if markErr != nil {
						yield(llm.StreamEvent{}, fmt.Errorf("mark profile exhausted after %v: %w", streamErr, markErr))
						return
					}
					if transition.Advanced && !transition.Stale && hooks.transition != nil {
						hooks.transition(selection, transition, streamErr)
					}
					if !transition.Stale && transition.NextProfileID == nil {
						yield(llm.StreamEvent{}, &taskLLMError{taskID: taskID, chainExhausted: transition.ChainExhausted, cause: streamErr})
						return
					}
					continue // nothing delivered — safe to replay on the next profile
				}
			}
			// profileID=0 means the explicit chain was cleared while this stable task
			// bundle was still in use. Agent/global fallback errors follow the legacy
			// behavior and never mutate task failover state.
			if selection.profileID == 0 || !isQuotaExhaustedError(streamErr) {
				yield(llm.StreamEvent{}, streamErr)
				return
			}
			transition, markErr := hooks.exhaust(selection, streamErr)
			if markErr != nil {
				cause := fmt.Errorf("mark profile quota exhausted after %v: %w", streamErr, markErr)
				if committed {
					// Output may already have driven tool execution. Report the persistence
					// failure, but classify it as router-handled so the worker does not
					// replay the entire intent and duplicate those side effects.
					yield(llm.StreamEvent{}, &taskLLMError{taskID: taskID, cause: cause})
				} else {
					yield(llm.StreamEvent{}, cause)
				}
				return
			}
			if transition.Advanced && !transition.Stale && hooks.transition != nil {
				hooks.transition(selection, transition, streamErr)
			}
			if committed || (!transition.Stale && transition.NextProfileID == nil) {
				yield(llm.StreamEvent{}, &taskLLMError{taskID: taskID, chainExhausted: transition.ChainExhausted, cause: streamErr})
				return
			}
			// No event reached the caller, so replaying the same logical request on
			// the next profile cannot duplicate model output or tool execution.
		}
	}
}

// pendingUsage is the usage the buffered (uncommitted) events of one attempt
// reported. Only message_start can be buffered: message_delta commits.
func pendingUsage(pending []llm.StreamEvent) llm.Usage {
	var u llm.Usage
	for _, ev := range pending {
		if ev.Type == llm.SEMessageStart {
			u.Add(ev.Usage)
		}
	}
	return u
}

// streamEventCommitsOutput reports whether delivering event makes the attempt
// unreplayable. Signed and redacted thinking and tool-use signatures are opaque
// output the model bound to this exact response, so they commit like text.
func streamEventCommitsOutput(event llm.StreamEvent) bool {
	switch event.Type {
	case llm.SETextDelta, llm.SEThinkingDelta, llm.SEToolInputJSON,
		llm.SEThinkingSignature, llm.SERedactedThinking, llm.SEToolUseSignature:
		return event.Text != ""
	case llm.SEToolUseStart, llm.SEMessageDelta, llm.SEMessageStop:
		return true
	default:
		return false
	}
}

// The [default] retry count against the same provider within the pre-commit safe
// window. The SDK's doStream retries only the connection phase (before the 200); once
// the stream starts, mid-stream drops / overloaded / in-stream 429 and other transient
// faults bubble straight up as model_error with zero retries. As long as not one token has been handed to the caller (!committed), replaying the exact same request duplicates no model output or tool side effects, so this adds a same-provider backoff retry layer to absorb such jitter before the whole intent re-runs.
// Overridable by an LLM profile's retry overrides / the global retry policy.
const sameProviderStreamRetries = 2

// sameProviderRetryBackoff is the [default] backoff before retry attempt #attempt
// (0.5s, 1s…, capped at 4s) — same style as the SDK's exponential ladder but with a
// smaller cap so worker wrap-up/cancellation responsiveness is not dragged out. Exposed as variables so tests can zero the backoff.
var sameProviderRetryBackoff = func(attempt int) time.Duration {
	return min(500*time.Millisecond*(1<<attempt), 4*time.Second)
}

// sameProviderRetryPolicy resolves which same-provider retry parameters this call
// uses: a configured count wins (negative = turn this retry layer off), a configured
// interval swaps exponential backoff for a fixed interval, and with neither set it stays byte-for-byte identical to before it was configurable.
func sameProviderRetryPolicy(r agent.RetryConfig) (retries int, backoff func(int) time.Duration) {
	retries, backoff = sameProviderStreamRetries, sameProviderRetryBackoff
	if r.StreamAttempts != 0 {
		retries = max(r.StreamAttempts, 0)
	}
	if r.StreamInterval > 0 {
		d := r.StreamInterval
		backoff = func(int) time.Duration { return d }
	}
	return retries, backoff
}

// isRetryableStreamError decides whether a "pre-commit stream failure" is worth replaying on the same provider.
// Transient transport breaks / provider overload / rate limiting recover on their own and are safe to retry; these three are not:
//   - quota exhausted: left to profile failover, don't burn retries here in vain
//   - context too long: replaying the same request is useless; the harness's reactive compaction is the backstop
//   - deterministic 4xx rejection (400/401/403/404/422): every provider would fail the same way
func isRetryableStreamError(err error) bool {
	if err == nil {
		return false
	}
	if isQuotaExhaustedError(err) {
		return false
	}
	s := strings.ToLower(err.Error())
	if strings.Contains(s, "too long") || strings.Contains(s, "context length") ||
		strings.Contains(s, "context_length") || strings.Contains(s, "maximum context") ||
		strings.Contains(s, "status 413") {
		return false
	}
	for _, code := range []string{"status 400", "status 401", "status 403", "status 404", "status 422"} {
		if strings.Contains(s, code) {
			return false
		}
	}
	// Everything else (transport reset/EOF/timeout, 408/429/5xx, in-stream error events
	// such as anthropic overloaded_error, etc.) is treated as transient and retryable.
	return true
}

// CompactionWindow mirrors current()'s precedence so the context window always
// matches the provider the role will actually stream on.
func (r *taskLLMRuntime) CompactionWindow() int {
	if _, cfg, _, ok := r.s.agentBindingProvider(r.agentKey); ok {
		return cfg.CompactionWindow()
	}
	taskNum, err := parseTaskID(r.taskID)
	if err != nil {
		return (agent.Config{}).CompactionWindow()
	}
	chain, err := r.s.m.pg.TaskLLMProfiles(taskNum)
	if err != nil {
		return (agent.Config{}).CompactionWindow()
	}
	if len(chain) == 0 {
		if _, cfg, ok := r.s.globalProvider(); ok {
			return cfg.CompactionWindow()
		}
		return (agent.Config{}).CompactionWindow()
	}
	minimum := 0
	for _, entry := range chain {
		if cfg, ok := r.s.loadProfileConfig(entry.ProfileID); ok {
			window := cfg.CompactionWindow()
			if minimum == 0 || window < minimum {
				minimum = window
			}
		}
	}
	if minimum == 0 {
		return (agent.Config{}).CompactionWindow()
	}
	return minimum
}

// agentBindingProvider resolves the profile a role is explicitly bound to
// (agents.llm_profile_id) — the highest-precedence level for task agents. ok=false
// when the role has no binding or the bound profile no longer builds, so callers
// fall through to the task chain. A bound profile stays exclusive unless
// llm_pool_bind_fallback is on, which is what poolForBinding encodes. The
// returned id is the binding's profile, used to key breaker health when the
// returned provider is not the Pool.
func (s *Server) agentBindingProvider(agentKey string) (llm.Provider, agent.Config, int64, bool) {
	id := s.effectiveProfileForAgent(agentKey, nil)
	if id == nil {
		return nil, agent.Config{}, 0, false
	}
	prov, cfg, ok := s.providerForProfile(*id)
	if !ok {
		return nil, agent.Config{}, 0, false
	}
	return s.poolForBinding(*id, prov, cfg), cfg, *id, true
}

// globalProvider returns the process-wide provider (persisted active profile or
// environment config) — the last resort once a role has neither a binding nor a
// task chain.
func (s *Server) globalProvider() (llm.Provider, agent.Config, bool) {
	s.cfgMu.Lock()
	defer s.cfgMu.Unlock()
	if !s.llmOn || s.llmProv == nil {
		return nil, agent.Config{}, false
	}
	return s.llmProv, s.llmCfg, true
}

// globalProviderWithProfile is globalProvider plus the llm_profiles row the
// provider was built from (0 for an environment-only configuration). The id is
// read under the same lock as the provider so the pair cannot be mixed across
// an applyLLM rebuild.
func (s *Server) globalProviderWithProfile() (llm.Provider, agent.Config, int64, bool) {
	s.cfgMu.Lock()
	defer s.cfgMu.Unlock()
	if !s.llmOn || s.llmProv == nil {
		return nil, agent.Config{}, 0, false
	}
	return s.llmProv, s.llmCfg, s.llmHealthProfileID, true
}

// taskRuntimeAvailable reports whether every listed role can resolve a provider
// under the runtime precedence in current(): the role's own binding first, then
// the task chain, then global. An exhausted chain is a hard stop for unbound
// roles rather than a silent fall through to global — same as current().
func (s *Server) taskRuntimeAvailable(t *Task, agentKeys ...string) bool {
	if t == nil || len(agentKeys) == 0 {
		return false
	}
	state := t.llmStateSnapshot()
	unboundReady := false
	if len(state.ProfileIDs) > 0 {
		if state.ActiveID != nil {
			_, _, unboundReady = s.providerForProfile(*state.ActiveID)
		}
	} else {
		_, _, unboundReady = s.globalProvider()
	}
	for _, key := range agentKeys {
		if _, _, _, ok := s.agentBindingProvider(key); ok {
			continue
		}
		if !unboundReady {
			return false
		}
	}
	return true
}

func (s *Server) invalidateTaskAgents() {
	s.taskAgentMu.Lock()
	s.taskAgents = map[string]*taskAgentBundle{}
	s.taskAgentMu.Unlock()
}

func (s *Server) agentsForTask(t *Task) *taskAgentBundle {
	s.taskAgentMu.Lock()
	defer s.taskAgentMu.Unlock()
	if bundle := s.taskAgents[t.ID]; bundle != nil {
		return bundle
	}
	goalRuntime := &taskLLMRuntime{s: s, taskID: t.ID, agentKey: "goals"}
	plannerRuntime := &taskLLMRuntime{s: s, taskID: t.ID, agentKey: "planner"}
	workerRuntime := &taskLLMRuntime{s: s, taskID: t.ID, agentKey: "worker"}
	mainRuntime := &taskLLMRuntime{s: s, taskID: t.ID, agentKey: "mainagent"}
	tx := transcript.NewStore(filepath.Join(s.m.dir, "transcripts"))
	window := workerRuntime.CompactionWindow()
	wk := agent.NewWorker(workerRuntime, "task-router", s.m.dir, tx, window, s.agentMaxTurns("worker"))
	wk.SetFindingRecorder(s.evidenceStore())
	wk.SetTriageClient(s.triageClient()) // advisory dedup on report_finding (nil = off)
	s.applyTriageThreshold()             // stored suppression threshold (cheap, idempotent)
	wk.SetCompactionWindowResolver(workerRuntime.CompactionWindow)
	wk.SetNonStreaming(workerRuntime.nonStreaming) // per the task's currently active profile streaming switch (read every turn)
	wk.SetMaxTokens(workerRuntime.maxTokens)       // as above, the output cap also follows the currently active profile
	wk.SetNoaEnabled(s.m.NoaCompactionEnabled)     // experimental: noa context compaction (platform-level switch, read every run)
	wk.SetRunTimeout(time.Duration(s.agentRunSeconds("worker")) * time.Second)
	wk.SetProxy(s.m.ProxyAddr(), s.m.ProxyCACert())
	wk.SetFactTraffic(s.m.traffic) // fact provenance: relabel bytes captured from the target (#124 row 1)
	wk.SetWebSearch(s.webSearchFor("worker"))
	wk.SetConstraintInject(s.constraintInjectWorker) // operation-constraint injection into the worker (configurable, on by default)
	pl := agent.NewPlanner(plannerRuntime, "task-router", s.m.dir, tx, plannerRuntime.CompactionWindow(), s.agentMaxTurns("planner"))
	pl.SetFindingRecorder(s.evidenceStore())
	pl.SetTriageClient(s.triageClient()) // the planner registers findings too (wrap-up paths)
	pl.SetCompactionWindowResolver(plannerRuntime.CompactionWindow)
	pl.SetNonStreaming(plannerRuntime.nonStreaming)
	pl.SetMaxTokens(plannerRuntime.maxTokens)
	pl.SetNoaEnabled(s.m.NoaCompactionEnabled) // experimental: noa context compaction (platform-level switch, read every run)
	pl.SetKillWork(s.engine.KillWork)
	pl.SetSteerWork(s.engine.SteerWork)
	pl.SetProxy(s.m.ProxyAddr(), s.m.ProxyCACert())
	pl.SetFactTraffic(s.m.traffic)
	pl.SetWebSearch(s.webSearchFor("planner"))
	pl.SetConstraintInject(s.constraintInjectPlanner) // operation-constraint injection into the planner (configurable, on by default)
	// cold-digest §7: background compaction of cold nodes. This per-task planner set
	// (agentsForTask) is exactly what the engine actually drives through the authoritative
	// resolver, so the Compactor must hook in here. The planner provider goes through task routing (§4: same model as the agent, resolved with the task's LLM chain); compaction uses Complete to generate the body in one shot.
	pl.SetCompactor(agent.NewCompactor(plannerRuntime, "task-router"))
	// RSI shadow mode: select evidence-backed lessons for this task. Off by
	// default; shadow logs what would be shown, inject appends the block.
	s.wireTaskLessons(t, wk, pl)
	main := agent.NewMainAgent(mainRuntime, "task-router", s.m.dir, tx, mainRuntime.CompactionWindow(), s.agentMaxTurns("mainagent"))
	main.SetFindingRecorder(s.evidenceStore())
	main.SetCompactionWindowResolver(mainRuntime.CompactionWindow)
	main.SetNonStreaming(mainRuntime.nonStreaming)
	main.SetMaxTokens(mainRuntime.maxTokens)
	main.SetNoaEnabled(s.m.NoaCompactionEnabled) // experimental: noa context compaction (platform-level switch, read every run)
	main.SetProxy(s.m.ProxyAddr(), s.m.ProxyCACert())
	main.SetFactTraffic(s.m.traffic)
	main.SetWebSearch(s.webSearchFor("mainagent"))
	main.SetSteerWork(s.engine.SteerWork) // steer_work: real-time course correction on running work by a human
	bundle := &taskAgentBundle{
		runtime: goalRuntime, plannerRuntime: plannerRuntime, workerRuntime: workerRuntime,
		mainRuntime: mainRuntime, pl: pl, wk: wk, main: main,
	}
	s.taskAgents[t.ID] = bundle
	return bundle
}

func (s *Server) syncTaskLLMState(pt *db.Task) {
	if pt == nil {
		return
	}
	id := fmt.Sprintf("%d", pt.ID)
	s.m.mu.Lock()
	if task := s.m.tasks[id]; task != nil {
		task.setLLMState(pt.LLMProfileID, pt.ActiveLLMProfileID, pt.LLMProfileIDs, pt.LLMChainRevision, pt.LLMFailoverState, pt.LLMFailoverReason, pt.LLMRotate)
	}
	s.m.mu.Unlock()
}

func (s *Server) emitTaskLLMTransition(t *Task, transition db.TaskLLMTransition, cause error) {
	if t == nil {
		return
	}
	previous := s.llmAuditProfile(transition.PreviousProfileID)
	var next *llmAuditProfile
	if transition.NextProfileID != nil {
		next = s.llmAuditProfile(*transition.NextProfileID)
	}
	mode := "automatic"
	kind := "llm_switch"
	summary := fmt.Sprintf("%s quota exhausted", llmAuditProfileLabel(previous))
	if transition.NextProfileID != nil {
		summary += fmt.Sprintf(", subsequent calls switched to %s", llmAuditProfileLabel(next))
	} else {
		mode = "exhausted"
		kind = "llm_failover"
		summary += ", profile chain exhausted"
	}
	metadata, _ := json.Marshal(llmActivityMetadata{LLMTransition: llmTransitionAudit{
		Mode: mode, Reason: cause.Error(), Previous: previous, Next: next,
	}})
	s.engine.emitActivity(t, db.Activity{Worker: "system", Kind: kind, IsError: transition.ChainExhausted, Summary: summary, Detail: cause.Error(), Metadata: metadata})
	log.Printf("[llm-failover] task %s: %s", t.ID, summary)
}

func (s *Server) llmAuditProfile(id int64) *llmAuditProfile {
	if id <= 0 || s.m == nil || s.m.pg == nil {
		return nil
	}
	p, err := s.m.pg.ProfileByID(id)
	if err != nil || p == nil {
		return &llmAuditProfile{ID: id, Name: fmt.Sprintf("profile #%d", id)}
	}
	return &llmAuditProfile{ID: p.ID, Name: p.Name, Format: p.Format, Model: p.Model}
}

func llmAuditProfileLabel(profile *llmAuditProfile) string {
	if profile == nil {
		return "default profile"
	}
	name := profile.Name
	if name == "" {
		name = fmt.Sprintf("profile #%d", profile.ID)
	}
	detail := []string{}
	if profile.Format != "" {
		detail = append(detail, profile.Format)
	}
	if profile.Model != "" {
		detail = append(detail, profile.Model)
	}
	if len(detail) == 0 {
		return name
	}
	return fmt.Sprintf("%s (%s)", name, strings.Join(detail, " / "))
}

func sameOptionalID(a, b *int64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func (s *Server) emitManualTaskLLMSwitch(t *Task, previousID, nextID *int64) db.Activity {
	previous := (*llmAuditProfile)(nil)
	next := (*llmAuditProfile)(nil)
	if previousID != nil {
		previous = s.llmAuditProfile(*previousID)
	}
	if nextID != nil {
		next = s.llmAuditProfile(*nextID)
	}
	summary := fmt.Sprintf("user manually switched the task LLM from %s to %s", llmAuditProfileLabel(previous), llmAuditProfileLabel(next))
	metadata, _ := json.Marshal(llmActivityMetadata{LLMTransition: llmTransitionAudit{
		Mode: "manual", Reason: "user manually switched the task LLM", Previous: previous, Next: next,
	}})
	return s.engine.emitActivity(t, db.Activity{Worker: "system", Kind: "llm_switch", Summary: summary, Detail: summary, Metadata: metadata})
}
