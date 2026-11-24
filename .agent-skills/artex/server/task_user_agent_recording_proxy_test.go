package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/traffic"
)

func recordingProxyTestAddr(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	if err := ln.Close(); err != nil {
		t.Fatal(err)
	}
	return addr
}

func TestAssessmentHTTPToolGatedRecordingProxyRedirect(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	proxyAddr := recordingProxyTestAddr(t)
	g := newGateServerWithProxy(t, proxyAddr)
	t.Cleanup(g.m.Enrich().Close)
	egress.SetProfile(egress.Profile{Name: "off"})
	tr := g.m.Traffic()
	if tr == nil {
		t.Fatal("recording proxy unavailable")
	}
	if err := tr.SetUpstreamProxy(""); err != nil {
		t.Fatal(err)
	}
	captureWasOn := g.m.TrafficEnabled()
	t.Cleanup(func() {
		if err := g.m.SetTrafficEnabled(captureWasOn); err != nil {
			t.Error(err)
		}
	})
	if err := g.m.SetTrafficEnabled(true); err != nil {
		t.Fatal(err)
	}
	waitUntil(t, "recording proxy", func() bool {
		conn, err := net.DialTimeout("tcp", proxyAddr, 100*time.Millisecond)
		if err != nil {
			return false
		}
		_ = conn.Close()
		return true
	})

	sourceUA, redirectUA := make(chan string, 16), make(chan string, 16)
	dest := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		redirectUA <- r.UserAgent()
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(dest.Close)
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sourceUA <- r.UserAgent()
		http.Redirect(w, r, dest.URL+"/redirected", http.StatusFound)
	}))
	t.Cleanup(source.Close)

	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	// The label permits both origins. The approval gate still decides if a
	// request may reach either one, and a cross-origin hop still drops the label.
	raw := execJSON(t, map[string]any{"reference": "FS-17", "origins": []string{source.URL, dest.URL}})
	if err := json.Unmarshal(raw, &task.assessmentIdentity); err != nil {
		t.Fatal(err)
	}
	ctx := gatedCtx(task, 0)
	sourceURL, redirectURL := source.URL+"/initial", dest.URL+"/redirected"
	const toolName = "assessment_gated_redirect"
	spec := execJSON(t, httpExec{URL: sourceURL, UseRecordingProxy: true, TimeoutMs: 5000})
	wantPending := func(target string) {
		t.Helper()
		res, err := g.s.runHTTPTool(ctx, toolName, spec, nil, nil)
		if err != nil || !res.IsError || !strings.Contains(res.Flatten(), "TARGET_APPROVAL_PENDING") ||
			!strings.Contains(res.Flatten(), strings.TrimPrefix(target, "http://")) {
			t.Fatalf("expected pending approval for %s, got %v %s", target, err, res.Flatten())
		}
	}
	approve := func(target string) {
		t.Helper()
		id, name, _, ok := openTargetRequest(t, g.m.pg, task.ID, strings.TrimPrefix(target, "http://"))
		if !ok || name != toolName {
			t.Fatalf("no pending %s approval for %s, tool=%q", toolName, target, name)
		}
		if code, body := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"allowed"}`); code != 200 {
			t.Fatalf("approve %s: %d %v", target, code, body)
		}
	}

	wantPending(source.URL)
	if len(sourceUA) != 0 || len(redirectUA) != 0 {
		t.Fatal("a request reached an origin before the initial approval")
	}
	approve(source.URL)
	wantPending(dest.URL)
	if len(sourceUA) != 1 || len(redirectUA) != 0 {
		t.Fatalf("before redirect approval, got %d initial requests and %d redirect requests", len(sourceUA), len(redirectUA))
	}
	approve(dest.URL)
	res, err := g.s.runHTTPTool(ctx, toolName, spec, nil, nil)
	if err != nil || res.IsError || res.Flatten() != `{"body":"","status":204}` {
		t.Fatalf("after both approvals: %v %s", err, res.Flatten())
	}
	if len(sourceUA) != 2 || len(redirectUA) != 1 {
		t.Fatalf("after redirect approval, got %d initial requests and %d redirect requests", len(sourceUA), len(redirectUA))
	}
	for _, got := range []string{<-sourceUA, <-sourceUA} {
		if got != assessmentTestUA {
			t.Errorf("initial origin received User-Agent %q, want %q", got, assessmentTestUA)
		}
	}
	if got := <-redirectUA; got != goTestUA {
		t.Errorf("redirect origin received User-Agent %q, want %q", got, goTestUA)
	}
	pins, err := g.m.pg.ListTargetPins(taskRef(t, task))
	if err != nil || len(pins) != 2 || !pins[0].NameOnlyEffective || !pins[1].NameOnlyEffective {
		t.Fatalf("expected two name-only approvals for proxied traffic, got %+v, %v", pins, err)
	}

	var rows []traffic.ExchangeMeta
	waitUntil(t, "three recorded HTTP exchanges", func() bool {
		var err error
		rows, err = tr.Search("", 0, 10)
		if err != nil {
			t.Fatal(err)
		}
		return len(rows) >= 3
	})
	wantCount := map[string]int{sourceURL: 2, redirectURL: 1}
	wantUA := map[string]string{sourceURL: assessmentTestUA, redirectURL: goTestUA}
	for _, row := range rows {
		raw, _, err := tr.Get(row.ID)
		if err != nil {
			t.Fatal(err)
		}
		req, err := http.ReadRequest(bufio.NewReader(strings.NewReader(raw)))
		if err != nil {
			t.Fatalf("parse recorded request for %s: %v", row.URL, err)
		}
		if want := wantUA[row.URL]; want == "" || req.UserAgent() != want {
			t.Errorf("recorded User-Agent for %s = %q, want %q", row.URL, req.UserAgent(), want)
		}
		wantCount[row.URL]--
	}
	for target, remaining := range wantCount {
		if remaining != 0 {
			t.Errorf("unexpected number of recorded requests for %s, remaining expected = %d", target, remaining)
		}
	}
}
