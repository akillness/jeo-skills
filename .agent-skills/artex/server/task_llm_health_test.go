package server

import (
	"context"
	"fmt"
	"testing"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/llmpool"
	"github.com/Autumn-27/norma/llm"
)

// healthHooks runs one logical call on p and reports every physical attempt to
// reg under healthID, the way streamHooks wires it in production.
func healthHooks(reg *llmpool.Registry, p llm.Provider, healthID int64) taskLLMStreamHooks {
	return taskLLMStreamHooks{
		current: func(context.Context) (taskLLMSelection, error) {
			return taskLLMSelection{provider: p, healthProfileID: healthID, retry: agent.RetryConfig{StreamAttempts: 1}}, nil
		},
		exhaust: func(taskLLMSelection, error) (db.TaskLLMTransition, error) { return db.TaskLLMTransition{}, nil },
		recordHealth: func(ctx context.Context, profileID int64, stream, committed bool, err error) {
			reg.RecordCall(ctx, profileID, stream, committed, err)
		},
	}
}

// A successful call clears a degraded profile, on both call shapes.
func TestTaskLLMRecordsHealthOnSuccess(t *testing.T) {
	resetLLMFailStreaksForTest()
	ctx := context.Background()
	for _, stream := range []bool{false, true} {
		t.Run(fmt.Sprintf("stream=%v", stream), func(t *testing.T) {
			reg := llmpool.NewRegistry(nil, nil)
			reg.RecordCall(ctx, 7, false, false, fmt.Errorf("openai: status 500: down"))
			if st := reg.Get(7); st.Fails != 1 {
				t.Fatalf("seed state=%+v, want one failure", st)
			}
			runLogicalCall(ctx, stream, "health-success", healthHooks(reg, &scriptedLLMProvider{}, 7))
			if st := reg.Get(7); st.Fails != 0 || st.Trips != 0 {
				t.Fatalf("state=%+v after success, want clean", st)
			}
		})
	}
}

// A deterministic 400 on an atomic call clears the streak, matching
// Pool.Complete; the same error on a stream leaves it alone, matching
// Pool.Stream.
func TestTaskLLMRecordsNonFailoverErrorLikeThePool(t *testing.T) {
	resetLLMFailStreaksForTest()
	ctx := context.Background()
	bad := fmt.Errorf("openai: status 400: bad request")
	reg := llmpool.NewRegistry(nil, nil)
	reg.RecordCall(ctx, 7, false, false, fmt.Errorf("openai: status 500: down"))
	runLogicalCall(ctx, false, "health-atomic-400", healthHooks(reg, &scriptedLLMProvider{err: bad}, 7))
	if st := reg.Get(7); st.Fails != 0 || st.Trips != 0 {
		t.Fatalf("atomic state=%+v after 400, want clean", st)
	}

	reg2 := llmpool.NewRegistry(nil, nil)
	reg2.RecordCall(ctx, 8, false, false, fmt.Errorf("openai: status 500: down"))
	runLogicalCall(ctx, true, "health-stream-400", healthHooks(reg2, &scriptedLLMProvider{err: bad}, 8))
	if st := reg2.Get(8); st.Fails != 1 || st.Trips != 0 {
		t.Fatalf("stream state=%+v after 400, want the failure kept", st)
	}
}

// Every physical stream attempt is reported: a retried pre-commit 500 counts
// twice and does not trip a three-strike breaker.
func TestTaskLLMRecordsEveryStreamAttempt(t *testing.T) {
	resetLLMFailStreaksForTest()
	defer withZeroRetryBackoff()()
	ctx := context.Background()
	reg := llmpool.NewRegistry(nil, nil)
	p := &scriptedLLMProvider{err: fmt.Errorf("openai: status 500: down")}
	runLogicalCall(ctx, true, "health-retry", healthHooks(reg, p, 7))
	if p.calls != 2 {
		t.Fatalf("provider calls=%d, want one attempt plus one retry", p.calls)
	}
	if st := reg.Get(7); st.Fails != 2 || st.Trips != 0 {
		t.Fatalf("state=%+v, want two soft failures and no trip", st)
	}
}

// A failure after output reached the caller is committed: the Pool does not
// fail over there and the breaker is left alone.
func TestTaskLLMRecordsCommittedFailureAsNoHealthEvent(t *testing.T) {
	resetLLMFailStreaksForTest()
	reg := llmpool.NewRegistry(nil, nil)
	p := &scriptedLLMProvider{
		events: []llm.StreamEvent{{Type: llm.SETextDelta, Text: "partial"}},
		err:    fmt.Errorf("openai: status 500: mid-stream drop"),
	}
	runLogicalCall(context.Background(), true, "health-committed", healthHooks(reg, p, 7))
	if st := reg.Get(7); st.Fails != 0 || st.Trips != 0 {
		t.Fatalf("state=%+v after a committed failure, want clean", st)
	}
}

// Without a health profile (environment-only configuration) nothing is
// recorded.
func TestTaskLLMRecordsNoHealthWithoutProfile(t *testing.T) {
	resetLLMFailStreaksForTest()
	reg := llmpool.NewRegistry(nil, nil)
	p := &scriptedLLMProvider{err: fmt.Errorf("openai: status 500: down")}
	runLogicalCall(context.Background(), true, "health-none", healthHooks(reg, p, 0))
	if n := len(reg.Snapshot()); n != 0 {
		t.Fatalf("%d states recorded with healthProfileID 0", n)
	}
}

// healthIDFor keys the registry only for a provider that does not record by
// itself: a Pool already updates every member attempt.
func TestHealthIDForSkipsPooledProviders(t *testing.T) {
	bare := &scriptedLLMProvider{}
	pool := llmpool.New([]*llmpool.Member{{ID: 9, Prov: bare}}, nil)
	if pool == nil {
		t.Fatal("pool should be non-nil")
	}
	if got := healthIDFor(bare, 7); got != 7 {
		t.Fatalf("bare provider id=%d, want 7", got)
	}
	if got := healthIDFor(pool, 7); got != 0 {
		t.Fatalf("pooled provider id=%d, want 0", got)
	}
	if got := healthIDFor(bare, 0); got != 0 {
		t.Fatalf("profile 0 id=%d, want 0", got)
	}
}

// The production hook closure records under the given profile and no-ops on 0.
func TestStreamHooksRecordBreakerHealth(t *testing.T) {
	reg := llmpool.NewRegistry(nil, nil)
	r := &taskLLMRuntime{s: &Server{llmHealth: reg}}
	h := r.streamHooks()
	ctx := context.Background()
	h.recordHealth(ctx, 0, false, false, fmt.Errorf("openai: status 500: down"))
	if n := len(reg.Snapshot()); n != 0 {
		t.Fatalf("%d states recorded for profile 0", n)
	}
	h.recordHealth(ctx, 7, false, false, fmt.Errorf("openai: status 500: down"))
	if st := reg.Get(7); st.Fails != 1 {
		t.Fatalf("state=%+v, want one failure", st)
	}
	h.recordHealth(ctx, 7, false, false, nil)
	if st := reg.Get(7); st.Fails != 0 || st.Trips != 0 {
		t.Fatalf("state=%+v after success, want clean", st)
	}
}
