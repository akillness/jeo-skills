package server

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
)

// Step 2.1: the custom http tool connects directly through the pinned dialer
// in a gated scope, and a gated worker's WebFetch end to end.

// routeDialer is the base dialer of the gate in these tests: it records every
// address, connects the routed TEST-NET addresses to local listeners, and
// refuses the rest.
type routeDialer struct {
	mu     sync.Mutex
	routes map[string]string
	dialed []string
}

func newRouteDialer(g *gateServer) *routeDialer {
	d := &routeDialer{routes: map[string]string{}}
	g.m.interceptor.SetBaseDialer(d.dial)
	return d
}

func (d *routeDialer) route(addr, to string) {
	d.mu.Lock()
	d.routes[addr] = to
	d.mu.Unlock()
}

func (d *routeDialer) dial(ctx context.Context, network, addr string) (net.Conn, error) {
	d.mu.Lock()
	d.dialed = append(d.dialed, addr)
	to, ok := d.routes[addr]
	d.mu.Unlock()
	if !ok {
		return nil, &net.OpError{Op: "dial", Net: network, Err: errors.New("no route in the test dialer")}
	}
	return (&net.Dialer{}).DialContext(ctx, network, to)
}

func (d *routeDialer) calls() []string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return slices.Clone(d.dialed)
}

func (r *countingResolver) set(host string, ips ...string) {
	r.mu.Lock()
	r.answers[host] = ips
	r.mu.Unlock()
}

// approveTarget opens the request of a gated http tool call on key and approves it.
func approveTarget(t *testing.T, g *gateServer, task *Task, tool interface {
	Name() string
}, call func() (string, bool), key string) {
	t.Helper()
	if out, isErr := call(); !isErr || !strings.Contains(out, "TARGET_APPROVAL_PENDING") {
		t.Fatalf("%s before the approval: error=%v out=%q", tool.Name(), isErr, out)
	}
	id, _, _, ok := openTargetRequest(t, g.m.pg, task.ID, key)
	if !ok {
		t.Fatalf("no request on %s", key)
	}
	decide(t, g, id, "allowed")
}

// A gated direct call reaches its target at the pinned address; once the name
// answers another address, the rendered-URL gate passes on the cached answer
// and the dial connects nowhere.
func TestCustomHTTPDirectDialPinned(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	srv, hits, _, port := countingServer(t)
	res := &countingResolver{answers: map[string][]string{"api.example.com": {"203.0.113.7"}}}
	g.m.interceptor.SetResolver(res)
	dialer := newRouteDialer(g)
	dialer.route("203.0.113.7:"+port, srv.Listener.Addr().String())
	dialer.route("203.0.113.9:"+port, srv.Listener.Addr().String())
	key := "api.example.com:" + port
	tool := g.s.buildCustomTool(&db.Tool{Key: "probe_dial", Kind: "http",
		Exec: execJSON(t, map[string]any{"url": "http://" + key + "/dial"})})
	call := func() (string, bool) { return callTool(t, tool, gatedCtx(task, 0), `{}`, nil) }
	approveTarget(t, g, task, tool, call, key)

	if out, isErr := call(); isErr || !strings.Contains(out, "probe-reached") || hits.Load() != 1 {
		t.Fatalf("pinned call: error=%v out=%q hits=%d", isErr, out, hits.Load())
	}
	res.set("api.example.com", "203.0.113.9")
	out, isErr := call()
	if !isErr || !strings.Contains(out, "TARGET_APPROVAL_PENDING: the connection to "+key+" was not opened") || hits.Load() != 1 {
		t.Fatalf("rebound name: error=%v out=%q hits=%d", isErr, out, hits.Load())
	}
	if got := dialer.calls(); !slices.Equal(got, []string{"203.0.113.7:" + port}) {
		t.Fatalf("dialled %v, want the pinned address once", got)
	}
	if _, toolName, input, ok := openTargetRequest(t, g.m.pg, task.ID, key); !ok || toolName != "probe_dial" || !strings.Contains(input, "dial") {
		t.Fatalf("request at the dial: ok=%v tool=%q input=%s", ok, toolName, input)
	}
}

// With the gate off (and without a scope) the call keeps http.DefaultTransport:
// no transport is built. A spec with a proxy keeps its proxy transport, without
// a dialer. Gate on and direct: a transport with the pinned dialer, no
// environment proxy, keep-alive off.
func TestCustomHTTPGateOffTransportUnchanged(t *testing.T) {
	s := &Server{}
	direct := httpExec{URL: "http://api.example.com/"}
	scope := func(on bool) context.Context {
		return intercept.WithTargetScope(context.Background(), intercept.TargetScope{TaskID: "7", Enabled: func() bool { return on }})
	}
	for name, ctx := range map[string]context.Context{"no scope": context.Background(), "flag off": scope(false)} {
		if tr := s.httpToolTransport(ctx, "probe", direct); tr != nil {
			t.Fatalf("%s: transport %+v, want nil (http.DefaultTransport)", name, tr)
		}
	}
	if tr := s.httpToolTransport(scope(true), "probe", httpExec{URL: direct.URL, Proxy: "http://127.0.0.1:1"}); tr == nil || tr.Proxy == nil || tr.DialContext != nil {
		t.Fatalf("operator proxy: transport %+v, want the proxy transport without a dialer", tr)
	}
	if tr := s.httpToolTransport(scope(true), "probe", direct); tr == nil || tr.Proxy != nil || tr.DialContext == nil || !tr.DisableKeepAlives {
		t.Fatalf("gated direct call: transport %+v", tr)
	}
}

// The proxy URL of the http tool's transport: an address with a scheme is kept
// as is, a bare host:port gets "http://"; never a doubled scheme.
func TestHTTPProxyTransportProxyScheme(t *testing.T) {
	req := httptest.NewRequest("GET", "http://api.example.com/", nil)
	for _, c := range []struct {
		name, globalProxy string
		spec              httpExec
		want              string
	}{
		{"recording proxy, global proxy with a scheme", "http://127.0.0.1:3128", httpExec{UseRecordingProxy: true}, "http://127.0.0.1:3128"},
		{"operator proxy with a scheme", "", httpExec{Proxy: "http://10.0.0.5:8080"}, "http://10.0.0.5:8080"},
		{"operator proxy as bare host:port", "", httpExec{Proxy: " 10.0.0.5:8080 "}, "http://10.0.0.5:8080"},
	} {
		s := &Server{m: &Manager{globalProxy: c.globalProxy}}
		tr := s.httpProxyTransport(c.spec)
		if tr == nil || tr.Proxy == nil {
			t.Fatalf("%s: transport %+v, want a proxy transport", c.name, tr)
		}
		u, err := tr.Proxy(req)
		if err != nil || u == nil || u.String() != c.want {
			t.Fatalf("%s: Proxy(req) = %v, %v; want %s", c.name, u, err, c.want)
		}
	}
}

// passRoundTripper stands in for an http.DefaultTransport that is not an
// *http.Transport; it hands every request to the original transport.
type passRoundTripper struct{ next http.RoundTripper }

func (p passRoundTripper) RoundTrip(r *http.Request) (*http.Response, error) {
	return p.next.RoundTrip(r)
}

// With http.DefaultTransport replaced by another RoundTripper, a gated direct
// call still gets a transport with the pinned dialer instead of a panic.
func TestHTTPToolTransportDefaultTransportNotStd(t *testing.T) {
	orig := http.DefaultTransport
	http.DefaultTransport = passRoundTripper{next: orig}
	defer func() { http.DefaultTransport = orig }()
	ctx := intercept.WithTargetScope(context.Background(), intercept.TargetScope{TaskID: "7", Enabled: func() bool { return true }})
	tr := (&Server{}).httpToolTransport(ctx, "probe", httpExec{URL: "http://api.example.com/"})
	if tr == nil || tr.DialContext == nil {
		t.Fatalf("transport %+v, want one with the pinned dialer", tr)
	}
}

// A redirect of a pinned origin to a pinned hop: the hop is dialled at the
// hop's pinned address.
func TestCustomHTTPRedirectHopDialPinned(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	final, finalHits, _, finalPort := countingServer(t)
	hopKey := "hop.example.com:" + finalPort
	start, _, startAddr := redirectingServer(t, "http://"+hopKey+"/final")
	_, startPort, _ := net.SplitHostPort(startAddr)
	originKey := "api.example.com:" + startPort
	res := &countingResolver{answers: map[string][]string{"api.example.com": {"203.0.113.7"}, "hop.example.com": {"203.0.113.8"}}}
	g.m.interceptor.SetResolver(res)
	dialer := newRouteDialer(g)
	dialer.route("203.0.113.7:"+startPort, start.Listener.Addr().String())
	dialer.route("203.0.113.8:"+finalPort, final.Listener.Addr().String())
	// Were the hop dialled at the origin's address, it would still reach it.
	dialer.route("203.0.113.7:"+finalPort, final.Listener.Addr().String())
	tool := g.s.buildCustomTool(&db.Tool{Key: "probe_hop", Kind: "http",
		Exec: execJSON(t, map[string]any{"url": "http://" + originKey + "/start"})})
	call := func() (string, bool) { return callTool(t, tool, gatedCtx(task, 0), `{}`, nil) }
	approveTarget(t, g, task, tool, call, originKey)
	approveTarget(t, g, task, tool, call, hopKey)

	before := len(dialer.calls())
	if out, isErr := call(); isErr || !strings.Contains(out, "probe-reached") || finalHits.Load() != 1 {
		t.Fatalf("pinned hop: error=%v out=%q", isErr, out)
	}
	if got := dialer.calls()[before:]; !slices.Equal(got, []string{"203.0.113.7:" + startPort, "203.0.113.8:" + finalPort}) {
		t.Fatalf("dialled %v, want the origin's then the hop's pinned address", got)
	}
}

// The custom-tool test endpoint has no scope (D14): its connection never goes
// through the gate's dialer, and nothing is written.
func TestCustomToolTestEndpointDialUngated(t *testing.T) {
	g := newGateServer(t)
	on := true
	g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	dialer := newRouteDialer(g)
	_, hits, host, port := countingServer(t)
	before := 0
	if err := g.m.pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE decision_source='target' OR target_key IS NOT NULL`).Scan(&before); err != nil {
		t.Fatal(err)
	}
	code, out := g.do(t, "POST", "/api/tools/custom/test", fmt.Sprintf(`{"kind":"http","exec":{"url":"http://%s:%s/test"}}`, host, port))
	if code != 200 || out["is_error"] != false || hits.Load() != 1 || len(dialer.calls()) != 0 {
		t.Fatalf("test endpoint: %d %v hits=%d dialled %v", code, out, hits.Load(), dialer.calls())
	}
	after := 0
	if err := g.m.pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE decision_source='target' OR target_key IS NOT NULL`).Scan(&after); err != nil || after != before {
		t.Fatalf("the test endpoint wrote %d target rows (%v)", after-before, err)
	}
}

// Documents a known limit: a custom http tool that goes through a proxy is not
// bound to pins. The pinned dialer covers direct connections only; through a
// proxy the connection to the target is the proxy's, and the proxy here
// connects to a peer nobody pinned. Step 2.2 binds the recording proxy (and
// flips its half of this test); an operator-written proxy stays unbound
// (OPEN-6).
func TestBypass_CustomHTTPProxyPeerNotPinned(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	_, hits, _, port := countingServer(t)
	peer := "127.0.0.1:" + port
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Whatever the request names, the proxy connects to peer.
		resp, err := http.Get("http://" + peer + r.URL.Path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		_, _ = io.Copy(w, resp.Body)
	}))
	t.Cleanup(proxy.Close)
	res := &countingResolver{answers: map[string][]string{"api.example.com": {"203.0.113.7"}}}
	g.m.interceptor.SetResolver(res)
	dialer := newRouteDialer(g)
	key := "api.example.com:" + port
	url := "http://" + key + "/bypass"
	direct := g.s.buildCustomTool(&db.Tool{Key: "probe_bypass", Kind: "http", Exec: execJSON(t, map[string]any{"url": url})})
	approveTarget(t, g, task, direct, func() (string, bool) { return callTool(t, direct, gatedCtx(task, 0), `{}`, nil) }, key)

	// The global proxy carries a scheme, as in production (ProxyAddr returns it
	// as is with capture off); httpProxyTransport must not write a second one.
	g.m.mu.Lock()
	g.m.globalProxy = proxy.URL
	g.m.mu.Unlock()
	t.Cleanup(func() {
		g.m.mu.Lock()
		g.m.globalProxy = ""
		g.m.mu.Unlock()
	})
	for name, exec := range map[string]map[string]any{
		"operator proxy":      {"url": url, "proxy": proxy.URL},
		"use_recording_proxy": {"url": url, "use_recording_proxy": true},
	} {
		before := hits.Load()
		tool := g.s.buildCustomTool(&db.Tool{Key: "probe_bypass", Kind: "http", Exec: execJSON(t, exec)})
		if out, isErr := callTool(t, tool, gatedCtx(task, 0), `{}`, nil); isErr || !strings.Contains(out, "probe-reached") || hits.Load() != before+1 {
			t.Fatalf("%s: error=%v out=%q", name, isErr, out)
		}
	}
	if got := dialer.calls(); len(got) != 0 {
		t.Fatalf("dialled %v; the pinned address 203.0.113.7 is never dialled through a proxy", got)
	}
}

// A gated worker's WebFetch end to end: approved, the next call passes; the
// name then answers another address from the next lookup on, so the following
// call passes the hook on the cached answer and fails at the dial with
// TARGET_APPROVAL_PENDING. The new_ip request is approved through the API and
// the call after passes.
func TestTargetGateEndToEndDialRebindBlocked(t *testing.T) {
	g := newGateServer(t)
	on := true
	task := g.newTask(t, db.TaskCreateOptions{TargetGate: &on})
	pg := g.m.pg
	srv, hits, _, port := countingServer(t)
	res := &countingResolver{answers: map[string][]string{"api.example.com": {"203.0.113.7"}}}
	g.m.interceptor.SetResolver(res)
	dialer := newRouteDialer(g)
	dialer.route("203.0.113.7:"+port, srv.Listener.Addr().String())
	dialer.route("203.0.113.9:"+port, srv.Listener.Addr().String())
	key := "api.example.com:" + port
	target := "http://" + key + "/e2e"
	p := &toolScript{calls: fetches(target, target, target), results: make(chan string, 16),
		hold: map[int64]chan struct{}{2: make(chan struct{}), 3: make(chan struct{})}}
	done := runScriptedWorker(t, g, task, p)

	var id int64
	waitUntil(t, "the first request", func() bool {
		var ok bool
		id, _, _, ok = openTargetRequest(t, pg, task.ID, key)
		return ok
	})
	decide(t, g, id, "allowed")
	if r := p.next(t); !strings.Contains(r, "probe-reached") || hits.Load() != 1 {
		t.Fatalf("first call after the approval: %q hits=%d", r, hits.Load())
	}

	res.set("api.example.com", "203.0.113.9")
	close(p.hold[2])
	if r := p.next(t); !strings.Contains(r, "TARGET_APPROVAL_PENDING: the connection to "+key+" was not opened") || hits.Load() != 1 {
		t.Fatalf("second call, rebound at the dial: %q hits=%d", r, hits.Load())
	}
	newIP, toolName, _, ok := openTargetRequest(t, pg, task.ID, key)
	if !ok || newIP == id || toolName != "WebFetch" {
		t.Fatalf("new_ip request: ok=%v id=%d tool=%q", ok, newIP, toolName)
	}
	detail, err := pg.GetInterceptDetail(newIP)
	if err != nil || detail == nil || detail.Audit == nil || detail.Audit.Targets[0].Reason != "new_ip" ||
		!slices.Equal(detail.Audit.Targets[0].ResolvedIPs, []string{"203.0.113.9"}) {
		t.Fatalf("new_ip request detail = %+v, %v", detail, err)
	}
	decide(t, g, newIP, "allowed")
	close(p.hold[3])
	if r := p.next(t); !strings.Contains(r, "probe-reached") || hits.Load() != 2 {
		t.Fatalf("third call after the new_ip approval: %q hits=%d", r, hits.Load())
	}
	if got := dialer.calls(); !slices.Equal(got, []string{"203.0.113.7:" + port, "203.0.113.9:" + port}) {
		t.Fatalf("dialled %v", got)
	}
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		t.Fatal("the worker run did not end")
	}
}
