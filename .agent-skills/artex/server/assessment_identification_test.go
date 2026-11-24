package server

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/Autumn-27/artex/config"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/artex/traffic"
)

const (
	assessmentTestUA = "ARTEX-Assessment/1.0 (engagement=FS-17)"
	goTestUA         = "Go-http-client/1.1"
	legacyTestUA     = "LegacyFixture/1.2"
)

func runAssessmentHTTPTool(t *testing.T, s *Server, ctx context.Context, spec httpExec) {
	t.Helper()
	res, err := s.runHTTPTool(ctx, "assessment_label_test", execJSON(t, spec), nil, nil)
	if err != nil || res.IsError {
		t.Fatalf("HTTP custom tool failed: %v %s", err, res.Flatten())
	}
}

func assessmentTaskContext(t *testing.T, id, reference string, origins ...string) context.Context {
	t.Helper()
	var identity config.AssessmentIdentity
	raw := execJSON(t, map[string]any{"reference": reference, "origins": origins})
	if err := json.Unmarshal(raw, &identity); err != nil {
		t.Fatal(err)
	}
	return gatedCtx(&Task{ID: id, assessmentIdentity: identity}, 0)
}

func TestAssessmentHTTPToolUserAgent(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	t.Setenv("ARTEX_TARGET_USER_AGENT", legacyTestUA)
	legacy, ok := egress.ProfileByName("balanced")
	if !ok {
		t.Fatal("balanced noise profile unavailable")
	}

	received := make(chan string, 16)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- r.UserAgent()
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	tagged := assessmentTaskContext(t, "42", "FS-17", srv.URL)
	base := assessmentTaskContext(t, "43", "", srv.URL)
	untagged := gatedCtx(&Task{ID: "44"}, 0)
	conversation := intercept.WithTargetScope(context.Background(), intercept.TargetScope{ConversationID: 42})
	for _, tc := range []struct {
		name    string
		ctx     context.Context
		headers map[string]string
		legacy  bool
		want    string
	}{
		{name: "tagged task, noise off", ctx: tagged, want: assessmentTestUA},
		{name: "configured without reference", ctx: base, want: "ARTEX-Assessment/1.0"},
		{name: "unconfigured task after tagged task", ctx: untagged, want: goTestUA},
		{name: "unscoped editor test", ctx: context.Background(), want: goTestUA},
		{name: "conversation ID equals configured task ID", ctx: conversation, want: goTestUA},
		{name: "tagged task, legacy configured", ctx: tagged, legacy: true, want: assessmentTestUA},
		{name: "unconfigured task, legacy configured", ctx: untagged, legacy: true, want: legacyTestUA},
		{name: "explicit UA", ctx: tagged, headers: map[string]string{"user-agent": "RequiredFixture/2.0"}, legacy: true, want: "RequiredFixture/2.0"},
		{name: "explicit empty UA", ctx: tagged, headers: map[string]string{"user-agent": ""}},
		{name: "explicit empty UA with legacy fallback", ctx: tagged, headers: map[string]string{"user-agent": ""}, legacy: true, want: legacyTestUA},
		{name: "tagged task repeated", ctx: tagged, want: assessmentTestUA},
	} {
		t.Run(tc.name, func(t *testing.T) {
			profile := egress.Profile{Name: "off"}
			if tc.legacy {
				profile = legacy
			}
			egress.SetProfile(profile)
			runAssessmentHTTPTool(t, &Server{}, tc.ctx, httpExec{URL: srv.URL, Headers: tc.headers})
			select {
			case got := <-received:
				if got != tc.want {
					t.Errorf("wire User-Agent = %q, want %q", got, tc.want)
				}
			default:
				t.Fatal("local server received no request")
			}
		})
	}
}

func TestAssessmentHTTPToolRedirectIdentification(t *testing.T) {
	prev := egress.CurrentProfile()
	egress.SetProfile(egress.Profile{Name: "off"})
	t.Cleanup(func() { egress.SetProfile(prev) })

	type observation struct{ path, ua string }
	received := make(chan observation, 16)
	cross := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- observation{r.URL.Path, r.UserAgent()}
		http.Redirect(w, r, r.URL.Query().Get("return"), http.StatusFound)
	}))
	t.Cleanup(cross.Close)
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- observation{r.URL.Path, r.UserAgent()}
		switch r.URL.Path {
		case "/start":
			http.Redirect(w, r, "/same", http.StatusFound)
		case "/same":
			back := url.QueryEscape("http://" + r.Host + "/return")
			http.Redirect(w, r, cross.URL+"/cross?return="+back, http.StatusFound)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	t.Cleanup(origin.Close)
	ctx := assessmentTaskContext(t, "42", "FS-17", origin.URL, cross.URL)
	runAssessmentHTTPTool(t, &Server{}, ctx, httpExec{URL: origin.URL + "/start"})
	ctx = assessmentTaskContext(t, "42", "FS-17", origin.URL)
	back := url.QueryEscape(origin.URL + "/return")
	runAssessmentHTTPTool(t, &Server{}, ctx, httpExec{URL: cross.URL + "/outside?return=" + back})
	for _, want := range []observation{
		{"/start", assessmentTestUA},
		{"/same", assessmentTestUA},
		{"/cross", goTestUA},
		{"/return", goTestUA},
		{"/outside", goTestUA},
		{"/return", goTestUA},
	} {
		select {
		case got := <-received:
			if got != want {
				t.Errorf("observed %v, want %v", got, want)
			}
		default:
			t.Fatalf("local servers did not receive %s", want.path)
		}
	}
	if len(received) != 0 {
		t.Fatalf("unexpected additional redirect requests: %d", len(received))
	}
}

func TestAssessmentHTTPToolDoesNotLabelUnicodeOrigin(t *testing.T) {
	prev := egress.CurrentProfile()
	egress.SetProfile(egress.Profile{Name: "off"})
	t.Cleanup(func() { egress.SetProfile(prev) })

	// The local HTTP proxy receives the request without resolving the target.
	// Unicode case folding of the Kelvin sign must not expand k.example.test.
	received := make(chan string, 1)
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- r.UserAgent()
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(proxy.Close)
	ctx := assessmentTaskContext(t, "42", "FS-17", "http://k.example.test")
	runAssessmentHTTPTool(t, &Server{}, ctx, httpExec{
		URL: "http://K.example.test/check", Proxy: proxy.URL,
	})
	select {
	case got := <-received:
		if got != goTestUA {
			t.Errorf("wire User-Agent for Unicode origin = %q, want %q", got, goTestUA)
		}
	default:
		t.Fatal("local proxy received no request")
	}
}

func TestAssessmentStartupScopesCurrentTasks(t *testing.T) {
	skipWithoutDSN(t)
	dsn, _, err := db.DSN()
	if err != nil {
		t.Fatal(err)
	}
	pg, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.Close() })
	addTask := func() *db.Task {
		t.Helper()
		task, err := pg.CreateTask("scanner User-Agent fixture", "", nil, 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = pg.DeleteTask(task.ID) })
		return task
	}
	tagged, untagged := addTask(), addTask()
	taggedID := strconv.FormatInt(tagged.ID, 10)
	untaggedID := strconv.FormatInt(untagged.ID, 10)
	futureID := strconv.FormatInt(untagged.ID+1, 10)
	cfgPath := filepath.Join(t.TempDir(), "config.json")
	cfg := map[string]any{"task_user_agents": map[string]any{
		taggedID: map[string]any{"reference": "FS-17", "origins": []string{"https://shop.example.test"}},
		futureID: map[string]any{"reference": "future", "origins": []string{"https://shop.example.test"}},
	}}
	if err := os.WriteFile(cfgPath, execJSON(t, cfg), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ARTEX_CONFIG", cfgPath)
	t.Setenv("ARTEX_PG_DSN", dsn)
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		m.Enrich().Close()
		_ = m.Close()
	})
	m.LoadExisting()
	created, err := m.CreateTask("scanner User-Agent fixture created after startup", "", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		id, _ := strconv.ParseInt(created.ID, 10, 64)
		_ = pg.DeleteTask(id)
	})
	if created.ID != futureID {
		t.Fatalf("fixture allocated task ID %s, expected next ID %s", created.ID, futureID)
	}
	for _, tc := range []struct{ id, want string }{
		{taggedID, assessmentTestUA},
		{untaggedID, ""},
		{futureID, ""},
	} {
		task, ok := m.Task(tc.id)
		if !ok {
			t.Fatalf("task %s unavailable", tc.id)
		}
		scope := task.targetScope(0)
		if got := scope.AssessmentIdentity.UserAgent(); got != tc.want {
			t.Errorf("task %s scope User-Agent = %q, want %q", tc.id, got, tc.want)
		}
	}
}

func TestAssessmentHTTPToolRecordingProxy(t *testing.T) {
	prev := egress.CurrentProfile()
	egress.SetProfile(egress.Profile{Name: "off"})
	t.Cleanup(func() { egress.SetProfile(prev) })
	received := make(chan string, 1)
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- r.UserAgent()
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(target.Close)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	if err := ln.Close(); err != nil {
		t.Fatal(err)
	}
	tr, err := traffic.Open(t.TempDir(), addr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tr.Close() })
	startErr := make(chan error, 1)
	go func() { startErr <- tr.Start() }()
	deadline := time.Now().Add(3 * time.Second)
	for {
		select {
		case err := <-startErr:
			t.Fatalf("recording proxy stopped: %v", err)
		default:
		}
		conn, err := net.DialTimeout("tcp", addr, 100*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("recording proxy didn't start: %v", err)
		}
		time.Sleep(15 * time.Millisecond)
	}

	ctx := assessmentTaskContext(t, "42", "FS-17", target.URL)
	s := &Server{m: &Manager{traffic: tr, trafficOn: true}}
	const path = "/recorded-identification"
	runAssessmentHTTPTool(t, s, ctx, httpExec{URL: target.URL + path, UseRecordingProxy: true})
	select {
	case got := <-received:
		if got != assessmentTestUA {
			t.Errorf("wire User-Agent via recording proxy = %q, want %q", got, assessmentTestUA)
		}
	default:
		t.Fatal("local server received no request through the recording proxy")
	}

	deadline = time.Now().Add(3 * time.Second)
	for {
		rows, _, err := tr.Page(traffic.PageQuery{Path: path}, 0, 10)
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) == 1 && rows[0].URL == target.URL+path {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("request did not appear in the recording proxy's traffic store")
		}
		time.Sleep(15 * time.Millisecond)
	}
}
