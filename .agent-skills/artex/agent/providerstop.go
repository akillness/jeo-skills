package agent

import (
	"context"
	"sync"

	"github.com/Autumn-27/artex/llmrec"
)

// IsRefusalStop reports whether a provider stop reason means the provider's
// safety system declined the request rather than the model ending its turn.
// Anthropic returns stop_reason "refusal" with an empty or partial message;
// OpenAI-compatible endpoints return finish_reason "content_filter", which Norma
// passes through unmapped.
func IsRefusalStop(stopReason string) bool {
	return stopReason == "refusal" || stopReason == "content_filter"
}

// stopTracker keeps the stop reason of the latest model call of one run. The
// harness does not expose it: a refused turn has no text and no tool calls, so it
// ends as ReasonCompleted, the same as a model that chose to stop.
type stopTracker struct {
	mu   sync.Mutex
	last string
}

func (t *stopTracker) set(stopReason string) {
	t.mu.Lock()
	t.last = stopReason
	t.mu.Unlock()
}

func (t *stopTracker) get() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.last
}

type stopTrackerKey struct{}

// WithStopTracker attaches a fresh stop tracker to ctx and subscribes it to the
// LLM recorder's stop sink, so every model call made under the returned context
// updates it. captureRunSession installs one per run; a nested run gets its own.
func WithStopTracker(ctx context.Context) context.Context {
	t := &stopTracker{}
	ctx = context.WithValue(ctx, stopTrackerKey{}, t)
	return llmrec.WithStopSink(ctx, t.set)
}

// LastStopReason returns the stop reason of the latest model call made under ctx
// by the run that owns it, or "" when none was observed.
func LastStopReason(ctx context.Context) string {
	if t, _ := ctx.Value(stopTrackerKey{}).(*stopTracker); t != nil {
		return t.get()
	}
	return ""
}
