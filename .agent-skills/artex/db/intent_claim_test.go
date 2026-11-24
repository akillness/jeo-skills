package db

import (
	"database/sql"
	"errors"
	"sync"
	"testing"
	"time"
)

// openClaimInstances opens the test database twice — two application instances
// sharing one database — and returns each instance's store for a fresh
// exploration.
func openClaimInstances(t *testing.T) (*DB, *ExplorationStore, *ExplorationStore) {
	t.Helper()
	dsn := testDSN(t)
	a, err := Open(dsn)
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { a.Close() })
	b, err := Open(dsn)
	if err != nil {
		t.Fatalf("open second instance: %v", err)
	}
	t.Cleanup(func() { b.Close() })
	expID, err := a.CreateExploration("intent claim lease", "heartbeat, expiry and fencing")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { a.Exec(`DELETE FROM explorations WHERE id=$1`, expID) })
	return a, a.Exploration(expID), b.Exploration(expID)
}

func addClaimIntent(t *testing.T, store *ExplorationStore) int64 {
	t.Helper()
	id, err := store.AddIntent(map[string]any{"summary": "leased"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func claimIntentToken(t *testing.T, store *ExplorationStore, id int64, owner string) string {
	t.Helper()
	token, err := store.ClaimIntentToken(id, owner)
	if err != nil || token == "" {
		t.Fatalf("claim by %s: token=%q err=%v", owner, token, err)
	}
	return token
}

// ageClaimHeartbeat moves the intent's last heartbeat age into the past, on the
// database clock the expiry check uses.
func ageClaimHeartbeat(t *testing.T, d *DB, id int64, age time.Duration) {
	t.Helper()
	if _, err := d.Exec(`UPDATE exploration_nodes SET last_heartbeat_at = now() - $2 * INTERVAL '1 second' WHERE id=$1`, id, age.Seconds()); err != nil {
		t.Fatal(err)
	}
}

type claimRow struct {
	state         string
	token         sql.NullString
	blockedReason sql.NullString
	heartbeatAge  sql.NullFloat64 // seconds since last_heartbeat_at; NULL when never set
}

func readClaimRow(t *testing.T, d *DB, id int64) claimRow {
	t.Helper()
	var row claimRow
	if err := d.QueryRow(`SELECT state, unclaim_token, blocked_reason, EXTRACT(EPOCH FROM now() - last_heartbeat_at)::float8
FROM exploration_nodes WHERE id=$1`, id).Scan(&row.state, &row.token, &row.blockedReason, &row.heartbeatAge); err != nil {
		t.Fatal(err)
	}
	return row
}

func mustResetRunning(t *testing.T, store *ExplorationStore, want int64) {
	t.Helper()
	n, err := store.ResetRunningIntents()
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Fatalf("ResetRunningIntents reclaimed %d intents, want %d", n, want)
	}
}

func TestIntentClaimLiveClaimIsNotReclaimed(t *testing.T) {
	d, a, b := openClaimInstances(t)
	id := addClaimIntent(t, a)
	token := claimIntentToken(t, a, id, "work#1")

	row := readClaimRow(t, d, id)
	if row.state != "running" || row.token.String != token || !row.heartbeatAge.Valid {
		t.Fatalf("claim did not start a lease: %+v", row)
	}

	// Neither the claiming instance nor a second instance on the same database
	// may take a live claim over, by reset or by a fresh claim.
	mustResetRunning(t, a, 0)
	mustResetRunning(t, b, 0)
	if other, err := b.ClaimIntentToken(id, "work#2"); err != nil || other != "" {
		t.Fatalf("second instance claimed a live intent: token=%q err=%v", other, err)
	}

	// Still live just inside the TTL.
	ageClaimHeartbeat(t, d, id, IntentClaimTTL-10*time.Second)
	mustResetRunning(t, b, 0)

	row = readClaimRow(t, d, id)
	if row.state != "running" || row.token.String != token {
		t.Fatalf("live claim changed: %+v, want running with token %q", row, token)
	}
	if err := a.HeartbeatIntentClaim(id, token); err != nil {
		t.Fatalf("heartbeat of the live claimer: %v", err)
	}
}

func TestIntentClaimExpiredClaimIsReclaimed(t *testing.T) {
	d, a, b := openClaimInstances(t)
	id := addClaimIntent(t, a)
	old := claimIntentToken(t, a, id, "work#1")

	ageClaimHeartbeat(t, d, id, IntentClaimTTL+time.Second)
	mustResetRunning(t, b, 1)

	row := readClaimRow(t, d, id)
	if row.state != "open" || row.token.Valid {
		t.Fatalf("expired claim not released: %+v, want open with no token", row)
	}
	fresh := claimIntentToken(t, b, id, "work#2")
	if fresh == old {
		t.Fatal("re-claim reused the previous unclaim token")
	}
	mustResetRunning(t, a, 0) // the new claim is live
}

// A row claimed before the lease columns existed has neither a heartbeat nor a
// token; SetIntentState produces exactly that shape. It counts as expired.
func TestIntentClaimLegacyRunningRowIsReclaimed(t *testing.T) {
	d, a, b := openClaimInstances(t)
	id := addClaimIntent(t, a)
	if err := a.SetIntentState(id, "running"); err != nil {
		t.Fatal(err)
	}
	row := readClaimRow(t, d, id)
	if row.heartbeatAge.Valid || row.token.Valid {
		t.Fatalf("legacy fixture carries lease data: %+v", row)
	}

	mustResetRunning(t, b, 1)
	if row = readClaimRow(t, d, id); row.state != "open" {
		t.Fatalf("legacy running row state=%q, want open", row.state)
	}
	claimIntentToken(t, b, id, "work#1")
}

func TestIntentClaimHeartbeatExtendsLease(t *testing.T) {
	d, a, b := openClaimInstances(t)
	id := addClaimIntent(t, a)
	token := claimIntentToken(t, a, id, "work#1")

	// Past the TTL but not yet taken over: the claimer's heartbeat renews it.
	ageClaimHeartbeat(t, d, id, IntentClaimTTL+time.Second)
	if err := a.HeartbeatIntentClaim(id, token); err != nil {
		t.Fatalf("heartbeat: %v", err)
	}
	mustResetRunning(t, b, 0)

	row := readClaimRow(t, d, id)
	if row.state != "running" || row.token.String != token {
		t.Fatalf("heartbeat did not keep the claim: %+v", row)
	}
	if !row.heartbeatAge.Valid || row.heartbeatAge.Float64 > 30 {
		t.Fatalf("last_heartbeat_at not renewed: age=%+v", row.heartbeatAge)
	}

	// Without a further heartbeat the same claim does expire.
	ageClaimHeartbeat(t, d, id, IntentClaimTTL+time.Second)
	mustResetRunning(t, b, 1)
}

func TestIntentClaimStaleWorkerIsFencedAfterReclaim(t *testing.T) {
	d, a, b := openClaimInstances(t)
	id := addClaimIntent(t, a)
	stale := claimIntentToken(t, a, id, "work#1")

	ageClaimHeartbeat(t, d, id, IntentClaimTTL+time.Second)
	mustResetRunning(t, b, 1)

	assertFenced := func(when string) {
		t.Helper()
		before := readClaimRow(t, d, id)
		if err := a.HeartbeatIntentClaim(id, stale); !errors.Is(err, ErrIntentClaimLost) {
			t.Fatalf("%s: stale heartbeat err=%v, want ErrIntentClaimLost", when, err)
		}
		if err := a.SettleIntentClaim(id, stale, "done"); !errors.Is(err, ErrIntentClaimLost) {
			t.Fatalf("%s: stale result write err=%v, want ErrIntentClaimLost", when, err)
		}
		if err := a.SettleIntentClaimBlocked(id, stale, IntentBlockedLLMQuota); !errors.Is(err, ErrIntentClaimLost) {
			t.Fatalf("%s: stale blocked write err=%v, want ErrIntentClaimLost", when, err)
		}
		after := readClaimRow(t, d, id)
		if after.state != before.state || after.token != before.token || after.blockedReason != before.blockedReason {
			t.Fatalf("%s: a rejected stale write changed the intent: %+v -> %+v", when, before, after)
		}
	}
	assertFenced("after takeover, before the re-claim")

	current := claimIntentToken(t, b, id, "work#2")
	ageClaimHeartbeat(t, d, id, time.Minute)
	assertFenced("after the re-claim")
	if row := readClaimRow(t, d, id); row.state != "running" || row.token.String != current || row.heartbeatAge.Float64 < 50 {
		t.Fatalf("stale worker touched the new claim: %+v", row)
	}

	// The current claimer is unaffected and its result write releases the claim.
	if err := b.HeartbeatIntentClaim(id, current); err != nil {
		t.Fatalf("current claimer heartbeat: %v", err)
	}
	if err := b.SettleIntentClaim(id, current, "done"); err != nil {
		t.Fatalf("current claimer result write: %v", err)
	}
	if row := readClaimRow(t, d, id); row.state != "done" || row.token.Valid {
		t.Fatalf("settled intent: %+v, want done with no token", row)
	}
	if err := b.SettleIntentClaim(id, current, "blocked"); !errors.Is(err, ErrIntentClaimLost) {
		t.Fatalf("second settle with a released token err=%v, want ErrIntentClaimLost", err)
	}
}

func TestSettleIntentClaimBlockedAndStateConflict(t *testing.T) {
	d, a, _ := openClaimInstances(t)

	blocked := addClaimIntent(t, a)
	token := claimIntentToken(t, a, blocked, "work#1")
	if err := a.SettleIntentClaimBlocked(blocked, token, IntentBlockedLLMQuota); err != nil {
		t.Fatal(err)
	}
	if row := readClaimRow(t, d, blocked); row.state != "blocked" || row.blockedReason.String != IntentBlockedLLMQuota || row.token.Valid {
		t.Fatalf("blocked settle: %+v", row)
	}

	// The token is still current but the intent left 'running' through an
	// unfenced path: that is a state conflict, not a lost claim.
	moved := addClaimIntent(t, a)
	token = claimIntentToken(t, a, moved, "work#1")
	if err := a.SetIntentState(moved, "paused"); err != nil {
		t.Fatal(err)
	}
	err := a.SettleIntentClaim(moved, token, "done")
	if !errors.Is(err, ErrIntentStateConflict) || errors.Is(err, ErrIntentClaimLost) {
		t.Fatalf("settle of a non-running intent err=%v, want ErrIntentStateConflict", err)
	}
	if row := readClaimRow(t, d, moved); row.state != "paused" {
		t.Fatalf("rejected settle changed the state to %q", row.state)
	}
}

func TestClaimPausedIntentTokenStartsLease(t *testing.T) {
	d, a, b := openClaimInstances(t)
	id := addClaimIntent(t, a)
	first := claimIntentToken(t, a, id, "work#1")
	if err := a.SettleIntentClaim(id, first, "paused"); err != nil {
		t.Fatal(err)
	}
	ageClaimHeartbeat(t, d, id, IntentClaimTTL+time.Second) // the paused intent's old heartbeat is stale

	token, err := a.ClaimPausedIntentToken(id)
	if err != nil || token == "" || token == first {
		t.Fatalf("claim paused: token=%q first=%q err=%v", token, first, err)
	}
	if again, err := b.ClaimPausedIntentToken(id); err != nil || again != "" {
		t.Fatalf("second paused claim: token=%q err=%v, want none", again, err)
	}
	mustResetRunning(t, b, 0)
	if row := readClaimRow(t, d, id); row.state != "running" || row.token.String != token {
		t.Fatalf("paused claim: %+v", row)
	}
	if err := a.SettleIntentClaim(id, first, "done"); !errors.Is(err, ErrIntentClaimLost) {
		t.Fatalf("previous run's token err=%v, want ErrIntentClaimLost", err)
	}
}

// A heartbeat racing a takeover of the same expired claim must have exactly one
// winner: either the claim is renewed and stays, or it is taken over and the
// heartbeat is rejected. Both succeeding would be a stolen live claim.
func TestIntentClaimTakeoverRacesHeartbeatAtomically(t *testing.T) {
	d, a, b := openClaimInstances(t)
	id := addClaimIntent(t, a)
	token := claimIntentToken(t, a, id, "work#1")

	var renewed, takenOver int
	for round := 0; round < 40; round++ {
		ageClaimHeartbeat(t, d, id, IntentClaimTTL+time.Second)
		var heartbeatErr, resetErr error
		var reclaimed int64
		var wg sync.WaitGroup
		start := make(chan struct{})
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			heartbeatErr = a.HeartbeatIntentClaim(id, token)
		}()
		go func() {
			defer wg.Done()
			<-start
			reclaimed, resetErr = b.ResetRunningIntents()
		}()
		close(start)
		wg.Wait()
		if resetErr != nil {
			t.Fatal(resetErr)
		}
		row := readClaimRow(t, d, id)
		switch {
		case heartbeatErr == nil && reclaimed == 0:
			renewed++
			if row.state != "running" || row.token.String != token {
				t.Fatalf("round %d: renewed claim is %+v", round, row)
			}
		case errors.Is(heartbeatErr, ErrIntentClaimLost) && reclaimed == 1:
			takenOver++
			if row.state != "open" || row.token.Valid {
				t.Fatalf("round %d: taken-over claim is %+v", round, row)
			}
			token = claimIntentToken(t, a, id, "work#1")
		default:
			t.Fatalf("round %d: heartbeat err=%v with %d reclaimed, want exactly one winner", round, heartbeatErr, reclaimed)
		}
	}
	t.Logf("heartbeat won %d rounds, takeover won %d rounds", renewed, takenOver)
}

// The lease columns reach existing installs through schema.sql, which runs on
// every startup. This replays it on a table stripped back to its pre-upgrade
// shape, inside a transaction that is always rolled back.
func TestIntentClaimColumnsMigrateIdempotently(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()

	tx, err := d.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback() //nolint:errcheck // the test never commits

	if _, err := tx.Exec(`ALTER TABLE exploration_nodes DROP COLUMN IF EXISTS last_heartbeat_at, DROP COLUMN IF EXISTS unclaim_token`); err != nil {
		t.Fatalf("simulate old table: %v", err)
	}
	var legacy int64
	if err := tx.QueryRow(`
WITH exp AS (INSERT INTO explorations(description, goal) VALUES ('legacy', 'pre-lease install') RETURNING id)
INSERT INTO exploration_nodes(exploration_id, kind, state, owner)
SELECT id, 'intent', 'running', 'work#1' FROM exp RETURNING id`).Scan(&legacy); err != nil {
		t.Fatalf("insert legacy running intent: %v", err)
	}

	for run := 1; run <= 2; run++ {
		if _, err := tx.Exec(schemaSQL); err != nil {
			t.Fatalf("schema run %d: %v", run, err)
		}
		for col, typ := range map[string]string{"last_heartbeat_at": "timestamp with time zone", "unclaim_token": "text"} {
			var dataType, nullable string
			if err := tx.QueryRow(`SELECT data_type, is_nullable FROM information_schema.columns
WHERE table_schema=current_schema() AND table_name='exploration_nodes' AND column_name=$1`, col).Scan(&dataType, &nullable); err != nil {
				t.Fatalf("schema run %d: column %s: %v", run, col, err)
			}
			if dataType != typ || nullable != "YES" {
				t.Fatalf("schema run %d: column %s is %s nullable=%s, want %s nullable", run, col, dataType, nullable, typ)
			}
		}
		var checks int
		if err := tx.QueryRow(`SELECT count(*) FROM pg_constraint
WHERE conrelid='exploration_nodes'::regclass AND contype='c'
  AND (pg_get_constraintdef(oid) LIKE '%last_heartbeat_at%' OR pg_get_constraintdef(oid) LIKE '%unclaim_token%')`).Scan(&checks); err != nil {
			t.Fatal(err)
		}
		if checks != 0 {
			t.Fatalf("schema run %d: %d CHECK constraints on the lease columns, want none", run, checks)
		}
		var state string
		var heartbeat sql.NullTime
		var token sql.NullString
		if err := tx.QueryRow(`SELECT state, last_heartbeat_at, unclaim_token FROM exploration_nodes WHERE id=$1`, legacy).Scan(&state, &heartbeat, &token); err != nil {
			t.Fatal(err)
		}
		if state != "running" || heartbeat.Valid || token.Valid {
			t.Fatalf("schema run %d: legacy row state=%q heartbeat=%v token=%v, want running with NULL lease columns", run, state, heartbeat, token)
		}
	}
}
