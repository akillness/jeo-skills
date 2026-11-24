package evidence

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic"
	"github.com/Autumn-27/artex/traffic/rewrite"
)

func evidenceFixture(t *testing.T) (*Store, db.RecordFindingInput, string) {
	t.Helper()
	dsn := os.Getenv("ARTEX_PG_DSN")
	if dsn == "" {
		t.Skip("ARTEX_PG_DSN is required for evidence integration tests")
	}
	pg, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pg.Close() })
	task, err := pg.CreateTask("evidence integration "+t.Name(), "local fixtures", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pg.DeleteFindingsByTask(task.ID); pg.DeleteTask(task.ID) })
	dir := t.TempDir()
	tr, err := traffic.Open(filepath.Join(dir, "traffic"), ":0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { tr.Close() })
	store := New(pg, tr, filepath.Join(dir, "evidence"))
	in := db.RecordFindingInput{TaskID: task.ID, ExplorationID: task.ExplorationID, Worker: "test", VulnClass: "TEST", Name: "Evidence fixture", Severity: "low", Summary: "local test"}
	return store, in, dir
}

func seedExchange(t *testing.T, s *Store, id string, body []byte, spill bool) {
	t.Helper()
	var blob any
	inline := body
	if spill {
		sum := sha256.Sum256(body)
		hash := hex.EncodeToString(sum[:])
		blob = hash
		path := filepath.Join(filepath.Dir(s.Dir), "traffic", "_blobs", "sha256", hash[:2], hash+".bin")
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, body, 0o600); err != nil {
			t.Fatal(err)
		}
		inline = []byte("TRUNCATED PREVIEW")
	}
	_, err := s.Traffic.DB().Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path) VALUES(?,?,'fixture.local','POST','/test',?,200,'application/octet-stream',2,?,'')`, id, time.Now().Unix(), "https://fixture.local/"+id, len(body))
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Traffic.DB().Exec(`INSERT INTO exchange_bodies(id,req_head,req_body,resp_head,resp_body,resp_blob) VALUES(?,?,?, ?,?,?)`, id, "POST /test HTTP/1.1\nHost: fixture.local\n", []byte("{}"), "HTTP 200\nContent-Type: application/octet-stream\n", inline, blob)
	if err != nil {
		t.Fatal(err)
	}
}

func TestEvidenceBindingLifecycle(t *testing.T) {
	s, in, _ := evidenceFixture(t)
	ctx := context.Background()
	large := bytes.Repeat([]byte{0, 1, 2, 255, 'a', 'b'}, 180000)
	for i := 0; i < 3; i++ {
		seedExchange(t, s, fmt.Sprint(i), large, i == 2)
	}
	refs := []db.TrafficRef{{TrafficID: "0", Role: "baseline", Note: "normal"}, {TrafficID: "1", Role: "proof", Note: "proof"}, {TrafficID: "2", Role: "verification", Note: "binary"}}
	r, err := s.Record(ctx, in, refs)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Traffic.Bindings) != 3 || r.Traffic.Version != 1 {
		t.Fatalf("record=%+v", r)
	}
	again, err := s.Bind(ctx, r.FindingID, []db.TrafficRef{{TrafficID: "1", Note: "must not overwrite"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(again.Bindings) != 3 || again.Version != 1 || again.Bindings[1].Note != "proof" {
		t.Fatalf("duplicate changed bindings: %+v", again)
	}
	other, err := s.Record(ctx, in, []db.TrafficRef{refs[2]})
	if err != nil {
		t.Fatal(err)
	}
	if other.Traffic.Bindings[0].SnapshotID != r.Traffic.Bindings[2].SnapshotID {
		t.Fatal("snapshot was not shared")
	}
	if _, err = s.Traffic.DeleteHost("fixture.local"); err != nil {
		t.Fatal(err)
	}
	for _, binding := range r.Traffic.Bindings {
		if err = s.WithBinding(ctx, r.FindingID, binding.ID, func(b db.FindingTrafficBinding) error {
			f, _, err := s.OpenBody(b.Snapshot, "response")
			if err != nil {
				return err
			}
			defer f.Close()
			got, err := io.ReadAll(f)
			if !bytes.Equal(got, large) {
				t.Fatal("body was truncated/changed")
			}
			return err
		}); err != nil {
			t.Fatal(err)
		}
	}
	v := again.Version
	if _, err = s.DB.SetFindingReportVersionByNodeID(ctx, r.NodeID, "report", &v); err != nil {
		t.Fatal(err)
	}
	note := "updated"
	if err = s.DB.EditFindingTraffic(ctx, r.FindingID, again.Bindings[0].ID, v, nil, &note, false, nil); err != nil {
		t.Fatal(err)
	}
	if _, err = s.DB.SetFindingReportVersionByNodeID(ctx, r.NodeID, "stale report", &v); !errors.Is(err, db.ErrEvidenceConflict) {
		t.Fatalf("stale report: %v", err)
	}
	f, err := s.DB.GetFinding(r.FindingID)
	if err != nil {
		t.Fatal(err)
	}
	if f.Report != "report" || f.EvidenceVersion == f.ReportEvidenceVersion || f.TrafficCount != 3 {
		t.Fatalf("finding versions: %+v", f)
	}
	if err = s.DB.EditFindingTraffic(ctx, r.FindingID, again.Bindings[0].ID, v, nil, nil, true, nil); !errors.Is(err, db.ErrEvidenceConflict) {
		t.Fatalf("stale delete: %v", err)
	}
	if _, err = s.DB.SetFindingReportByNodeID(r.NodeID, "legacy report"); err != nil {
		t.Fatal(err)
	}
	f, err = s.DB.GetFinding(r.FindingID)
	if err != nil {
		t.Fatal(err)
	}
	if f.ReportEvidenceVersion != -1 {
		t.Fatal("legacy write claimed current evidence")
	}
	if _, err = s.DB.DeleteFinding(r.FindingID); err != nil {
		t.Fatal(err)
	}
	if err = s.Collect(ctx, time.Now().Add(48*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err = s.WithBinding(ctx, other.FindingID, other.Traffic.Bindings[0].ID, func(b db.FindingTrafficBinding) error {
		f, _, err := s.OpenBody(b.Snapshot, "response")
		if f != nil {
			f.Close()
		}
		return err
	}); err != nil {
		t.Fatal("GC removed shared body:", err)
	}
}

func TestEvidenceAtomicFailuresAndLegacy(t *testing.T) {
	s, in, dir := evidenceFixture(t)
	ctx := context.Background()
	seedExchange(t, s, "valid", []byte("OK"), false)
	counts := func() (findings, nodes int) {
		s.DB.QueryRow(`SELECT count(*) FROM findings WHERE task_id=$1`, in.TaskID).Scan(&findings)
		s.DB.QueryRow(`SELECT count(*) FROM exploration_nodes WHERE exploration_id=$1 AND kind='finding'`, in.ExplorationID).Scan(&nodes)
		return
	}
	for _, kind := range []string{"missing_id", "missing_body", "disk_failure", "database_failure"} {
		t.Run(kind, func(t *testing.T) {
			input := in
			refs := []db.TrafficRef{{TrafficID: "valid"}, {TrafficID: "absent"}}
			local := *s
			switch kind {
			case "missing_body":
				seedExchange(t, s, "broken", []byte("more than preview"), false)
				s.Traffic.DB().Exec(`UPDATE exchange_bodies SET resp_body=? WHERE id='broken'`, []byte("x"))
				refs = []db.TrafficRef{{TrafficID: "valid"}, {TrafficID: "broken"}}
			case "disk_failure":
				local.Dir = filepath.Join(dir, "file-not-dir")
				if err := os.WriteFile(local.Dir, []byte("x"), 0o600); err != nil {
					t.Fatal(err)
				}
				refs = refs[:1]
			case "database_failure":
				input.AssetIDs = []int64{9223372036854775807}
				refs = refs[:1]
			}
			if _, err := local.Record(ctx, input, refs); err == nil {
				t.Fatal("expected failure")
			}
			if f, n := counts(); f != 0 || n != 0 {
				t.Fatalf("partial record: findings=%d nodes=%d", f, n)
			}
		})
	}
	legacy := filepath.Join(dir, "traffic", "legacy")
	os.MkdirAll(legacy, 0o700)
	os.WriteFile(filepath.Join(legacy, "request.http"), []byte("GET / HTTP/1.1\nHost: old.local\n"), 0o600)
	os.WriteFile(filepath.Join(legacy, "response.http"), []byte("HTTP 200\n\nlegacy body"), 0o600)
	_, err := s.Traffic.DB().Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path) VALUES('old',1,'old.local','GET','/','http://old.local/',200,'text/plain',0,11,'legacy')`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Record(ctx, in, []db.TrafficRef{{TrafficID: "old"}}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Record(ctx, in, nil); err != nil {
		t.Fatal("legacy no-traffic report failed:", err)
	}
}

func TestEvidenceConcurrentBindAndDelete(t *testing.T) {
	s, in, _ := evidenceFixture(t)
	ctx := context.Background()
	seedExchange(t, s, "race", bytes.Repeat([]byte("large"), 90000), true)
	r, err := s.Record(ctx, in, nil)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 10)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.Bind(ctx, r.FindingID, []db.TrafficRef{{TrafficID: "race"}})
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	list, err := s.DB.GetFindingTraffic(ctx, r.FindingID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Bindings) != 1 || list.Version != 1 {
		t.Fatalf("concurrent duplicates: %+v", list)
	}
	// Race a new capture copy with source deletion: either the full copy commits
	// or nothing does. An already-bound snapshot remains readable in both cases.
	wg.Add(2)
	go func() { defer wg.Done(); s.Bind(ctx, r.FindingID, []db.TrafficRef{{TrafficID: "race"}}) }()
	go func() { defer wg.Done(); s.Traffic.DeleteHost("fixture.local") }()
	wg.Wait()
	if err = s.WithBinding(ctx, r.FindingID, list.Bindings[0].ID, func(b db.FindingTrafficBinding) error {
		f, _, err := s.OpenBody(b.Snapshot, "response")
		if f != nil {
			f.Close()
		}
		return err
	}); err != nil {
		t.Fatal(err)
	}
}

func TestEvidenceGCGraceAndActiveRestore(t *testing.T) {
	s, in, _ := evidenceFixture(t)
	ctx := context.Background()
	seedExchange(t, s, "gc", []byte("unique unreferenced gc body"), false)
	f, err := s.Record(ctx, in, []db.TrafficRef{{TrafficID: "gc"}})
	if err != nil {
		t.Fatal(err)
	}
	snap := f.Traffic.Bindings[0].Snapshot
	archive := t.TempDir()
	if err = s.CopySnapshots(ctx, []db.TrafficEvidenceSnapshot{snap}, archive); err != nil {
		t.Fatal(err)
	}
	if _, err = s.DB.DeleteFinding(f.FindingID); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if err = s.Collect(ctx, now); err != nil {
		t.Fatal(err)
	}
	path, err := hashPath(s.Dir, snap.RespHash)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Collect(ctx, now.Add(23*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(path); err != nil {
		t.Fatal("GC grace ignored", err)
	}
	if err = s.Collect(ctx, now.Add(25*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("orphan was not collected", err)
	}
	entered, release, finished := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	go func() {
		finished <- s.WithInstalledSnapshots(ctx, []db.TrafficEvidenceSnapshot{snap}, archive, func() error { close(entered); <-release; return nil })
	}()
	<-entered
	short, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	err = s.Collect(short, now.Add(72*time.Hour))
	cancel()
	close(release)
	if err == nil {
		t.Fatal("GC entered during active restore")
	}
	if err = <-finished; err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(path); err != nil {
		t.Fatal("active restore lost body", err)
	}
	// A portable package cannot substitute metadata while retaining its old ID.
	bad := snap
	bad.URL = "http://tampered.local/"
	if err = s.InstallSnapshots(ctx, []db.TrafficEvidenceSnapshot{bad}, archive); err == nil {
		t.Fatal("accepted tampered snapshot")
	}
}

func startRewriteProxy(t *testing.T, dir string) (*traffic.Traffic, string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	ln.Close()
	tr, err := traffic.Open(dir, addr)
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = tr.Start() }()
	t.Cleanup(func() { _ = tr.Close() })
	deadline := time.Now().Add(5 * time.Second)
	for {
		c, err := net.Dial("tcp", addr)
		if err == nil {
			c.Close()
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("proxy did not listen on %s: %v", addr, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	return tr, "http://" + addr
}

func TestEvidenceBindingRewrittenExchange(t *testing.T) {
	dsn := os.Getenv("ARTEX_PG_DSN")
	if dsn == "" {
		t.Skip("ARTEX_PG_DSN is required for evidence integration tests")
	}
	pg, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pg.Close() })
	task, err := pg.CreateTask("evidence rewrite "+t.Name(), "rewrite provenance", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pg.DeleteFindingsByTask(task.ID); pg.DeleteTask(task.ID) })

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = io.WriteString(w, "upstream response")
	}))
	t.Cleanup(target.Close)

	dir := t.TempDir()
	tr, proxyURL := startRewriteProxy(t, filepath.Join(dir, "traffic"))

	// Rules 5 (request) and 2 (response) apply to /rewritten; rule 9 only matches
	// /never-matches so it is skipped. Neither applies to /plain.
	set := rewrite.Compile([]rewrite.Rule{
		{
			ID: 5, Name: "req-header", Enabled: true, Phase: rewrite.PhaseRequest,
			Matchers: rewrite.Matchers{URLRegex: "^/rewritten$"},
			Actions:  []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-Injected", Value: "yes"}},
		},
		{
			ID: 2, Name: "resp-header", Enabled: true, Phase: rewrite.PhaseResponse,
			Matchers: rewrite.Matchers{URLRegex: "^/rewritten$"},
			Actions:  []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-Resp-Tag", Value: "1"}},
		},
		{
			ID: 9, Name: "skipped-rule", Enabled: true, Phase: rewrite.PhaseRequest,
			Matchers: rewrite.Matchers{URLRegex: "^/never-matches$"},
			Actions:  []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-Skipped", Value: "1"}},
		},
	}, rewrite.Options{})
	if len(set.LoadErrors()) != 0 {
		t.Fatalf("rewrite rule load errors: %v", set.LoadErrors())
	}
	tr.SetRewriteRules(set)

	pu, err := url.Parse(proxyURL)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(pu)}}
	for _, path := range []string{"/rewritten", "/plain"} {
		req, err := http.NewRequest(http.MethodGet, target.URL+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.ReadAll(resp.Body)
		resp.Body.Close()
	}

	exchangeID := func(suffix string) string {
		var id string
		deadline := time.Now().Add(3 * time.Second)
		for {
			err := tr.DB().QueryRow(`SELECT id FROM exchanges WHERE url LIKE ?`, "%"+suffix).Scan(&id)
			if err == nil {
				return id
			}
			if time.Now().After(deadline) {
				t.Fatalf("exchange %s not recorded: %v", suffix, err)
			}
			time.Sleep(20 * time.Millisecond)
		}
	}
	rewrittenID := exchangeID("/rewritten")
	plainID := exchangeID("/plain")

	store := New(pg, tr, filepath.Join(dir, "evidence"))
	in := db.RecordFindingInput{
		TaskID: task.ID, ExplorationID: task.ExplorationID, Worker: "test",
		VulnClass: "TEST", Name: "Rewrite provenance", Severity: "low", Summary: "proxy rewrite test",
	}
	ctx := context.Background()
	rec, err := store.Record(ctx, in, []db.TrafficRef{
		{TrafficID: rewrittenID, Role: "proof", Note: "rewritten"},
		{TrafficID: plainID, Role: "baseline", Note: "plain"},
	})
	if err != nil {
		t.Fatalf("store.Record: %v", err)
	}
	if len(rec.Traffic.Bindings) != 2 {
		t.Fatalf("bindings = %d, want 2", len(rec.Traffic.Bindings))
	}

	rewSnap := rec.Traffic.Bindings[0].Snapshot
	if !rewSnap.Rewritten {
		t.Fatalf("rewritten snapshot has Rewritten=false, want true")
	}
	if !slices.Equal(rewSnap.RewriteRuleIDs, []int64{2, 5}) {
		t.Fatalf("rewritten snapshot rule IDs = %v, want [2 5]", rewSnap.RewriteRuleIDs)
	}
	// Content-addressed ID must exclude the rewrite flag and rule IDs.
	stripped := rewSnap
	stripped.Rewritten = false
	stripped.RewriteRuleIDs = nil
	if gotID := db.TrafficSnapshotID(stripped); gotID != rewSnap.ID {
		t.Fatalf("snapshot ID depended on rewrite flag: stripped=%s stored=%s", gotID, rewSnap.ID)
	}

	plainSnap := rec.Traffic.Bindings[1].Snapshot
	if plainSnap.Rewritten || len(plainSnap.RewriteRuleIDs) != 0 {
		t.Fatalf("plain snapshot = rewritten:%v ids:%v, want false/empty", plainSnap.Rewritten, plainSnap.RewriteRuleIDs)
	}

	// Verify RewriteInfo errors fail preparation instead of recording a silent false.
	if _, err := tr.DB().Exec(`DROP TABLE exchange_rewrites`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.prepare(ctx, []db.TrafficRef{{TrafficID: plainID, Role: "proof"}}); err == nil || !strings.Contains(err.Error(), "rewrite provenance") {
		t.Fatalf("prepare with broken exchange_rewrites = %v, want rewrite provenance error", err)
	}
}
