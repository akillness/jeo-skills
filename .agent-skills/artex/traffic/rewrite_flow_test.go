package traffic

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"slices"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/traffic/rewrite"
	"github.com/gorilla/websocket"
	mproxy "github.com/lqqyt2423/go-mitmproxy/proxy"
)

// --- helpers ---------------------------------------------------------------

// rules compiles enabled rules, failing the test on a load error.
func rules(t *testing.T, key []byte, errs *rewrite.ErrorLog, rs ...rewrite.Rule) *rewrite.Set {
	t.Helper()
	for i := range rs {
		rs[i].Enabled = true
		if rs[i].Name == "" {
			rs[i].Name = fmt.Sprintf("rule %d", rs[i].ID)
		}
	}
	set := rewrite.Compile(rs, rewrite.Options{TraceKey: key, Errors: errs})
	if len(set.LoadErrors()) != 0 {
		t.Fatalf("load errors: %v", set.LoadErrors())
	}
	return set
}

type traceRow struct {
	seq                         int
	phase, outcome, reason      string
	ruleID                      sql.NullInt64
	snapshot, action, field     sql.NullString
	beforeHash, afterHash, blob sql.NullString
	inline                      []byte
}

func traceRows(t *testing.T, tr *Traffic, id string) []traceRow {
	t.Helper()
	rows, err := tr.DB().Query(`SELECT seq,phase,rule_id,rule_snapshot,action,field,outcome,reason,before_hash,after_hash,after_inline,after_blob
FROM exchange_rewrites WHERE exchange_id=? ORDER BY seq`, id)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []traceRow
	for rows.Next() {
		var r traceRow
		if err := rows.Scan(&r.seq, &r.phase, &r.ruleID, &r.snapshot, &r.action, &r.field, &r.outcome, &r.reason, &r.beforeHash, &r.afterHash, &r.inline, &r.blob); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

func countRows(t *testing.T, tr *Traffic, table string) int {
	t.Helper()
	var n int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func exchangeIDByPath(t *testing.T, tr *Traffic, suffix string) string {
	t.Helper()
	var id string
	if err := tr.DB().QueryRow(`SELECT id FROM exchanges WHERE url LIKE ?`, "%"+suffix).Scan(&id); err != nil {
		t.Fatalf("exchange %s: %v", suffix, err)
	}
	return id
}

// logBuf captures the standard logger, where every ARTEX log goes.
type logBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *logBuf) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *logBuf) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

func captureLog(t *testing.T) *logBuf {
	b := &logBuf{}
	prev := log.Writer()
	log.SetOutput(b)
	t.Cleanup(func() { log.SetOutput(prev) })
	return b
}

func setTestHook(t *testing.T, h func(stage string)) {
	testRuleHook.Store(&h)
	t.Cleanup(func() { testRuleHook.Store(nil) })
}

// limits changes the table's bounds and clock for a test.
func (t *snapTable) limits(maxEntries int, maxBytes int64, maxTombs int, now func() time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.maxEntries, t.maxBytes, t.maxTombs = maxEntries, maxBytes, maxTombs
	if now != nil {
		t.now = now
	}
}

func (t *snapTable) slot(k flowKey) *reqSnap {
	t.mu.Lock()
	defer t.mu.Unlock()
	if s := t.slots[k]; s != nil {
		c := *s
		return &c
	}
	return nil
}

func key(n int) flowKey {
	var k flowKey
	k[0], k[1] = byte(n), byte(n>>8)
	return k
}

// withID gives a synthetic flow a distinct id, as real flows have.
func withID(f *mproxy.Flow, n int) *mproxy.Flow {
	f.Id[0], f.Id[1], f.Id[15] = byte(n), byte(n>>8), 0xAB
	return f
}

type received struct {
	mu   sync.Mutex
	reqs []string
}

func (r *received) add(s string) { r.mu.Lock(); r.reqs = append(r.reqs, s); r.mu.Unlock() }
func (r *received) all() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return slices.Clone(r.reqs)
}

func sendThrough(t *testing.T, tr *Traffic, proxyURL, method, target, body string, header http.Header) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(method, target, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	for k, vs := range header {
		req.Header[k] = vs
	}
	resp, err := proxyClient(t, tr, proxyURL).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp, b
}

// --- integration: rewritten exchange -----------------------------------------

// A request and a response rewritten by rules: the target gets the rewritten
// request, the client the rewritten response, and the exchange records what
// the client sent and what the target answered, with the trace of both phases.
// Lengths stay coherent after a body rewrite on both sides, and full-text
// search finds the originals only.
func TestRewriteAppliedRecordsOriginals(t *testing.T) {
	var got received
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		got.add(fmt.Sprintf("%s %s X-Client=%s len=%d %s", r.Method, r.RequestURI, r.Header.Get("X-Client"), r.ContentLength, body))
		w.Header().Set("X-Target", "t")
		w.Header().Set("Content-Length", "11")
		w.WriteHeader(http.StatusTeapot)
		io.WriteString(w, "target body")
	}))
	t.Cleanup(target.Close)
	tr, _, proxyURL := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetMethod, Value: "PUT"},
			{Type: rewrite.ActionSetPathQuery, Value: "/rewritten?r=1"},
			{Type: rewrite.ActionSetHeader, Name: "X-Client", Value: "rewritten"},
			{Type: rewrite.ActionSetBody, Value: "rewritten request body"}}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetStatus, Value: "200"},
			{Type: rewrite.ActionSetHeader, Name: "X-Rewritten", Value: "1"},
			{Type: rewrite.ActionReplaceBody, Regex: "target", Value: "REWRITTEN-RESPONSE"}}},
	))

	resp, body := sendThrough(t, tr, proxyURL, "POST", target.URL+"/path?q=1", "client body", http.Header{"X-Client": {"c"}})

	if want := []string{"PUT /rewritten?r=1 X-Client=rewritten len=22 rewritten request body"}; !slices.Equal(got.all(), want) {
		t.Fatalf("target received %q, want %q", got.all(), want)
	}
	if resp.StatusCode != 200 || resp.Header.Get("X-Target") != "t" || resp.Header.Get("X-Rewritten") != "1" || string(body) != "REWRITTEN-RESPONSE body" {
		t.Fatalf("client received %d %v %q", resp.StatusCode, resp.Header, body)
	}
	if resp.ContentLength != -1 && resp.ContentLength != int64(len(body)) {
		t.Fatalf("client Content-Length %d for a %d-byte body", resp.ContentLength, len(body))
	}

	id := onlyExchangeID(t, tr)
	var method, rawURL string
	var status, reqLen, respLen int
	if err := tr.DB().QueryRow(`SELECT method,url,status,req_len,resp_len FROM exchanges WHERE id=?`, id).Scan(&method, &rawURL, &status, &reqLen, &respLen); err != nil {
		t.Fatal(err)
	}
	if method != "POST" || rawURL != target.URL+"/path?q=1" || status != 418 || reqLen != 11 || respLen != 11 {
		t.Fatalf("exchange row %s %s %d %d %d", method, rawURL, status, reqLen, respLen)
	}
	reqText, respText, err := tr.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	host := strings.TrimPrefix(target.URL, "http://")
	for _, want := range []string{"POST /path?q=1 HTTP/1.1\n", "Host: " + host + "\n", "X-Client: c\n", "\n\nclient body"} {
		if !strings.Contains(reqText, want) {
			t.Fatalf("recorded request lacks %q:\n%s", want, reqText)
		}
	}
	for _, want := range []string{"HTTP 418\n", "X-Target: t\n", "\n\ntarget body"} {
		if !strings.Contains(respText, want) {
			t.Fatalf("recorded response lacks %q:\n%s", want, respText)
		}
	}
	if strings.Contains(strings.ToLower(reqText+respText), "rewritten") {
		t.Fatalf("a rewritten value was recorded as original:\n%s\n%s", reqText, respText)
	}

	lines := traceRows(t, tr, id)
	var summary []string
	for _, l := range lines {
		summary = append(summary, fmt.Sprintf("%s/%d/%s/%s", l.phase, l.ruleID.Int64, l.field.String, l.outcome))
	}
	want := []string{"request/1/method/applied", "request/1/url/applied", "request/1/header:X-Client/applied", "request/1/body/applied",
		"response/2/header:X-Rewritten/applied", "response/2/body/applied", "response/2/status/applied"}
	if !slices.Equal(summary, want) {
		t.Fatalf("trace %q, want %q", summary, want)
	}
	for i, l := range lines {
		first := i == 0 || l.ruleID != lines[i-1].ruleID
		if l.snapshot.Valid != first {
			t.Fatalf("line %d: rule_snapshot present=%v, want it on the first line of each rule only", i, l.snapshot.Valid)
		}
	}
	if string(lines[3].inline) != "rewritten request body" || string(lines[5].inline) != "REWRITTEN-RESPONSE body" {
		t.Fatalf("body lines keep %q and %q", lines[3].inline, lines[5].inline)
	}

	if ok, ids, err := tr.RewriteInfo(id); err != nil || !ok || !slices.Equal(ids, []int64{1, 2}) {
		t.Fatalf("RewriteInfo = %v %v %v", ok, ids, err)
	}
	out := toolText(t, tr, "traffic_get", `{"id":"`+id+`"}`)
	if !strings.HasPrefix(out, "=== REWRITTEN === rewrite rules [1 2] ") || !strings.Contains(out, "client body") {
		t.Fatalf("traffic_get output:\n%s", out)
	}

	h := "127.0.0.1"
	for term, found := range map[string]bool{"client body": true, "target body": true, "rewritten request": false, "REWRITTEN-RESPONSE": false, "/rewritten": false} {
		rows, err := tr.query(h, "", term, 0, 10)
		if err != nil {
			t.Fatal(err)
		}
		if (len(rows) == 1) != found {
			t.Fatalf("full-text search for %q found %d exchanges, want found=%v", term, len(rows), found)
		}
	}
	if e, tb := tr.snaps.counts(); e != 0 || tb != 0 {
		t.Fatalf("snapshot table holds %d entries, %d tombstones after Response", e, tb)
	}
}

// toolText runs one of the traffic agent tools and returns its text.
func toolText(t *testing.T, tr *Traffic, name, input string) string {
	t.Helper()
	for _, tool := range tr.Tools() {
		if tool.Name() != name {
			continue
		}
		res, err := tool.Call(context.Background(), json.RawMessage(input), nil)
		if err != nil {
			t.Fatal(err)
		}
		return res.Flatten()
	}
	t.Fatalf("no tool %s", name)
	return ""
}

// --- non-regression ----------------------------------------------------------

type recordedRow struct {
	exchange, bodies string
}

func dumpOnly(t *testing.T, tr *Traffic) recordedRow {
	t.Helper()
	var host, method, tmpl, u, ct, path, reqHead, respHead string
	var status, reqLen, respLen int
	var reqBody, respBody []byte
	var reqBlob, respBlob sql.NullString
	if err := tr.DB().QueryRow(`SELECT e.host,e.method,e.url_template,e.url,e.status,e.content_type,e.req_len,e.resp_len,e.path,
b.req_head,b.req_body,b.req_blob,b.resp_head,b.resp_body,b.resp_blob FROM exchanges e JOIN exchange_bodies b ON b.id=e.id`).
		Scan(&host, &method, &tmpl, &u, &status, &ct, &reqLen, &respLen, &path, &reqHead, &reqBody, &reqBlob, &respHead, &respBody, &respBlob); err != nil {
		t.Fatal(err)
	}
	return recordedRow{
		exchange: fmt.Sprintf("%q %q %q %q %d %q %d %d %q", host, method, tmpl, u, status, ct, reqLen, respLen, path),
		bodies:   fmt.Sprintf("%q %q %v %q %q %v", reqHead, reqBody, reqBlob, respHead, respBody, respBlob),
	}
}

// Without a rule that matches, the hooks record exactly what record() records,
// byte for byte, and write no trace row.
func TestRewriteNoRuleRecordsUnchanged(t *testing.T) {
	flow := func(n int) *mproxy.Flow {
		return withID(newFlow("api.example.com", "POST", "/v1/items/42?x=1", []byte(`{"a":1}`), []byte(`{"ok":true}`)), n)
	}
	plain, _ := openTraffic(t)
	plain.record(flow(1))
	want := dumpOnly(t, plain)

	for name, set := range map[string]*rewrite.Set{
		"no snapshot": nil,
		"no match": rules(t, nil, nil,
			rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Matchers: rewrite.Matchers{Host: "other.example"}, Actions: []rewrite.Action{{Type: rewrite.ActionSetBody, Value: "x"}}},
			rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Matchers: rewrite.Matchers{Host: "*.other.example"}, Actions: []rewrite.Action{{Type: rewrite.ActionSetStatus, Value: "500"}}}),
	} {
		tr, _ := openTraffic(t)
		tr.SetRewriteRules(set)
		s := tr.proxy.Addons[0].(*sink)
		f := flow(2)
		s.Request(f)
		s.Response(f)
		if got := dumpOnly(t, tr); got != want {
			t.Fatalf("%s: recorded\n%+v\nwant\n%+v", name, got, want)
		}
		if n := countRows(t, tr, "exchange_rewrites"); n != 0 {
			t.Fatalf("%s: %d trace rows", name, n)
		}
		if f.Response.StatusCode != 200 || string(f.Request.Body) != `{"a":1}` {
			t.Fatalf("%s: the flow changed", name)
		}
	}
}

// Through the real proxy, a snapshot whose rules match nothing gives the same
// client response, target request and recorded exchange as no snapshot.
func TestRewriteNoMatchThroughProxy(t *testing.T) {
	var got received
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		got.add(r.Method + " " + r.RequestURI + " " + string(body))
		w.Header().Set("Content-Type", "text/plain")
		io.WriteString(w, "target body")
	}))
	t.Cleanup(target.Close)
	canon := func(raw string) string {
		head, body, _ := strings.Cut(raw, "\n\n")
		lines := strings.Split(head, "\n")
		sort.Strings(lines[1:])
		lines = slices.DeleteFunc(lines, func(l string) bool { return strings.HasPrefix(l, "Date: ") })
		return strings.Join(lines, "\n") + "\n\n" + body
	}
	exchange := func(set *rewrite.Set) string {
		tr, _, proxyURL := startProxy(t)
		tr.SetRewriteRules(set)
		resp, body := sendThrough(t, tr, proxyURL, "POST", target.URL+"/p?q=1", "client body", nil)
		reqText, respText, err := tr.Get(onlyExchangeID(t, tr))
		if err != nil {
			t.Fatal(err)
		}
		if n := countRows(t, tr, "exchange_rewrites"); n != 0 {
			t.Fatalf("%d trace rows", n)
		}
		return fmt.Sprintf("%d %s|%s|%s", resp.StatusCode, body, canon(reqText), canon(respText))
	}
	base := exchange(nil)
	other := exchange(rules(t, nil, nil, rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Matchers: rewrite.Matchers{Methods: []string{"DELETE"}},
		Actions: []rewrite.Action{{Type: rewrite.ActionSetBody, Value: "x"}}}))
	if base != other {
		t.Fatalf("without rules:\n%s\nwith non-matching rules:\n%s", base, other)
	}
	if all := got.all(); len(all) != 2 || all[0] != all[1] || all[0] != "POST /p?q=1 client body" {
		t.Fatalf("target received %q", all)
	}
}

// --- atomicity and log redaction ---------------------------------------------

// A trace that cannot be written rolls the whole exchange back: no rewritten
// exchange is ever left without its trace. The client is not affected, and the
// log names the host, the step and the rules, never the URL.
func TestRewriteTraceFailureRollsBack(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "target body") }))
	t.Cleanup(target.Close)
	tr, _, proxyURL := startProxy(t)
	if _, err := tr.DB().Exec(`CREATE TRIGGER fail_trace BEFORE INSERT ON exchange_rewrites BEGIN SELECT RAISE(ABORT, 'forced'); END`); err != nil {
		t.Fatal(err)
	}
	logs := captureLog(t)
	tr.SetRewriteRules(rules(t, nil, nil, rewrite.Rule{ID: 7, Phase: rewrite.PhaseRequest,
		Actions: []rewrite.Action{{Type: rewrite.ActionSetPathQuery, Value: "/secret-path?token=XYZ123"}}}))
	resp, body := sendThrough(t, tr, proxyURL, "GET", target.URL+"/client-path?c=1", "", nil)
	if resp.StatusCode != 200 || string(body) != "target body" {
		t.Fatalf("client got %d %q", resp.StatusCode, body)
	}
	for _, table := range []string{"exchanges", "exchange_bodies", "exchange_rewrites", "blob_refs"} {
		if n := countRows(t, tr, table); n != 0 {
			t.Fatalf("%s holds %d rows after a failed trace insert", table, n)
		}
	}
	out := logs.String()
	if !strings.Contains(out, "failed to record rewritten exchange") || !strings.Contains(out, "host=127.0.0.1") || !strings.Contains(out, "rules=[7]") {
		t.Fatalf("log: %q", out)
	}
	for _, leak := range []string{"secret-path", "XYZ123", "client-path", "forced"} {
		if strings.Contains(out, leak) {
			t.Fatalf("log contains %q: %q", leak, out)
		}
	}
}

// A transport error on a rewritten request clears its slot, keeps the host
// intercepted, and logs neither the URL a rule wrote nor the error text.
func TestRewriteRequestErrorRedactedAndCleared(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	dead := ln.Addr().String()
	ln.Close()
	tr, _, proxyURL := startProxy(t)
	logs := captureLog(t)
	tr.SetRewriteRules(rules(t, nil, nil, rewrite.Rule{ID: 3, Phase: rewrite.PhaseRequest,
		Actions: []rewrite.Action{{Type: rewrite.ActionReplaceURL, Regex: "c=1", Value: "token=XYZ123"}}}))
	resp, _ := sendThrough(t, tr, proxyURL, "GET", "http://"+dead+"/client-path?c=1", "", nil)
	if resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("status %d", resp.StatusCode)
	}
	waitFor(t, "empty snapshot table", func() bool { e, tb := tr.snaps.counts(); return e == 0 && tb == 0 })
	out := logs.String()
	if !strings.Contains(out, "rewritten request failed") || !strings.Contains(out, "host=127.0.0.1") || !strings.Contains(out, "rules=[3]") || !strings.Contains(out, "class=transport_error") {
		t.Fatalf("log: %q", out)
	}
	for _, leak := range []string{"XYZ123", "client-path", dead, "refused"} {
		if strings.Contains(out, leak) {
			t.Fatalf("log contains %q: %q", leak, out)
		}
	}
	if n := countRows(t, tr, "exchanges"); n != 0 {
		t.Fatalf("%d exchanges", n)
	}
}

// RequestError never switches the host of a rewritten request to passthrough,
// records the rules' last error, and still does so for a request no rule changed.
func TestRewriteRequestErrorKeepsInterception(t *testing.T) {
	tr, _ := openTraffic(t)
	s := tr.proxy.Addons[0].(*sink)
	errs := &rewrite.ErrorLog{}
	tr.SetRewriteRules(rules(t, nil, errs, rewrite.Rule{ID: 9, Phase: rewrite.PhaseRequest, Matchers: rewrite.Matchers{Host: "rw.example"},
		Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-A", Value: "1"}}}))
	protoErr := errors.New("http2: protocol error")

	f := withID(newFlow("rw.example", "GET", "/", nil, nil), 1)
	s.Request(f)
	if f.Request.Header.Get("X-A") != "1" {
		t.Fatal("request not rewritten")
	}
	s.RequestError(f, protoErr)
	if _, flagged := tr.pass.Load("rw.example"); flagged {
		t.Fatal("a rewritten request flagged its host for passthrough")
	}
	if e, ok := errs.Get(9); !ok || e.Class != rewrite.ErrClassTransport {
		t.Fatalf("last error %+v %v", e, ok)
	}
	g := withID(newFlow("plain.example", "GET", "/", nil, nil), 2)
	s.Request(g)
	s.RequestError(g, protoErr)
	if _, flagged := tr.pass.Load("plain.example"); !flagged {
		t.Fatal("an unrewritten request no longer flags its host")
	}
	if e, tb := tr.snaps.counts(); e != 0 || tb != 0 {
		t.Fatalf("table holds %d entries, %d tombstones", e, tb)
	}
}

// --- snapshot table ----------------------------------------------------------

func liveEntry(cost int64) (*reqSnap, chan struct{}) {
	ch := make(chan struct{})
	return &reqSnap{done: ch, cost: cost, host: "h.example", lines: []rewrite.TraceLine{{Phase: rewrite.PhaseRequest, RuleID: 4, Outcome: rewrite.OutcomeApplied}}, rewritten: true}, ch
}

type fakeClock struct{ ns atomic.Int64 }

func (c *fakeClock) now() time.Time      { return time.Unix(0, c.ns.Load()) }
func (c *fakeClock) add(d time.Duration) { c.ns.Add(int64(d)) }

func newFakeClock() *fakeClock {
	c := &fakeClock{}
	c.ns.Store(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).UnixNano())
	return c
}

// The sweep a ClientDisconnected asks for removes the slots of finished flows
// only (Response and RequestError are covered by the proxy tests above).
func TestSnapshotClearedOnDisconnectSweep(t *testing.T) {
	tr, _ := openTraffic(t)
	s := tr.proxy.Addons[0].(*sink)
	finished, done := liveEntry(10)
	close(done)
	live, _ := liveEntry(10)
	if !tr.snaps.reserve(key(1), finished) || !tr.snaps.reserve(key(2), live) {
		t.Fatal("reserve")
	}
	s.ClientDisconnected(&mproxy.ClientConn{})
	waitFor(t, "the sweep after a disconnect", func() bool { e, _ := tr.snaps.counts(); return e == 1 })
	if tr.snaps.slot(key(2)) == nil || tr.snaps.slot(key(1)) != nil {
		t.Fatal("the sweep must remove the finished flow's slot and keep the live one")
	}
}

// One sweep per second at most, whatever the number of disconnects; a periodic
// pass without any; a live slot survives, even past the TTL.
func TestSnapshotSweepDebounce(t *testing.T) {
	clk := newFakeClock()
	tb := newSnapTable()
	tb.limits(maxSnapEntries, maxSnapBytes, maxSnapTombs, clk.now)
	tb.tick()
	if tb.sweeps.Load() != 0 {
		t.Fatal("an empty table was swept")
	}
	live, _ := liveEntry(10)
	tb.reserve(key(1), live)
	tb.tick() // first sweep: none before
	start := tb.sweeps.Load()
	for i := 0; i < 100; i++ {
		tb.requestSweep()
		tb.tick()
	}
	if tb.sweeps.Load() != start {
		t.Fatalf("%d sweeps within the debounce", tb.sweeps.Load()-start)
	}
	clk.add(sweepDebounce)
	tb.tick()
	if tb.sweeps.Load() != start+1 {
		t.Fatal("the requested sweep did not run after the debounce")
	}
	clk.add(30 * time.Second)
	tb.tick()
	if tb.sweeps.Load() != start+1 {
		t.Fatal("swept without a request before the period")
	}
	clk.add(sweepPeriod + snapTTL)
	tb.tick()
	if tb.sweeps.Load() != start+2 {
		t.Fatal("no periodic sweep")
	}
	if e, _ := tb.counts(); e != 1 {
		t.Fatal("a live slot past the TTL was swept")
	}
}

// Close stops the sweeper goroutine.
func TestSnapshotSweeperStopsOnClose(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { _ = tr.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Close did not return: the sweeper did not stop")
	}
}

// Past 1024 entries a reservation fails: the request is not rewritten and a
// capacity tombstone stands for the flow.
func TestSnapshotCapacityTombstone(t *testing.T) {
	tb := newSnapTable()
	for i := 0; i < maxSnapEntries; i++ {
		e, _ := liveEntry(1)
		if !tb.reserve(key(i), e) {
			t.Fatalf("reservation %d failed", i)
		}
	}
	e, _ := liveEntry(1)
	if tb.reserve(key(5000), e) {
		t.Fatal("reservation past 1024 entries succeeded")
	}
	if n, tombs := tb.counts(); n != maxSnapEntries || tombs != 1 {
		t.Fatalf("%d entries, %d tombstones", n, tombs)
	}
	if s := tb.slot(key(5000)); s == nil || !s.tomb || s.reason != reasonSnapshotCapacity {
		t.Fatalf("slot %+v", s)
	}
	if tb.capacity.Load() != 1 || tb.conversions.Load() != 0 {
		t.Fatal("counters")
	}

	// The 64 MiB budget bounds the entries too.
	tb = newSnapTable()
	for i := 0; i < 64; i++ {
		e, _ := liveEntry(1 << 20)
		if !tb.reserve(key(i), e) {
			t.Fatalf("reservation %d failed", i)
		}
	}
	if e, _ := liveEntry(1); tb.reserve(key(100), e) {
		t.Fatal("reservation past 64 MiB succeeded")
	}
}

// Through the sink: a refused reservation leaves the request as the client
// sent it, and the exchange carries one global "snapshot capacity" line.
func TestSnapshotCapacityRecordsGlobalLine(t *testing.T) {
	tr, _ := openTraffic(t)
	s := tr.proxy.Addons[0].(*sink)
	tr.snaps.limits(0, maxSnapBytes, maxSnapTombs, nil)
	tr.SetRewriteRules(rules(t, nil, nil, rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-A", Value: "1"}}}))
	f := withID(newFlow("api.example.com", "GET", "/", nil, []byte("ok")), 1)
	s.Request(f)
	if f.Request.Header.Get("X-A") != "" {
		t.Fatal("the request was rewritten without a snapshot")
	}
	s.Response(f)
	lines := traceRows(t, tr, onlyExchangeID(t, tr))
	if len(lines) != 1 || lines[0].ruleID.Valid || lines[0].outcome != "skipped" || lines[0].reason != reasonSnapshotCapacity {
		t.Fatalf("trace %+v", lines)
	}
	if ok, _, _ := tr.RewriteInfo(onlyExchangeID(t, tr)); ok {
		t.Fatal("an unrewritten exchange is flagged")
	}
}

// An entry of a live flow older than the TTL is turned into a tombstone in
// place when a reservation fails; the flow keeps its slot throughout.
func TestSnapshotConversionInPlace(t *testing.T) {
	clk := newFakeClock()
	tb := newSnapTable()
	tb.limits(2, maxSnapBytes, maxSnapTombs, clk.now)
	old, _ := liveEntry(10)
	tb.reserve(key(1), old)
	clk.add(time.Minute)
	young, _ := liveEntry(10)
	tb.reserve(key(2), young)
	clk.add(snapTTL)
	e, _ := liveEntry(10)
	if !tb.reserve(key(3), e) {
		t.Fatal("reservation failed although an old entry was convertible")
	}
	s := tb.slot(key(1))
	if s == nil || !s.tomb || s.reason != reasonOriginalUnavailable || !slices.Equal(s.ruleIDs, []int64{4}) || s.header != nil || s.lines != nil {
		t.Fatalf("converted slot %+v", s)
	}
	if n, tombs := tb.counts(); n != 2 || tombs != 1 || tb.conversions.Load() != 1 {
		t.Fatalf("%d entries %d tombstones %d conversions", n, tombs, tb.conversions.Load())
	}
	if s := tb.slot(key(2)); s == nil || s.tomb {
		t.Fatal("the younger entry was converted")
	}
}

// With every tombstone place held by a live flow, the conversion is refused:
// the old entry stays, the new reservation fails and, with no room for its
// tombstone either, is only counted.
func TestSnapshotConversionRefusedWithoutTombstoneRoom(t *testing.T) {
	clk := newFakeClock()
	tb := newSnapTable()
	tb.limits(1, maxSnapBytes, 1, clk.now)
	old, _ := liveEntry(10)
	tb.reserve(key(1), old)
	blocker, _ := liveEntry(10)
	tb.reserve(key(2), blocker) // refused while old is young: the single capacity tombstone
	clk.add(snapTTL + time.Minute)
	e, _ := liveEntry(10)
	if tb.reserve(key(3), e) {
		t.Fatal("reservation succeeded")
	}
	if s := tb.slot(key(1)); s == nil || s.tomb {
		t.Fatal("the old entry was converted without a tombstone place")
	}
	if tb.slot(key(3)) != nil || tb.tombDrops.Load() != 1 || tb.conversions.Load() != 0 {
		t.Fatalf("drops %d conversions %d", tb.tombDrops.Load(), tb.conversions.Load())
	}

	// A tombstone of a finished flow is evicted to make room.
	tb = newSnapTable()
	tb.limits(1, maxSnapBytes, 1, clk.now)
	old, _ = liveEntry(10)
	tb.reserve(key(1), old)
	gone, done := liveEntry(10)
	tb.reserve(key(2), gone) // capacity tombstone of a flow that then ends
	close(done)
	clk.add(snapTTL + time.Minute)
	tb.mu.Lock() // no sweep here: only the eviction can free the place
	ok := tb.convertLocked(10)
	tb.mu.Unlock()
	if !ok {
		t.Fatal("conversion refused although the only tombstone belongs to a finished flow")
	}
}

// The validated rule: an entry is converted only when releasing it lets the
// new reservation succeed. When the freed budget is too small, nothing is
// converted and the new request goes the capacity path.
func TestSnapshotConversionFreedBudgetInsufficient(t *testing.T) {
	clk := newFakeClock()
	tb := newSnapTable()
	tb.limits(10, 1000, maxSnapTombs, clk.now)
	old, _ := liveEntry(100)
	tb.reserve(key(1), old)
	clk.add(snapTTL + time.Minute)
	young, _ := liveEntry(850)
	tb.reserve(key(2), young)
	e, _ := liveEntry(200) // 950 - 100 + 200 > 1000
	if tb.reserve(key(3), e) {
		t.Fatal("reservation succeeded")
	}
	if s := tb.slot(key(1)); s == nil || s.tomb {
		t.Fatal("the old entry was converted although its release frees too little")
	}
	if s := tb.slot(key(3)); s == nil || s.reason != reasonSnapshotCapacity || tb.conversions.Load() != 0 {
		t.Fatalf("new slot %+v, conversions %d", s, tb.conversions.Load())
	}
	// With enough freed, the same old entry is converted.
	e, _ = liveEntry(140) // 950 - 100 + 140 <= 1000
	tb.mu.Lock()
	tb.lastSweep = time.Time{}
	tb.mu.Unlock()
	if !tb.reserve(key(4), e) || tb.conversions.Load() != 1 {
		t.Fatal("conversion refused although the release frees enough")
	}
}

// A failed reservation right after a sweep is refused by the debounce: no
// sweep, no conversion.
func TestSnapshotReservationDebounced(t *testing.T) {
	clk := newFakeClock()
	tb := newSnapTable()
	tb.limits(1, maxSnapBytes, maxSnapTombs, clk.now)
	old, _ := liveEntry(10)
	tb.reserve(key(1), old)
	clk.add(snapTTL + time.Minute)
	tb.mu.Lock()
	tb.lastSweep = clk.now()
	tb.mu.Unlock()
	e, _ := liveEntry(10)
	if tb.reserve(key(2), e) || tb.conversions.Load() != 0 || tb.sweeps.Load() != 0 {
		t.Fatal("a debounced reservation swept or converted")
	}
}

// End to end through the proxy: a live flow whose entry is converted under
// pressure is recorded "original request unavailable", with the client's
// method, URL and Host from Raw(), never the rewritten request.
func TestRewriteOriginalUnavailable(t *testing.T) {
	arrived, release := make(chan struct{}), make(chan struct{})
	var got received
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.add(r.URL.Path + " X-Rule=" + r.Header.Get("X-Rule"))
		if r.URL.Path == "/slow" {
			close(arrived)
			<-release
		}
		io.WriteString(w, "ok")
	}))
	t.Cleanup(target.Close)
	tr, _, proxyURL := startProxy(t)
	clk := newFakeClock()
	tr.snaps.limits(1, maxSnapBytes, maxSnapTombs, clk.now)
	tr.SetRewriteRules(rules(t, nil, nil, rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-Rule", Value: "v"}}}))

	slowDone := make(chan string)
	go func() {
		resp, err := proxyClient(t, tr, proxyURL).Get(target.URL + "/slow?a=1")
		if err != nil {
			slowDone <- err.Error()
			return
		}
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		slowDone <- string(b)
	}()
	<-arrived
	clk.add(snapTTL + time.Minute)
	if _, body := sendThrough(t, tr, proxyURL, "GET", target.URL+"/fast", "", nil); string(body) != "ok" {
		t.Fatalf("fast body %q", body)
	}
	close(release)
	if b := <-slowDone; b != "ok" {
		t.Fatalf("slow: %s", b)
	}
	if all := got.all(); !slices.Contains(all, "/slow X-Rule=v") || !slices.Contains(all, "/fast X-Rule=v") {
		t.Fatalf("target received %q", all)
	}
	waitFor(t, "both exchanges", func() bool { return countRows(t, tr, "exchanges") == 2 })

	id := exchangeIDByPath(t, tr, "/slow?a=1")
	var method, u, host, reqHead string
	var reqLen int
	if err := tr.DB().QueryRow(`SELECT e.method,e.url,e.host,e.req_len,b.req_head FROM exchanges e JOIN exchange_bodies b ON b.id=e.id WHERE e.id=?`, id).Scan(&method, &u, &host, &reqLen, &reqHead); err != nil {
		t.Fatal(err)
	}
	if method != "GET" || u != target.URL+"/slow?a=1" || host != "127.0.0.1" || reqLen != 0 ||
		reqHead != "GET /slow?a=1 HTTP/1.1\nHost: "+strings.TrimPrefix(target.URL, "http://")+"\n"+unavailableMarker {
		t.Fatalf("exchange %s %s %s %d %q", method, u, host, reqLen, reqHead)
	}
	lines := traceRows(t, tr, id)
	if len(lines) != 2 || lines[0].outcome != "error" || lines[0].reason != reasonOriginalUnavailable || lines[0].ruleID.Valid ||
		lines[1].outcome != "applied" || lines[1].ruleID.Int64 != 1 || lines[1].field.Valid {
		t.Fatalf("trace %+v", lines)
	}
	if ok, ids, _ := tr.RewriteInfo(id); !ok || !slices.Equal(ids, []int64{1}) {
		t.Fatal("RewriteInfo of the converted flow")
	}
	if fast := traceRows(t, tr, exchangeIDByPath(t, tr, "/fast")); len(fast) != 1 || fast[0].outcome != "applied" {
		t.Fatalf("fast trace %+v", fast)
	}
	if tr.snaps.conversions.Load() != 1 {
		t.Fatal("no conversion counted")
	}
}

// Without Raw(), the unavailable request records an empty method, URL and host.
func TestRewriteOriginalUnavailableWithoutRaw(t *testing.T) {
	tr, _ := openTraffic(t)
	s := tr.proxy.Addons[0].(*sink)
	f := withID(newFlow("api.example.com", "PUT", "/rewritten", []byte("rewritten"), []byte("ok")), 1)
	tr.snaps.mu.Lock()
	tr.snaps.slots[keyOf(f)] = &reqSnap{tomb: true, reason: reasonOriginalUnavailable, ruleIDs: []int64{5}, host: "api.example.com"}
	tr.snaps.tombs++
	tr.snaps.mu.Unlock()
	s.Response(f)
	var method, u, host, reqHead string
	if err := tr.DB().QueryRow(`SELECT e.method,e.url,e.host,b.req_head FROM exchanges e JOIN exchange_bodies b ON b.id=e.id`).Scan(&method, &u, &host, &reqHead); err != nil {
		t.Fatal(err)
	}
	if method != "" || u != "" || host != "" || strings.Contains(reqHead, "rewritten") || !strings.HasSuffix(reqHead, unavailableMarker) {
		t.Fatalf("exchange %q %q %q %q", method, u, host, reqHead)
	}
}

// --- fail-open ---------------------------------------------------------------

// A rule that panics is an error line; the flow goes on with the request and
// response untouched, and the exchange is recorded.
func TestRewriteRulePanicKeepsFlow(t *testing.T) {
	var got received
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got.add(string(b))
		io.WriteString(w, "target body")
	}))
	t.Cleanup(target.Close)
	tr, _, proxyURL := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{{Type: rewrite.ActionSetBody, Value: "x"}}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{{Type: rewrite.ActionSetBody, Value: "y"}}}))
	setTestHook(t, func(stage string) {
		if stage == "rule" {
			panic("rule")
		}
	})
	resp, body := sendThrough(t, tr, proxyURL, "POST", target.URL+"/", "client body", nil)
	if resp.StatusCode != 200 || string(body) != "target body" || !slices.Equal(got.all(), []string{"client body"}) {
		t.Fatalf("client %d %q, target %q", resp.StatusCode, body, got.all())
	}
	lines := traceRows(t, tr, onlyExchangeID(t, tr))
	if len(lines) != 2 || lines[0].outcome != "error" || lines[0].reason != rewrite.ErrClassPanic || lines[1].outcome != "error" {
		t.Fatalf("trace %+v", lines)
	}
}

// A panic in the sink itself, after the engine, is recovered by the sink: the
// client still gets the target's response, not the library's empty 200.
func TestRewriteSinkRecoverKeepsFlow(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		io.WriteString(w, "target body")
	}))
	t.Cleanup(target.Close)
	tr, _, proxyURL := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-A", Value: "1"}}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{{Type: rewrite.ActionSetStatus, Value: "500"}}}))
	logs := captureLog(t)
	setTestHook(t, func(stage string) {
		if stage == "request" || stage == "response" {
			panic(stage)
		}
	})
	resp, body := sendThrough(t, tr, proxyURL, "GET", target.URL+"/p", "", nil)
	if resp.StatusCode != http.StatusAccepted || string(body) != "target body" {
		t.Fatalf("client %d %q", resp.StatusCode, body)
	}
	if n := countRows(t, tr, "exchanges"); n != 1 {
		t.Fatalf("%d exchanges", n)
	}
	if out := logs.String(); !strings.Contains(out, "class=panic") || strings.Contains(out, "/p") {
		t.Fatalf("log %q", out)
	}
}

// --- 5 MiB passthrough -------------------------------------------------------

// StreamResponseModifier hands back the reader it got, nil included, and is
// nil-safe.
func TestStreamResponseModifierPassThrough(t *testing.T) {
	tr, _ := openTraffic(t)
	s := tr.proxy.Addons[0].(*sink)
	f := withID(newFlow("a.example", "GET", "/", nil, nil), 1)
	f.Stream = true
	e, _ := liveEntry(1)
	tr.snaps.reserve(keyOf(f), e)
	if out := s.StreamResponseModifier(f, nil); out != nil {
		t.Fatalf("nil reader became %v", out)
	}
	if n, _ := tr.snaps.counts(); n != 0 || tr.RewriteStats().LargeResponses != 1 {
		t.Fatal("the slot of a streamed response was not released and counted")
	}
	r := strings.NewReader("x")
	if out := s.StreamResponseModifier(f, r); out != io.Reader(r) {
		t.Fatal("the reader was replaced")
	}
	if out := (&sink{}).StreamResponseModifier(nil, r); out != io.Reader(r) {
		t.Fatal("nil flow / nil traffic")
	}
	if out := (*sink)(nil).StreamResponseModifier(f, r); out != io.Reader(r) {
		t.Fatal("nil sink")
	}
}

// A rewritten request whose response reaches 5 MiB: the response reaches the
// client intact, nothing is recorded, the slot is released and counted.
func TestRewriteLargeResponsePassedThrough(t *testing.T) {
	big := bytes.Repeat([]byte("0123456789abcdef"), (libraryStreamBody/16)+1024)
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-A") != "1" {
			w.WriteHeader(400)
			return
		}
		w.Write(big)
	}))
	t.Cleanup(target.Close)
	tr, _, proxyURL := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil, rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-A", Value: "1"}}}))
	resp, body := sendThrough(t, tr, proxyURL, "GET", target.URL+"/big", "", nil)
	if resp.StatusCode != 200 || !bytes.Equal(body, big) {
		t.Fatalf("status %d, %d bytes, intact=%v", resp.StatusCode, len(body), bytes.Equal(body, big))
	}
	waitFor(t, "large response counted", func() bool { return tr.RewriteStats().LargeResponses == 1 })
	if n, tb := tr.snaps.counts(); n != 0 || tb != 0 || countRows(t, tr, "exchanges") != 0 {
		t.Fatal("slot kept or exchange recorded")
	}
}

// --- purge, collisions, sensitive values, skip reasons ------------------------

// Deleting a host takes the trace with it, and gcBlobs frees the trace's blobs.
func TestRewriteDeleteHostTakesTrace(t *testing.T) {
	tr, dir := openTraffic(t)
	s := tr.proxy.Addons[0].(*sink)
	large := strings.Repeat("L", maxInlineBody+1)
	tr.SetRewriteRules(rules(t, nil, nil, rewrite.Rule{ID: 1, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{{Type: rewrite.ActionSetBody, Value: large}}}))
	f := withID(newFlow("gone.example", "GET", "/", nil, []byte("small")), 1)
	s.Request(f)
	s.Response(f)
	if string(f.Response.Body) != large {
		t.Fatal("response not rewritten")
	}
	lines := traceRows(t, tr, onlyExchangeID(t, tr))
	if len(lines) != 1 || !lines[0].blob.Valid || len(lines[0].inline) == 0 {
		t.Fatalf("trace %+v", lines)
	}
	blob := lines[0].blob.String
	blobFile := dir + "/_blobs/sha256/" + blob[:2] + "/" + blob + ".bin"
	if _, err := os.Stat(blobFile); err != nil {
		t.Fatalf("trace blob: %v", err)
	}
	if n, err := tr.DeleteHost("gone.example"); err != nil || n != 1 {
		t.Fatalf("DeleteHost = %d %v", n, err)
	}
	for _, table := range []string{"exchange_rewrites", "blob_refs", "exchanges"} {
		if n := countRows(t, tr, table); n != 0 {
			t.Fatalf("%s holds %d rows", table, n)
		}
	}
	if _, err := os.Stat(blobFile); !os.IsNotExist(err) {
		t.Fatalf("trace blob survived gcBlobs: %v", err)
	}
}

// An exchange id can repeat. Each of the three INSERT OR REPLACE paths clears
// the trace left under the id first, so the new exchange is never flagged.
func TestRewriteIDCollisionClearsTrace(t *testing.T) {
	paths := map[string]func(tr *Traffic){
		"record": func(tr *Traffic) { tr.record(newFlow("c.example", "GET", "/", nil, nil)) },
		"RecordExternal": func(tr *Traffic) {
			if err := tr.RecordExternal(ExternalExchange{Method: "GET", URL: "http://c.example/", Status: 200}); err != nil {
				t.Fatal(err)
			}
		},
		"recordStreamStart": func(tr *Traffic) {
			u, _ := url.Parse("https://c.example/ws")
			f := &mproxy.Flow{Request: &mproxy.Request{Method: "GET", URL: u, Proto: "HTTP/1.1", Header: http.Header{}}, WebScoket: &mproxy.WebSocketData{}}
			tr.proxy.Addons[0].(*sink).WebSocketStart(f)
		},
	}
	for name, write := range paths {
		tr, _ := openTraffic(t)
		var id string
		for attempt := 0; ; attempt++ {
			id = fmt.Sprintf("%d-%04d", time.Now().Unix(), (tr.seq.Load()+1)%10000)
			if _, err := tr.DB().Exec(`INSERT INTO exchange_rewrites(exchange_id,seq,phase,rule_id,outcome) VALUES(?,0,'request',1,'applied')`, id); err != nil {
				t.Fatal(err)
			}
			write(tr)
			var got string
			if err := tr.DB().QueryRow(`SELECT id FROM exchanges ORDER BY rowid DESC LIMIT 1`).Scan(&got); err != nil {
				t.Fatal(err)
			}
			if got == id {
				break
			}
			if attempt == 5 {
				t.Fatalf("%s: could not land on the planted id", name)
			}
			if _, err := tr.DB().Exec(`DELETE FROM exchange_rewrites`); err != nil {
				t.Fatal(err)
			}
		}
		if ok, _, err := tr.RewriteInfo(id); err != nil || ok {
			t.Fatalf("%s: the new exchange inherited the old trace", name)
		}
	}
}

// A sensitive value is never in the trace: the line keeps rule id, field and
// a 128-bit HMAC under the trace sub-key, or no fingerprint without a key.
func TestRewriteSensitiveValueNotInTrace(t *testing.T) {
	const secret = "Bearer s3cr3t-token-value"
	master := []byte("instance key for the test")
	m := hmac.New(sha256.New, master)
	m.Write([]byte("artex-traffic-trace"))
	sub := m.Sum(nil)
	m = hmac.New(sha256.New, sub)
	m.Write([]byte(secret))
	wantHash := hex.EncodeToString(m.Sum(nil)[:16])

	for _, withKey := range []bool{true, false} {
		tr, _ := openTraffic(t)
		logs := captureLog(t)
		s := tr.proxy.Addons[0].(*sink)
		var k []byte
		if withKey {
			k = sub
		}
		tr.SetRewriteRules(rules(t, k, nil, rewrite.Rule{ID: 6, Phase: rewrite.PhaseRequest,
			Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "Authorization", Value: secret, Sensitive: true}}}))
		f := withID(newFlow("api.example.com", "GET", "/", nil, []byte("ok")), 1)
		s.Request(f)
		if f.Request.Header.Get("Authorization") != secret {
			t.Fatal("the sensitive value did not reach the request")
		}
		s.Response(f)
		id := onlyExchangeID(t, tr)
		var dump string
		if err := tr.DB().QueryRow(`SELECT group_concat(coalesce(rule_snapshot,'')||'|'||coalesce(after_inline,'')||'|'||coalesce(after_hash,'')||'|'||coalesce(before_hash,'')||'|'||reason, ';') FROM exchange_rewrites`).Scan(&dump); err != nil {
			t.Fatal(err)
		}
		req, _, _ := tr.Get(id)
		if strings.Contains(dump, "s3cr3t") || strings.Contains(req, "s3cr3t") || strings.Contains(logs.String(), "s3cr3t") {
			t.Fatalf("secret leaked: trace %q request %q log %q", dump, req, logs.String())
		}
		lines := traceRows(t, tr, id)
		if len(lines) != 1 || lines[0].ruleID.Int64 != 6 || lines[0].field.String != "header:Authorization" || lines[0].inline != nil || lines[0].blob.Valid {
			t.Fatalf("trace %+v", lines)
		}
		if withKey && lines[0].afterHash.String != wantHash {
			t.Fatalf("fingerprint %q, want %q", lines[0].afterHash.String, wantHash)
		}
		if !withKey && lines[0].afterHash.Valid {
			t.Fatal("a fingerprint without a key")
		}
	}
}

// Body rules are skipped, with their reason, for a compressed, binary or too
// large body; rules without a body component still apply.
func TestRewriteBodySkipReasons(t *testing.T) {
	tr, _ := openTraffic(t)
	s := tr.proxy.Addons[0].(*sink)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{{Type: rewrite.ActionReplaceBody, Regex: "a", Value: "b"}}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{{Type: rewrite.ActionReplaceBody, Regex: "a", Value: "b"}}},
		rewrite.Rule{ID: 3, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-H", Value: "1"}}}))
	cases := []struct {
		name string
		f    *mproxy.Flow
		want []string
	}{
		{"content-encoding", withID(newFlow("e.example", "GET", "/ce", nil, []byte("aaa"), func(f *mproxy.Flow) { f.Response.Header.Set("Content-Encoding", "gzip") }), 1),
			[]string{"response/2/skipped/not rewritten: content-encoding", "response/3/applied/"}},
		{"binary", withID(newFlow("e.example", "GET", "/bin", nil, []byte("aaa"), withRespType("image/png")), 2),
			[]string{"response/2/skipped/not rewritten: binary", "response/3/applied/"}},
		{"too large", withID(newFlow("e.example", "POST", "/big", bytes.Repeat([]byte("a"), rewrite.MaxBodySize+1), []byte("x")), 3),
			[]string{"request/1/skipped/not rewritten: body too large", "response/3/applied/"}},
	}
	for _, c := range cases {
		s.Request(c.f)
		s.Response(c.f)
		var got []string
		for _, l := range traceRows(t, tr, exchangeIDByPath(t, tr, c.f.Request.URL.Path)) {
			got = append(got, fmt.Sprintf("%s/%d/%s/%s", l.phase, l.ruleID.Int64, l.outcome, l.reason))
		}
		if !slices.Equal(got, c.want) {
			t.Fatalf("%s: trace %q, want %q", c.name, got, c.want)
		}
		if c.f.Response.Header.Get("X-H") != "1" {
			t.Fatalf("%s: the header rule did not apply", c.name)
		}
	}
	if string(cases[0].f.Response.Body) != "aaa" || cases[0].f.Response.Header.Get("Content-Encoding") != "gzip" {
		t.Fatal("a compressed body was rewritten")
	}
}

// --- streams -----------------------------------------------------------------

// SSE: the request is rewritten; at SSEStart the status and header actions
// reach the client, the body rule is traced "not rewritten: stream"; the
// exchange records the client's request and the target's status and headers,
// with the trace of both phases, and the events.
func TestRewriteSSEHeadersAndStatus(t *testing.T) {
	var got received
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.add(r.URL.RequestURI() + " X-Client=" + r.Header.Get("X-Client"))
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("X-Target", "t")
		w.WriteHeader(200)
		fl := w.(http.Flusher)
		for _, ev := range []string{"id: 1\ndata: hello\n\n", "data: bye\n\n"} {
			_, _ = io.WriteString(w, ev)
			fl.Flush()
		}
	}))
	t.Cleanup(srv.Close)
	tr, _, proxyURL := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetPathQuery, Value: "/rewritten-events?x=1"},
			{Type: rewrite.ActionSetHeader, Name: "X-Client", Value: "rewritten"}}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetStatus, Value: "203"},
			{Type: rewrite.ActionSetHeader, Name: "X-Rewritten", Value: "1"}}},
		rewrite.Rule{ID: 3, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{{Type: rewrite.ActionReplaceBody, Regex: "hello", Value: "HIJACKED"}}}))

	resp, body := sendThrough(t, tr, proxyURL, "GET", localhostURL(srv.URL)+"/events", "", http.Header{"X-Client": {"c"}})
	if resp.StatusCode != 203 || resp.Header.Get("X-Rewritten") != "1" || resp.Header.Get("X-Target") != "t" ||
		!strings.Contains(string(body), "data: hello") || strings.Contains(string(body), "HIJACKED") {
		t.Fatalf("client got %d %v %q", resp.StatusCode, resp.Header, body)
	}
	if all := got.all(); !slices.Equal(all, []string{"/rewritten-events?x=1 X-Client=rewritten"}) {
		t.Fatalf("target received %q", all)
	}
	var ex streamExchange
	waitFor(t, "sse end", func() bool {
		exs := streamExchanges(t, tr, "%event-stream%")
		if len(exs) != 1 || exs[0].respLen == 0 {
			return false
		}
		ex = exs[0]
		return true
	})
	if ex.status != 200 || ex.url != localhostURL(srv.URL)+"/events" {
		t.Fatalf("exchange %+v", ex)
	}
	reqText, respText, err := tr.Get(ex.id)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(reqText, "GET /events HTTP/1.1\n") || !strings.Contains(reqText, "X-Client: c\n") || strings.Contains(reqText, "rewritten") ||
		!strings.HasPrefix(respText, "HTTP 200\n") || strings.Contains(respText, "X-Rewritten") {
		t.Fatalf("recorded:\n%s\n%s", reqText, respText)
	}
	var summary []string
	for _, l := range traceRows(t, tr, ex.id) {
		summary = append(summary, fmt.Sprintf("%s/%d/%s/%s/%s", l.phase, l.ruleID.Int64, l.field.String, l.outcome, l.reason))
	}
	want := []string{"request/1/url/applied/", "request/1/header:X-Client/applied/",
		"response/2/header:X-Rewritten/applied/", "response/2/status/applied/", "response/3//skipped/not rewritten: stream"}
	if !slices.Equal(summary, want) {
		t.Fatalf("trace %q, want %q", summary, want)
	}
	if msgs := allMessages(t, tr, ex.id); len(msgs) != 2 || msgs[0].Payload != "hello" {
		t.Fatalf("events %+v", msgs)
	}
	if n, tb := tr.snaps.counts(); n != 0 || tb != 0 {
		t.Fatal("slot kept after SSEStart")
	}
}

// WebSocket: go-mitmproxy calls WebSocketStart after it has upgraded the
// client, with no response on the flow, so the handshake cannot be rewritten:
// every candidate rule is traced "not rewritten: stream", the handshake is
// recorded as the client sent it, and the frames pass unchanged.
func TestRewriteWebSocketTracedNotRewritten(t *testing.T) {
	var gotRule atomic.Value
	up := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotRule.Store(r.Header.Get("X-Rule"))
		c, err := up.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close()
		for {
			mt, msg, err := c.ReadMessage()
			if err != nil {
				return
			}
			if err := c.WriteMessage(mt, append([]byte("echo:"), msg...)); err != nil {
				return
			}
		}
	}))
	t.Cleanup(srv.Close)
	tr, _, proxyURL := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-Rule", Value: "1"}}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-Resp", Value: "1"}}},
		rewrite.Rule{ID: 3, Phase: rewrite.PhaseResponse, Matchers: rewrite.Matchers{Host: "elsewhere.example"}, Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-Resp", Value: "2"}}}))
	target := "wss://" + strings.TrimPrefix(localhostURL(srv.URL), "https://") + "/ws"
	c, hs, err := wsDialer(t, tr, proxyURL).Dial(target, http.Header{"X-Client": {"c"}})
	if err != nil {
		t.Fatal(err)
	}
	if hs.Header.Get("X-Resp") != "" {
		t.Fatal("the handshake response was rewritten")
	}
	if err := c.WriteMessage(websocket.TextMessage, []byte("hi")); err != nil {
		t.Fatal(err)
	}
	if _, msg, err := c.ReadMessage(); err != nil || string(msg) != "echo:hi" {
		t.Fatalf("echo %q %v", msg, err)
	}
	closeWS(c)
	if v, _ := gotRule.Load().(string); v != "" {
		t.Fatal("the handshake request was rewritten")
	}
	var ex streamExchange
	waitFor(t, "websocket end", func() bool {
		exs := streamExchanges(t, tr, "websocket")
		if len(exs) != 1 || exs[0].reqLen == 0 {
			return false
		}
		ex = exs[0]
		return true
	})
	var summary []string
	for _, l := range traceRows(t, tr, ex.id) {
		summary = append(summary, fmt.Sprintf("%s/%d/%s/%s", l.phase, l.ruleID.Int64, l.outcome, l.reason))
	}
	if want := []string{"request/1/skipped/not rewritten: stream", "response/2/skipped/not rewritten: stream"}; !slices.Equal(summary, want) {
		t.Fatalf("trace %q, want %q", summary, want)
	}
	if ok, _, _ := tr.RewriteInfo(ex.id); ok {
		t.Fatal("a websocket exchange is flagged rewritten")
	}
	reqText, _, _ := tr.Get(ex.id)
	if !strings.Contains(reqText, "X-Client: c\n") || strings.Contains(reqText, "X-Rule") {
		t.Fatalf("handshake recorded:\n%s", reqText)
	}
	if msgs := allMessages(t, tr, ex.id); len(msgs) != 2 || msgs[0].Payload != "hi" || msgs[1].Payload != "echo:hi" {
		t.Fatalf("messages %+v", msgs)
	}
}
