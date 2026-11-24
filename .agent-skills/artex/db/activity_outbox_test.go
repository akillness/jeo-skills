package db

import "testing"

func TestActivityOutboxKeepsDetail(t *testing.T) {
	in := Activity{Worker: "worker", Kind: "tool_result", Summary: "done", Detail: "full body", IsError: true}
	raw, err := marshalActivity(in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := unmarshalActivity(raw)
	if err != nil {
		t.Fatal(err)
	}
	if out.Detail != in.Detail || out.Summary != in.Summary || out.Worker != in.Worker || out.Kind != in.Kind || !out.IsError {
		t.Fatalf("round trip = %+v", out)
	}
}

func TestFlushActivityOutboxReplaysOnce(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { _ = d.Close() })
	expID, err := d.CreateExploration("outbox", "replay")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM activity_outbox WHERE exploration_id=$1`, expID)
		_, _ = d.Exec(`DELETE FROM explorations WHERE id=$1`, expID)
	})
	es := d.Exploration(expID)
	if err := es.EnqueueActivity(Activity{Worker: "worker", Kind: "text", Summary: "kept", Detail: "body"}, "insert failed"); err != nil {
		t.Fatal(err)
	}
	n, err := es.FlushActivityOutbox()
	if err != nil || n != 1 {
		t.Fatalf("flush n=%d err=%v", n, err)
	}
	var activities, queued int
	if err := d.QueryRow(`SELECT count(*) FROM activity WHERE exploration_id=$1 AND summary='kept'`, expID).Scan(&activities); err != nil {
		t.Fatal(err)
	}
	if err := d.QueryRow(`SELECT count(*) FROM activity_outbox WHERE exploration_id=$1`, expID).Scan(&queued); err != nil {
		t.Fatal(err)
	}
	if activities != 1 || queued != 0 {
		t.Fatalf("activities=%d outbox=%d, want 1 and 0", activities, queued)
	}
	if n, err = es.FlushActivityOutbox(); err != nil || n != 0 {
		t.Fatalf("second flush n=%d err=%v", n, err)
	}
	if err := d.QueryRow(`SELECT count(*) FROM activity WHERE exploration_id=$1 AND summary='kept'`, expID).Scan(&activities); err != nil {
		t.Fatal(err)
	}
	if activities != 1 {
		t.Fatalf("activities=%d after a second flush, want 1", activities)
	}
}

func TestFlushActivityOutboxDropsStuckRow(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { _ = d.Close() })
	const missing = int64(9_000_000_000_001)
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM activity_outbox WHERE exploration_id=$1`, missing) })
	es := d.Exploration(missing)
	if err := es.EnqueueActivity(Activity{Worker: "worker", Kind: "text", Summary: "stuck"}, "no parent"); err != nil {
		t.Fatal(err)
	}
	for attempt := 1; attempt < activityOutboxMaxAttempts; attempt++ {
		n, err := es.FlushActivityOutbox()
		if err != nil || n != 0 {
			t.Fatalf("attempt %d: n=%d err=%v", attempt, n, err)
		}
		var queued int
		if err := d.QueryRow(`SELECT count(*) FROM activity_outbox WHERE exploration_id=$1`, missing).Scan(&queued); err != nil {
			t.Fatal(err)
		}
		if queued != 1 {
			t.Fatalf("attempt %d: outbox rows=%d, want the stuck row kept", attempt, queued)
		}
	}
	n, err := es.FlushActivityOutbox()
	if err != nil || n != 0 {
		t.Fatalf("final flush n=%d err=%v", n, err)
	}
	var queued int
	if err := d.QueryRow(`SELECT count(*) FROM activity_outbox WHERE exploration_id=$1`, missing).Scan(&queued); err != nil {
		t.Fatal(err)
	}
	if queued != 0 {
		t.Fatalf("outbox rows=%d, want the stuck row dropped", queued)
	}
}
