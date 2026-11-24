package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"slices"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestTrafficSnapshotIDExcludesRewriteFlag(t *testing.T) {
	base := TrafficEvidenceSnapshot{
		SourceTrafficID: "tr-100",
		CapturedAt:      1700000000,
		URL:             "https://target.example/login",
		Method:          "POST",
		Status:          200,
		ContentType:     "application/json",
		ReqHead:         "POST /login HTTP/1.1\nHost: target.example\n",
		RespHead:        "HTTP 200\nContent-Type: application/json\n",
		ReqHash:         strings.Repeat("a", 64),
		RespHash:        strings.Repeat("b", 64),
		ReqLen:          42,
		RespLen:         128,
	}

	idPlain := TrafficSnapshotID(base)

	withFlag := base
	withFlag.Rewritten = true
	withFlag.RewriteRuleIDs = []int64{1, 2}
	if got := TrafficSnapshotID(withFlag); got != idPlain {
		t.Fatalf("TrafficSnapshotID changed with Rewritten=true/ids=[1,2]: got %s want %s", got, idPlain)
	}

	withOtherRules := base
	withOtherRules.Rewritten = true
	withOtherRules.RewriteRuleIDs = []int64{99, 42, 7}
	if got := TrafficSnapshotID(withOtherRules); got != idPlain {
		t.Fatalf("TrafficSnapshotID changed with different rule ids: got %s want %s", got, idPlain)
	}

	// Simulate an older binary whose TrafficEvidenceSnapshot struct did not have
	// Rewritten or RewriteRuleIDs: it must marshal to the exact same hash.
	type legacyTrafficEvidenceSnapshot struct {
		ID              string    `json:"id"`
		SourceTrafficID string    `json:"source_traffic_id"`
		CapturedAt      int64     `json:"captured_at"`
		URL             string    `json:"url"`
		Method          string    `json:"method"`
		Status          int       `json:"status"`
		ContentType     string    `json:"content_type"`
		ReqHead         string    `json:"req_head,omitempty"`
		RespHead        string    `json:"resp_head,omitempty"`
		ReqHash         string    `json:"req_hash"`
		RespHash        string    `json:"resp_hash"`
		ReqLen          int64     `json:"req_len"`
		RespLen         int64     `json:"resp_len"`
		CreatedAt       time.Time `json:"created_at"`
	}
	norm := base.Normalize()
	legacy := legacyTrafficEvidenceSnapshot{
		SourceTrafficID: norm.SourceTrafficID,
		CapturedAt:      norm.CapturedAt,
		URL:             norm.URL,
		Method:          norm.Method,
		Status:          norm.Status,
		ContentType:     norm.ContentType,
		ReqHead:         norm.ReqHead,
		RespHead:        norm.RespHead,
		ReqHash:         norm.ReqHash,
		RespHash:        norm.RespHash,
		ReqLen:          norm.ReqLen,
		RespLen:         norm.RespLen,
	}
	raw, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(raw)
	wantLegacy := hex.EncodeToString(sum[:])
	if idPlain != wantLegacy {
		t.Fatalf("TrafficSnapshotID = %s, old-version hash = %s", idPlain, wantLegacy)
	}
}

func TestEvidenceRewriteFlagMigrationAndRoundTrip(t *testing.T) {
	dsn := scratchDSN(t, "ev_rewrite")

	// Build an FS containing migrations 0001..0007 (pre-0008 database).
	pre0008 := fstest.MapFS{}
	entries, err := fs.ReadDir(migrationsFS(), ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.IsDir() || e.Name() >= "0008_" {
			continue
		}
		data, err := fs.ReadFile(migrationsFS(), e.Name())
		if err != nil {
			t.Fatal(err)
		}
		pre0008[e.Name()] = &fstest.MapFile{Data: data}
	}

	d0, err := openWithMigrations(dsn, pre0008)
	if err != nil {
		t.Fatalf("open pre-0008: %v", err)
	}
	task, err := d0.CreateTask("ev-rewrite-mig", "verify 0008", nil, 0, 0)
	if err != nil {
		d0.Close()
		t.Fatal(err)
	}
	legacySnap := TrafficEvidenceSnapshot{
		SourceTrafficID: "tr-pre-0008",
		CapturedAt:      1700000001,
		URL:             "https://legacy.example/a",
		Method:          "GET",
		Status:          200,
		ContentType:     "text/plain",
		ReqHead:         "GET /a HTTP/1.1\nHost: legacy.example\n",
		RespHead:        "HTTP 200\n",
		ReqHash:         strings.Repeat("1", 64),
		RespHash:        strings.Repeat("2", 64),
	}
	legacySnap.ID = TrafficSnapshotID(legacySnap)

	var legacyFindingID int64
	if err := d0.WithEvidenceTx(context.Background(), func(tx *sql.Tx) error {
		rec, err := RecordFindingTx(context.Background(), tx, RecordFindingInput{
			TaskID: task.ID, ExplorationID: task.ExplorationID, Worker: "test",
			VulnClass: "TEST", Name: "pre-0008 finding", Severity: "low", Summary: "legacy row",
		}, nil)
		if err != nil {
			return err
		}
		legacyFindingID = rec.FindingID
		if _, err := tx.Exec(`INSERT INTO traffic_evidence_snapshots
(id,source_traffic_id,captured_at,url,method,status,content_type,req_head,resp_head,req_hash,resp_hash,req_len,resp_len)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
			legacySnap.ID, legacySnap.SourceTrafficID, legacySnap.CapturedAt, legacySnap.URL, legacySnap.Method,
			legacySnap.Status, legacySnap.ContentType, legacySnap.ReqHead, legacySnap.RespHead,
			legacySnap.ReqHash, legacySnap.RespHash, legacySnap.ReqLen, legacySnap.RespLen); err != nil {
			return err
		}
		_, err = tx.Exec(`INSERT INTO finding_traffic_bindings(finding_id,snapshot_id,role,note,position) VALUES($1,$2,'proof','pre-0008',0)`,
			legacyFindingID, legacySnap.ID)
		return err
	}); err != nil {
		d0.Close()
		t.Fatalf("seed pre-0008 snapshot: %v", err)
	}
	d0.Close()

	// Re-open with full embedded migrations: 0008 must apply cleanly.
	d, err := Open(dsn)
	if err != nil {
		t.Fatalf("Open with 0008: %v", err)
	}
	defer d.Close()
	assertEmbeddedApplied(t, d)

	// Existing pre-0008 row reads rewritten=false and empty rewrite_rule_ids.
	ftLegacy, err := d.GetFindingTraffic(context.Background(), legacyFindingID)
	if err != nil {
		t.Fatal(err)
	}
	if len(ftLegacy.Bindings) != 1 {
		t.Fatalf("legacy bindings = %d, want 1", len(ftLegacy.Bindings))
	}
	gotLegacy := ftLegacy.Bindings[0].Snapshot
	if gotLegacy.Rewritten || len(gotLegacy.RewriteRuleIDs) != 0 {
		t.Fatalf("pre-0008 snapshot = rewritten:%v ids:%v, want false/empty", gotLegacy.Rewritten, gotLegacy.RewriteRuleIDs)
	}

	// New snapshot with Rewritten=true and unsorted/duplicate rule IDs round-trips cleanly
	// through InsertEvidenceSnapshotTx and FindingTrafficTx while preserving sealed heads.
	rewrittenSnap := TrafficEvidenceSnapshot{
		SourceTrafficID: "tr-rewritten-1",
		CapturedAt:      1700000002,
		URL:             "https://rewritten.example/item",
		Method:          "POST",
		Status:          201,
		ContentType:     "application/json",
		ReqHead:         "POST /item HTTP/1.1\nAuthorization: Bearer topsecret\n",
		RespHead:        "HTTP 201\nSet-Cookie: sid=topsecret\n",
		ReqHash:         strings.Repeat("3", 64),
		RespHash:        strings.Repeat("4", 64),
		ReqLen:          10,
		RespLen:         20,
		Rewritten:       true,
		RewriteRuleIDs:  []int64{9, 2, 9, 5},
	}
	rewrittenSnap.ID = TrafficSnapshotID(rewrittenSnap)

	var rewrittenFindingID int64
	if err := d.WithEvidenceTx(context.Background(), func(tx *sql.Tx) error {
		rec, err := RecordFindingTx(context.Background(), tx, RecordFindingInput{
			TaskID: task.ID, ExplorationID: task.ExplorationID, Worker: "test",
			VulnClass: "TEST", Name: "rewritten finding", Severity: "medium", Summary: "post-0008",
		}, []PreparedTrafficEvidence{{
			Ref:      TrafficRef{TrafficID: rewrittenSnap.SourceTrafficID, Role: "proof", Note: "rewritten"},
			Snapshot: rewrittenSnap,
		}})
		if err != nil {
			return err
		}
		rewrittenFindingID = rec.FindingID
		return nil
	}); err != nil {
		t.Fatalf("record rewritten snapshot: %v", err)
	}

	ft, err := d.GetFindingTraffic(context.Background(), rewrittenFindingID)
	if err != nil {
		t.Fatal(err)
	}
	if len(ft.Bindings) != 1 {
		t.Fatalf("rewritten bindings = %d, want 1", len(ft.Bindings))
	}
	got := ft.Bindings[0].Snapshot
	if !got.Rewritten || !slices.Equal(got.RewriteRuleIDs, []int64{2, 5, 9}) {
		t.Fatalf("round-tripped snapshot = rewritten:%v ids:%v, want true [2 5 9]", got.Rewritten, got.RewriteRuleIDs)
	}
	if got.ID != rewrittenSnap.ID || TrafficSnapshotID(got) != got.ID {
		t.Fatalf("snapshot ID mismatch: got=%s want=%s recomputed=%s", got.ID, rewrittenSnap.ID, TrafficSnapshotID(got))
	}
	if got.ReqHead != rewrittenSnap.ReqHead || got.RespHead != rewrittenSnap.RespHead {
		t.Fatalf("heads mismatch after round-trip: req=%q resp=%q", got.ReqHead, got.RespHead)
	}
}
