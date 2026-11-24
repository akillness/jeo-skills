package llmrec

import (
	"context"
	"iter"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
	"github.com/google/uuid"
)

// echoStreamProvider streams one message_start and one message_delta with the
// given (already normalized) usage, as Norma's providers emit them.
type echoStreamProvider struct {
	completeProvider
	start, delta llm.Usage
}

func (p echoStreamProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(yield func(llm.StreamEvent, error) bool) {
		for _, ev := range []llm.StreamEvent{
			{Type: llm.SEMessageStart, Usage: p.start},
			{Type: llm.SETextDelta, Text: "answer"},
			{Type: llm.SEMessageDelta, StopReason: "end_turn", Usage: p.delta},
			{Type: llm.SEMessageStop},
		} {
			if !yield(ev, nil) {
				return
			}
		}
	}
}

// Norma normalizes Anthropic usage so InputTokens includes the cache read and
// write subsets, and since v0.4.7 message_delta echoes that input side.
var usageEchoCases = []struct {
	name         string
	start, delta llm.Usage
	want         llm.Usage
}{
	{
		name:  "full_echo",
		start: llm.Usage{InputTokens: 23, CacheReadTokens: 5, CacheWriteTokens: 3},
		delta: llm.Usage{InputTokens: 23, CacheReadTokens: 5, CacheWriteTokens: 3, OutputTokens: 5},
		want:  llm.Usage{InputTokens: 23, OutputTokens: 5, CacheReadTokens: 5, CacheWriteTokens: 3},
	},
	{
		// Raw start: input 500, cache read 200, cache creation 40 → normalized 740.
		// Raw delta: input 500, output 77, no cache fields → normalized 500.
		name:  "partial_echo",
		start: llm.Usage{InputTokens: 740, CacheReadTokens: 200, CacheWriteTokens: 40},
		delta: llm.Usage{InputTokens: 500, OutputTokens: 77},
		want:  llm.Usage{InputTokens: 740, OutputTokens: 77, CacheReadTokens: 200, CacheWriteTokens: 40},
	},
	{
		name:  "no_echo",
		start: llm.Usage{InputTokens: 23, CacheReadTokens: 5, CacheWriteTokens: 3},
		delta: llm.Usage{OutputTokens: 5},
		want:  llm.Usage{InputTokens: 23, OutputTokens: 5, CacheReadTokens: 5, CacheWriteTokens: 3},
	},
}

func drainRecorderStream(t *testing.T, ctx context.Context, r *Recorder) {
	t.Helper()
	for _, err := range r.Stream(ctx, llm.CompletionRequest{}) {
		if err != nil {
			t.Fatal(err)
		}
	}
}

// The metered usage of a streamed call counts an echoed input side once.
func TestStreamUsageEchoCountedOnce(t *testing.T) {
	for _, tc := range usageEchoCases {
		t.Run(tc.name, func(t *testing.T) {
			var got []llm.Usage
			ctx := WithUsageSink(t.Context(), func(u llm.Usage) { got = append(got, u) })
			drainRecorderStream(t, ctx, Wrap(echoStreamProvider{start: tc.start, delta: tc.delta}, nil, "fixture", "profile", "", "", func() bool { return false }))
			if len(got) != 1 || got[0] != tc.want {
				t.Fatalf("metered %+v, want one call with %+v", got, tc.want)
			}
		})
	}
}

// The llm_usage ledger gets one row per streamed call, with the echo counted once.
func TestStreamUsageEchoLedgerRow(t *testing.T) {
	dsn, _, err := db.DSN()
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	pg, err := db.Open(dsn)
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer pg.Close()
	if err := pg.EnsureLLMUsageTable(); err != nil {
		t.Fatal(err)
	}
	for _, tc := range usageEchoCases {
		t.Run(tc.name, func(t *testing.T) {
			profile := "usage-echo-" + uuid.NewString()
			t.Cleanup(func() { _, _ = pg.Exec(`DELETE FROM llm_usage WHERE profile_name=$1`, profile) })
			drainRecorderStream(t, t.Context(), Wrap(echoStreamProvider{start: tc.start, delta: tc.delta}, pg, "fixture", profile, "", "", func() bool { return false }))
			var rows int
			var got llm.Usage
			err := pg.QueryRow(`SELECT count(*), COALESCE(sum(input_tokens),0), COALESCE(sum(output_tokens),0), COALESCE(sum(cache_read),0), COALESCE(sum(cache_write),0)
FROM llm_usage WHERE profile_name=$1`, profile).Scan(&rows, &got.InputTokens, &got.OutputTokens, &got.CacheReadTokens, &got.CacheWriteTokens)
			if err != nil {
				t.Fatal(err)
			}
			if rows != 1 || got != tc.want {
				t.Fatalf("ledger rows=%d usage=%+v, want 1 row with %+v", rows, got, tc.want)
			}
		})
	}
}
