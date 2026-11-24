package traffic

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestTrafficArchiveRoundTripAndCurrentRowWins(t *testing.T) {
	trafficDir := t.TempDir()
	tr, err := Open(trafficDir, "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()
	const (
		id   = "archive-exchange-1"
		host = "archive.example"
	)
	requestHead := "POST /v1/test HTTP/1.1\nHost: archive.example"
	responseHead := "HTTP/1.1 200 OK\nContent-Type: application/json"
	if _, err := tr.DB().Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, 1, host, "POST", "/v1/test", "https://archive.example/v1/test", 200,
		"application/json", 7, 11, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := tr.DB().Exec(`INSERT INTO exchange_bodies(id,req_head,req_body,resp_head,resp_body)
VALUES(?,?,?,?,?)`, id, requestHead, []byte("payload"), responseHead, []byte(`{"ok":true}`)); err != nil {
		t.Fatal(err)
	}

	archiveDir := filepath.Join(t.TempDir(), "traffic")
	count, err := tr.ExportHosts([]string{host, host}, archiveDir)
	if err != nil || count != 1 {
		t.Fatalf("ExportHosts count=%d err=%v", count, err)
	}
	if _, err := os.Stat(filepath.Join(archiveDir, "traffic.json")); err != nil {
		t.Fatal(err)
	}
	stage, err := tr.StageDeleteHostsExact([]string{host})
	if err != nil {
		t.Fatal(err)
	}
	if stage.Deleted() != 1 {
		t.Fatalf("staged deleted=%d, want 1", stage.Deleted())
	}
	if err := stage.Commit(); err != nil {
		t.Fatal(err)
	}
	if _, _, err := tr.Get(id); err == nil {
		t.Fatal("deleted exchange remained readable")
	}
	imported, err := tr.ImportArchive(archiveDir)
	if err != nil || imported != 1 {
		t.Fatalf("ImportArchive imported=%d err=%v", imported, err)
	}
	req, resp, err := tr.Get(id)
	if err != nil || !strings.Contains(req, "payload") || !strings.Contains(resp, `{"ok":true}`) {
		t.Fatalf("restored exchange req=%q resp=%q err=%v", req, resp, err)
	}
	if _, err := tr.DB().Exec(`UPDATE exchange_bodies SET resp_body=? WHERE id=?`, []byte(`{"current":true}`), id); err != nil {
		t.Fatal(err)
	}
	imported, err = tr.ImportArchive(archiveDir)
	if err != nil || imported != 0 {
		t.Fatalf("idempotent import imported=%d err=%v", imported, err)
	}
	_, resp, err = tr.Get(id)
	if err != nil || !strings.Contains(resp, `{"current":true}`) || strings.Contains(resp, `{"ok":true}`) {
		t.Fatalf("archive overwrote current exchange resp=%q err=%v", resp, err)
	}
}

func TestRecoverArchiveHostDeleteStageRollsBackBeforePostgresCommit(t *testing.T) {
	trafficDir := t.TempDir()
	tr, err := Open(trafficDir, "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()
	const host = "rollback-archive.example"
	insertArchiveRecoveryExchange(t, tr, "rollback-exchange", host)
	legacyDir := filepath.Join(trafficDir, sanitize(host))
	if err := os.MkdirAll(legacyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacyDir, "request.http"), []byte("request"), 0o600); err != nil {
		t.Fatal(err)
	}
	stage, err := tr.StageDeleteHostsExactForArchive([]string{host}, 17, 42)
	if err != nil {
		t.Fatal(err)
	}
	simulateTrafficStageProcessExit(t, stage)
	if err := tr.RecoverHostDeleteStages(func(id, taskID int64) (bool, error) {
		if id != 17 || taskID != 42 {
			t.Fatalf("archive id=%d task=%d, want 17/42", id, taskID)
		}
		return false, nil
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(legacyDir, "request.http")); err != nil {
		t.Fatalf("legacy traffic tree not restored: %v", err)
	}
	var count int
	if err := tr.DB().QueryRow(`SELECT count(*) FROM exchanges WHERE host=?`, host).Scan(&count); err != nil || count != 1 {
		t.Fatalf("exchange count=%d err=%v, want 1", count, err)
	}
}

func TestRecoverArchiveHostDeleteStageCompletesAfterPostgresCommit(t *testing.T) {
	trafficDir := t.TempDir()
	tr, err := Open(trafficDir, "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()
	const host = "committed-archive.example"
	insertArchiveRecoveryExchange(t, tr, "committed-exchange", host)
	legacyDir := filepath.Join(trafficDir, sanitize(host))
	if err := os.MkdirAll(legacyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	stage, err := tr.StageDeleteHostsExactForArchive([]string{host}, 18, 43)
	if err != nil {
		t.Fatal(err)
	}
	simulateTrafficStageProcessExit(t, stage)
	if err := tr.RecoverHostDeleteStages(func(id, taskID int64) (bool, error) { return id == 18 && taskID == 43, nil }); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(legacyDir); !os.IsNotExist(err) {
		t.Fatalf("committed legacy traffic tree remains: %v", err)
	}
	var count int
	if err := tr.DB().QueryRow(`SELECT count(*) FROM exchanges WHERE host=?`, host).Scan(&count); err != nil || count != 0 {
		t.Fatalf("exchange count=%d err=%v, want 0", count, err)
	}
}

func insertArchiveRecoveryExchange(t *testing.T, tr *Traffic, id, host string) {
	t.Helper()
	if _, err := tr.DB().Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, 1, host, "GET", "/", "https://"+host+"/", 200, "text/plain", 0, 0, ""); err != nil {
		t.Fatal(err)
	}
}

func simulateTrafficStageProcessExit(t *testing.T, stage *HostDeleteStage) {
	t.Helper()
	if err := stage.tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	stage.done = true
	stage.traffic.wmu.Unlock()
}

func callTrafficGetTool(t *testing.T, tr *Traffic, id string) string {
	t.Helper()
	for _, tool := range tr.Tools() {
		if tool.Name() != "traffic_get" {
			continue
		}
		res, err := tool.Call(context.Background(), json.RawMessage(`{"id":`+mustJSON(t, id)+`}`), nil)
		if err != nil {
			t.Fatalf("traffic_get(%s) error: %v", id, err)
		}
		if res.IsError {
			t.Fatalf("traffic_get(%s) tool error: %s", id, res.Flatten())
		}
		return res.Flatten()
	}
	t.Fatal("traffic_get tool not found")
	return ""
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestTrafficArchiveV2RewriteProvenanceRoundTripAndByteIdentical(t *testing.T) {
	src, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()

	const host = "v2-provenance.example"
	insertEx := func(id string, ts int64, urlPath string) {
		t.Helper()
		if _, err := src.DB().Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, ts, host, "GET", urlPath, "https://"+host+urlPath, 200, "text/plain", 0, 2, ""); err != nil {
			t.Fatal(err)
		}
		if _, err := src.DB().Exec(`INSERT INTO exchange_bodies(id,req_head,req_body,resp_head,resp_body)
VALUES(?,?,?,?,?)`, id, "GET "+urlPath+" HTTP/1.1\nHost: "+host, []byte{}, "HTTP/1.1 200 OK", []byte("ok")); err != nil {
			t.Fatal(err)
		}
	}

	// 1. Rewritten exchange with out-of-order + duplicate applied rule IDs plus skipped/error rows.
	insertEx("ex-rewritten", 10, "/rewritten")
	for seq, row := range []struct {
		phase   string
		ruleID  any
		outcome string
	}{
		{"request", 7, "applied"},
		{"request", 99, "skipped"},
		{"response", 2, "applied"},
		{"response", 7, "applied"},
		{"response", 88, "error"},
	} {
		if _, err := src.DB().Exec(`INSERT INTO exchange_rewrites(exchange_id,seq,phase,rule_id,rule_snapshot,outcome,reason)
VALUES(?,?,?,?,?,?,?)`, "ex-rewritten", seq, row.phase, row.ruleID, `{"id":1}`, row.outcome, ""); err != nil {
			t.Fatal(err)
		}
	}

	// 2. Rewritten exchange with applied row carrying NULL rule_id.
	insertEx("ex-rewritten-null-rule", 20, "/rewritten-null")
	if _, err := src.DB().Exec(`INSERT INTO exchange_rewrites(exchange_id,seq,phase,rule_id,outcome,reason)
VALUES('ex-rewritten-null-rule',0,'request',NULL,'applied','')`); err != nil {
		t.Fatal(err)
	}

	// 3. Exchange with only skipped/error rows -> NOT rewritten.
	insertEx("ex-skipped-only", 30, "/skipped")
	if _, err := src.DB().Exec(`INSERT INTO exchange_rewrites(exchange_id,seq,phase,rule_id,outcome,reason)
VALUES('ex-skipped-only',0,'request',5,'skipped','not rewritten: binary'),('ex-skipped-only',1,'response',6,'error','boom')`); err != nil {
		t.Fatal(err)
	}

	// 4. Plain original exchange with no rewrite rows.
	insertEx("ex-plain", 40, "/plain")

	export1Dir := filepath.Join(t.TempDir(), "export1")
	count, err := src.ExportHosts([]string{host}, export1Dir)
	if err != nil || count != 4 {
		t.Fatalf("ExportHosts = (%d, %v), want (4, nil)", count, err)
	}
	raw1, err := os.ReadFile(filepath.Join(export1Dir, "traffic.json"))
	if err != nil {
		t.Fatal(err)
	}
	var snap ArchiveSnapshot
	if err := json.Unmarshal(raw1, &snap); err != nil {
		t.Fatal(err)
	}
	if snap.Version != 2 {
		t.Fatalf("archive version = %d, want 2", snap.Version)
	}
	if len(snap.Exchanges) != 4 {
		t.Fatalf("archive exchanges = %d, want 4", len(snap.Exchanges))
	}
	if !snap.Exchanges[0].Rewritten || !slices.Equal(snap.Exchanges[0].RewriteRuleIDs, []int64{2, 7}) {
		t.Fatalf("ex-rewritten exported = (%v, %v), want (true, [2 7])", snap.Exchanges[0].Rewritten, snap.Exchanges[0].RewriteRuleIDs)
	}
	if !snap.Exchanges[1].Rewritten || len(snap.Exchanges[1].RewriteRuleIDs) != 0 {
		t.Fatalf("ex-rewritten-null-rule exported = (%v, %v), want (true, nil)", snap.Exchanges[1].Rewritten, snap.Exchanges[1].RewriteRuleIDs)
	}
	if snap.Exchanges[2].Rewritten || len(snap.Exchanges[2].RewriteRuleIDs) != 0 {
		t.Fatalf("ex-skipped-only exported = (%v, %v), want (false, nil)", snap.Exchanges[2].Rewritten, snap.Exchanges[2].RewriteRuleIDs)
	}
	if snap.Exchanges[3].Rewritten || len(snap.Exchanges[3].RewriteRuleIDs) != 0 {
		t.Fatalf("ex-plain exported = (%v, %v), want (false, nil)", snap.Exchanges[3].Rewritten, snap.Exchanges[3].RewriteRuleIDs)
	}

	// Import into a fresh store and verify RewriteInfo, reconstructed rows, traffic_get, and Page.
	dst, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer dst.Close()

	imported, err := dst.ImportArchive(export1Dir)
	if err != nil || imported != 4 {
		t.Fatalf("ImportArchive = (%d, %v), want (4, nil)", imported, err)
	}

	if rw, ids, err := dst.RewriteInfo("ex-rewritten"); err != nil || !rw || !slices.Equal(ids, []int64{2, 7}) {
		t.Fatalf("dst RewriteInfo(ex-rewritten) = (%v, %v, %v), want (true, [2 7], nil)", rw, ids, err)
	}
	if rw, ids, err := dst.RewriteInfo("ex-rewritten-null-rule"); err != nil || !rw || len(ids) != 0 {
		t.Fatalf("dst RewriteInfo(ex-rewritten-null-rule) = (%v, %v, %v), want (true, nil, nil)", rw, ids, err)
	}
	for _, id := range []string{"ex-skipped-only", "ex-plain"} {
		if rw, ids, err := dst.RewriteInfo(id); err != nil || rw || len(ids) != 0 {
			t.Fatalf("dst RewriteInfo(%s) = (%v, %v, %v), want (false, nil, nil)", id, rw, ids, err)
		}
	}

	// Reconstructed rows must not fabricate a rule_snapshot.
	var snapCount int
	if err := dst.DB().QueryRow(`SELECT COUNT(*) FROM exchange_rewrites WHERE exchange_id='ex-rewritten' AND rule_snapshot IS NOT NULL`).Scan(&snapCount); err != nil || snapCount != 0 {
		t.Fatalf("reconstructed rows should have NULL rule_snapshot, got count=%d err=%v", snapCount, err)
	}
	var phase, outcome string
	var rid sql.NullInt64
	if err := dst.DB().QueryRow(`SELECT phase, outcome, rule_id FROM exchange_rewrites WHERE exchange_id='ex-rewritten' AND seq=0`).Scan(&phase, &outcome, &rid); err != nil {
		t.Fatal(err)
	}
	if phase != "archived" || outcome != "applied" || !rid.Valid || rid.Int64 != 2 {
		t.Fatalf("reconstructed row 0 = (%q, %q, %+v), want ('archived', 'applied', 2)", phase, outcome, rid)
	}

	// traffic_get shows === REWRITTEN === for rewritten exchange and not for plain/skipped-only.
	if out := callTrafficGetTool(t, dst, "ex-rewritten"); !strings.HasPrefix(out, "=== REWRITTEN === rewrite rules [2 7] ") {
		t.Fatalf("traffic_get(ex-rewritten) = %q, want REWRITTEN header", out)
	}
	if out := callTrafficGetTool(t, dst, "ex-plain"); strings.Contains(out, "REWRITTEN") {
		t.Fatalf("traffic_get(ex-plain) unexpectedly contained REWRITTEN: %q", out)
	}
	if out := callTrafficGetTool(t, dst, "ex-skipped-only"); strings.Contains(out, "REWRITTEN") {
		t.Fatalf("traffic_get(ex-skipped-only) unexpectedly contained REWRITTEN: %q", out)
	}

	// Re-export from the imported store must be byte-identical.
	export2Dir := filepath.Join(t.TempDir(), "export2")
	if count2, err := dst.ExportHosts([]string{host}, export2Dir); err != nil || count2 != 4 {
		t.Fatalf("re-export ExportHosts = (%d, %v), want (4, nil)", count2, err)
	}
	raw2, err := os.ReadFile(filepath.Join(export2Dir, "traffic.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(raw1, raw2) {
		t.Fatalf("re-exported traffic.json differs:\nfirst:  %s\nsecond: %s", string(raw1), string(raw2))
	}

	// Re-importing over the original hot store must preserve the original live trace rows.
	if importedAgain, err := src.ImportArchive(export1Dir); err != nil || importedAgain != 0 {
		t.Fatalf("ImportArchive over hot store = (%d, %v), want (0, nil)", importedAgain, err)
	}
	var liveTraceRows int
	if err := src.DB().QueryRow(`SELECT COUNT(*) FROM exchange_rewrites WHERE exchange_id='ex-rewritten'`).Scan(&liveTraceRows); err != nil || liveTraceRows != 5 {
		t.Fatalf("hot store live trace rows = %d err=%v, want 5", liveTraceRows, err)
	}
}

func TestTrafficArchiveV1FixtureImportsWithoutRewritten(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "traffic")
	if err := os.MkdirAll(filepath.Join(dir, "blobs"), 0o700); err != nil {
		t.Fatal(err)
	}
	// v1 fixture: first entry is standard v1 without rewrite fields; second entry
	// tries to smuggle rewrite fields under version 1 and must still import as unrewritten.
	v1JSON := `{
		"version": 1,
		"exchanges": [
			{
				"id": "v1-plain",
				"ts": 100,
				"host": "legacy.example",
				"method": "GET",
				"url_template": "/legacy",
				"url": "https://legacy.example/legacy",
				"status": 200,
				"content_type": "text/plain",
				"req_len": 0,
				"resp_len": 2,
				"req_head": "GET /legacy HTTP/1.1\nHost: legacy.example",
				"resp_head": "HTTP/1.1 200 OK",
				"resp_body": "b2s="
			},
			{
				"id": "v1-ignored-fields",
				"ts": 101,
				"host": "legacy.example",
				"method": "GET",
				"url_template": "/legacy2",
				"url": "https://legacy.example/legacy2",
				"status": 200,
				"content_type": "text/plain",
				"req_len": 0,
				"resp_len": 2,
				"req_head": "GET /legacy2 HTTP/1.1\nHost: legacy.example",
				"resp_head": "HTTP/1.1 200 OK",
				"resp_body": "b2s=",
				"rewritten": true,
				"rewrite_rule_ids": [3, 9]
			}
		],
		"blobs": []
	}`
	if err := os.WriteFile(filepath.Join(dir, "traffic.json"), []byte(v1JSON), 0o600); err != nil {
		t.Fatal(err)
	}

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	imported, err := tr.ImportArchive(dir)
	if err != nil || imported != 2 {
		t.Fatalf("ImportArchive(v1) = (%d, %v), want (2, nil)", imported, err)
	}
	for _, id := range []string{"v1-plain", "v1-ignored-fields"} {
		if rw, ids, err := tr.RewriteInfo(id); err != nil || rw || len(ids) != 0 {
			t.Fatalf("v1 RewriteInfo(%s) = (%v, %v, %v), want (false, nil, nil)", id, rw, ids, err)
		}
		if out := callTrafficGetTool(t, tr, id); strings.Contains(out, "REWRITTEN") {
			t.Fatalf("v1 traffic_get(%s) unexpectedly has REWRITTEN: %q", id, out)
		}
	}
	rows, total, err := tr.Page(PageQuery{RespMin: -1, RespMax: -1}, 0, 10)
	if err != nil || total != 2 || len(rows) != 2 {
		t.Fatalf("Page after v1 import = (%d, %d, %v), want (2, 2, nil)", len(rows), total, err)
	}
	for _, r := range rows {
		if r.Rewritten {
			t.Fatalf("v1 row %s marked rewritten", r.ID)
		}
	}
}

func TestTrafficArchiveUnknownVersionRefused(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	for _, ver := range []int{-1, 0, 3, 99} {
		dir := filepath.Join(t.TempDir(), "traffic")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		payload := mustJSON(t, ArchiveSnapshot{Version: ver})
		if err := os.WriteFile(filepath.Join(dir, "traffic.json"), []byte(payload), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := tr.ImportArchive(dir); err == nil || !strings.Contains(err.Error(), "unsupported traffic archive version") {
			t.Fatalf("ImportArchive(version=%d) err = %v, want unsupported version error", ver, err)
		}
	}
}
