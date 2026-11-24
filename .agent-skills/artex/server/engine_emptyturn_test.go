package server

import (
	"context"
	"iter"
	"sync/atomic"
	"testing"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/norma/llm"
)

// stopReasonProvider ends a streamed call with the given stop reason and no
// content, the shape of a provider refusal before any output.
type stopReasonProvider struct{ stop string }

func (p stopReasonProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
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

func (p stopReasonProvider) Complete(context.Context, llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return llm.Message{Role: llm.RoleAssistant}, p.stop, llm.Usage{}, nil
}

// runCtxAfter returns a run context whose latest recorded model call ended with stop.
func runCtxAfter(t *testing.T, stop string) context.Context {
	t.Helper()
	ctx := agent.WithStopTracker(context.Background())
	rec := llmrec.Wrap(stopReasonProvider{stop: stop}, nil, "model", "profile", "", "", func() bool { return false })
	for _, err := range rec.Stream(ctx, llm.CompletionRequest{}) {
		if err != nil {
			t.Fatal(err)
		}
	}
	return ctx
}

// A provider refusal leaves an assistant turn with no text and no tools, the same
// shape as an idle turn, but rerunning it only sends the same conversation to be
// refused again.
func TestSteerHooksStopDoesNotRerunProviderRefusal(t *testing.T) {
	refused := []llm.Message{llm.UserText("start"), {Role: llm.RoleAssistant}}
	for _, stop := range []string{"refusal", "content_filter"} {
		h := steerHooks{nudges: &atomic.Int64{}, limit: defaultEmptyTurnNudges, label: "worker-1 · #1"}
		prevent, blocking, _ := h.Stop(runCtxAfter(t, stop), refused)
		if prevent || blocking != nil {
			t.Fatalf("%s: refusal was rerun: prevent=%v blocking=%v", stop, prevent, blocking)
		}
		if n := h.nudges.Load(); n != 0 {
			t.Fatalf("%s: refusal consumed the idle-turn quota: %d", stop, n)
		}
	}

	// Control: the same empty turn after an ordinary end of turn is still nudged.
	h := steerHooks{nudges: &atomic.Int64{}, limit: defaultEmptyTurnNudges, label: "worker-1 · #1"}
	if _, blocking, _ := h.Stop(runCtxAfter(t, "end_turn"), refused); len(blocking) != 1 || blocking[0] != emptyTurnNudge {
		t.Fatalf("idle turn after end_turn not nudged: %v", blocking)
	}
}

// Identifying and nudging empty turns (thinking only, no text, no tools); see steerHooks.Stop.

func assistantThinking(text string) llm.Message {
	return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{
		{Type: llm.BlockThinking, Thinking: text, Signature: "sig"},
	}}
}

func TestIsThinkingOnlyTurn(t *testing.T) {
	toolUse := llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{
		{Type: llm.BlockThinking, Thinking: "scan ports first"},
		{Type: llm.BlockToolUse, ID: "t1", Name: "run_nuclei"},
	}}
	cases := []struct {
		name string
		msgs []llm.Message
		want bool
	}{
		{"thinking only", []llm.Message{llm.UserText("start"), assistantThinking("thinking")}, true},
		{"thinking+tool", []llm.Message{llm.UserText("start"), toolUse}, false},
		{"thinking+text", []llm.Message{assistantThinking("thinking"), {
			Role:    llm.RoleAssistant,
			Content: []llm.ContentBlock{{Type: llm.BlockThinking, Thinking: "x"}, llm.TextBlock("conclusion")},
		}}, false},
		{"text with only whitespace", []llm.Message{{
			Role:    llm.RoleAssistant,
			Content: []llm.ContentBlock{{Type: llm.BlockThinking, Thinking: "x"}, llm.TextBlock("  \n ")},
		}}, true},
		{"completely empty assistant turn", []llm.Message{{Role: llm.RoleAssistant}}, true},
		// Tool results have the user role; the check must walk back to the assistant message
		// before it instead of misjudging the nearest message.
		{"last message is a tool result", []llm.Message{toolUse, {
			Role:    llm.RoleUser,
			Content: []llm.ContentBlock{{Type: llm.BlockToolResult, ToolUseID: "t1"}},
		}}, false},
		{"no assistant message", []llm.Message{llm.UserText("start")}, false},
		{"empty history", nil, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := isThinkingOnlyTurn(c.msgs); got != c.want {
				t.Fatalf("isThinkingOnlyTurn = %v, want %v", got, c.want)
			}
		})
	}
}

// fakeHooks is a programmable inner HookRunner used to verify that steerHooks respects
// the inner decision.
type fakeHooks struct {
	prevent  bool
	blocking []string
	msg      string
}

func (f fakeHooks) PreToolUse(context.Context, string, []byte) (bool, string, []byte) {
	return false, "", nil
}
func (f fakeHooks) PostToolUse(context.Context, string, []byte, []byte, bool) {}
func (f fakeHooks) Stop(context.Context, []llm.Message) (bool, []string, string) {
	return f.prevent, f.blocking, f.msg
}

func TestSteerHooksStopNudgesEmptyTurn(t *testing.T) {
	empty := []llm.Message{assistantThinking("I should enumerate subdomains first")}

	t.Run("empty turn injects a continue directive", func(t *testing.T) {
		h := steerHooks{nudges: &atomic.Int64{}, limit: defaultEmptyTurnNudges, label: "worker-1 · #1"}
		prevent, blocking, _ := h.Stop(context.Background(), empty)
		if prevent {
			t.Fatal("empty turn should not be hard-stopped")
		}
		if len(blocking) != 1 || blocking[0] != emptyTurnNudge {
			t.Fatalf("blocking = %v, want [emptyTurnNudge]", blocking)
		}
	})

	t.Run("does not intervene when text or tools are present", func(t *testing.T) {
		h := steerHooks{nudges: &atomic.Int64{}, limit: defaultEmptyTurnNudges}
		normal := []llm.Message{{
			Role:    llm.RoleAssistant,
			Content: []llm.ContentBlock{llm.TextBlock("scan complete, no open ports found")},
		}}
		if _, blocking, _ := h.Stop(context.Background(), normal); blocking != nil {
			t.Fatalf("normal wrap-up misjudged as an empty turn: %v", blocking)
		}
		if n := h.nudges.Load(); n != 0 {
			t.Fatalf("should not count when not intervening, got %d", n)
		}
	})

	t.Run("allows wrap-up after the limit is reached", func(t *testing.T) {
		const limit = 5 // the user configured "empty response retries" to 5
		h := steerHooks{nudges: &atomic.Int64{}, limit: limit}
		for i := 1; i <= limit; i++ {
			if _, blocking, _ := h.Stop(context.Background(), empty); len(blocking) != 1 {
				t.Fatalf("attempt %d should still be within quota, blocking = %v", i, blocking)
			}
		}
		if _, blocking, _ := h.Stop(context.Background(), empty); blocking != nil {
			t.Fatalf("still injecting beyond the limit: %v", blocking)
		}
	})

	// "empty response retries" set to -1 disables this layer; emptyTurnNudgeLimit parses to 0.
	t.Run("does not intervene when disabled by config", func(t *testing.T) {
		h := steerHooks{nudges: &atomic.Int64{}, limit: 0}
		if _, blocking, _ := h.Stop(context.Background(), empty); blocking != nil {
			t.Fatalf("still injecting when disabled: %v", blocking)
		}
	})

	t.Run("does not stack when inner decides a hard stop", func(t *testing.T) {
		h := steerHooks{inner: fakeHooks{prevent: true, msg: "guard refused to finish"}, nudges: &atomic.Int64{}, limit: defaultEmptyTurnNudges}
		prevent, blocking, msg := h.Stop(context.Background(), empty)
		if !prevent || msg != "guard refused to finish" || blocking != nil {
			t.Fatalf("inner hard stop was rewritten: prevent=%v blocking=%v msg=%q", prevent, blocking, msg)
		}
		if n := h.nudges.Load(); n != 0 {
			t.Fatalf("should not consume quota when yielding to inner, got %d", n)
		}
	})

	t.Run("does not stack when inner already wants to continue", func(t *testing.T) {
		h := steerHooks{inner: fakeHooks{blocking: []string{"guard's reason to continue"}}, nudges: &atomic.Int64{}, limit: defaultEmptyTurnNudges}
		_, blocking, _ := h.Stop(context.Background(), empty)
		if len(blocking) != 1 || blocking[0] != "guard's reason to continue" {
			t.Fatalf("inner continue message was rewritten: %v", blocking)
		}
	})

	t.Run("behavior unchanged without a counter", func(t *testing.T) {
		h := steerHooks{limit: defaultEmptyTurnNudges} // e.g. a future call site forgets to pass nudges
		if _, blocking, _ := h.Stop(context.Background(), empty); blocking != nil {
			t.Fatalf("should not inject without a counter: %v", blocking)
		}
	})
}
