package server

import (
	"context"
	"encoding/json"
	"fmt"
	"iter"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/llm"
	actool "github.com/Autumn-27/norma/tool"
)

// Step 1.8: the targets the custom tools render. The hook reads the parameters
// of a custom tool, not the URL or the command they produce: the tool runs the
// gate on what it is about to run. Plus the end-to-end run of a gated worker
// and the run of a task with the gate off.

// countingServer is an HTTP server on 127.0.0.1 that counts the requests it
// receives. Its host:port is an IP literal: the gate never resolves it.
func countingServer(t *testing.T) (srv *httptest.Server, hits *atomic.Int64, host, port string) {
	t.Helper()
	hits = &atomic.Int64{}
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("probe-reached"))
	}))
	t.Cleanup(srv.Close)
	u, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	host, port, err = net.SplitHostPort(u.Host)
	if err != nil {
		t.Fatal(err)
	}
	return srv, hits, host, port
}

// gatedCtx is the context of a worker tool call of task: its approval scope
// with the given wait bound.
func gatedCtx(task *Task, wait time.Duration) context.Context {
	ctx := intercept.WithTaskContext(context.Background(), task.ID, "worker", nil)
	return intercept.WithTargetScope(ctx, task.targetScope(wait))
}

func execJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// callTool runs a custom tool the way the harness does and returns its text.
func callTool(t *testing.T, tool actool.CoreTool, ctx context.Context, input string, tc *actool.ToolContext) (string, bool) {
	t.Helper()
	res, err := tool.Call(ctx, json.RawMessage(input), tc)
	if err != nil {
		t.Fatalf("%s: %v", tool.Name(), err)
	}
	return res.Flatten(), res.IsError
}

// openTargetRequest returns the open target request of the task on key.
func openTargetRequest(t *testing.T, pg *db.DB, taskID, key string) (id int64, toolName, toolInput string, ok bool) {
	t.Helper()
	err := pg.QueryRow(`SELECT id, tool_name, tool_input::text FROM intercept_pending
WHERE task_id=$1 AND status='pending' AND target_key=$2`, taskID, key).Scan(&id, &toolName, &toolInput)
	if err != nil {
		return 0, "", "", false
	}
	return id, toolName, toolInput, true
}

func targetRowCount(t *testing.T, pg *db.DB, taskID string) int {
	t.Helper()
	var n int
	if err := pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE task_id=$1 AND (decision_source='target' OR target_key IS NOT NULL)`, taskID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// A custom http tool is gated on the URL it renders, whether the target comes
// from a parameter (here split over two parameters, so the hook reads no
// target in them) or is written in the template. Nothing is sent before an
// approval; an approval lets both through; a revoked pin asks again.
func TestCustomHTTPRenderedTargetGated(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	pg := g.m.pg
	srv, hits, host, port := countingServer(t)
	key := net.JoinHostPort(host, port)
	dot := strings.LastIndexByte(host, '.')

	rendered := g.s.buildCustomTool(&db.Tool{Key: "probe_http", Kind: "http",
		Schema: json.RawMessage(`{"type":"object","properties":{"last":{"type":"string"},"port":{"type":"string"}}}`),
		Exec:   execJSON(t, map[string]any{"method": "GET", "url": "http://" + host[:dot+1] + "{last}:{port}/rendered"})})
	params := fmt.Sprintf(`{"last":%q,"port":%q}`, host[dot+1:], port)
	fixed := g.s.buildCustomTool(&db.Tool{Key: "probe_fixed", Kind: "http",
		Exec: execJSON(t, map[string]any{"method": "GET", "url": srv.URL + "/fixed"})})
	// The hook cannot see either target: neither input names one.
	for _, in := range []struct{ tool, input string }{{"probe_http", params}, {"probe_fixed", `{}`}} {
		if got := intercept.ExtractTargets(in.tool, []byte(in.input)); len(got) != 0 {
			t.Fatalf("%s: the hook reads %+v; the test needs a target only the rendering shows", in.tool, got)
		}
	}

	// The template's own URL, wait bound 0: blocked at once, nothing sent, the
	// request open with the rendered URL as its input.
	out, isErr := callTool(t, fixed, gatedCtx(task, 0), `{}`, nil)
	if !isErr || !strings.Contains(out, "TARGET_APPROVAL_PENDING") || !strings.Contains(out, key) || hits.Load() != 0 {
		t.Fatalf("hard-coded URL: error=%v out=%q hits=%d", isErr, out, hits.Load())
	}
	id, toolName, toolInput, ok := openTargetRequest(t, pg, task.ID, key)
	if !ok || toolName != "probe_fixed" || !strings.Contains(toolInput, srv.URL+"/fixed") {
		t.Fatalf("request row: ok=%v tool=%q input=%s", ok, toolName, toolInput)
	}

	// The rendered URL names the same host and port: the call attaches to the
	// open request and waits. One click lets it through.
	type result struct {
		out   string
		isErr bool
	}
	done := make(chan result, 1)
	go func() {
		res, err := rendered.Call(gatedCtx(task, 30*time.Second), json.RawMessage(params), nil)
		if err != nil {
			done <- result{err.Error(), true}
			return
		}
		done <- result{res.Flatten(), res.IsError}
	}()
	time.Sleep(300 * time.Millisecond)
	if hits.Load() != 0 {
		t.Fatal("the rendered URL was fetched before the approval")
	}
	if n := targetRowCount(t, pg, task.ID); n != 1 {
		t.Fatalf("%d target rows, want the one request", n)
	}
	if code, body := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"allowed"}`); code != 200 {
		t.Fatalf("decide: %d %v", code, body)
	}
	select {
	case r := <-done:
		if r.isErr || !strings.Contains(r.out, "probe-reached") || hits.Load() != 1 {
			t.Fatalf("after the approval: error=%v out=%q hits=%d", r.isErr, r.out, hits.Load())
		}
	case <-time.After(30 * time.Second):
		t.Fatal("the waiting call did not end after the approval")
	}
	if out, isErr := callTool(t, fixed, gatedCtx(task, 0), `{}`, nil); isErr || hits.Load() != 2 {
		t.Fatalf("pinned, hard-coded URL: error=%v out=%q hits=%d", isErr, out, hits.Load())
	}

	// Revoked: the next call asks again and sends nothing.
	pins, err := pg.ListTargetPins(taskRef(t, task))
	if err != nil || len(pins) != 1 || pins[0].Host != host || fmt.Sprint(pins[0].Port) != port {
		t.Fatalf("pins = %+v, %v", pins, err)
	}
	if code, _ := g.do(t, "POST", fmt.Sprintf("/api/tasks/%s/target-pins/%d/revoke", task.ID, pins[0].ID), ""); code != 200 {
		t.Fatalf("revoke: %d", code)
	}
	out, isErr = callTool(t, rendered, gatedCtx(task, 0), params, nil)
	if !isErr || !strings.Contains(out, "TARGET_APPROVAL_PENDING") || hits.Load() != 2 {
		t.Fatalf("revoked: error=%v out=%q hits=%d", isErr, out, hits.Load())
	}
	if again, toolName, _, ok := openTargetRequest(t, pg, task.ID, key); !ok || again == id || toolName != "probe_http" {
		t.Fatalf("after the revoke: open request %d (ok=%v, tool %q), want a new one", again, ok, toolName)
	}

	// A URL whose target cannot be read is blocked, never sent.
	broken := g.s.buildCustomTool(&db.Tool{Key: "probe_broken", Kind: "http",
		Schema: json.RawMessage(`{"type":"object","properties":{"host":{"type":"string"}}}`),
		Exec:   execJSON(t, map[string]any{"url": "http://{host}/x"})})
	out, isErr = callTool(t, broken, gatedCtx(task, 0), `{"host":"a b"}`, nil)
	if !isErr || !strings.Contains(out, "TARGET_GATE_UNAVAILABLE") {
		t.Fatalf("unreadable URL: error=%v out=%q", isErr, out)
	}
}

// A custom command tool is gated on the command it renders, with a target
// written in the template or formed by a parameter inside a host name. The
// command does not run before an approval.
func TestCustomCommandRenderedTargetGated(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	pg := g.m.pg
	res := &countingResolver{answers: map[string][]string{"api.example.com": {"198.51.100.7"}}}
	g.m.interceptor.SetResolver(res)
	dir := t.TempDir()
	marker := filepath.Join(dir, "marker")
	ran := func() bool {
		_, err := os.Stat(marker)
		return err == nil
	}

	fixed := g.s.buildCustomTool(&db.Tool{Key: "probe_cmd_fixed", Kind: "command",
		Exec: execJSON(t, map[string]any{"command": "echo reached > '" + marker + "' && : http://198.51.100.7:8080/"})})
	glued := g.s.buildCustomTool(&db.Tool{Key: "probe_cmd", Kind: "command",
		Schema: json.RawMessage(`{"type":"object","properties":{"sub":{"type":"string"}}}`),
		Exec:   execJSON(t, map[string]any{"command": "echo reached > '" + marker + "' && : http://{sub}.example.com:8080/"})})
	if got := intercept.ExtractTargets("probe_cmd", []byte(`{"sub":"api"}`)); len(got) != 0 {
		t.Fatalf("the hook reads %+v; the test needs a target only the rendering shows", got)
	}
	tc := &actool.ToolContext{WorkingDir: dir}

	for _, c := range []struct {
		name  string
		tool  actool.CoreTool
		input string
		key   string
	}{
		{"template", fixed, `{}`, "198.51.100.7:8080"},
		{"parameter inside the host", glued, `{"sub":"api"}`, "api.example.com:8080"},
	} {
		out, isErr := callTool(t, c.tool, gatedCtx(task, 0), c.input, tc)
		if !isErr || !strings.Contains(out, "TARGET_APPROVAL_PENDING") || ran() {
			t.Fatalf("%s: error=%v out=%q ran=%v, want a block before the command runs", c.name, isErr, out, ran())
		}
		id, toolName, _, ok := openTargetRequest(t, pg, task.ID, c.key)
		if !ok || toolName != c.tool.Name() {
			t.Fatalf("%s: no open request on %s for %s", c.name, c.key, c.tool.Name())
		}
		if code, body := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"allowed"}`); code != 200 {
			t.Fatalf("%s: decide: %d %v", c.name, code, body)
		}
		if out, isErr := callTool(t, c.tool, gatedCtx(task, 0), c.input, tc); isErr || !ran() {
			t.Fatalf("%s, approved: error=%v out=%q ran=%v", c.name, isErr, out, ran())
		}
		_ = os.Remove(marker)
	}
	if res.lookups() == 0 {
		t.Fatal("the name formed by the parameter was never resolved")
	}
}

// The custom-tool test endpoint is the operator's own action (D14): it has no
// approval scope, so the gate is not on there, whatever the tasks say.
func TestCustomToolTestEndpointUngated(t *testing.T) {
	g := newGateServer(t)
	on := true
	g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	_, hits, host, port := countingServer(t)
	before := 0
	if err := g.m.pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE decision_source='target' OR target_key IS NOT NULL`).Scan(&before); err != nil {
		t.Fatal(err)
	}
	body := fmt.Sprintf(`{"kind":"http","exec":{"url":"http://%s:{port}/test"},"params":{"port":%q}}`, host, port)
	code, out := g.do(t, "POST", "/api/tools/custom/test", body)
	if code != 200 || out["is_error"] != false || !strings.Contains(fmt.Sprint(out["output"]), "probe-reached") || hits.Load() != 1 {
		t.Fatalf("http: %d %v hits=%d", code, out, hits.Load())
	}
	code, out = g.do(t, "POST", "/api/tools/custom/test", `{"kind":"command","exec":{"command":": http://198.51.100.7:8080/ && echo ran-ungated"}}`)
	if code != 200 || !strings.Contains(fmt.Sprint(out["output"]), "ran-ungated") {
		t.Fatalf("command: %d %v", code, out)
	}
	after := 0
	if err := g.m.pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE decision_source='target' OR target_key IS NOT NULL`).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if after != before {
		t.Fatalf("the test endpoint wrote %d target rows", after-before)
	}
}

// countingResolver answers from a table and counts every lookup.
type countingResolver struct {
	mu      sync.Mutex
	answers map[string][]string
	n       int
}

func (r *countingResolver) Name() string { return "counting" }

func (r *countingResolver) LookupIPs(_ context.Context, host string) ([]netip.Addr, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.n++
	var out []netip.Addr
	for _, ip := range r.answers[host] {
		out = append(out, netip.MustParseAddr(ip))
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no answer for %s", host)
	}
	return out, nil
}

func (r *countingResolver) lookups() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.n
}

// scriptedCall is one tool call of a toolScript.
type scriptedCall struct{ tool, input string }

func fetches(urls ...string) []scriptedCall {
	calls := make([]scriptedCall, len(urls))
	for n, u := range urls {
		calls[n] = scriptedCall{"WebFetch", fmt.Sprintf(`{"url":%q}`, u)}
	}
	return calls
}

// toolScript is a model that makes each of its calls in turn, one per turn,
// then ends the run. It hands the result of every call to the test, and waits
// before turn n while hold[n] is open.
type toolScript struct {
	calls   []scriptedCall
	hold    map[int64]chan struct{}
	results chan string
	turn    atomic.Int64
}

func (p *toolScript) Stream(ctx context.Context, req llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	n := p.turn.Add(1)
	if n > 1 {
		select {
		case p.results <- lastToolResult(req.Messages):
		default:
		}
	}
	if h := p.hold[n]; h != nil {
		select {
		case <-h:
		case <-ctx.Done():
		}
	}
	events := []llm.StreamEvent{{Type: llm.SETextDelta, Text: "done"}, {Type: llm.SEMessageDelta, StopReason: "end_turn"}}
	if int(n) <= len(p.calls) {
		call := p.calls[n-1]
		events = []llm.StreamEvent{
			{Type: llm.SEToolUseStart, ToolID: fmt.Sprintf("call-%d", n), ToolName: call.tool},
			{Type: llm.SEToolInputJSON, Text: call.input},
			{Type: llm.SEMessageDelta, StopReason: "tool_use"},
		}
	}
	return func(yield func(llm.StreamEvent, error) bool) {
		for _, event := range events {
			if !yield(event, nil) {
				return
			}
		}
	}
}

func (p *toolScript) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return accumulateStreamForTest(ctx, p.Stream, req)
}

func (p *toolScript) next(t *testing.T) string {
	t.Helper()
	select {
	case r := <-p.results:
		return r
	case <-time.After(60 * time.Second):
		t.Fatal("the worker did not hand back a tool result")
		return ""
	}
}

// lastToolResult is the text of the last tool result the model is shown.
func lastToolResult(msgs []llm.Message) string {
	for i := len(msgs) - 1; i >= 0; i-- {
		for _, b := range msgs[i].Content {
			if b.Type != llm.BlockToolResult {
				continue
			}
			var s strings.Builder
			if b.IsError {
				s.WriteString("[error] ")
			}
			for _, c := range b.Content {
				s.WriteString(c.Text)
			}
			return s.String()
		}
	}
	return ""
}

// runScriptedWorker claims one intent of task and runs it with a worker driven
// by p, in the background. extra are tools the worker has besides its own.
func runScriptedWorker(t *testing.T, g *gateServer, task *Task, p llm.Provider, extra ...actool.CoreTool) <-chan struct{} {
	t.Helper()
	if _, err := task.Store.AddIntent(map[string]any{"summary": "fetch the probe"}, 1, nil, "planner"); err != nil {
		t.Fatal(err)
	}
	intent, token := g.s.engine.claimNext(task, "work#1")
	if intent == nil {
		t.Fatal("no intent claimed")
	}
	worker := agent.NewWorker(p, "test-model", g.m.dir, nil, 0, 8, extra...)
	done := make(chan struct{})
	go func() {
		defer close(done)
		g.s.engine.runIntent(context.Background(), task, "work#1", worker, intent, token, "", "")
	}()
	t.Cleanup(func() {
		select {
		case <-done:
		case <-time.After(60 * time.Second):
			t.Error("the worker run did not end")
		}
	})
	return done
}

// A gated task end to end: a worker's WebFetch waits on a request, a click
// through the API pins the address and the call is made, the next call passes
// on the pin, the pin is listed and revoked, and the call after asks again.
func TestTargetGateEndToEnd(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	pg := g.m.pg
	srv, hits, host, port := countingServer(t)
	key := net.JoinHostPort(host, port)
	target := srv.URL + "/e2e"
	p := &toolScript{calls: fetches(target, target, target), results: make(chan string, 16),
		hold: map[int64]chan struct{}{3: make(chan struct{})}}
	done := runScriptedWorker(t, g, task, p)

	var id int64
	waitUntil(t, "the first request", func() bool {
		var ok bool
		id, _, _, ok = openTargetRequest(t, pg, task.ID, key)
		return ok
	})
	if hits.Load() != 0 {
		t.Fatal("fetched before the approval")
	}
	if code, body := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"allowed"}`); code != 200 {
		t.Fatalf("decide: %d %v", code, body)
	}
	if r := p.next(t); !strings.Contains(r, "probe-reached") || hits.Load() != 1 {
		t.Fatalf("first call after the approval: %q hits=%d", r, hits.Load())
	}
	if r := p.next(t); !strings.Contains(r, "probe-reached") || hits.Load() != 2 {
		t.Fatalf("second call, pinned: %q hits=%d", r, hits.Load())
	}
	var requests int
	if err := pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE task_id=$1 AND target_key IS NOT NULL`, task.ID).Scan(&requests); err != nil || requests != 1 {
		t.Fatalf("%d requests, %v; want the one that was approved", requests, err)
	}

	code, body := g.do(t, "GET", "/api/tasks/"+task.ID+"/target-pins", "")
	pins, _ := body["pins"].([]any)
	if code != 200 || len(pins) != 1 {
		t.Fatalf("pins: %d %v", code, body)
	}
	pin := pins[0].(map[string]any)
	if pin["host"] != host || fmt.Sprint(pin["port"]) != port || pin["status"] != "active" || fmt.Sprint(pin["pinned_ips"]) != "["+host+"]" {
		t.Fatalf("listed pin = %v", pin)
	}
	pinID, _ := pin["id"].(float64)
	if code, _ := g.do(t, "POST", fmt.Sprintf("/api/tasks/%s/target-pins/%d/revoke", task.ID, int64(pinID)), ""); code != 200 {
		t.Fatalf("revoke: %d", code)
	}
	close(p.hold[3])

	var again int64
	waitUntil(t, "the request after the revoke", func() bool {
		var ok bool
		again, _, _, ok = openTargetRequest(t, pg, task.ID, key)
		return ok && again != id
	})
	if code, body := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", again), `{"decision":"denied"}`); code != 200 {
		t.Fatalf("deny: %d %v", code, body)
	}
	if r := p.next(t); !strings.Contains(r, "TARGET_DENIED") || hits.Load() != 2 {
		t.Fatalf("third call, revoked then denied: %q hits=%d", r, hits.Load())
	}
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		t.Fatal("the worker run did not end")
	}
}

// A custom tool in a gated worker session. A deny rule on the call decides
// first, at the hook: the tool never runs, so its rendered target is never
// read, resolved or requested. The next call, which no rule refuses, is gated
// inside the tool on the URL it renders.
func TestDenyRuleWinsBeforeRenderedTarget(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	pg, ic := g.m.pg, g.m.interceptor
	_, hits, _, port := countingServer(t)
	res := &countingResolver{answers: map[string][]string{"api.example.com": {"127.0.0.1"}}}
	ic.SetResolver(res)

	prior, err := ic.GetEnabledTools()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ic.SetEnabledTools(prior) })
	if err := ic.SetEnabledTools(append(slices.Clone(prior), "probe_http")); err != nil {
		t.Fatal(err)
	}
	const sentinel = "ARTEX_RENDERED_DENY_PROBE"
	rule, err := pg.CreateInterceptRule("rendered deny probe", "tool_input", "string", sentinel, "deny", "", 1000000, true, false, 0, "deny")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = pg.DeleteInterceptRule(rule.ID)
		ic.Invalidate()
	})
	ic.Invalidate()

	tool := g.s.buildCustomTool(&db.Tool{Key: "probe_http", Kind: "http",
		Schema: json.RawMessage(`{"type":"object","properties":{"sub":{"type":"string"},"note":{"type":"string"}}}`),
		Exec:   execJSON(t, map[string]any{"url": "http://{sub}.example.com:" + port + "/deny"})})
	p := &toolScript{calls: []scriptedCall{
		{"probe_http", `{"sub":"api","note":"` + sentinel + `"}`},
		{"probe_http", `{"sub":"api"}`},
	}, results: make(chan string, 16), hold: map[int64]chan struct{}{2: make(chan struct{})}}
	done := runScriptedWorker(t, g, task, p, tool)

	if r := p.next(t); !strings.Contains(r, "intercepted by the platform") || strings.Contains(r, "TARGET_") {
		t.Fatalf("call refused by the rule: %q", r)
	}
	if n, rows := res.lookups(), targetRowCount(t, pg, task.ID); n != 0 || rows != 0 || hits.Load() != 0 {
		t.Fatalf("after the deny: %d lookups, %d target rows, %d requests sent; want none", n, rows, hits.Load())
	}
	close(p.hold[2])

	key := "api.example.com:" + port
	var id int64
	waitUntil(t, "the request for the rendered target", func() bool {
		var ok bool
		var tool string
		id, tool, _, ok = openTargetRequest(t, pg, task.ID, key)
		return ok && tool == "probe_http"
	})
	if code, body := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"denied"}`); code != 200 {
		t.Fatalf("deny: %d %v", code, body)
	}
	if r := p.next(t); !strings.Contains(r, "TARGET_DENIED") || hits.Load() != 0 || res.lookups() == 0 {
		t.Fatalf("rendered target: %q, %d requests sent, %d lookups", r, hits.Load(), res.lookups())
	}
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		t.Fatal("the worker run did not end")
	}
}

// Documents a known limit: script tools stay advisory (D9). A custom script
// tool's target is in its stored code, which neither the hook nor the tool
// reads, so in a gated task the call is allowed and the script reaches a target
// nobody approved: no lookup, no request, no row. This test changes only if
// that decision changes.
func TestBypass_CustomScriptToolTargetNotGated(t *testing.T) {
	if detectPython() == "" {
		t.Skip("python3 unavailable")
	}
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	res := &countingResolver{answers: map[string][]string{"localhost": {"127.0.0.1"}}}
	g.m.interceptor.SetResolver(res)
	_, hits, _, port := countingServer(t)

	code := "import urllib.request\n" +
		"opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))\n" +
		"print(opener.open('http://localhost:" + port + "/script', timeout=20).read().decode())\n"
	tool := g.s.buildCustomTool(&db.Tool{Key: "probe_script", Kind: "script", Exec: execJSON(t, map[string]any{"code": code})})
	// The gate sees no target in the call: only the parameters reach the hook.
	if got := intercept.ExtractTargets("probe_script", []byte(`{}`)); len(got) != 0 {
		t.Fatalf("the hook reads %+v; the test needs a target only the stored code names", got)
	}

	p := &toolScript{calls: []scriptedCall{{"probe_script", `{}`}}, results: make(chan string, 16)}
	done := runScriptedWorker(t, g, task, p, tool)
	if r := p.next(t); !strings.Contains(r, "probe-reached") || strings.Contains(r, "TARGET_") {
		t.Fatalf("script tool in a gated task: %q, want it allowed and the target reached", r)
	}
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		t.Fatal("the worker run did not end")
	}
	if hits.Load() != 1 {
		t.Fatalf("%d requests reached the unapproved target, want 1 (the gap)", hits.Load())
	}
	if n, rows := res.lookups(), targetRowCount(t, g.m.pg, task.ID); n != 0 || rows != 0 {
		t.Fatalf("%d lookups, %d target rows; the gate did see the script's target", n, rows)
	}
}

// A task with the gate off (the default) runs as before: a worker's WebFetch
// and the custom tools reach their targets, and the gate writes no row and
// resolves no name.
func TestGateOffTaskIsUnchanged(t *testing.T) {
	g := newGateServer(t)
	task := g.newTask(t, db.TaskCreateOptions{})
	res := &countingResolver{answers: map[string][]string{"localhost": {"127.0.0.1"}}}
	g.m.interceptor.SetResolver(res)
	_, hits, _, port := countingServer(t)
	byName := "http://localhost:" + port

	p := &toolScript{calls: fetches(byName+"/a", byName+"/b"), results: make(chan string, 16)}
	done := runScriptedWorker(t, g, task, p)
	for n := 1; n <= 2; n++ {
		if r := p.next(t); !strings.Contains(r, "probe-reached") {
			t.Fatalf("WebFetch %d: %q", n, r)
		}
	}
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		t.Fatal("the worker run did not end")
	}

	httpTool := g.s.buildCustomTool(&db.Tool{Key: "probe_http", Kind: "http",
		Schema: json.RawMessage(`{"type":"object","properties":{"port":{"type":"string"}}}`),
		Exec:   execJSON(t, map[string]any{"url": "http://localhost:{port}/c"})})
	if out, isErr := callTool(t, httpTool, gatedCtx(task, intercept.DefaultTargetWaitBound), fmt.Sprintf(`{"port":%q}`, port), nil); isErr || !strings.Contains(out, "probe-reached") {
		t.Fatalf("custom http tool: error=%v out=%q", isErr, out)
	}
	cmdTool := g.s.buildCustomTool(&db.Tool{Key: "probe_cmd", Kind: "command",
		Exec: execJSON(t, map[string]any{"command": ": http://localhost:" + port + "/ && echo ran-gate-off"})})
	if out, isErr := callTool(t, cmdTool, gatedCtx(task, intercept.DefaultTargetWaitBound), `{}`, &actool.ToolContext{WorkingDir: t.TempDir()}); isErr || !strings.Contains(out, "ran-gate-off") {
		t.Fatalf("custom command tool: error=%v out=%q", isErr, out)
	}

	if hits.Load() != 3 {
		t.Fatalf("%d requests reached the server, want 3", hits.Load())
	}
	if n := targetRowCount(t, g.m.pg, task.ID); n != 0 {
		t.Fatalf("%d target rows, want none", n)
	}
	if n := res.lookups(); n != 0 {
		t.Fatalf("%d lookups, want none", n)
	}
}
