package server

import (
	"errors"
	"fmt"
	"testing"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/norma/harness"
)

// A NOA budget refusal is deterministic: the engine must not rerun the intent,
// whether the sentinel arrives bare or wrapped.
func TestWorkerModelErrorRetrySkipsNoaBudget(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{"noa budget", agent.ErrNoaBudget, false},
		{"noa budget wrapped", fmt.Errorf("%w: estimate 64000 exceeds configured budget 32000", agent.ErrNoaBudget), false},
		{"noa budget wrapped twice", fmt.Errorf("worker: %w", fmt.Errorf("%w: estimate", agent.ErrNoaBudget)), false},
		{"generic model error", errors.New("connection reset by peer"), true},
		{"task router error", &taskLLMError{taskID: "7", cause: errors.New("insufficient_quota")}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := retryableWorkerModelError(harness.ReasonModelError, tc.err); got != tc.want {
				t.Fatalf("retryableWorkerModelError(model_error, %v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
