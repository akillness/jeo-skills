package server

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// Step 1.9: the redirect hops of the custom http tool and of a worker's
// WebFetch go through the target gate.

// redirectingServer answers every request with a redirect to location and
// counts the requests. Its host:port is an IP literal: the gate never resolves it.
func redirectingServer(t *testing.T, location string) (srv *httptest.Server, hits *atomic.Int64, key string) {
	t.Helper()
	hits = &atomic.Int64{}
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Redirect(w, r, location, http.StatusFound)
	}))
	t.Cleanup(srv.Close)
	return srv, hits, srv.Listener.Addr().String()
}

func decide(t *testing.T, g *gateServer, id int64, decision string) {
	t.Helper()
	if code, body := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"`+decision+`"}`); code != 200 {
		t.Fatalf("decide %d: %d %v", id, code, body)
	}
}

// A custom http tool whose rendered URL is pinned, and which redirects to a
// target no pin covers: the hop is not followed, one request is opened for its
// target, and the call fails at once. After the approval the same call follows.
func TestCustomHTTPRedirectTargetGated(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	pg := g.m.pg
	final, finalHits, fhost, fport := countingServer(t)
	finalKey := net.JoinHostPort(fhost, fport)
	start, startHits, startKey := redirectingServer(t, final.URL+"/final")

	tool := g.s.buildCustomTool(&db.Tool{Key: "probe_redirect", Kind: "http",
		Exec: execJSON(t, map[string]any{"method": "GET", "url": start.URL + "/start"})})
	// The rendered URL itself first: its request, approved.
	if out, isErr := callTool(t, tool, gatedCtx(task, 0), `{}`, nil); !isErr || !strings.Contains(out, "TARGET_APPROVAL_PENDING") || startHits.Load() != 0 {
		t.Fatalf("rendered URL: error=%v out=%q", isErr, out)
	}
	id, _, _, ok := openTargetRequest(t, pg, task.ID, startKey)
	if !ok {
		t.Fatal("no request for the rendered URL")
	}
	decide(t, g, id, "allowed")

	// The wait bound is long: the hop must not use it.
	began := time.Now()
	out, isErr := callTool(t, tool, gatedCtx(task, time.Minute), `{}`, nil)
	if !isErr || !strings.Contains(out, "TARGET_APPROVAL_PENDING") || !strings.Contains(out, start.URL+"/start redirects to "+finalKey) {
		t.Fatalf("redirect to an unpinned target: error=%v out=%q", isErr, out)
	}
	if elapsed := time.Since(began); elapsed > 10*time.Second {
		t.Fatalf("the hop waited %v", elapsed)
	}
	if startHits.Load() != 1 || finalHits.Load() != 0 {
		t.Fatalf("hits origin=%d target=%d, want the target untouched", startHits.Load(), finalHits.Load())
	}
	hopID, toolName, toolInput, ok := openTargetRequest(t, pg, task.ID, finalKey)
	if !ok || toolName != "probe_redirect" || !strings.Contains(toolInput, final.URL+"/final") || !strings.Contains(toolInput, start.URL+"/start") {
		t.Fatalf("request for the hop: ok=%v tool=%q input=%s", ok, toolName, toolInput)
	}
	var requests int
	if err := pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE task_id=$1 AND target_key IS NOT NULL`, task.ID).Scan(&requests); err != nil || requests != 2 {
		t.Fatalf("%d requests, %v; want the origin's and the hop's", requests, err)
	}

	decide(t, g, hopID, "allowed")
	if out, isErr := callTool(t, tool, gatedCtx(task, 0), `{}`, nil); isErr || !strings.Contains(out, "probe-reached") || finalHits.Load() != 1 {
		t.Fatalf("after the approval: error=%v out=%q target hits=%d", isErr, out, finalHits.Load())
	}
}

// The custom-tool test endpoint has no approval scope (D14): its redirects are
// followed as before, and nothing is written.
func TestCustomToolTestEndpointRedirectUngated(t *testing.T) {
	g := newGateServer(t)
	on := true
	g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	final, finalHits, _, _ := countingServer(t)
	start, _, _ := redirectingServer(t, final.URL+"/final")
	count := func() int {
		var n int
		if err := g.m.pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE decision_source='target' OR target_key IS NOT NULL`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	before := count()
	code, out := g.do(t, "POST", "/api/tools/custom/test", fmt.Sprintf(`{"kind":"http","exec":{"url":%q}}`, start.URL+"/start"))
	if code != 200 || out["is_error"] != false || !strings.Contains(fmt.Sprint(out["output"]), "probe-reached") || finalHits.Load() != 1 {
		t.Fatalf("test endpoint: %d %v target hits=%d", code, out, finalHits.Load())
	}
	if after := count(); after != before {
		t.Fatalf("the test endpoint wrote %d target rows", after-before)
	}
}

// A gated worker's WebFetch end to end: the origin is approved at the hook, the
// redirect stops at the hop with TARGET_APPROVAL_PENDING and leaves one request
// open; once it is approved through the API, the same call follows.
func TestRedirectRequestSurvivesAndRetryPasses(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	pg := g.m.pg
	final, finalHits, fhost, fport := countingServer(t)
	finalKey := net.JoinHostPort(fhost, fport)
	start, startHits, startKey := redirectingServer(t, final.URL+"/final")
	p := &toolScript{calls: fetches(start.URL+"/start", start.URL+"/start"), results: make(chan string, 16),
		hold: map[int64]chan struct{}{2: make(chan struct{})}}
	done := runScriptedWorker(t, g, task, p)

	var id int64
	waitUntil(t, "the request for the origin", func() bool {
		var ok bool
		id, _, _, ok = openTargetRequest(t, pg, task.ID, startKey)
		return ok
	})
	decide(t, g, id, "allowed")
	if r := p.next(t); !strings.Contains(r, "TARGET_APPROVAL_PENDING") || !strings.Contains(r, "redirects to "+finalKey) {
		t.Fatalf("first call: %q", r)
	}
	if startHits.Load() != 1 || finalHits.Load() != 0 {
		t.Fatalf("hits origin=%d target=%d, want the target untouched", startHits.Load(), finalHits.Load())
	}
	hopID, toolName, _, ok := openTargetRequest(t, pg, task.ID, finalKey)
	if !ok || toolName != "WebFetch" {
		t.Fatalf("request for the hop: ok=%v tool=%q", ok, toolName)
	}
	detail, err := pg.GetInterceptDetail(hopID)
	if err != nil || detail == nil || detail.Audit == nil || len(detail.Audit.Targets) != 1 || detail.Audit.Targets[0].RedirectFrom != startKey {
		t.Fatalf("hop request detail = %+v, %v", detail, err)
	}

	decide(t, g, hopID, "allowed")
	close(p.hold[2])
	if r := p.next(t); !strings.Contains(r, "probe-reached") || finalHits.Load() != 1 {
		t.Fatalf("the same call after the approval: %q target hits=%d", r, finalHits.Load())
	}
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		t.Fatal("the worker run did not end")
	}
}
