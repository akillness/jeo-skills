package llmpool

import (
	"context"
	"fmt"
	"testing"

	"github.com/Autumn-27/norma/llm"
)

// RecordCall is the policy a provider call applies when no Pool wraps it. A
// completed call clears the state; a failover-eligible failure trips; a
// non-failover failure neither trips nor, on a stream, clears.
func TestRecordCallPolicy(t *testing.T) {
	ctx := context.Background()
	soft := fmt.Errorf("openai: status 500: down")
	bad := fmt.Errorf("openai: status 400: bad request")
	seed := func(t *testing.T) *Registry {
		t.Helper()
		reg := NewRegistry(nil, nil)
		reg.RecordCall(ctx, 7, false, false, soft)
		if st := reg.Get(7); st.Fails != 1 || st.Trips != 0 {
			t.Fatalf("seed state=%+v, want one soft failure", st)
		}
		return reg
	}

	t.Run("success clears", func(t *testing.T) {
		reg := seed(t)
		reg.RecordCall(ctx, 7, false, false, nil)
		if st := reg.Get(7); st.Fails != 0 || st.Trips != 0 || st.Open() {
			t.Fatalf("state=%+v after a success, want clean", st)
		}
	})
	t.Run("atomic non-failover clears", func(t *testing.T) {
		reg := seed(t)
		reg.RecordCall(ctx, 7, false, false, bad)
		if st := reg.Get(7); st.Fails != 0 || st.Trips != 0 {
			t.Fatalf("state=%+v after an atomic 400, want clean (Pool.Complete policy)", st)
		}
	})
	t.Run("stream non-failover keeps", func(t *testing.T) {
		reg := seed(t)
		reg.RecordCall(ctx, 7, true, false, bad)
		if st := reg.Get(7); st.Fails != 1 || st.Trips != 0 {
			t.Fatalf("state=%+v after a stream 400, want the failure kept", st)
		}
	})
	t.Run("stream cancel keeps", func(t *testing.T) {
		reg := seed(t)
		reg.RecordCall(ctx, 7, true, false, context.Canceled)
		if st := reg.Get(7); st.Fails != 1 || st.Trips != 0 {
			t.Fatalf("state=%+v after a cancel, want the failure kept", st)
		}
	})
	t.Run("committed stream failure keeps", func(t *testing.T) {
		reg := seed(t)
		reg.RecordCall(ctx, 7, true, true, soft)
		if st := reg.Get(7); st.Fails != 1 || st.Trips != 0 {
			t.Fatalf("state=%+v after a committed failure, want it ignored", st)
		}
	})
	t.Run("pre-commit stream failure counts", func(t *testing.T) {
		reg := NewRegistry(nil, nil)
		reg.RecordCall(ctx, 7, true, false, soft)
		if st := reg.Get(7); st.Fails != 1 || st.Trips != 0 || st.Open() {
			t.Fatalf("state=%+v, want one soft failure", st)
		}
	})
	t.Run("hard failure trips at once", func(t *testing.T) {
		reg := NewRegistry(nil, nil)
		reg.RecordCall(ctx, 7, false, false, fmt.Errorf("openai: status 401: bad key"))
		if st := reg.Get(7); st.Trips != 1 || !st.Open() {
			t.Fatalf("state=%+v, want an open breaker after one hard failure", st)
		}
	})
	t.Run("profile 0 is a no-op", func(t *testing.T) {
		reg := NewRegistry(nil, nil)
		reg.RecordCall(ctx, 0, false, false, soft)
		if n := len(reg.Snapshot()); n != 0 {
			t.Fatalf("%d states recorded for profile 0", n)
		}
	})
}

// The Pool feeds the same policy: a failure before the first event counts on
// the member that failed, a failure after output reached the caller does not,
// because the Pool neither fails over nor blames the profile in that case.
func TestPoolFeedsRecordCallPolicy(t *testing.T) {
	t.Run("pre-commit failure counts", func(t *testing.T) {
		a := &fakeProv{name: "a", errs: []error{fmt.Errorf("status 500: down")}}
		reg := NewRegistry(nil, nil)
		p := New([]*Member{member(1, "a", 10, a), member(2, "b", 5, okProv("b", "full"))}, reg)
		if _, err := drain(p.Stream(context.Background(), llm.CompletionRequest{})); err != nil {
			t.Fatalf("stream error: %v", err)
		}
		if st := reg.Get(1); st.Fails != 1 || st.Trips != 0 {
			t.Fatalf("state=%+v after a pre-commit failure, want one soft failure", st)
		}
		if st := reg.Get(2); st.Fails != 0 || st.Trips != 0 {
			t.Fatalf("state=%+v on the backup member, want clean", st)
		}
	})
	t.Run("committed failure is ignored", func(t *testing.T) {
		a := &fakeProv{
			name:   "a",
			events: [][]llm.StreamEvent{{{Type: llm.SETextDelta, Text: "partial"}}},
			errs:   []error{fmt.Errorf("status 500: mid-stream drop")},
		}
		reg := NewRegistry(nil, nil)
		p := New([]*Member{member(1, "a", 10, a), member(2, "b", 5, okProv("b", "full"))}, reg)
		if _, err := drain(p.Stream(context.Background(), llm.CompletionRequest{})); err == nil {
			t.Fatal("mid-stream error should surface")
		}
		if st := reg.Get(1); st.Fails != 0 || st.Trips != 0 {
			t.Fatalf("state=%+v after a committed failure, want clean", st)
		}
	})
}
