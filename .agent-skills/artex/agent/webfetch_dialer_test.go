package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/guard"
	"github.com/Autumn-27/artex/intercept"
	actool "github.com/Autumn-27/norma/tool"
)

// Step 2.1: the WebFetch tool of every agent kind connects through the pinned
// dialer. In a gated scope it reaches a target only at an address a pin holds.

// tableResolver answers from a table and counts the lookups.
type tableResolver struct {
	mu      sync.Mutex
	answers map[string][]string
	n       int
}

func newTableResolver() *tableResolver { return &tableResolver{answers: map[string][]string{}} }

func (r *tableResolver) Name() string { return "table" }

func (r *tableResolver) LookupIPs(_ context.Context, host string) ([]netip.Addr, error) {
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

func (r *tableResolver) set(host string, ips ...string) {
	r.mu.Lock()
	r.answers[host] = ips
	r.mu.Unlock()
}

func (r *tableResolver) lookups() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.n
}

// testDialer is the base dialer of the gate in these tests: it records every
// address, connects the routed TEST-NET addresses to local listeners and a
// loopback address to itself, and refuses the rest.
type testDialer struct {
	mu     sync.Mutex
	routes map[string]string
	dialed []string
}

func newTestDialer() *testDialer { return &testDialer{routes: map[string]string{}} }

func (d *testDialer) route(addr, to string) {
	d.mu.Lock()
	d.routes[addr] = to
	d.mu.Unlock()
}

func (d *testDialer) dial(ctx context.Context, network, addr string) (net.Conn, error) {
	d.mu.Lock()
	d.dialed = append(d.dialed, addr)
	to, ok := d.routes[addr]
	d.mu.Unlock()
	if !ok && strings.HasPrefix(addr, "127.0.0.1:") {
		to, ok = addr, true
	}
	if !ok {
		return nil, &net.OpError{Op: "dial", Net: network, Err: errors.New("no route in the test dialer")}
	}
	return (&net.Dialer{}).DialContext(ctx, network, to)
}

func (d *testDialer) calls() []string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return slices.Clone(d.dialed)
}

// dialFixture is a gated scope on task taskID whose gate resolves through a
// table and dials through a testDialer.
func dialFixture(t *testing.T, d *db.DB, taskID string) (intercept.TargetScope, *tableResolver, *testDialer) {
	t.Helper()
	scope := gatedScope(t, d, taskID)
	res, dialer := newTableResolver(), newTestDialer()
	scope.Interceptor.SetResolver(res)
	scope.Interceptor.SetBaseDialer(dialer.dial)
	return scope, res, dialer
}

// listener is an HTTP server that counts its requests; port is its port.
func listener(t *testing.T, body string) (addr, port string, hits *atomic.Int64) {
	t.Helper()
	hits = &atomic.Int64{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	addr = srv.Listener.Addr().String()
	_, port, _ = net.SplitHostPort(addr)
	return addr, port, hits
}

// runAgentKind runs one scripted WebFetch call with the agent kind on ctx.
func runAgentKind(t *testing.T, kind string, f hookReachFixture, ctx context.Context, rawURL string) {
	t.Helper()
	prov := toolCallThenStop("WebFetch", fetchInputJSON(rawURL))
	switch kind {
	case "worker":
		payload := map[string]any{"summary": "dial probe"}
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
		if _, err := c.Chat(ctx, "assistant", "conv-dial-probe", "fetch it", 3, 0, false, nil); err != nil {
			t.Fatal(err)
		}
	}
}

// Each agent kind's WebFetch reaches a pinned name at its pinned address, and
// once the name answers another address it connects nowhere and asks. A fifth
// agent kind built without the dialer fails this table once it is added to it.
func TestWebFetchDialerWiredOnEveryAgentKind(t *testing.T) {
	for _, kind := range []string{"worker", "planner", "mainagent", "chat"} {
		t.Run(kind, func(t *testing.T) {
			f := newHookReachFixture(t)
			d := testDB(t)
			t.Cleanup(func() { _ = d.Close() })
			addr, port, hits := listener(t, "pinned-reached")
			scope, res, dialer := dialFixture(t, d, f.taskID)
			dialer.route("203.0.113.7:"+port, addr)
			dialer.route("203.0.113.9:"+port, addr)
			res.set("a.example", "203.0.113.7")
			u := "http://a.example:" + port + "/"
			pinTarget(t, d, scope, u)
			ctx := intercept.WithTargetScope(t.Context(), scope)

			runAgentKind(t, kind, f, ctx, u)
			if hits.Load() != 1 || !slices.Equal(dialer.calls(), []string{"203.0.113.7:" + port}) {
				t.Fatalf("pinned: hits=%d dialled %v, want the pinned address", hits.Load(), dialer.calls())
			}
			res.set("a.example", "203.0.113.9")
			runAgentKind(t, kind, f, ctx, u)
			if hits.Load() != 1 || len(dialer.calls()) != 1 {
				t.Fatalf("address changed: hits=%d dialled %v, want nothing more", hits.Load(), dialer.calls())
			}
			if keys := openRedirectRequests(t, d, f.taskID); len(keys) != 1 || keys[0] != "a.example:"+port {
				t.Fatalf("open requests = %v, want one for a.example:%s", keys, port)
			}
		})
	}
}

// S2: through a proxy, the dialer is given the proxy's address, never the
// target's. The proxy is a derived exemption: dialled as received, no lookup,
// no row. The connection to the target is the proxy's (step 2.2 binds it).
func TestWebFetchProxiedDialIsTheProxy(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	f := newHookReachFixture(t)
	scope, res, dialer := dialFixture(t, d, f.taskID)
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("via-proxy " + r.URL.Host))
	}))
	t.Cleanup(proxy.Close)
	scope.Interceptor.SetDerivedExemptions(func() []string { return []string{proxy.URL} })
	res.set("a.example", "203.0.113.7")
	ctx := intercept.WithTargetScope(t.Context(), scope)

	out, isErr := callWebFetch(t, ctx, proxy.URL, "http://a.example:8080/")
	if isErr || !strings.Contains(out, "via-proxy a.example:8080") {
		t.Fatalf("proxied fetch: error=%v out=%q", isErr, out)
	}
	if got := dialer.calls(); !slices.Equal(got, []string{proxy.Listener.Addr().String()}) || res.lookups() != 0 {
		t.Fatalf("dialled %v after %d lookups, want the proxy only", got, res.lookups())
	}
	if keys := openRedirectRequests(t, d, f.taskID); len(keys) != 0 {
		t.Fatalf("open requests = %v", keys)
	}
}

// D-8: a run built with the gate off keeps its direct retry when the gate is
// switched on during the run, and the retry goes through the pinned dialer: a
// pinned target is dialled at its pinned address, an unpinned one nowhere.
func TestWebFetchRetryAfterLiveSwitchIsPinned(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	f := newHookReachFixture(t)
	scope, res, dialer := dialFixture(t, d, f.taskID)
	var on atomic.Bool
	scope.Enabled = on.Load
	scope.Interceptor.SetDerivedExemptions(func() []string { return []string{"http://127.0.0.1:1"} })
	addr, port, hits := listener(t, "retry-reached")
	dialer.route("203.0.113.7:"+port, addr)
	dialer.route("203.0.113.8:"+port, addr)
	res.set("a.example", "203.0.113.7")
	res.set("b.example", "203.0.113.8")
	ctx := intercept.WithTargetScope(t.Context(), scope)
	tools := withWebFetch(ctx, nil, "http://127.0.0.1:1", "")

	on.Store(true)
	pinTarget(t, d, scope, "http://a.example:"+port+"/")
	call := func(u string) (string, bool) {
		r, err := tools[0].Call(ctx, json.RawMessage(fetchInputJSON(u)), &actool.ToolContext{})
		if err != nil {
			t.Fatal(err)
		}
		return r.Flatten(), r.IsError
	}
	if out, isErr := call("http://a.example:" + port + "/"); isErr || !strings.Contains(out, "retry-reached") || hits.Load() != 1 {
		t.Fatalf("pinned target through the retry: error=%v out=%q", isErr, out)
	}
	if out, isErr := call("http://b.example:" + port + "/"); !isErr || !strings.Contains(out, intercept.TargetApprovalPending) || hits.Load() != 1 {
		t.Fatalf("unpinned target through the retry: error=%v out=%q", isErr, out)
	}
	want := []string{"127.0.0.1:1", "203.0.113.7:" + port, "127.0.0.1:1"}
	if got := dialer.calls(); !slices.Equal(got, want) {
		t.Fatalf("dialled %v, want %v", got, want)
	}
}
