package server

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

// The worker-side heartbeat must keep a claim alive while it runs and, once
// another worker has taken the intent over, cancel the stale run with the named
// claim-lost cause instead of carrying on.
func TestClaimHeartbeatRenewsThenCancelsOnTakeover(t *testing.T) {
	skipWithoutDSN(t)
	dsn, _, err := db.DSN()
	if err != nil {
		t.Fatal(err)
	}
	d, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	expID, err := d.CreateExploration("claim heartbeat", "renew, then stop on takeover")
	if err != nil {
		t.Fatal(err)
	}
	defer d.Exec(`DELETE FROM explorations WHERE id=$1`, expID)
	store := d.Exploration(expID)
	id, err := store.AddIntent(map[string]any{"summary": "leased"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	token, err := store.ClaimIntentToken(id, "work#1")
	if err != nil || token == "" {
		t.Fatalf("claim: token=%q err=%v", token, err)
	}
	expire := func() {
		t.Helper()
		if _, err := d.Exec(`UPDATE exploration_nodes SET last_heartbeat_at = now() - $2 * INTERVAL '1 second' WHERE id=$1`,
			id, (db.IntentClaimTTL + time.Second).Seconds()); err != nil {
			t.Fatal(err)
		}
	}

	ctx, cancel := context.WithCancelCause(context.Background())
	defer cancel(nil)
	stop := startClaimHeartbeat(store, 20*time.Millisecond, "work#1", id, token, cancel)
	defer stop()

	// Renewal: an expired-looking heartbeat is refreshed by the next ticks.
	expire()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var fresh bool
		if err := d.QueryRow(`SELECT last_heartbeat_at > now() - INTERVAL '30 seconds' FROM exploration_nodes WHERE id=$1`, id).Scan(&fresh); err != nil {
			t.Fatal(err)
		}
		if fresh {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("heartbeat did not renew the claim")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if ctx.Err() != nil {
		t.Fatalf("run cancelled while its claim was live: %v", context.Cause(ctx))
	}

	// Takeover: expire the claim and reclaim it before the next heartbeat lands
	// (retried, because a heartbeat may win the race and renew the claim first).
	var reclaimed int64
	for attempt := 0; attempt < 200 && reclaimed == 0; attempt++ {
		expire()
		if reclaimed, err = store.ResetRunningIntents(); err != nil {
			t.Fatal(err)
		}
	}
	if reclaimed != 1 {
		t.Fatalf("could not take the claim over: reclaimed=%d", reclaimed)
	}
	other, err := store.ClaimIntentToken(id, "work#2")
	if err != nil || other == "" {
		t.Fatalf("re-claim: token=%q err=%v", other, err)
	}

	select {
	case <-ctx.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("stale run was not cancelled after the takeover")
	}
	if cause := context.Cause(ctx); !errors.Is(cause, agent.AbortWorkClaimLost) {
		t.Fatalf("cancel cause=%v, want AbortWorkClaimLost", cause)
	}
	if err := store.HeartbeatIntentClaim(id, other); err != nil {
		t.Fatalf("new claimer lost its claim: %v", err)
	}
}
