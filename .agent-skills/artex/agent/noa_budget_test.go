package agent

import (
	"context"
	"errors"
	"iter"
	"strings"
	"testing"

	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/harness"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/noaadapter"
)

// A worker whose protected context exceeds a tiny NOA window ends with
// model_error and an error that still wraps ErrNoaBudget after the Norma harness
// and the capture layer: the engine's retry check relies on that.
func TestWorkerNoaBudgetRefusalKeepsSentinelThroughHarness(t *testing.T) {
	f := newSessionFixture(t)
	inner := &countingProvider{}
	w := NewWorker(inner, "test-model", t.TempDir(), nil, 2000, 3)
	w.SetNoaEnabled(func() bool { return true })
	reason, _, err := w.Execute(t.Context(), "work#1", f.expID, nil, f.ts, f.intent, passHooks{}, nil, nil, nil)
	if reason != harness.ReasonModelError || !errors.Is(err, ErrNoaBudget) || inner.calls != 0 {
		t.Fatalf("reason=%q err=%v provider calls=%d; want model_error wrapping ErrNoaBudget and no call", reason, err, inner.calls)
	}
}

// countingProvider answers with one text turn and counts the calls it receives.
type countingProvider struct{ calls int }

func (p *countingProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	p.calls++
	return func(yield func(llm.StreamEvent, error) bool) {
		if yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "ok"}, nil) {
			yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
		}
	}
}

func (p *countingProvider) Complete(context.Context, llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	p.calls++
	return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{llm.TextBlock("ok")}}, "end_turn", llm.Usage{}, nil
}

// withNoaEnable swaps the noaadapter.Enable seam for the duration of a test.
func withNoaEnable(t *testing.T, fn func(*agentcore.Options, noaadapter.Options) error) {
	t.Helper()
	prev := noaEnable
	noaEnable = fn
	t.Cleanup(func() { noaEnable = prev })
}

func TestEnableNoaUsesConfiguredWindow(t *testing.T) {
	for _, tc := range []struct {
		name       string
		compaction func() *agentcore.Options
		want       int
	}{
		{"configured", func() *agentcore.Options { return &agentcore.Options{Compaction: compactionConfig(32000)} }, 32000},
		{"default", func() *agentcore.Options { return &agentcore.Options{} }, defaultWindowK * 1000},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var got noaadapter.Options
			withNoaEnable(t, func(opts *agentcore.Options, o noaadapter.Options) error {
				got = o
				return noaadapter.Enable(opts, o)
			})
			inner := &countingProvider{}
			opts := tc.compaction()
			opts.Provider = inner
			enableNoa(opts, func() bool { return true }, t.TempDir(), "noa-window", nil)

			if got.ModelContextLimit != tc.want {
				t.Fatalf("noaadapter.Options.ModelContextLimit=%d, want %d", got.ModelContextLimit, tc.want)
			}
			bp, ok := opts.Provider.(*noaBudgetProvider)
			if !ok || bp.window != tc.want || bp.Provider != inner {
				t.Fatalf("provider %T %+v, want *noaBudgetProvider{window %d} around the original", opts.Provider, opts.Provider, tc.want)
			}
			if opts.Compaction != nil || opts.Compactor == nil {
				t.Fatalf("Compaction=%v Compactor=%v; noa must replace the built-in compaction", opts.Compaction, opts.Compactor)
			}
		})
	}
}

func irreducibleRequest() llm.CompletionRequest {
	return llm.CompletionRequest{System: []string{strings.Repeat("protected system prompt ", 8000)}, MaxTokens: 8000}
}

func TestNoaBudgetRefusesIrreducibleRequestBeforeTransport(t *testing.T) {
	t.Run("atomic", func(t *testing.T) {
		inner := &countingProvider{}
		p := &noaBudgetProvider{Provider: inner, window: 32000}
		_, _, _, err := p.Complete(t.Context(), irreducibleRequest())
		if err == nil || !strings.Contains(err.Error(), "exceeds configured budget 32000") || inner.calls != 0 {
			t.Fatalf("err=%v provider calls=%d", err, inner.calls)
		}
		if !errors.Is(err, ErrNoaBudget) {
			t.Fatalf("atomic refusal does not wrap ErrNoaBudget: %v", err)
		}
		if _, _, _, err := p.Complete(t.Context(), llm.CompletionRequest{System: []string{"short"}, MaxTokens: 1000}); err != nil || inner.calls != 1 {
			t.Fatalf("a request that fits was refused or not sent: err=%v calls=%d", err, inner.calls)
		}
	})
	t.Run("stream", func(t *testing.T) {
		inner := &countingProvider{}
		p := &noaBudgetProvider{Provider: inner, window: 32000}
		var events int
		var err error
		for ev, e := range p.Stream(t.Context(), irreducibleRequest()) {
			if e != nil {
				err = e
				break
			}
			_ = ev
			events++
		}
		if err == nil || !strings.Contains(err.Error(), "exceeds configured budget 32000") || events != 0 || inner.calls != 0 {
			t.Fatalf("err=%v events=%d provider calls=%d", err, events, inner.calls)
		}
		if !errors.Is(err, ErrNoaBudget) {
			t.Fatalf("stream refusal does not wrap ErrNoaBudget: %v", err)
		}
		for _, e := range p.Stream(t.Context(), llm.CompletionRequest{System: []string{"short"}, MaxTokens: 1000}) {
			if e != nil {
				t.Fatal(e)
			}
		}
		if inner.calls != 1 {
			t.Fatalf("a request that fits was not streamed: calls=%d", inner.calls)
		}
	})
}

func TestEnableNoaFailureKeepsBuiltInCompaction(t *testing.T) {
	withNoaEnable(t, func(*agentcore.Options, noaadapter.Options) error { return errors.New("archive dir unusable") })
	inner := &countingProvider{}
	compaction := compactionConfig(32000)
	opts := &agentcore.Options{Compaction: compaction, Provider: inner}
	var warns []string
	enableNoa(opts, func() bool { return true }, t.TempDir(), "noa-fail", func(m string) { warns = append(warns, m) })

	if len(warns) != 1 || !strings.Contains(warns[0], "falling back to built-in compaction") || !strings.Contains(warns[0], "archive dir unusable") {
		t.Fatalf("warnings %q", warns)
	}
	if opts.Compaction != compaction || opts.Compactor != nil {
		t.Fatalf("Compaction=%v Compactor=%v; the built-in compaction must stay", opts.Compaction, opts.Compactor)
	}
	if opts.Provider != llm.Provider(inner) {
		t.Fatalf("provider %T was wrapped although noa is off", opts.Provider)
	}
}
