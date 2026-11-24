package llmrec

import (
	"context"
	"iter"
	"os"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/transcript"
	"github.com/google/uuid"
)

type completeProvider struct{}

func (completeProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(func(llm.StreamEvent, error) bool) {}
}

func (completeProvider) Complete(context.Context, llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return llm.Message{
		Role: llm.RoleAssistant,
		Content: []llm.ContentBlock{
			{Type: llm.BlockThinking, Thinking: "reasoning"},
			llm.TextBlock("answer"),
		},
	}, "stop", llm.Usage{InputTokens: 7, OutputTokens: 3}, nil
}

func TestTaskIDContextUsesExplicitRegistryID(t *testing.T) {
	ctx := WithTaskID(context.Background(), " 42 ")
	if got := TaskIDFrom(ctx); got != "42" {
		t.Fatalf("TaskIDFrom()=%q want 42", got)
	}
	if got := TaskIDFrom(WithTaskID(ctx, "   ")); got != "42" {
		t.Fatalf("blank task id should preserve parent context, got %q", got)
	}
	if got := TaskIDFrom(nil); got != "" {
		t.Fatalf("nil context returned %q", got)
	}
}

func TestParseSessionFallbackIsExplorationScoped(t *testing.T) {
	taskID, worker := parseSession("exp12-worker-i99")
	if taskID != "12" || worker != "worker" {
		t.Fatalf("parseSession()=(%q,%q)", taskID, worker)
	}
	if taskID, worker := parseSession("not-a-task"); taskID != "" || worker != "" {
		t.Fatalf("unexpected non-session parse: (%q,%q)", taskID, worker)
	}
}

func TestCompleteForwardsAtomicResponse(t *testing.T) {
	recorder := Wrap(completeProvider{}, nil, "model", "profile", "", "", func() bool { return false })
	msg, stopReason, usage, err := recorder.Complete(context.Background(), llm.CompletionRequest{})
	if err != nil {
		t.Fatalf("Complete() error: %v", err)
	}
	if got := msg.Text(); got != "answer" {
		t.Fatalf("Complete() text=%q want answer", got)
	}
	if stopReason != "stop" {
		t.Fatalf("Complete() stop reason=%q want stop", stopReason)
	}
	if usage.InputTokens != 7 || usage.OutputTokens != 3 {
		t.Fatalf("Complete() usage=%+v", usage)
	}
}

// The usage sink sees each metered call once, with the usage the llm_usage row gets.
func TestUsageSinkSeesMeteredCalls(t *testing.T) {
	var got []llm.Usage
	ctx := WithUsageSink(context.Background(), func(u llm.Usage) { got = append(got, u) })
	recorder := Wrap(meteredStreamProvider{}, nil, "model", "profile", "", "", func() bool { return false })
	for _, err := range recorder.Stream(ctx, llm.CompletionRequest{}) {
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, _, _, err := recorder.Complete(ctx, llm.CompletionRequest{}); err != nil {
		t.Fatal(err)
	}
	want := []llm.Usage{{InputTokens: 23, OutputTokens: 5}, {InputTokens: 7, OutputTokens: 3}}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("sink saw %+v, want %+v", got, want)
	}
	// A call that gets no llm_usage row (no model, zero usage) is not seen either.
	got = nil
	empty := Wrap(completeProvider{}, nil, "", "", "", "", nil)
	empty.recordUsage(ctx, "", 0, "", llm.Usage{}, 0, "ok")
	if len(got) != 0 {
		t.Fatalf("sink saw an unmetered call: %+v", got)
	}
}

// The stop sink sees the final stop reason of each call that completes, which the
// harness otherwise drops: a refusal is an empty, tool-less turn like any other.
func TestStopSinkSeesFinalStopReason(t *testing.T) {
	var got []string
	ctx := WithStopSink(context.Background(), func(stop string) { got = append(got, stop) })
	recorder := Wrap(refusalStreamProvider{}, nil, "model", "profile", "", "", func() bool { return false })
	for _, err := range recorder.Stream(ctx, llm.CompletionRequest{}) {
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, _, _, err := recorder.Complete(ctx, llm.CompletionRequest{}); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != "refusal" || got[1] != "stop" {
		t.Fatalf("sink saw %q, want [refusal stop]", got)
	}
	// Without a sink on the context nothing is reported and nothing breaks.
	for _, err := range recorder.Stream(context.Background(), llm.CompletionRequest{}) {
		if err != nil {
			t.Fatal(err)
		}
	}
}

// refusalStreamProvider streams what Anthropic sends for a refusal before any
// output: message_start, then message_delta with stop_reason "refusal" and no
// content blocks at all.
type refusalStreamProvider struct{ completeProvider }

func (refusalStreamProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SEMessageStart, Usage: llm.Usage{InputTokens: 41}}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SEMessageDelta, StopReason: "refusal", Usage: llm.Usage{InputTokens: 41}}, nil) {
			return
		}
		yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
	}
}

type meteredStreamProvider struct{ completeProvider }

func (meteredStreamProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SEMessageStart, Usage: llm.Usage{InputTokens: 23}}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SEMessageDelta, Usage: llm.Usage{OutputTokens: 5}}, nil) {
			return
		}
		yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
	}
}

func TestSideUsageRecordedOnceOnConsumerCancellation(t *testing.T) {
	// Previously skipped as timing-sensitive (BaaRai/ARTEX#9). The recorder now
	// decides the status at the point the consumer stops, so the result no
	// longer depends on when the deferred finish runs.
	dsn := os.Getenv("ARTEX_PG_DSN")
	if dsn == "" {
		t.Skip("requires isolated ARTEX_PG_DSN")
	}
	pg, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pg.Close()
	// full: read to the end. cancel: cancel ctx, then stop reading.
	// abandon: stop reading before message_stop with ctx still live.
	for _, mode := range []string{"full", "cancel", "abandon"} {
		profile := "btw-metering-" + uuid.NewString()
		ctx, cancel := context.WithCancel(transcript.WithSessionID(t.Context(), "exp0-btw-test"))
		recorder := Wrap(meteredStreamProvider{}, pg, "fixture", profile, "", "", func() bool { return false })
		for event, err := range recorder.Stream(ctx, llm.CompletionRequest{}) {
			if err != nil {
				t.Fatal(err)
			}
			if mode != "full" && event.Type == llm.SEMessageDelta {
				if mode == "cancel" {
					cancel()
				}
				break // Consumer exits before the provider can return a cancellation event.
			}
		}
		cancel()
		var count, input, output int
		var worker, status string
		err = pg.QueryRow(`SELECT count(*),max(input_tokens),max(output_tokens),max(worker),max(status)
FROM llm_usage WHERE profile_name=$1`, profile).Scan(&count, &input, &output, &worker, &status)
		_, _ = pg.Exec(`DELETE FROM llm_usage WHERE profile_name=$1`, profile)
		if err != nil {
			t.Fatal(err)
		}
		wantStatus := "ok"
		if mode != "full" {
			wantStatus = "error"
		}
		if count != 1 || input != 23 || output != 5 || worker != "btw" || status != wantStatus {
			t.Fatalf("mode=%s: count=%d usage=%d/%d worker=%q status=%q", mode, count, input, output, worker, status)
		}
	}
}
