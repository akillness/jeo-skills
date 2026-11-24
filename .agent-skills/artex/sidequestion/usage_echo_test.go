package sidequestion

import (
	"context"
	"iter"
	"testing"

	"github.com/Autumn-27/norma/llm"
)

// A streamed side answer counts message_delta's echo of the input side once.
func TestAnswerStreamUsageEchoCountedOnce(t *testing.T) {
	for _, tc := range []struct {
		name         string
		start, delta llm.Usage
		want         llm.Usage
	}{
		{"full_echo",
			llm.Usage{InputTokens: 23, CacheReadTokens: 5, CacheWriteTokens: 3},
			llm.Usage{InputTokens: 23, CacheReadTokens: 5, CacheWriteTokens: 3, OutputTokens: 5},
			llm.Usage{InputTokens: 23, OutputTokens: 5, CacheReadTokens: 5, CacheWriteTokens: 3}},
		{"partial_echo",
			llm.Usage{InputTokens: 740, CacheReadTokens: 200, CacheWriteTokens: 40},
			llm.Usage{InputTokens: 500, OutputTokens: 77},
			llm.Usage{InputTokens: 740, OutputTokens: 77, CacheReadTokens: 200, CacheWriteTokens: 40}},
		{"no_echo",
			llm.Usage{InputTokens: 23, CacheReadTokens: 5, CacheWriteTokens: 3},
			llm.Usage{OutputTokens: 5},
			llm.Usage{InputTokens: 23, OutputTokens: 5, CacheReadTokens: 5, CacheWriteTokens: 3}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := fakeProvider{stream: func(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
				return func(yield func(llm.StreamEvent, error) bool) {
					for _, ev := range []llm.StreamEvent{
						{Type: llm.SEMessageStart, Usage: tc.start},
						{Type: llm.SETextDelta, Text: "answer"},
						{Type: llm.SEMessageDelta, StopReason: "end_turn", Usage: tc.delta},
						{Type: llm.SEMessageStop},
					} {
						if !yield(ev, nil) {
							return
						}
					}
				}
			}}
			out, err := (SideQuestionService{Provider: p}).Answer(t.Context(), llm.CompletionRequest{}, true, nil)
			if err != nil || out.Text != "answer" || out.Usage != tc.want {
				t.Fatalf("answer=%+v err=%v, want usage %+v", out, err, tc.want)
			}
		})
	}
}
