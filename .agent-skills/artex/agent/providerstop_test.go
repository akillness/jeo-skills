package agent

import (
	"context"
	"iter"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/norma/harness"
	"github.com/Autumn-27/norma/llm"
)

// stopProvider ends every streamed call with the given stop reason and no content,
// the shape of a provider refusal before any output.
type stopProvider struct{ stop string }

func (p stopProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SEMessageStart, Usage: llm.Usage{InputTokens: 41}}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SEMessageDelta, StopReason: p.stop}, nil) {
			return
		}
		yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
	}
}

func (p stopProvider) Complete(context.Context, llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return llm.Message{Role: llm.RoleAssistant}, p.stop, llm.Usage{InputTokens: 41}, nil
}

// streamUnder runs one recorded streaming call with the given stop reason under ctx.
func streamUnder(t *testing.T, ctx context.Context, stop string) {
	t.Helper()
	rec := llmrec.Wrap(stopProvider{stop: stop}, nil, "model", "profile", "", "", func() bool { return false })
	for _, err := range rec.Stream(ctx, llm.CompletionRequest{}) {
		if err != nil {
			t.Fatal(err)
		}
	}
}

func TestIsRefusalStop(t *testing.T) {
	for stop, want := range map[string]bool{
		"refusal": true, "content_filter": true,
		"end_turn": false, "tool_use": false, "max_tokens": false, "stop": false, "": false,
	} {
		if got := IsRefusalStop(stop); got != want {
			t.Errorf("IsRefusalStop(%q) = %v, want %v", stop, got, want)
		}
	}
}

// The tracker installed per run is fed by the LLM recorder, and each run sees only
// its own calls.
func TestStopTrackerFedByRecorder(t *testing.T) {
	ctx := WithStopTracker(context.Background())
	if got := LastStopReason(ctx); got != "" {
		t.Fatalf("fresh tracker reports %q", got)
	}
	streamUnder(t, ctx, "refusal")
	if got := LastStopReason(ctx); got != "refusal" {
		t.Fatalf("LastStopReason = %q, want refusal", got)
	}
	// A later call overwrites it: the tracker describes the latest call only.
	streamUnder(t, ctx, "end_turn")
	if got := LastStopReason(ctx); got != "end_turn" {
		t.Fatalf("LastStopReason = %q, want end_turn", got)
	}
	// A nested run gets its own tracker and does not leak into the outer one.
	inner := WithStopTracker(ctx)
	streamUnder(t, inner, "content_filter")
	if LastStopReason(inner) != "content_filter" || LastStopReason(ctx) != "end_turn" {
		t.Fatalf("nested tracker leaked: inner=%q outer=%q", LastStopReason(inner), LastStopReason(ctx))
	}
	if got := LastStopReason(context.Background()); got != "" {
		t.Fatalf("context without a tracker reports %q", got)
	}
}

func TestTerminalTextNamesProviderRefusal(t *testing.T) {
	trace := &runTrace{startedAt: time.Now()}
	for _, stop := range []string{"refusal", "content_filter"} {
		ctx := WithStopTracker(context.Background())
		streamUnder(t, ctx, stop)
		summary, detail := terminalText(ctx, &harness.Terminal{Reason: harness.ReasonCompleted}, trace)
		if !strings.Contains(summary, "provider refusal (stop_reason "+stop+")") || strings.Contains(summary, "ended this turn normally") {
			t.Fatalf("%s: summary does not name the refusal: %q", stop, summary)
		}
		if !strings.Contains(detail, "stop_reason `"+stop+"`") || !strings.Contains(detail, "was not completed") {
			t.Fatalf("%s: detail does not explain the refusal:\n%s", stop, detail)
		}
	}

	// Control: an ordinary end of turn keeps the completed wording.
	ctx := WithStopTracker(context.Background())
	streamUnder(t, ctx, "end_turn")
	summary, _ := terminalText(ctx, &harness.Terminal{Reason: harness.ReasonCompleted}, trace)
	if !strings.Contains(summary, "terminal state completed") || strings.Contains(summary, "refusal") {
		t.Fatalf("ordinary end of turn misreported: %q", summary)
	}

	// A refusal stop only relabels a completed run; other terminal states keep theirs.
	ctx = WithStopTracker(context.Background())
	streamUnder(t, ctx, "refusal")
	summary, _ = terminalText(ctx, &harness.Terminal{Reason: harness.ReasonMaxTurns}, trace)
	if !strings.Contains(summary, "run budget cap") {
		t.Fatalf("max_turns relabelled by a refusal stop: %q", summary)
	}
}
