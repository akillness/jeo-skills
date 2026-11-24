package llmpool

import (
	"sync/atomic"
	"testing"
	"time"
)

// persist and forget run under the registry lock. A second update on the same
// profile cannot enqueue until the first callback returns, so the queue cannot
// observe the later state first.
func TestHealthCallbacksStayInStateOrder(t *testing.T) {
	var entered atomic.Int32
	firstIn := make(chan struct{})
	release := make(chan struct{})
	block := func() {
		if entered.Add(1) == 1 {
			close(firstIn)
			<-release
		}
	}
	reg := NewRegistry(
		func(int64, State) { block() },
		func(int64) { block() },
	)
	go reg.Trip(1, "down", true)
	select {
	case <-firstIn:
	case <-time.After(2 * time.Second):
		t.Fatal("Trip did not reach persist")
	}
	passed := make(chan struct{})
	go func() {
		reg.Pass(1)
		close(passed)
	}()
	select {
	case <-passed:
		t.Fatal("Pass enqueued while Trip's persist was still running")
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	select {
	case <-passed:
	case <-time.After(2 * time.Second):
		t.Fatal("Pass did not finish after Trip released the lock")
	}
	if entered.Load() != 2 {
		t.Fatalf("callbacks=%d, want Trip then Pass", entered.Load())
	}
}
