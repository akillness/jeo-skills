package server

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/llmpool"
)

func TestHealthSyncLoopWritesLatest(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var mu sync.Mutex
	saved := map[int64]db.LLMHealth{}
	cleared := map[int64]int{}
	savedCh := make(chan struct{}, 4)
	clearedCh := make(chan struct{}, 4)
	h := newHealthSync(ctx,
		func(row db.LLMHealth) error {
			mu.Lock()
			saved[row.ProfileID] = row
			mu.Unlock()
			savedCh <- struct{}{}
			return nil
		},
		func(id int64) error {
			mu.Lock()
			cleared[id]++
			delete(saved, id)
			mu.Unlock()
			clearedCh <- struct{}{}
			return nil
		},
	)
	openUntil := time.Now().Add(time.Minute).UTC().Truncate(time.Second)
	h.enqueue(8, healthOp{st: llmpool.State{Fails: 1, LastError: "first"}})
	h.enqueue(8, healthOp{st: llmpool.State{Fails: 4, Trips: 1, OpenUntil: openUntil, LastError: "down"}})
	deadline := time.After(2 * time.Second)
	var latest db.LLMHealth
	for {
		mu.Lock()
		latest = saved[8]
		mu.Unlock()
		if latest.Fails == 4 && latest.OpenUntil != nil && latest.OpenUntil.Equal(openUntil) {
			break
		}
		select {
		case <-savedCh:
		case <-deadline:
			t.Fatalf("loop saved=%+v, want the latest trip", latest)
		}
	}
	h.enqueue(7, healthOp{clear: true})
	select {
	case <-clearedCh:
	case <-time.After(2 * time.Second):
		t.Fatal("loop did not clear")
	}
	mu.Lock()
	defer mu.Unlock()
	got := saved[8]
	if got.Fails != 4 || got.Trips != 1 || got.LastError != "down" || got.OpenUntil == nil || !got.OpenUntil.Equal(openUntil) {
		t.Fatalf("saved=%+v, want the latest trip including OpenUntil", got)
	}
	if cleared[7] != 1 {
		t.Fatalf("cleared=%v", cleared)
	}
}

func TestHealthSyncRetriesFailedSave(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var mu sync.Mutex
	calls := 0
	done := make(chan struct{})
	h := newHealthSync(ctx,
		func(row db.LLMHealth) error {
			mu.Lock()
			calls++
			n := calls
			mu.Unlock()
			if n == 1 {
				return errors.New("database down")
			}
			if n == 2 {
				close(done)
			}
			return nil
		},
		func(int64) error { return nil },
	)
	h.retryAfter = 20 * time.Millisecond
	h.enqueue(3, healthOp{st: llmpool.State{Fails: 2, LastError: "blip"}})
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("failed save was not retried")
	}
	mu.Lock()
	defer mu.Unlock()
	if calls < 2 {
		t.Fatalf("save calls=%d, want a retry", calls)
	}
}

func TestHealthSyncEnqueueDoesNotWaitOnSave(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	started := make(chan struct{})
	release := make(chan struct{})
	later := make(chan struct{})
	h := newHealthSync(ctx,
		func(row db.LLMHealth) error {
			if row.Fails == 1 {
				close(started)
				<-release
				return nil
			}
			if row.Fails == 9 {
				close(later)
			}
			return nil
		},
		func(int64) error { return nil },
	)
	h.enqueue(4, healthOp{st: llmpool.State{Fails: 1}})
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("save did not start")
	}
	done := make(chan struct{})
	go func() {
		h.enqueue(4, healthOp{st: llmpool.State{Fails: 9, LastError: "later"}})
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("enqueue blocked while a save was in flight")
	}
	close(release)
	select {
	case <-later:
	case <-time.After(2 * time.Second):
		t.Fatal("the later state was not written")
	}
}

func TestHealthSyncDropsStaleWrite(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	writes := 0
	h := newHealthSync(ctx,
		func(db.LLMHealth) error {
			writes++
			return nil
		},
		func(int64) error { return nil },
	)
	h.mu.Lock()
	h.seq = 4
	h.applied[5] = 2
	h.pending[6] = healthOp{seq: 4, clear: true}
	h.mu.Unlock()
	if err := h.apply(5, healthOp{seq: 1, st: llmpool.State{Fails: 1}}); err != nil {
		t.Fatal(err)
	}
	if err := h.apply(6, healthOp{seq: 3, st: llmpool.State{Fails: 3}}); err != nil {
		t.Fatal(err)
	}
	if writes != 0 {
		t.Fatalf("stale writes=%d", writes)
	}
}
