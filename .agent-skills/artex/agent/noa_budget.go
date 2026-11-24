package agent

import (
	"context"
	"errors"
	"fmt"
	"iter"

	"github.com/Autumn-27/artex/sidequestion"
	"github.com/Autumn-27/norma/llm"
)

// noaRequestOverhead covers request framing the input estimate does not count.
const noaRequestOverhead = 512

// ErrNoaBudget marks a request refused by the NOA budget check. The refusal is
// deterministic (the same history fails the same way), so callers must not
// retry it.
var ErrNoaBudget = errors.New("noa request budget exceeded")

// noaBudgetProvider refuses, before any transport, a request that cannot fit the
// window noa was configured with. noa trims what it is allowed to drop; when
// the protected part (system prompt, recent turns, the output reservation)
// alone is over the window, sending it only buys a provider rejection.
type noaBudgetProvider struct {
	llm.Provider
	window int
}

func (p *noaBudgetProvider) check(req llm.CompletionRequest) error {
	estimate := sidequestion.EstimateInputTokens(req) + max(req.MaxTokens, 0) + noaRequestOverhead
	if estimate > p.window {
		return fmt.Errorf("%w: estimate %d exceeds configured budget %d; protected context cannot fit, increase the configured window or start a new session", ErrNoaBudget, estimate, p.window)
	}
	return nil
}

func (p *noaBudgetProvider) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	if err := p.check(req); err != nil {
		return llm.Message{}, "", llm.Usage{}, err
	}
	return p.Provider.Complete(ctx, req)
}

func (p *noaBudgetProvider) Stream(ctx context.Context, req llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	if err := p.check(req); err != nil {
		return func(yield func(llm.StreamEvent, error) bool) { yield(llm.StreamEvent{}, err) }
	}
	return p.Provider.Stream(ctx, req)
}
