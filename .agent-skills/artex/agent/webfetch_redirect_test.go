package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/guard"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/llm"
	actool "github.com/Autumn-27/norma/tool"
)

// Step 1.9: the WebFetch tool of every agent kind checks each redirect hop
// against the target gate. With the gate off it follows redirects as before.
// Step 2.1: in a gated scope WebFetch has no direct retry.

// passHooks lets every tool call run.
type passHooks struct{}

func (passHooks) PreToolUse(context.Context, string, []byte) (bool, string, []byte) {
	return false, "", nil
}

func (passHooks) PostToolUse(context.Context, string, []byte, []byte, bool) {}

func (passHooks) Stop(context.Context, []llm.Message) (bool, []string, string) {
	return false, nil, ""
}

// redirectPair is a server that redirects to a second one on another port of
// 127.0.0.1, so the hop is another target (an IP literal: never resolved).
type redirectPair struct {
	start, final         string // URLs
	startHits, finalHits *atomic.Int64
	finalKey             string // host:port of the redirect target
}

func newRedirectPair(t *testing.T) redirectPair {
	t.Helper()
	p := redirectPair{startHits: &atomic.Int64{}, finalHits: &atomic.Int64{}}
	final := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.finalHits.Add(1)
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("redirect-target-reached"))
	}))
	t.Cleanup(final.Close)
	start := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.startHits.Add(1)
		http.Redirect(w, r, final.URL+"/final", http.StatusFound)
	}))
	t.Cleanup(start.Close)
	u, _ := url.Parse(final.URL)
	p.start, p.final, p.finalKey = start.URL+"/start", final.URL+"/final", u.Host
	return p
}

// gatedScope is a gated target scope on task taskID, whose rows are removed
// afterwards.
func gatedScope(t *testing.T, d *db.DB, taskID string) intercept.TargetScope {
	t.Helper()
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, taskID) })
	return intercept.TargetScope{TaskID: taskID, Enabled: func() bool { return true },
		WaitBound: intercept.DefaultTargetWaitBound, Interceptor: intercept.New(d)}
}

// openRedirectRequests returns the target keys of the open requests of task.
func openRedirectRequests(t *testing.T, d *db.DB, taskID string) []string {
	t.Helper()
	rows, err := d.Query(`SELECT target_key FROM intercept_pending WHERE task_id=$1 AND status='pending' AND target_key IS NOT NULL ORDER BY id`, taskID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			t.Fatal(err)
		}
		keys = append(keys, k)
	}
	return keys
}

func fetchInputJSON(u string) string {
	b, _ := json.Marshal(map[string]string{"url": u})
	return string(b)
}

// Each agent kind runs a scripted WebFetch on a URL that redirects to a target
// no pin covers. The hooks let the call run, so the hop is what the gate sees:
// each kind must stop at the hop, leave the redirect target untouched and open
// one request for it. A fifth agent kind added without the redirect policy
// fails this table once it is added to it. The origin is pinned first: the
// hooks never check it here, and the pinned dialer (step 2.1) connects only to
// a pinned target.
func TestWebFetchRedirectCheckWiredOnEveryAgentKind(t *testing.T) {
	for _, kind := range []string{"worker", "planner", "mainagent", "chat"} {
		t.Run(kind, func(t *testing.T) {
			f := newHookReachFixture(t)
			d := testDB(t)
			t.Cleanup(func() { _ = d.Close() })
			pair := newRedirectPair(t)
			scope := gatedScope(t, d, f.taskID)
			pinTarget(t, d, scope, pair.start)
			ctx := intercept.WithTargetScope(t.Context(), scope)
			prov := toolCallThenStop("WebFetch", fetchInputJSON(pair.start))

			switch kind {
			case "worker":
				payload := map[string]any{"summary": "redirect probe"}
				intentID, err := f.ts.AddNode("intent", payload, 0, "running", "planner", nil)
				if err != nil {
					t.Fatal(err)
				}
				raw, _ := json.Marshal(payload)
				w := NewWorker(prov, "test-model", f.workDir, nil, 0, 3)
				if _, _, err := w.Execute(ctx, "work#1", f.expID, nil, f.ts, &db.Node{ID: intentID, Payload: raw}, passHooks{}, nil, nil, nil); err != nil {
					t.Fatal(err)
				}
			case "planner":
				p := NewPlanner(prov, "test-model", f.workDir, nil, 0, 3)
				if _, _, err := p.Plan(ctx, f.expID, nil, f.ts, "probe goal", nil, passHooks{}, nil); err != nil {
					t.Fatal(err)
				}
			case "mainagent":
				m := NewMainAgent(prov, "test-model", f.workDir, nil, 0, 3)
				if _, err := m.Chat(ctx, f.expID, 0, nil, f.ts, "probe goal", "status?", passHooks{}, nil, nil, nil, nil, nil); err != nil {
					t.Fatal(err)
				}
			case "chat":
				c := NewChatAgent(prov, "test-model", t.TempDir(), nil, 0)
				c.SetGuard(guard.New())
				if _, err := c.Chat(ctx, "assistant", "conv-redirect-probe", "fetch it", 3, 0, false, nil); err != nil {
					t.Fatal(err)
				}
			}

			if pair.startHits.Load() != 1 {
				t.Fatalf("the fetch did not run: %d hits on the origin", pair.startHits.Load())
			}
			if pair.finalHits.Load() != 0 {
				t.Fatal("the redirect was followed to a target no pin covers")
			}
			if keys := openRedirectRequests(t, d, f.taskID); len(keys) != 1 || keys[0] != pair.finalKey {
				t.Fatalf("open requests = %v, want one for %s", keys, pair.finalKey)
			}
		})
	}
}

// In a gated scope the direct retry is off (D-8): with a proxy that refuses the
// connection, the fetch fails with the proxy's error and never leaves without
// it. The proxy is a derived exemption, so its dial asks for nothing.
func TestWebFetchGatedScopeHasNoDirectRetry(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	expID, err := d.CreateExploration("no direct retry probe", "a gated scope has no direct retry")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM explorations WHERE id=$1`, expID) })
	taskID := fmt.Sprint(expID)
	pair := newRedirectPair(t)
	scope := gatedScope(t, d, taskID)
	scope.Interceptor.SetDerivedExemptions(func() []string { return []string{"http://127.0.0.1:1"} })
	ctx := intercept.WithTargetScope(t.Context(), scope)

	out, isErr := callWebFetch(t, ctx, "http://127.0.0.1:1", pair.start)
	if !isErr || !strings.Contains(out, "proxyconnect") || strings.Contains(out, "TARGET_") {
		t.Fatalf("proxied fetch: error=%v out=%q, want the proxy's error", isErr, out)
	}
	if pair.startHits.Load() != 0 || pair.finalHits.Load() != 0 {
		t.Fatalf("hits origin=%d target=%d, want no direct retry", pair.startHits.Load(), pair.finalHits.Load())
	}
	var requests int
	if err := d.QueryRow(`SELECT count(*) FROM intercept_pending WHERE task_id=$1 AND target_key IS NOT NULL`, taskID).Scan(&requests); err != nil || requests != 0 {
		t.Fatalf("%d requests, %v; want none", requests, err)
	}
}

// With the gate off, or without a scope, WebFetch follows redirects as it did
// with agentcore's own tool: to the end of the chain, and the same error after
// 10 hops. No database.
func TestWebFetchRedirectGateOffUnchanged(t *testing.T) {
	pinNoiseOff(t) // a gate-off regression test: independent of ARTEX_NOISE_PROFILE
	loop := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, r.URL.Path+"x", http.StatusFound)
	}))
	t.Cleanup(loop.Close)
	for name, ctx := range map[string]context.Context{
		"no scope": t.Context(),
		"flag off": intercept.WithTargetScope(t.Context(), intercept.TargetScope{TaskID: "7", Enabled: func() bool { return false },
			WaitBound: time.Minute, Interceptor: intercept.New(nil)}),
	} {
		pair := newRedirectPair(t)
		for _, proxy := range []string{"", "http://127.0.0.1:1"} {
			if out, isErr := callWebFetch(t, ctx, proxy, pair.start); isErr || !strings.Contains(out, "redirect-target-reached") {
				t.Fatalf("%s, proxy %q: error=%v out=%q", name, proxy, isErr, out)
			}
		}
		if pair.finalHits.Load() != 2 {
			t.Fatalf("%s: %d hits on the redirect target, want 2", name, pair.finalHits.Load())
		}
		got, _ := callWebFetch(t, ctx, "", loop.URL+"/l")
		want := actool.NewWebFetch(actool.WebFetchConfig{}).Call
		res, err := want(ctx, json.RawMessage(fetchInputJSON(loop.URL+"/l")), &actool.ToolContext{})
		if err != nil || got != res.Flatten() || !strings.Contains(got, "stopped after 10 redirects") {
			t.Fatalf("%s: redirect loop: %q, want agentcore's %q", name, got, res.Flatten())
		}
	}
}

// pinTarget opens the request for the target of rawURL in scope and approves
// it, as a click on the approval card does.
func pinTarget(t *testing.T, d *db.DB, scope intercept.TargetScope, rawURL string) {
	t.Helper()
	ic, input := scope.Interceptor, []byte(fetchInputJSON(rawURL))
	reqs, res := ic.CheckTargets(t.Context(), scope, "WebFetch", input)
	if res.Code != "" || len(reqs) != 1 {
		t.Fatalf("%s: requests=%+v result=%+v, want one request", rawURL, reqs, res)
	}
	scope.WaitBound = 0
	if res = ic.RequestTargets(t.Context(), scope, "WebFetch", input, reqs, nil); res.Code != intercept.TargetApprovalPending || res.PendingID == 0 {
		t.Fatalf("%s: request = %+v", rawURL, res)
	}
	if err := ic.Decide(res.PendingID, true, "test", "192.0.2.1"); err != nil {
		t.Fatal(err)
	}
	taskID, err := strconv.ParseInt(scope.TaskID, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM target_pins WHERE task_id=$1`, taskID) })
}

// callWebFetch runs the WebFetch tool the agents build, with proxy.
func callWebFetch(t *testing.T, ctx context.Context, proxy, u string) (string, bool) {
	t.Helper()
	tools := withWebFetch(ctx, nil, proxy, "")
	if len(tools) != 1 || tools[0].Name() != "WebFetch" {
		t.Fatalf("withWebFetch built %d tools", len(tools))
	}
	res, err := tools[0].Call(ctx, json.RawMessage(fetchInputJSON(u)), &actool.ToolContext{})
	if err != nil {
		t.Fatal(err)
	}
	return res.Flatten(), res.IsError
}
