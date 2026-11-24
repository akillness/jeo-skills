package server

import (
	"context"
	"errors"
	"fmt"
	"iter"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/norma/llm"
)

// Usage reported by one failed attempt, and by a successful one. A stream
// reports the input side in message_start and echoes it, with the output, in
// message_delta; the atomic path returns the attempt's normalized usage.
var (
	failedAttemptUsage = llm.Usage{InputTokens: 11, OutputTokens: 2, CacheReadTokens: 3, CacheWriteTokens: 2}
	okStartUsage       = llm.Usage{InputTokens: 13, CacheReadTokens: 3, CacheWriteTokens: 2}
	okDeltaUsage       = llm.Usage{InputTokens: 17, OutputTokens: 5, CacheReadTokens: 4, CacheWriteTokens: 2}
	okAttemptUsage     = llm.Usage{InputTokens: 17, OutputTokens: 5, CacheReadTokens: 4, CacheWriteTokens: 2}
)

// usageAttemptProvider fails its first fail attempts (always, when fail < 0)
// after reporting failedAttemptUsage, then answers "done".
type usageAttemptProvider struct {
	fail    int
	failErr error
	onFail  func()
	// extra events a failed stream attempt emits before its error.
	failEvents []llm.StreamEvent
	calls      int
}

func (p *usageAttemptProvider) failing() bool {
	p.calls++
	failed := p.fail < 0 || p.calls <= p.fail
	if failed && p.onFail != nil {
		p.onFail()
	}
	return failed
}

func (p *usageAttemptProvider) Complete(context.Context, llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	if p.failing() {
		return llm.Message{}, "", failedAttemptUsage, p.failErr
	}
	return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{llm.TextBlock("done")}}, "end_turn", okAttemptUsage, nil
}

func (p *usageAttemptProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(yield func(llm.StreamEvent, error) bool) {
		if p.failing() {
			events := append([]llm.StreamEvent{{Type: llm.SEMessageStart, Usage: failedAttemptUsage}}, p.failEvents...)
			for _, ev := range events {
				if !yield(ev, nil) {
					return
				}
			}
			yield(llm.StreamEvent{}, p.failErr)
			return
		}
		for _, ev := range []llm.StreamEvent{
			{Type: llm.SEMessageStart, Usage: okStartUsage},
			{Type: llm.SETextDelta, Text: "done"},
			{Type: llm.SEMessageDelta, StopReason: "end_turn", Usage: okDeltaUsage},
			{Type: llm.SEMessageStop},
		} {
			if !yield(ev, nil) {
				return
			}
		}
	}
}

// logicalResult is what the SDK sees for one logical call.
type logicalResult struct {
	usage  llm.Usage
	text   string
	events []llm.StreamEvent
	err    error
}

func runLogicalCall(ctx context.Context, stream bool, taskID string, hooks taskLLMStreamHooks) logicalResult {
	if !stream {
		msg, _, usage, err := completeTaskLLM(ctx, taskID, llm.CompletionRequest{}, hooks)
		return logicalResult{usage: usage, text: msg.Text(), err: err}
	}
	var r logicalResult
	acc := llm.NewAccumulator()
	for ev, err := range streamTaskLLM(ctx, taskID, llm.CompletionRequest{}, hooks) {
		if err != nil {
			r.err = err
			break
		}
		r.events = append(r.events, ev)
		acc.Add(ev)
	}
	r.usage, r.text = acc.Usage, acc.Message().Text()
	return r
}

func singleProfileHooks(p llm.Provider, retry agent.RetryConfig) taskLLMStreamHooks {
	return taskLLMStreamHooks{
		current: func(context.Context) (taskLLMSelection, error) {
			return taskLLMSelection{provider: p, retry: retry}, nil
		},
		exhaust: func(taskLLMSelection, error) (db.TaskLLMTransition, error) {
			return db.TaskLLMTransition{}, nil
		},
	}
}

func sumUsage(us ...llm.Usage) llm.Usage {
	var t llm.Usage
	for _, u := range us {
		t.Add(u)
	}
	return t
}

var usageModes = []struct {
	name   string
	stream bool
}{{"atomic", false}, {"stream", true}}

func TestTaskLLMRetrySumsAttemptUsage(t *testing.T) {
	for _, m := range usageModes {
		t.Run(m.name, func(t *testing.T) {
			p := &usageAttemptProvider{fail: 1, failErr: errors.New("connection reset by peer")}
			r := runLogicalCall(t.Context(), m.stream, "p12-retry", singleProfileHooks(p, agent.RetryConfig{StreamAttempts: 1, StreamInterval: time.Millisecond}))
			if r.err != nil {
				t.Fatal(r.err)
			}
			want := sumUsage(failedAttemptUsage, okAttemptUsage) // {28 7 7 4}
			if r.usage != want || p.calls != 2 || r.text != "done" {
				t.Fatalf("usage=%+v want %+v, calls=%d, text=%q", r.usage, want, p.calls, r.text)
			}
		})
	}
}

func TestTaskLLMExhaustedRetriesReturnSummedUsage(t *testing.T) {
	for _, m := range usageModes {
		t.Run(m.name, func(t *testing.T) {
			p := &usageAttemptProvider{fail: -1, failErr: errors.New("connection reset by peer")}
			r := runLogicalCall(t.Context(), m.stream, "p12-exhausted", singleProfileHooks(p, agent.RetryConfig{StreamAttempts: 1, StreamInterval: time.Millisecond}))
			if r.err == nil || r.err.Error() != "connection reset by peer" {
				t.Fatalf("err=%v", r.err)
			}
			want := sumUsage(failedAttemptUsage, failedAttemptUsage)
			if r.usage != want || p.calls != 2 {
				t.Fatalf("usage=%+v want %+v, calls=%d", r.usage, want, p.calls)
			}
		})
	}
}

func TestTaskLLMProfileFailoverSumsUsage(t *testing.T) {
	for _, m := range usageModes {
		t.Run(m.name, func(t *testing.T) {
			first := &usageAttemptProvider{fail: -1, failErr: errors.New("openai: status 402: insufficient_quota")}
			second := &usageAttemptProvider{}
			active := int64(11)
			hooks := taskLLMStreamHooks{
				current: func(context.Context) (taskLLMSelection, error) {
					if active == 11 {
						return taskLLMSelection{profileID: 11, provider: first}, nil
					}
					return taskLLMSelection{profileID: 22, provider: second}, nil
				},
				exhaust: func(taskLLMSelection, error) (db.TaskLLMTransition, error) {
					active = 22
					next := active
					return db.TaskLLMTransition{PreviousProfileID: 11, NextProfileID: &next, Advanced: true}, nil
				},
			}
			r := runLogicalCall(t.Context(), m.stream, "p12-failover-"+m.name, hooks)
			if r.err != nil {
				t.Fatal(r.err)
			}
			want := sumUsage(failedAttemptUsage, okAttemptUsage)
			if r.usage != want || first.calls != 1 || second.calls != 1 || r.text != "done" {
				t.Fatalf("usage=%+v want %+v, calls first=%d second=%d, text=%q", r.usage, want, first.calls, second.calls, r.text)
			}
		})
	}
}

func TestTaskLLMCancelDuringBackoffStops(t *testing.T) {
	for _, m := range usageModes {
		t.Run(m.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			p := &usageAttemptProvider{fail: -1, failErr: errors.New("connection reset by peer")}
			// Cancel once the retry is waiting out its (long) backoff.
			p.onFail = func() { time.AfterFunc(20*time.Millisecond, cancel) }
			r := runLogicalCall(ctx, m.stream, "p12-cancel", singleProfileHooks(p, agent.RetryConfig{StreamAttempts: 2, StreamInterval: time.Minute}))
			if !errors.Is(r.err, context.Canceled) {
				t.Fatalf("err=%v, want context.Canceled", r.err)
			}
			if p.calls != 1 || r.usage != failedAttemptUsage {
				t.Fatalf("calls=%d usage=%+v", p.calls, r.usage)
			}
		})
	}
}

func TestTaskLLMUncommittedStreamAttemptKeepsUsageWithoutReplay(t *testing.T) {
	p := &usageAttemptProvider{
		fail:    1,
		failErr: errors.New("anthropic: overloaded_error"),
		// Buffered, non-committing events of the failed attempt.
		failEvents: []llm.StreamEvent{{Type: llm.SEThinkingDelta}, {Type: llm.SEToolInputJSON}},
	}
	r := runLogicalCall(t.Context(), true, "p12-uncommitted", singleProfileHooks(p, agent.RetryConfig{StreamAttempts: 1, StreamInterval: time.Millisecond}))
	if r.err != nil {
		t.Fatal(r.err)
	}
	if want := sumUsage(failedAttemptUsage, okAttemptUsage); r.usage != want {
		t.Fatalf("usage=%+v want %+v", r.usage, want)
	}
	if r.text != "done" {
		t.Fatalf("text=%q, want the second attempt's only", r.text)
	}
	// The failed attempt contributes one usage-only message_start, nothing else.
	if len(r.events) == 0 || r.events[0].Type != llm.SEMessageStart || r.events[0].Usage != failedAttemptUsage {
		t.Fatalf("first event %+v", r.events)
	}
	for _, ev := range r.events {
		if ev.Type == llm.SEThinkingDelta || ev.Type == llm.SEToolInputJSON {
			t.Fatalf("buffered event of the failed attempt was delivered: %+v", r.events)
		}
	}
}

func TestTaskLLMOpaqueThinkingCommitsStream(t *testing.T) {
	defer withZeroRetryBackoff()()
	for _, kind := range []llm.StreamEventType{llm.SEThinkingSignature, llm.SERedactedThinking, llm.SEToolUseSignature} {
		t.Run(string(kind), func(t *testing.T) {
			if !streamEventCommitsOutput(llm.StreamEvent{Type: kind, Text: "opaque"}) {
				t.Fatalf("%s does not commit", kind)
			}
			// A retryable failure after the opaque block is surfaced, not replayed.
			p := &scriptedLLMProvider{events: []llm.StreamEvent{{Type: kind, Text: "opaque"}}, err: errors.New("connection reset by peer")}
			events, err := collectTaskLLMStream(streamTaskLLM(t.Context(), "p12-opaque", llm.CompletionRequest{}, singleProfileHooks(p, agent.RetryConfig{})))
			if err == nil || p.calls != 1 || len(events) != 1 || events[0].Type != kind {
				t.Fatalf("calls=%d events=%+v err=%v", p.calls, events, err)
			}
		})
	}
}

// The recorder below the task router writes one llm_usage row per physical
// attempt; summing the attempts for the logical call adds no row.
func TestTaskLLMRetryKeepsOneLedgerRowPerPhysicalCall(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	pg := m.PG()
	for _, mode := range usageModes {
		t.Run(mode.name, func(t *testing.T) {
			taskID := fmt.Sprintf("p12-ledger-%s-%d", mode.name, time.Now().UnixNano())
			t.Cleanup(func() { _, _ = pg.Exec(`DELETE FROM llm_usage WHERE task_id=$1`, taskID) })
			p := &usageAttemptProvider{fail: 1, failErr: errors.New("connection reset by peer")}
			rec := llmrec.Wrap(p, pg, "test-model", "test-profile", "", "", func() bool { return false })
			ctx := llmrec.WithTaskID(t.Context(), taskID)
			r := runLogicalCall(ctx, mode.stream, taskID, singleProfileHooks(rec, agent.RetryConfig{StreamAttempts: 1, StreamInterval: time.Millisecond}))
			if r.err != nil {
				t.Fatal(r.err)
			}
			var rows, failed int
			if err := pg.QueryRow(`SELECT count(*), count(*) FILTER (WHERE status='error') FROM llm_usage WHERE task_id=$1`, taskID).Scan(&rows, &failed); err != nil {
				t.Fatal(err)
			}
			if rows != 2 || failed != 1 || p.calls != 2 {
				t.Fatalf("llm_usage rows=%d (error %d), physical calls=%d; want 2 rows, 1 error", rows, failed, p.calls)
			}
		})
	}
}
