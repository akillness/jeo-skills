package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic"
)

func TestGetTrafficRewrittenFlagAndFilter(t *testing.T) {
	tr, err := traffic.Open(t.TempDir(), ":0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { tr.Close() })

	insertEx := func(id string, ts int64, host string, status int) {
		t.Helper()
		if _, err := tr.DB().Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, ts, host, "GET", "/"+id, "https://"+host+"/"+id, status, "application/json", 0, 12, ""); err != nil {
			t.Fatal(err)
		}
	}

	insertEx("rw-alpha-200", 10, "alpha.example", 200)
	insertEx("rw-beta-404", 20, "beta.example", 404)
	insertEx("orig-alpha-200", 30, "alpha.example", 200)
	insertEx("skip-alpha-404", 40, "alpha.example", 404)

	if _, err := tr.DB().Exec(`INSERT INTO exchange_rewrites(exchange_id,seq,phase,rule_id,outcome) VALUES
('rw-alpha-200',0,'request',1,'applied'),
('rw-beta-404',0,'response',2,'applied'),
('skip-alpha-404',0,'request',3,'skipped')`); err != nil {
		t.Fatal(err)
	}

	s := &Server{m: &Manager{traffic: tr}}

	type respPayload struct {
		Count     int                  `json:"count"`
		Total     int                  `json:"total"`
		Exchanges []TrafficExchangeDTO `json:"exchanges"`
	}
	fetch := func(query string) (respPayload, []map[string]any) {
		t.Helper()
		w := httptest.NewRecorder()
		s.getTraffic(w, httptest.NewRequest(http.MethodGet, "/api/traffic"+query, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("GET /api/traffic%s status=%d body=%s", query, w.Code, w.Body.String())
		}
		var out respPayload
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		var raw struct {
			Exchanges []map[string]any `json:"exchanges"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
			t.Fatal(err)
		}
		return out, raw.Exchanges
	}

	// Default (absent) and rewritten=all return all 4 exchanges and each row carries explicit "rewritten" bool.
	for _, q := range []string{"", "?rewritten=all"} {
		res, rawRows := fetch(q)
		if res.Count != 4 || res.Total != 4 || len(res.Exchanges) != 4 {
			t.Fatalf("query %q count=%d total=%d len=%d, want 4/4/4", q, res.Count, res.Total, len(res.Exchanges))
		}
		flags := map[string]bool{}
		for i, row := range res.Exchanges {
			if _, ok := rawRows[i]["rewritten"].(bool); !ok {
				t.Fatalf("query %q row %s missing boolean rewritten field: %v", q, row.ID, rawRows[i])
			}
			flags[row.ID] = row.Rewritten
		}
		if !flags["rw-alpha-200"] || !flags["rw-beta-404"] || flags["orig-alpha-200"] || flags["skip-alpha-404"] {
			t.Fatalf("query %q flags=%v", q, flags)
		}
	}

	// Filter rewritten (true and canonical "rewritten").
	for _, q := range []string{"?rewritten=true", "?rewritten=rewritten"} {
		res, _ := fetch(q)
		if res.Count != 4 || res.Total != 2 || len(res.Exchanges) != 2 {
			t.Fatalf("query %q count=%d total=%d len=%d, want 4/2/2", q, res.Count, res.Total, len(res.Exchanges))
		}
		ids := []string{res.Exchanges[0].ID, res.Exchanges[1].ID}
		slices.Sort(ids)
		if !slices.Equal(ids, []string{"rw-alpha-200", "rw-beta-404"}) {
			t.Fatalf("query %q ids=%v", q, ids)
		}
		for _, row := range res.Exchanges {
			if !row.Rewritten {
				t.Fatalf("query %q returned non-rewritten row %s", q, row.ID)
			}
		}
	}

	// Filter original (false and canonical "original"): finds plain + skipped-only, excludes rewritten.
	for _, q := range []string{"?rewritten=false", "?rewritten=original"} {
		res, _ := fetch(q)
		if res.Count != 4 || res.Total != 2 || len(res.Exchanges) != 2 {
			t.Fatalf("query %q count=%d total=%d len=%d, want 4/2/2", q, res.Count, res.Total, len(res.Exchanges))
		}
		ids := []string{res.Exchanges[0].ID, res.Exchanges[1].ID}
		slices.Sort(ids)
		if !slices.Equal(ids, []string{"orig-alpha-200", "skip-alpha-404"}) {
			t.Fatalf("query %q ids=%v", q, ids)
		}
		for _, row := range res.Exchanges {
			if row.Rewritten {
				t.Fatalf("query %q returned rewritten row %s", q, row.ID)
			}
		}
	}

	// Combined with host and status.
	resHostRW, _ := fetch("?rewritten=true&host=alpha.example&status=200")
	if resHostRW.Total != 1 || len(resHostRW.Exchanges) != 1 || resHostRW.Exchanges[0].ID != "rw-alpha-200" {
		t.Fatalf("combined rewritten+host+status = %+v", resHostRW)
	}
	resHostOrig, _ := fetch("?rewritten=false&host=alpha.example&status=4xx")
	if resHostOrig.Total != 1 || len(resHostOrig.Exchanges) != 1 || resHostOrig.Exchanges[0].ID != "skip-alpha-404" {
		t.Fatalf("combined original+host+4xx = %+v", resHostOrig)
	}

	// Pagination stays consistent with total under rewritten filter.
	p0, _ := fetch("?rewritten=rewritten&page=0&size=1")
	p1, _ := fetch("?rewritten=rewritten&page=1&size=1")
	if p0.Total != 2 || p1.Total != 2 || len(p0.Exchanges) != 1 || len(p1.Exchanges) != 1 || p0.Exchanges[0].ID == p1.Exchanges[0].ID {
		t.Fatalf("paginated rewritten p0=%+v p1=%+v", p0, p1)
	}
}

func TestTaskArchiveRestorePreservesRewriteProvenanceAndV1DoesNot(t *testing.T) {
	s, f, req := trafficEvidenceServer(t)
	ctx := context.Background()
	finding, err := s.m.pg.GetFinding(f.FindingID)
	if err != nil {
		t.Fatal(err)
	}
	tid := *finding.TaskID
	s.ctx = ctx

	seedHostFlow := func(host, id, path string) {
		t.Helper()
		if _, err := s.m.traffic.DB().Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,100,?,'GET',?,?,200,'text/plain',0,4,'')`, id, host, path, "https://"+host+path); err != nil {
			t.Fatal(err)
		}
		if _, err := s.m.traffic.DB().Exec(`INSERT INTO exchange_bodies(id,req_head,resp_head,req_body,resp_body)
VALUES(?,?, 'HTTP/1.1 200 OK', ?, ?)`, id, "GET "+path+" HTTP/1.1\nHost: "+host, []byte{}, []byte("body")); err != nil {
			t.Fatal(err)
		}
	}

	callTrafficGet := func(id string) string {
		t.Helper()
		for _, tool := range s.m.traffic.Tools() {
			if tool.Name() != "traffic_get" {
				continue
			}
			res, err := tool.Call(ctx, json.RawMessage(fmt.Sprintf(`{"id":%q}`, id)), nil)
			if err != nil || res.IsError {
				t.Fatalf("traffic_get(%s) err=%v res=%s", id, err, res.Flatten())
			}
			return res.Flatten()
		}
		t.Fatal("traffic_get tool not found")
		return ""
	}

	bindAndFetchViewer := func(findingID int64, trafficID string) (rewritten bool, ruleIDs []int64) {
		t.Helper()
		list, err := s.evidenceStore().Bind(ctx, findingID, []db.TrafficRef{{TrafficID: trafficID, Role: "proof"}})
		if err != nil {
			t.Fatalf("Bind(%s): %v", trafficID, err)
		}
		var bindingID int64
		for _, b := range list.Bindings {
			if b.Snapshot.SourceTrafficID == trafficID {
				bindingID = b.ID
				break
			}
		}
		if bindingID == 0 {
			t.Fatalf("binding for %s not found in %+v", trafficID, list.Bindings)
		}
		w := req(http.MethodGet, fmt.Sprintf("/api/exploration/findings/%d/traffic/%d", findingID, bindingID), "")
		if w.Code != http.StatusOK {
			t.Fatalf("evidence viewer GET status=%d body=%s", w.Code, w.Body.String())
		}
		var detail struct {
			Binding db.FindingTrafficBinding `json:"binding"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &detail); err != nil {
			t.Fatal(err)
		}
		return detail.Binding.Snapshot.Rewritten, detail.Binding.Snapshot.RewriteRuleIDs
	}

	// ---- Part 1: v2 rewritten archive restored into task ----
	const v2Host = "v2-archive-provenance.local"
	var v2AssetID int64
	if err := s.m.pg.QueryRow(`INSERT INTO assets(type,domain,root_domain,task_ids) VALUES('subdomain',$1,$1,ARRAY[$2]::bigint[]) RETURNING id`, v2Host, tid).Scan(&v2AssetID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = s.m.pg.Exec(`DELETE FROM assets WHERE id=$1`, v2AssetID) })

	seedHostFlow(v2Host, "ex-v2-rw", "/rw")
	seedHostFlow(v2Host, "ex-v2-orig", "/orig")
	if _, err := s.m.traffic.DB().Exec(`INSERT INTO exchange_rewrites(exchange_id,seq,phase,rule_id,outcome) VALUES
('ex-v2-rw',0,'request',7,'applied'),
('ex-v2-rw',1,'response',2,'applied'),
('ex-v2-rw',2,'response',9,'skipped')`); err != nil {
		t.Fatal(err)
	}

	if err := s.m.SetTaskPaused(strconv.FormatInt(tid, 10), true); err != nil {
		t.Fatal(err)
	}
	job, err := s.m.pg.QueueTaskArchive(tid)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err != nil {
		t.Fatalf("archive v2 task: %v", err)
	}
	// Exclusive host traffic must have been compacted out of the hot SQLite store.
	if _, _, err := s.m.traffic.Get("ex-v2-rw"); err == nil {
		t.Fatal("expected hot traffic to be compacted by archive")
	}

	if _, err := s.m.pg.QueueTaskArchiveRestore(job.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err != nil {
		t.Fatalf("restore v2 task: %v", err)
	}

	if out := callTrafficGet("ex-v2-rw"); !strings.HasPrefix(out, "=== REWRITTEN === rewrite rules [2 7] ") {
		t.Fatalf("restored v2 traffic_get(ex-v2-rw) = %q, want REWRITTEN line", out)
	}
	if out := callTrafficGet("ex-v2-orig"); strings.Contains(out, "REWRITTEN") {
		t.Fatalf("restored v2 traffic_get(ex-v2-orig) unexpectedly had REWRITTEN: %q", out)
	}
	if rw, ids := bindAndFetchViewer(f.FindingID, "ex-v2-rw"); !rw || !slices.Equal(ids, []int64{2, 7}) {
		t.Fatalf("restored v2 evidence viewer(ex-v2-rw) = (%v, %v), want (true, [2 7])", rw, ids)
	}
	if rw, ids := bindAndFetchViewer(f.FindingID, "ex-v2-orig"); rw || len(ids) != 0 {
		t.Fatalf("restored v2 evidence viewer(ex-v2-orig) = (%v, %v), want (false, nil)", rw, ids)
	}

	// ---- Part 2: v1 traffic archive restored into a task must NOT gain a REWRITTEN line ----
	taskV1, err := s.m.CreateTask("v1 traffic archive", "verify v1 restore", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	tidV1, _ := strconv.ParseInt(taskV1.ID, 10, 64)
	t.Cleanup(func() {
		_, _ = s.m.pg.DeleteFindingsByTask(tidV1)
		_, _ = s.m.pg.Exec(`DELETE FROM task_archives WHERE task_id=$1`, tidV1)
		_ = s.m.pg.DeleteTask(tidV1)
	})
	fV1, err := s.evidenceStore().Record(ctx, db.RecordFindingInput{
		TaskID: tidV1, ExplorationID: taskV1.ExpID, Worker: "test",
		VulnClass: "TEST", Summary: "v1 evidence", Name: "V1 Finding", Severity: "low",
	}, nil)
	if err != nil {
		t.Fatal(err)
	}

	const v1Host = "v1-archive-legacy.local"
	var v1AssetID int64
	if err := s.m.pg.QueryRow(`INSERT INTO assets(type,domain,root_domain,task_ids) VALUES('subdomain',$1,$1,ARRAY[$2]::bigint[]) RETURNING id`, v1Host, tidV1).Scan(&v1AssetID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = s.m.pg.Exec(`DELETE FROM assets WHERE id=$1`, v1AssetID) })

	seedHostFlow(v1Host, "ex-v1-legacy", "/legacy")
	if err := s.m.SetTaskPaused(taskV1.ID, true); err != nil {
		t.Fatal(err)
	}
	jobV1, err := s.m.pg.QueueTaskArchive(tidV1)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err != nil {
		t.Fatalf("archive v1 fixture task: %v", err)
	}

	// Repackage the task archive with a version-1 traffic.json (no rewrite provenance fields).
	archivedV1, err := s.m.pg.GetTaskArchive(jobV1.ID)
	if err != nil {
		t.Fatal(err)
	}
	repackDir := t.TempDir()
	if err := extractTaskArchivePackage(archivedV1.ArchivePath, archivedV1.SHA256, repackDir); err != nil {
		t.Fatal(err)
	}
	manifestRaw, err := os.ReadFile(filepath.Join(repackDir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var taskSnap db.TaskArchiveSnapshot
	if err := json.Unmarshal(manifestRaw, &taskSnap); err != nil {
		t.Fatal(err)
	}
	trafficPath := filepath.Join(repackDir, "traffic", "traffic.json")
	rawTraffic, err := os.ReadFile(trafficPath)
	if err != nil {
		t.Fatal(err)
	}
	var trafficSnap traffic.ArchiveSnapshot
	if err := json.Unmarshal(rawTraffic, &trafficSnap); err != nil {
		t.Fatal(err)
	}
	trafficSnap.Version = 1
	for i := range trafficSnap.Exchanges {
		trafficSnap.Exchanges[i].Rewritten = false
		trafficSnap.Exchanges[i].RewriteRuleIDs = nil
	}
	v1Raw, err := json.Marshal(trafficSnap)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(trafficPath, v1Raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(archivedV1.ArchivePath); err != nil {
		t.Fatal(err)
	}
	_, _, newSHA, err := writeTaskArchivePackage(archivedV1.ArchivePath, repackDir, &taskSnap)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.m.pg.Exec(`UPDATE task_archives SET sha256=$1 WHERE id=$2`, newSHA, jobV1.ID); err != nil {
		t.Fatal(err)
	}

	if _, err := s.m.pg.QueueTaskArchiveRestore(jobV1.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.runOneTaskArchiveJob(); err != nil {
		t.Fatalf("restore v1 task: %v", err)
	}
	if out := callTrafficGet("ex-v1-legacy"); strings.Contains(out, "REWRITTEN") {
		t.Fatalf("restored v1 traffic_get(ex-v1-legacy) unexpectedly gained REWRITTEN: %q", out)
	}
	if rw, ids := bindAndFetchViewer(fV1.FindingID, "ex-v1-legacy"); rw || len(ids) != 0 {
		t.Fatalf("restored v1 evidence viewer(ex-v1-legacy) = (%v, %v), want (false, nil)", rw, ids)
	}
}
