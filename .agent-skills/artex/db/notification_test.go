package db

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Autumn-27/artex/notify"
)

// Every case in this file connects to a real PostgreSQL (skipped when unavailable).
// These SQL statements use FOR UPDATE SKIP LOCKED, make_interval, JSONB, and multi-row
// IN(...) placeholder splicing — all "compiles fine but may fail at runtime" constructs
// that only count as verified when actually run.

func notifyTestDB(t *testing.T) *DB {
	t.Helper()
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

// newTestChannel creates a channel, automatically deleted when the test ends.
func newTestChannel(t *testing.T, d *DB, kind, mode string, filter string) *NotificationChannel {
	t.Helper()
	if filter == "" {
		filter = `{}`
	}
	ch := &NotificationChannel{
		Name:       "test-channel-" + t.Name(),
		Kind:       kind,
		Mode:       mode,
		Config:     json.RawMessage(`{"webhook":"https://example.com/hook"}`),
		Filter:     json.RawMessage(filter),
		RatePerMin: 100,
	}
	id, err := d.SaveNotificationChannel(context.Background(), ch)
	if err != nil {
		t.Fatalf("failed to create channel: %v", err)
	}
	t.Cleanup(func() { d.Exec(`DELETE FROM notification_channels WHERE id=$1`, id) })
	ch.ID = id
	return ch
}

// addTestEvent writes one event directly (no finding), for testing fan-out and delivery.
func addTestEvent(t *testing.T, d *DB, kind string, findingID int64, snap notify.Snapshot) int64 {
	t.Helper()
	snap.Kind = kind
	snap.FindingID = findingID
	id, err := d.AddNotificationEvent(context.Background(), kind, findingID, snap)
	if err != nil {
		t.Fatalf("failed to write event: %v", err)
	}
	t.Cleanup(func() { d.Exec(`DELETE FROM notification_events WHERE id=$1`, id) })
	return id
}

func TestNotificationAssetNamesResolvesAndPreservesOrder(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	// Three asset types each have their own display field: domain, IP, URL.
	insertAsset := func(query, value string) int64 {
		t.Helper()
		var id int64
		if err := d.QueryRow(query, value).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	domID := insertAsset(`INSERT INTO assets(type, domain) VALUES('subdomain',$1) RETURNING id`, "a.example.com")
	ipID := insertAsset(`INSERT INTO assets(type, ip) VALUES('ip',$1) RETURNING id`, "10.1.2.3")
	svcID := insertAsset(`INSERT INTO assets(type, url) VALUES('service',$1) RETURNING id`, "https://a.example.com/admin")
	t.Cleanup(func() {
		d.Exec(`DELETE FROM assets WHERE id IN ($1,$2,$3)`, domID, ipID, svcID)
	})

	// Input order is deliberately shuffled and includes one nonexistent id.
	got, err := d.NotificationAssetNames(ctx, []int64{svcID, 999999999, domID, ipID, svcID})
	if err != nil {
		t.Fatalf("failed to resolve asset names: %v", err)
	}
	want := []string{"https://a.example.com/admin", "a.example.com", "10.1.2.3"}
	if len(got) != len(want) {
		t.Fatalf("asset name count mismatch, want %v got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order/value mismatch, want %v got %v", want, got)
		}
	}
}

// TestRecordNotificationEventTxUnwindsOnFailure is the core case for the savepoint
// mechanism: inside a transaction, make the notification_events insert guaranteed to
// fail (by temporarily adding an always-false constraint), then assert ① the function
// reports false ② the transaction did not enter the aborted state and later statements still run.
//
// Without the savepoint, PostgreSQL would void the whole transaction and every later
// statement would fail with "current transaction is aborted" — exactly the failure path
// of "a notification-table problem keeps findings out of the database".
//
// This deliberately ends with **ROLLBACK instead of COMMIT**: ALTER TABLE is transactional
// in PG, and once committed the temporary constraint would stay in the schema permanently,
// breaking every later case. Rolling back undoes the DDL automatically, no manual cleanup
// needed. The assertion only needs "the transaction is still alive", not a real commit.
func TestRecordNotificationEventTxUnwindsOnFailure(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	// Defensive cleanup: if a previous run left this constraint behind, drop it first.
	if _, err := d.Exec(`ALTER TABLE notification_events DROP CONSTRAINT IF EXISTS notify_test_never`); err != nil {
		t.Fatal(err)
	}

	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback() //nolint:errcheck // undoes the temporary constraint; see the function comment

	// NOT VALID: constrains only rows written afterwards, without validating historical
	// events already in the database (otherwise violating existing rows would block the constraint).
	if _, err := tx.ExecContext(ctx, `ALTER TABLE notification_events ADD CONSTRAINT notify_test_never CHECK (false) NOT VALID`); err != nil {
		t.Fatalf("failed to add temporary constraint: %v", err)
	}
	if RecordNotificationEventTx(ctx, tx, notify.EventFindingCreated, 1, notify.Snapshot{Severity: "high"}) {
		t.Fatal("reported write success under a constraint that must fail")
	}
	// Key assertion: the transaction is still usable.
	var one int
	if err := tx.QueryRowContext(ctx, `SELECT 1`).Scan(&one); err != nil {
		t.Fatalf("transaction was polluted (savepoint did not work): %v", err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback failed: %v", err)
	}
	// Confirm the DDL was undone by the rollback, leaving no landmine for later cases.
	var exists bool
	if err := d.QueryRow(`SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='notify_test_never')`).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("temporary constraint was not undone by rollback; would pollute later cases")
	}
}

func TestFanOutRoutesEventsByFilter(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	all := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{}`)
	onlyCritical := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{"min_severity":"critical"}`)
	sqlOnly := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{"vulnclass_include":["SQL"]}`)

	highSQL := addTestEvent(t, d, notify.EventFindingCreated, 1001, notify.Snapshot{Severity: "high", VulnClass: "SQL injection"})
	lowXSS := addTestEvent(t, d, notify.EventFindingCreated, 1002, notify.Snapshot{Severity: "low", VulnClass: "XSS"})
	criticalXSS := addTestEvent(t, d, notify.EventFindingCreated, 1003, notify.Snapshot{Severity: "critical", VulnClass: "XSS"})

	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatalf("fan-out failed: %v", err)
	}

	cases := []struct {
		name    string
		eventID int64
		channel int64
		want    bool
	}{
		{"accept-all channel receives high", highSQL, all.ID, true},
		{"accept-all channel receives low", lowXSS, all.ID, true},
		{"critical-only channel skips high", highSQL, onlyCritical.ID, false},
		{"critical-only channel receives critical", criticalXSS, onlyCritical.ID, true},
		{"SQL-only channel receives SQL", highSQL, sqlOnly.ID, true},
		{"SQL-only channel skips XSS", lowXSS, sqlOnly.ID, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var exists bool
			if err := d.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM notification_deliveries WHERE event_id=$1 AND channel_id=$2)`,
				tc.eventID, tc.channel).Scan(&exists); err != nil {
				t.Fatal(err)
			}
			if exists != tc.want {
				t.Fatalf("delivery existence: want %v got %v", tc.want, exists)
			}
		})
	}

	// Fanning out again must not create duplicate deliveries (fanned_out is idempotent).
	events, deliveries, err := d.FanOutPendingEvents(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	if events != 0 || deliveries != 0 {
		t.Fatalf("dispatched events must not be processed again, got events=%d deliveries=%d", events, deliveries)
	}
}

// TestFanOutMarksEventsWithNoMatchingChannel covers the "event hits no channel" case.
// Such events must still be marked as dispatched, otherwise they stay in the undispatched
// set forever and get rescanned every tick.
func TestFanOutMarksEventsWithNoMatchingChannel(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()
	pick := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{"vulnclass_include":["never-matching-class"]}`)
	_ = pick

	ev := addTestEvent(t, d, notify.EventFindingCreated, 2001, notify.Snapshot{Severity: "high", VulnClass: "XSS"})
	_, deliveries, err := d.FanOutPendingEvents(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	if deliveries != 0 {
		t.Fatalf("must not create deliveries, got %d", deliveries)
	}
	var fanned bool
	if err := d.QueryRowContext(ctx, `SELECT fanned_out FROM notification_events WHERE id=$1`, ev).Scan(&fanned); err != nil {
		t.Fatal(err)
	}
	if !fanned {
		t.Fatal("an event hitting no channel must still be marked dispatched, otherwise it is rescanned forever")
	}
}

func TestClaimRealtimeDeliveriesHonorsLeaseAndMode(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	realtime := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{}`)
	digest := newTestChannel(t, d, notify.KindDingTalk, NotifyModeDigest, `{}`)

	addTestEvent(t, d, notify.EventFindingCreated, 3001, notify.Snapshot{Severity: "high", VulnClass: "XSS"})
	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatal(err)
	}

	// A realtime claim must only get the realtime channel's row, never the digest channel's.
	got, err := d.ClaimRealtimeDeliveries(ctx, realtime.ID, 10, time.Minute)
	if err != nil {
		t.Fatalf("claim failed: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("should claim 1 row, got %d", len(got))
	}
	if got[0].State != NotifyStateSending || got[0].Attempts != 1 {
		t.Fatalf("after claim should be sending with attempts=1, got state=%s attempts=%d", got[0].State, got[0].Attempts)
	}
	// The join-loaded render context must be complete (channel config + event snapshot + finding id).
	if got[0].Channel == nil || len(got[0].Channel.Config) == 0 {
		t.Fatal("claim result lacks channel config; rendering would fail")
	}
	if got[0].FindingID != 3001 {
		t.Fatalf("finding id not carried from the event, got %d", got[0].FindingID)
	}

	// The lease has not expired, so a second claim must be empty — this is the guarantee
	// that "the same row is never delivered by two dispatchers at once".
	again, err := d.ClaimRealtimeDeliveries(ctx, realtime.ID, 10, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 0 {
		t.Fatalf("must not re-claim within the lease, got %d rows", len(again))
	}

	// A realtime claim must not touch the digest channel's deliveries.
	left, err := d.ClaimRealtimeDeliveries(ctx, digest.ID, 10, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(left) != 0 {
		t.Fatalf("realtime claim must not get digest channel deliveries, got %d rows", len(left))
	}
}

// TestClaimExpiredLeaseRecovers covers crash self-healing: a process dying mid-delivery
// leaves a sending row, which must be claimable again once the lease expires, otherwise
// that delivery is stuck forever.
func TestClaimExpiredLeaseRecovers(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()
	ch := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{}`)
	addTestEvent(t, d, notify.EventFindingCreated, 4001, notify.Snapshot{Severity: "high"})
	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatal(err)
	}
	first, err := d.ClaimRealtimeDeliveries(ctx, ch.ID, 10, time.Minute)
	if err != nil || len(first) != 1 {
		t.Fatalf("first claim failed: %v (%d rows)", err, len(first))
	}
	// Manually push the lease into the past to simulate "lease expired".
	if _, err := d.Exec(`UPDATE notification_deliveries SET next_attempt_at = now() - interval '1 minute' WHERE id=$1`, first[0].ID); err != nil {
		t.Fatal(err)
	}
	second, err := d.ClaimRealtimeDeliveries(ctx, ch.ID, 10, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(second) != 1 {
		t.Fatalf("a sending row with an expired lease must be re-claimable, got %d rows", len(second))
	}
	if second[0].Attempts != 2 {
		t.Fatalf("re-claiming must accumulate the attempt count, got %d", second[0].Attempts)
	}
}

func TestClaimSkipsDisabledChannel(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()
	ch := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{}`)
	addTestEvent(t, d, notify.EventFindingCreated, 5001, notify.Snapshot{Severity: "high"})
	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatal(err)
	}
	// Disabling marks existing pending deliveries as skipped as well.
	if err := d.SetNotificationChannelEnabled(ctx, ch.ID, false); err != nil {
		t.Fatal(err)
	}
	var state string
	if err := d.QueryRow(`SELECT state FROM notification_deliveries WHERE channel_id=$1`, ch.ID).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != NotifyStateSkipped {
		t.Fatalf("a disabled channel's existing pending deliveries must be marked skipped, got %s", state)
	}
	got, err := d.ClaimRealtimeDeliveries(ctx, ch.ID, 10, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("a disabled channel must not be claimable, got %d rows", len(got))
	}
}

func TestDigestBatchDueAndStableBatchID(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()
	ch := newTestChannel(t, d, notify.KindDingTalk, NotifyModeDigest, `{}`)
	for i := 0; i < 3; i++ {
		addTestEvent(t, d, notify.EventFindingCreated, int64(6000+i), notify.Snapshot{Severity: "high"})
	}
	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatal(err)
	}

	// The batch was just created with age 0; under a 30-minute period it must not be due.
	due, err := d.DigestBatchDue(ctx, ch.ID, 30*time.Minute)
	if err != nil {
		t.Fatalf("failed to judge batch due: %v", err)
	}
	if due {
		t.Fatal("a freshly created batch must not be immediately due")
	}

	// Age all three deliveries together to simulate a batch that has filled a full period.
	if _, err := d.Exec(`UPDATE notification_deliveries SET created_at = now() - interval '40 minutes' WHERE channel_id=$1`, ch.ID); err != nil {
		t.Fatal(err)
	}
	due, err = d.DigestBatchDue(ctx, ch.ID, 30*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if !due {
		t.Fatal("a batch older than the period must be judged due")
	}

	batch, err := d.ClaimDigestBatch(ctx, ch.ID, MaxDigestBatchSize, time.Minute)
	if err != nil {
		t.Fatalf("failed to claim digest batch: %v", err)
	}
	if len(batch) != 3 {
		t.Fatalf("a digest should claim all 3 rows at once, got %d rows", len(batch))
	}
	if batch[0].BatchID == nil {
		t.Fatal("a digest batch must write batch_id, otherwise history cannot tell these rows went out together")
	}
	firstBatchID := *batch[0].BatchID
	for _, dl := range batch {
		if dl.BatchID == nil || *dl.BatchID != firstBatchID {
			t.Fatalf("one batch must share batch_id, got %v vs %d", dl.BatchID, firstBatchID)
		}
	}

	// After the **whole** batch fails, is rescheduled, and is claimed again, batch_id must
	// keep its original value (that is what COALESCE does): otherwise one retry erases the
	// fact that "this batch went out together".
	//
	// The whole batch must be rescheduled, not just one row — that is exactly how the
	// delivery engine handles digest messages (one message represents the whole batch,
	// succeeding or failing together). Rescheduling only one row would leave the rest
	// inside their lease, and the re-claim would naturally get only that one row.
	allIDs := make([]int64, 0, len(batch))
	for _, dl := range batch {
		allIDs = append(allIDs, dl.ID)
	}
	if err := d.RescheduleDeliveries(ctx, allIDs, time.Second, "simulated failure"); err != nil {
		t.Fatal(err)
	}
	// Push the lease into the past to simulate the backoff having elapsed.
	if _, err := d.Exec(`UPDATE notification_deliveries SET next_attempt_at = now() - interval '1 minute' WHERE channel_id=$1`, ch.ID); err != nil {
		t.Fatal(err)
	}
	reclaimed, err := d.ClaimDigestBatch(ctx, ch.ID, MaxDigestBatchSize, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(reclaimed) != 3 {
		t.Fatalf("re-claim should get all 3 rows, got %d", len(reclaimed))
	}
	if reclaimed[0].BatchID == nil || *reclaimed[0].BatchID != firstBatchID {
		t.Fatalf("batch_id must keep its original value %d after retry, got %v", firstBatchID, reclaimed[0].BatchID)
	}
}

func TestDeliveryStateTransitions(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()
	ch := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{}`)
	addTestEvent(t, d, notify.EventFindingCreated, 7001, notify.Snapshot{Severity: "high"})
	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatal(err)
	}
	got, err := d.ClaimRealtimeDeliveries(ctx, ch.ID, 10, time.Minute)
	if err != nil || len(got) != 1 {
		t.Fatalf("claim failed: %v (%d)", err, len(got))
	}
	id := got[0].ID

	if err := d.RescheduleDeliveries(ctx, []int64{id}, time.Second, "network jitter"); err != nil {
		t.Fatal(err)
	}
	var state, lastErr string
	if err := d.QueryRow(`SELECT state, last_error FROM notification_deliveries WHERE id=$1`, id).Scan(&state, &lastErr); err != nil {
		t.Fatal(err)
	}
	if state != NotifyStatePending || lastErr != "network jitter" {
		t.Fatalf("after reschedule should be pending with the reason recorded, got state=%s err=%q", state, lastErr)
	}

	if err := d.FailDeliveries(ctx, []int64{id}, "retries exhausted"); err != nil {
		t.Fatal(err)
	}
	if err := d.QueryRow(`SELECT state FROM notification_deliveries WHERE id=$1`, id).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != NotifyStateFailed {
		t.Fatalf("should be failed, got %s", state)
	}

	// Manual resend must zero the retry counter and become due immediately, otherwise it
	// would inherit the old failure budget.
	if err := d.RetryNotificationDelivery(ctx, id); err != nil {
		t.Fatalf("resend failed: %v", err)
	}
	var attempts int
	var next time.Time
	if err := d.QueryRow(`SELECT state, attempts, next_attempt_at FROM notification_deliveries WHERE id=$1`, id).Scan(&state, &attempts, &next); err != nil {
		t.Fatal(err)
	}
	if state != NotifyStatePending || attempts != 0 {
		t.Fatalf("after resend should be pending with attempts=0, got state=%s attempts=%d", state, attempts)
	}
	if next.After(time.Now().Add(time.Second)) {
		t.Fatal("resend should be immediately claimable")
	}

	// A delivered delivery must not be resendable.
	if err := d.MarkDeliveriesSent(ctx, []int64{id}); err != nil {
		t.Fatal(err)
	}
	if err := d.RetryNotificationDelivery(ctx, id); err == nil {
		t.Fatal("a delivered delivery must not allow resending")
	}
}

func TestListNotificationDeliveriesPagingAndFilter(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()
	ch := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{}`)
	for i := 0; i < 5; i++ {
		addTestEvent(t, d, notify.EventFindingCreated, int64(8000+i), notify.Snapshot{Severity: "high", Name: "paging test"})
	}
	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ClaimRealtimeDeliveries(ctx, ch.ID, 10, time.Minute); err != nil {
		t.Fatal(err)
	}

	page1, total, err := d.ListNotificationDeliveries(ctx, NotificationDeliveryFilter{ChannelID: ch.ID, State: NotifyStateSending}, 1, 2)
	if err != nil {
		t.Fatalf("query failed: %v", err)
	}
	if total != 5 {
		t.Fatalf("total should be 5, got %d", total)
	}
	if len(page1) != 2 {
		t.Fatalf("2 rows per page, got %d", len(page1))
	}
	// Newest first: the first id on page 1 must be greater than the first id on page 2.
	page2, _, err := d.ListNotificationDeliveries(ctx, NotificationDeliveryFilter{ChannelID: ch.ID, State: NotifyStateSending}, 2, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(page2) != 2 || page2[0].ID >= page1[0].ID {
		t.Fatalf("paging order should be newest first, got page1[0]=%d page2[0]=%d", page1[0].ID, page2[0].ID)
	}
	// The render context must come back with the history, otherwise the list cannot show "what was pushed".
	if page1[0].ChannelName == "" || page1[0].FindingID == 0 {
		t.Fatalf("history item lacks display fields: %+v", page1[0])
	}

	// Filter by state: there are no pending ones.
	pending, totalPending, err := d.ListNotificationDeliveries(ctx, NotificationDeliveryFilter{ChannelID: ch.ID, State: NotifyStatePending}, 1, 50)
	if err != nil {
		t.Fatal(err)
	}
	if totalPending != 0 || len(pending) != 0 {
		t.Fatalf("there must be no pending deliveries, got %d rows (total=%d)", len(pending), totalPending)
	}
}

func TestSetFindingStatusWithNotifyOnlyEmitsOnRealChange(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	tk, err := d.CreateTask("notification status change test", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(tk.ID) })
	es := d.Exploration(tk.ExplorationID)
	f, err := es.RecordFinding(ctx, RecordFindingInput{
		TaskID: tk.ID, Worker: "test", VulnClass: "SQL injection", Name: "status change case",
		Severity: "high", Summary: "summary",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM notification_events WHERE finding_id=$1`, f.FindingID)
		_, _ = d.DeleteFinding(f.FindingID)
	})

	// Writing the finding already registered one finding_created event; count it as the baseline.
	var base int
	if err := d.QueryRow(`SELECT count(*) FROM notification_events WHERE finding_id=$1`, f.FindingID).Scan(&base); err != nil {
		t.Fatal(err)
	}
	if base < 1 {
		t.Fatal("writing a finding should register one delivery event in the same transaction")
	}

	// Change to the same status: must not produce an event (avoid push noise from duplicate submissions).
	from, found, notified, err := d.SetFindingStatusWithNotify(ctx, f.FindingID, "pending")
	if err != nil || !found {
		t.Fatalf("status set failed: found=%v err=%v", found, err)
	}
	if notified {
		t.Fatal("no delivery event should be registered when the status did not change")
	}
	if from != "pending" {
		t.Fatalf("should return the pre-change status pending, got %q", from)
	}

	// A real change: an event must be registered with from/to recorded.
	from, found, notified, err = d.SetFindingStatusWithNotify(ctx, f.FindingID, "fixed")
	if err != nil || !found {
		t.Fatalf("status set failed: found=%v err=%v", found, err)
	}
	if !notified {
		t.Fatal("a delivery event should be registered when the status actually changes")
	}
	if from != "pending" {
		t.Fatalf("from should be pending, got %q", from)
	}
	var snapshot []byte
	if err := d.QueryRow(`SELECT snapshot FROM notification_events WHERE finding_id=$1 AND kind=$2`,
		f.FindingID, notify.EventFindingStatusChanged).Scan(&snapshot); err != nil {
		t.Fatalf("status change event not found: %v", err)
	}
	var snap notify.Snapshot
	if err := json.Unmarshal(snapshot, &snap); err != nil {
		t.Fatal(err)
	}
	if snap.FromStatus != "pending" || snap.ToStatus != "fixed" {
		t.Fatalf("wrong status transition in snapshot: %s → %s", snap.FromStatus, snap.ToStatus)
	}
	// The snapshot must carry the fields needed for rendering, otherwise the status-change message is an empty shell.
	if snap.VulnClass != "SQL injection" || snap.Severity != "high" || snap.Name != "status change case" {
		t.Fatalf("snapshot lacks render fields: %+v", snap)
	}
	var status string
	if err := d.QueryRow(`SELECT status FROM findings WHERE id=$1`, f.FindingID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "fixed" {
		t.Fatalf("status should have been updated to fixed, got %s", status)
	}

	// Nonexistent finding: found=false, no error.
	if _, found, _, err := d.SetFindingStatusWithNotify(ctx, 999999999, "fixed"); err != nil || found {
		t.Fatalf("a nonexistent finding should return found=false with no error, got found=%v err=%v", found, err)
	}
}

// A bulk update is one transaction with a per-id result: unknown ids are
// reported, not fatal, and a second call is a no-op that emits no event.
func TestSetFindingStatusesWithNotify(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	tk, err := d.CreateTask("bulk status test", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(tk.ID) })
	es := d.Exploration(tk.ExplorationID)
	record := func(name string) int64 {
		fi, err := es.RecordFinding(ctx, RecordFindingInput{
			TaskID: tk.ID, Worker: "test", VulnClass: "XSS", Name: name,
			Severity: "medium", Summary: "summary",
		})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_, _ = d.Exec(`DELETE FROM notification_events WHERE finding_id=$1`, fi.FindingID)
			_, _ = d.DeleteFinding(fi.FindingID)
		})
		return fi.FindingID
	}
	first, second := record("bulk one"), record("bulk two")
	const missingID = int64(999999999)

	results, err := d.SetFindingStatusesWithNotify(ctx, []int64{first, second, missingID}, FindingConfirmed)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 3 {
		t.Fatalf("want 3 results, got %d", len(results))
	}
	for i, want := range []int64{first, second} {
		r := results[i]
		if r.ID != want || !r.Found || !r.Changed || !r.Notified || r.From != FindingPending {
			t.Fatalf("result %d: %+v", i, r)
		}
	}
	if r := results[2]; r.Found || r.Changed || r.Notified {
		t.Fatalf("a missing id should be found=false with no change: %+v", r)
	}
	for _, id := range []int64{first, second} {
		var status string
		if err := d.QueryRow(`SELECT status FROM findings WHERE id=$1`, id).Scan(&status); err != nil || status != FindingConfirmed {
			t.Fatalf("finding %d status = %q (%v)", id, status, err)
		}
		var events int
		if err := d.QueryRow(`SELECT count(*) FROM notification_events WHERE finding_id=$1 AND kind=$2`, id, notify.EventFindingStatusChanged).Scan(&events); err != nil || events != 1 {
			t.Fatalf("finding %d status events = %d (%v)", id, events, err)
		}
	}

	// Same status again: no change, so no push.
	again, err := d.SetFindingStatusesWithNotify(ctx, []int64{first}, FindingConfirmed)
	if err != nil || len(again) != 1 {
		t.Fatalf("second batch: %v %v", again, err)
	}
	if again[0].Changed || again[0].Notified {
		t.Fatalf("a no-op batch should neither change nor notify: %+v", again[0])
	}
}

func TestNotificationStatsSnapshot(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()
	ch := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{}`)
	addTestEvent(t, d, notify.EventFindingCreated, 9001, notify.Snapshot{Severity: "high"})
	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatal(err)
	}
	stats, err := d.NotificationStatsSnapshot(ctx)
	if err != nil {
		t.Fatalf("stats failed: %v", err)
	}
	if stats.Channels < 1 || stats.ChannelsOn < 1 {
		t.Fatalf("wrong channel counts: %+v", stats)
	}
	if stats.Pending < 1 {
		t.Fatalf("should count pending deliveries: %+v", stats)
	}
	// A freshly created delivery's backlog age should be near 0, not negative or huge.
	if stats.BacklogAgeMS < 0 || stats.BacklogAgeMS > int64(time.Hour/time.Millisecond) {
		t.Fatalf("invalid backlog age: %d ms", stats.BacklogAgeMS)
	}
	_ = ch
}

func TestNotificationChannelCRUDRoundTrip(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	ch := &NotificationChannel{
		Name:       "CRUD roundtrip",
		Kind:       notify.KindEmail,
		Mode:       NotifyModeDigest,
		Config:     json.RawMessage(`{"host":"smtp.example.com","port":587,"from":"a@b.c","to":["x@y.z"]}`),
		Filter:     json.RawMessage(`{"min_severity":"medium","on_status_change":true}`),
		RatePerMin: 42,
	}
	id, err := d.SaveNotificationChannel(ctx, ch)
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	t.Cleanup(func() { d.Exec(`DELETE FROM notification_channels WHERE id=$1`, id) })

	got, err := d.NotificationChannelByID(ctx, id)
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if got.Mode != NotifyModeDigest || got.RatePerMin != 42 || got.Name != "CRUD roundtrip" {
		t.Fatalf("round-trip fields inconsistent: %+v", got)
	}
	if !got.IsEnabled() {
		t.Fatal("should be enabled by default")
	}
	var cfg map[string]any
	if err := json.Unmarshal(got.Config, &cfg); err != nil {
		t.Fatal(err)
	}
	if cfg["host"] != "smtp.example.com" {
		t.Fatalf("config not persisted correctly: %v", cfg)
	}
	var filter notify.Filter
	if err := json.Unmarshal(got.Filter, &filter); err != nil {
		t.Fatal(err)
	}
	if filter.MinSeverity != "medium" || !filter.OnStatusChange {
		t.Fatalf("filter not persisted correctly: %+v", filter)
	}

	// Read again after an update.
	got.Name = "renamed"
	off := false
	got.Enabled = &off
	if _, err := d.SaveNotificationChannel(ctx, got); err != nil {
		t.Fatal(err)
	}
	after, err := d.NotificationChannelByID(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if after.Name != "renamed" || after.IsEnabled() {
		t.Fatalf("update did not take effect: %+v", after)
	}

	// After deletion it should report "not found" instead of silently succeeding.
	if err := d.DeleteNotificationChannel(ctx, id); err != nil {
		t.Fatal(err)
	}
	if _, err := d.NotificationChannelByID(ctx, id); err != ErrNotificationChannelNotFound {
		t.Fatalf("want ErrNotificationChannelNotFound, got %v", err)
	}
	if err := d.DeleteNotificationChannel(ctx, id); err != ErrNotificationChannelNotFound {
		t.Fatalf("repeated delete should report not found, got %v", err)
	}
}

// TestSaveNotificationChannelKeepsExplicitZeroRate pins down a place that was once
// written wrong: **0 is a valid configuration meaning "no rate limit", and the db layer
// must not treat it as "unspecified" and overwrite it with a default**.
//
// Historical bug: SaveNotificationChannel had `if RatePerMin <= 0 { use default }`, so
// while the docs, the UI hint, and takeTokens all interpreted "0=unlimited", the write
// layer alone silently changed it to 20 (DingTalk/WeCom/Telegram) or 100 (Feishu) —
// operators thought they had lifted the limit while actually being capped, with no hint
// at all. Only the request body can express the difference between "unspecified" and
// "explicit 0", so the default is filled in the server layer (see notifyCreateChannel);
// the db layer just stores.
func TestSaveNotificationChannelKeepsExplicitZeroRate(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	// Explicit 0 (no rate limit): must be stored as-is.
	unlimited := &NotificationChannel{
		Name: "no rate limit", Kind: notify.KindDingTalk, RatePerMin: 0,
		Config: json.RawMessage(`{"webhook":"https://example.com/h"}`),
	}
	id, err := d.SaveNotificationChannel(ctx, unlimited)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Exec(`DELETE FROM notification_channels WHERE id=$1`, id) })
	got, err := d.NotificationChannelByID(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if got.RatePerMin != 0 {
		t.Fatalf("explicit 0 means unlimited and must be stored as-is, got %d", got.RatePerMin)
	}
	if got.Mode != NotifyModeRealtime {
		t.Fatalf("default mode should be realtime, got %s", got.Mode)
	}

	// A negative value is invalid input and must be rejected, not silently rewritten.
	bad := &NotificationChannel{
		Name: "negative rate limit", Kind: notify.KindDingTalk, RatePerMin: -1,
		Config: json.RawMessage(`{"webhook":"https://example.com/h"}`),
	}
	if _, err := d.SaveNotificationChannel(ctx, bad); err == nil {
		t.Fatal("a negative rate limit should be rejected")
	}
}

// TestDeleteChannelCascadesDeliveries pins down the foreign-key behavior: deleting a
// channel removes its delivery history too (with the config gone, the history is
// uninterpretable), but the events themselves must stay — they may still be referenced
// by other channels.
func TestDeleteChannelCascadesDeliveries(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()
	ch := newTestChannel(t, d, notify.KindDingTalk, NotifyModeRealtime, `{}`)
	ev := addTestEvent(t, d, notify.EventFindingCreated, 9101, notify.Snapshot{Severity: "high"})
	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatal(err)
	}
	var before int
	if err := d.QueryRow(`SELECT count(*) FROM notification_deliveries WHERE channel_id=$1`, ch.ID).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if before == 0 {
		t.Fatal("precondition not met: no deliveries created")
	}
	if err := d.DeleteNotificationChannel(ctx, ch.ID); err != nil {
		t.Fatal(err)
	}
	var after int
	if err := d.QueryRow(`SELECT count(*) FROM notification_deliveries WHERE channel_id=$1`, ch.ID).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if after != 0 {
		t.Fatalf("a channel's deliveries should cascade-delete with it; %d rows remain", after)
	}
	var evExists bool
	if err := d.QueryRow(`SELECT EXISTS(SELECT 1 FROM notification_events WHERE id=$1)`, ev).Scan(&evExists); err != nil {
		t.Fatal(err)
	}
	if !evExists {
		t.Fatal("deleting a channel must not delete the event itself")
	}
}

// TestClaimDigestBatchHonorsCallerLimit covers a gap found in audit: digest channels
// used to bypass the token bucket entirely — allow was deducted by takeTokens but never
// used, so rate_per_min did nothing in digest mode. Now limit also participates.
func TestClaimDigestBatchHonorsCallerLimit(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()
	ch := newTestChannel(t, d, notify.KindDingTalk, NotifyModeDigest, `{}`)
	for i := 0; i < 10; i++ {
		addTestEvent(t, d, notify.EventFindingCreated, int64(7000+i), notify.Snapshot{Severity: "high"})
	}
	if _, _, err := d.FanOutPendingEvents(ctx, 100); err != nil {
		t.Fatal(err)
	}
	// Take limit=3: only 3 rows may be claimed; the rest stay in the database.
	got, err := d.ClaimDigestBatch(ctx, ch.ID, 3, time.Minute)
	if err != nil {
		t.Fatalf("claim failed: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("should claim only 3 rows per the caller's rate allowance, got %d", len(got))
	}
	// limit=0 means this round's allowance is exhausted: claim nothing, and no error.
	if got, err := d.ClaimDigestBatch(ctx, ch.ID, 0, time.Minute); err != nil || len(got) != 0 {
		t.Fatalf("with 0 allowance should claim 0 rows without error, got %d rows err=%v", len(got), err)
	}
}

// TestFinishFindingRetestEmitsStatusChange covers an integrity gap found in audit:
// when a retest concludes "fixed", the status does change, but that UPDATE wrote
// directly, bypassing the notifying version — so channels configured with
// on_status_change never got pushes for this kind of transition; the status quietly
// changed in the UI and ops only found out when they opened the platform.
//
// This case pins down "every status-changing path must register a status-change event".
func TestFinishFindingRetestEmitsStatusChange(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	tk, err := d.CreateTask("retest push test", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(tk.ID) })
	es := d.Exploration(tk.ExplorationID)
	f, err := es.RecordFinding(ctx, RecordFindingInput{
		TaskID: tk.ID, Worker: "test", VulnClass: "SQL injection", Name: "retest target",
		Severity: "high", Summary: "summary",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM notification_events WHERE finding_id=$1`, f.FindingID)
		_, _ = d.DeleteFinding(f.FindingID)
	})

	// Create a retest record and drive it straight to completion.
	rt, _, _, err := d.CreateFindingRetest(ctx, f.FindingID, "review")
	if err != nil {
		t.Fatal(err)
	}
	if rt.ConversationID == nil {
		t.Fatal("a retest should be associated with a session")
	}
	retestConvID := *rt.ConversationID
	t.Cleanup(func() { _ = d.DeleteConversation(retestConvID) })
	// A retest must enter running before a verdict can land (consistent with the real flow).
	if ok, err := d.StartFindingRetest(ctx, rt.ID); err != nil || !ok {
		t.Fatalf("failed to start retest: ok=%v err=%v", ok, err)
	}
	if err := d.RecordFindingRetestResult(ctx, *rt.ConversationID, "fixed", "Fixed", "evidence"); err != nil {
		t.Fatal(err)
	}
	if err := d.FinishFindingRetest(rt.ID, "completed", ""); err != nil {
		t.Fatalf("failed to finish retest: %v", err)
	}

	var status string
	if err := d.QueryRow(`SELECT status FROM findings WHERE id=$1`, f.FindingID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != FindingFixed {
		t.Fatalf("status should be fixed after the retest judged fixed, got %s", status)
	}

	// Key assertion: there must be a status-change event with correct from/to.
	var snapshot []byte
	err = d.QueryRow(`SELECT snapshot FROM notification_events WHERE finding_id=$1 AND kind=$2 ORDER BY id DESC LIMIT 1`,
		f.FindingID, notify.EventFindingStatusChanged).Scan(&snapshot)
	if err != nil {
		t.Fatalf("a retest judging fixed should register a status-change delivery event (otherwise channels with on_status_change never hear about it): %v", err)
	}
	var snap notify.Snapshot
	if err := json.Unmarshal(snapshot, &snap); err != nil {
		t.Fatal(err)
	}
	if snap.FromStatus != "pending" || snap.ToStatus != FindingFixed {
		t.Fatalf("wrong status transition in snapshot: %s → %s", snap.FromStatus, snap.ToStatus)
	}
	// The snapshot must carry the fields needed for rendering, otherwise the push is an empty shell.
	if snap.Name != "retest target" || snap.Severity != "high" {
		t.Fatalf("snapshot lacks render fields: %+v", snap)
	}
}
