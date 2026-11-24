package traffic

import (
	"database/sql"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Autumn-27/artex/traffic/rewrite"
	mproxy "github.com/lqqyt2423/go-mitmproxy/proxy"
)

// Applying the rewrite rules to the proxied flows.
//
// The request phase runs in the Request hook. A request a rule rewrote leaves
// the proxy changed, but its exchange records what the client sent: the
// original is kept in a per-flow request snapshot until the Response hook
// records the exchange. The response phase runs at the start of the Response
// hook (status and headers only at SSEStart), and the exchange records the
// response as the target sent it. The trace of both phases is written in the
// exchange's own transaction (exchange_rewrites).
//
// A request is rewritten only once its snapshot slot is reserved, and a slot
// stays until the flow's exchange is recorded or the flow is finished, so the
// Response hook never takes a rewritten request for the client's.

// Limits of the request snapshots.
const (
	maxSnapEntries = 1024     // entries holding an original request
	maxSnapBytes   = 64 << 20 // what those entries hold
	maxSnapTombs   = 4096     // tombstones: slots whose data was released
	// snapTTL deletes nothing: past it, the entry of a live flow may be turned
	// into a tombstone when a new reservation finds no room.
	snapTTL       = 15 * time.Minute
	sweepDebounce = time.Second // at most one sweep per second
	sweepPeriod   = time.Minute // a sweep at least this often while slots exist
	// libraryStreamBody is go-mitmproxy's StreamLargeBodies default: a body this
	// large reaches neither the Request nor the Response hook.
	libraryStreamBody = 5 << 20

	reasonSnapshotCapacity    = "not rewritten: snapshot capacity"
	reasonOriginalUnavailable = "original request unavailable"
)

// testRuleHook, when a test sets it, runs inside each rule that checks a body
// ("rule") and in the sink right after the engine ("request", "response"), so
// a test can make a rule, or the sink itself, panic.
var testRuleHook atomic.Pointer[func(stage string)]

func runTestHook(stage string) {
	if h := testRuleHook.Load(); h != nil {
		(*h)(stage)
	}
}

// rulesIsBinary is the binary predicate handed to the engine: the recorder's
// own, so "not rewritten: binary" follows what the recorder treats as binary.
func rulesIsBinary(contentType string, body []byte) bool {
	runTestHook("rule")
	return isBinaryBody(contentType, body)
}

type flowKey [16]byte

func keyOf(f *mproxy.Flow) flowKey { return flowKey(f.Id) }

// reqSnap is one slot of the table: an entry, which holds the original of a
// request, or a tombstone, which holds only why it has none.
type reqSnap struct {
	// done is the flow's Done() channel: closed, no hook will come for the
	// slot any more. The flow itself is not referenced.
	done  <-chan struct{}
	rules *rewrite.Set // the snapshot of rules the flow runs with, both phases
	hooks *HookSet     // the snapshot of tampering hooks the flow runs with, both phases
	host  string       // host name: the only part of the request a log shows
	tomb  bool

	// Entry.
	created   time.Time
	cost      int64
	rewritten bool // the request phase changed the request
	method    string
	url       *url.URL
	header    http.Header
	rawHost   string
	body      []byte // the client's body, kept when a body action applied
	keepBody  bool
	lines     []rewrite.TraceLine // request-phase trace

	// Tombstone.
	reason  string  // reasonSnapshotCapacity or reasonOriginalUnavailable
	ruleIDs []int64 // rules that had rewritten the request
}

// requestRewritten reports a flow whose request left the proxy changed.
func (s *reqSnap) requestRewritten() bool {
	if s.tomb {
		return s.reason == reasonOriginalUnavailable
	}
	return s.rewritten
}

func (s *reqSnap) appliedRuleIDs() []int64 {
	if s.tomb {
		return s.ruleIDs
	}
	_, ids := appliedRules(s.lines)
	return ids
}

// snapTable holds the slots, keyed by flow id. Its mutex is a leaf lock.
type snapTable struct {
	mu          sync.Mutex
	slots       map[flowKey]*reqSnap
	entries     int
	bytes       int64
	tombs       int
	lastSweep   time.Time
	lastFullLog time.Time
	sweepWanted atomic.Bool

	now        func() time.Time
	maxEntries int
	maxBytes   int64
	maxTombs   int
	ttl        time.Duration

	sweeps, capacity, tombDrops, conversions, largeResponses atomic.Int64
}

func newSnapTable() *snapTable {
	return &snapTable{slots: map[flowKey]*reqSnap{}, now: time.Now,
		maxEntries: maxSnapEntries, maxBytes: maxSnapBytes, maxTombs: maxSnapTombs, ttl: snapTTL}
}

func doneClosed(ch <-chan struct{}) bool {
	if ch == nil {
		return false // a nil channel is never ready: the flow counts as live
	}
	select {
	case <-ch:
		return true
	default:
		return false
	}
}

// reserve stores the entry of a rewritten request. On failure the request must
// leave unchanged: a capacity tombstone then stands for the flow, when there is
// room for one.
func (t *snapTable) reserve(k flowKey, e *reqSnap) bool {
	if t == nil {
		return false
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.removeLocked(k)
	if !t.fitsLocked(e.cost) {
		// A failed reservation asks for an immediate sweep, under the same
		// debounce; a sweep refused by the debounce fails the reservation.
		now := t.now()
		if now.Sub(t.lastSweep) < sweepDebounce {
			t.refuseLocked(k, e)
			return false
		}
		t.sweepLocked(now)
		if !t.fitsLocked(e.cost) && !t.convertLocked(e.cost) {
			t.refuseLocked(k, e)
			return false
		}
	}
	e.created = t.now()
	t.slots[k] = e
	t.entries++
	t.bytes += e.cost
	return true
}

func (t *snapTable) fitsLocked(cost int64) bool {
	return t.entries < t.maxEntries && t.bytes+cost <= t.maxBytes
}

// convertLocked turns the oldest entry of a live flow older than the TTL into
// a tombstone, in place, so the flow is never without a slot. It does so only
// when releasing that entry lets a reservation of cost succeed, and when a
// tombstone place is free (after evicting tombstones of finished flows only).
// Otherwise nothing changes and it reports false.
func (t *snapTable) convertLocked(cost int64) bool {
	now := t.now()
	var victim *reqSnap
	for _, s := range t.slots {
		if s.tomb || doneClosed(s.done) || now.Sub(s.created) < t.ttl {
			continue
		}
		if t.entries-1 >= t.maxEntries || t.bytes-s.cost+cost > t.maxBytes {
			continue // released, it would still leave no room
		}
		if victim == nil || s.created.Before(victim.created) {
			victim = s
		}
	}
	if victim == nil {
		return false
	}
	if t.tombs >= t.maxTombs {
		t.evictFinishedTombsLocked()
	}
	if t.tombs >= t.maxTombs {
		return false
	}
	ids := victim.appliedRuleIDs()
	t.entries--
	t.bytes -= victim.cost
	t.tombs++
	*victim = reqSnap{done: victim.done, rules: victim.rules, host: victim.host, tomb: true, reason: reasonOriginalUnavailable, ruleIDs: ids}
	t.conversions.Add(1)
	slog.Warn("[traffic] rewrite snapshot released under pressure, exchange recorded as original request unavailable", "host", victim.host, "rules", ids)
	return true
}

// refuseLocked is the capacity path: the request is not rewritten, and a
// tombstone records why, when a place is free.
func (t *snapTable) refuseLocked(k flowKey, e *reqSnap) {
	t.capacity.Add(1)
	if t.tombs >= t.maxTombs {
		t.evictFinishedTombsLocked()
	}
	full := t.tombs >= t.maxTombs
	if full {
		t.tombDrops.Add(1)
	} else {
		t.slots[k] = &reqSnap{done: e.done, rules: e.rules, host: e.host, tomb: true, reason: reasonSnapshotCapacity}
		t.tombs++
	}
	if now := t.now(); now.Sub(t.lastFullLog) >= time.Minute {
		t.lastFullLog = now
		slog.Warn("[traffic] rewrite snapshot table full, requests sent without rewriting", "refused", t.capacity.Load(), "without_trace", t.tombDrops.Load())
	}
}

func (t *snapTable) evictFinishedTombsLocked() {
	for k, s := range t.slots {
		if s.tomb && doneClosed(s.done) {
			t.removeLocked(k)
		}
	}
}

// sweepLocked deletes every slot whose flow is finished. The slot of a live
// flow is never touched, whatever its age.
func (t *snapTable) sweepLocked(now time.Time) {
	for k, s := range t.slots {
		if doneClosed(s.done) {
			t.removeLocked(k)
		}
	}
	t.lastSweep = now
	t.sweepWanted.Store(false)
	t.sweeps.Add(1)
}

func (t *snapTable) removeLocked(k flowKey) {
	s := t.slots[k]
	if s == nil {
		return
	}
	if s.tomb {
		t.tombs--
	} else {
		t.entries--
		t.bytes -= s.cost
	}
	delete(t.slots, k)
}

// take removes and returns the slot of a flow, nil when it has none.
func (t *snapTable) take(k flowKey) *reqSnap {
	if t == nil {
		return nil
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	s := t.slots[k]
	t.removeLocked(k)
	return s
}

// requestSweep asks the sweeper for a pass; it runs at most once a second.
func (t *snapTable) requestSweep() {
	if t != nil {
		t.sweepWanted.Store(true)
	}
}

// tick is one beat of the sweeper: a sweep when one was asked for and the last
// is a second old, or when the last is a minute old. Nothing on an empty table.
func (t *snapTable) tick() {
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.slots) == 0 {
		t.sweepWanted.Store(false)
		return
	}
	now := t.now()
	since := now.Sub(t.lastSweep)
	if (t.sweepWanted.Load() && since >= sweepDebounce) || since >= sweepPeriod {
		t.sweepLocked(now)
	}
}

// counts reports the entries and tombstones in the table.
func (t *snapTable) counts() (entries, tombs int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.entries, t.tombs
}

// sweepSnapshots is the single sweeper goroutine, started by Open and stopped
// by Close.
func (t *Traffic) sweepSnapshots() {
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-t.closed:
			return
		case <-tick.C:
			t.snaps.tick()
		}
	}
}

// RewriteStats are the proxy-side counters of the rewrite rules since start.
type RewriteStats struct {
	// LargeResponses counts flows with a snapshot whose response reached the
	// library's 5 MiB stream threshold: passed through, not recorded.
	LargeResponses int64 `json:"large_responses"`
	// CapacityRefusals counts requests sent without rewriting for lack of room.
	CapacityRefusals int64 `json:"capacity_refusals"`
	// TombstoneDrops counts those of them that got no capacity tombstone either.
	TombstoneDrops int64 `json:"tombstone_drops"`
	// Conversions counts entries released under pressure.
	Conversions int64 `json:"conversions"`
	Sweeps      int64 `json:"sweeps"`
}

func (t *Traffic) RewriteStats() RewriteStats {
	s := t.snaps
	if s == nil {
		return RewriteStats{}
	}
	return RewriteStats{LargeResponses: s.largeResponses.Load(), CapacityRefusals: s.capacity.Load(),
		TombstoneDrops: s.tombDrops.Load(), Conversions: s.conversions.Load(), Sweeps: s.sweeps.Load()}
}

// newEntry builds the snapshot of a request before the rules' result is put on
// the flow: URL and headers cloned, the body referenced, and only when a body
// action applied (otherwise the flow's body is still the client's).
func newEntry(f *mproxy.Flow, set *rewrite.Set, hooks *HookSet, res rewrite.Result) *reqSnap {
	r := f.Request
	u := *r.URL
	e := &reqSnap{done: f.Done(), rules: set, hooks: hooks, host: r.URL.Hostname(), rewritten: res.Changed,
		method: r.Method, url: &u, header: r.Header.Clone(), lines: res.Lines}
	if raw := r.Raw(); raw != nil {
		e.rawHost = raw.Host
	}
	for _, l := range res.Lines {
		if l.Outcome == rewrite.OutcomeApplied && l.Field == "body" && len(r.Body) <= rewrite.MaxBodySize {
			e.body, e.keepBody = r.Body, true
			break
		}
	}
	e.cost = int64(len(e.method) + len(u.String()) + len(e.rawHost) + len(e.body))
	for k, vs := range e.header {
		for _, v := range vs {
			e.cost += int64(len(k) + len(v))
		}
	}
	for _, l := range e.lines {
		e.cost += int64(len(l.After) + len(l.RuleSnapshot))
	}
	return e
}

// originalRequest is the request an exchange records, with the request-phase
// trace: the flow's own request when no rule rewrote it, the entry's copy when
// one did, and only what Raw() still knows when the entry was released.
func originalRequest(f *mproxy.Flow, snap *reqSnap) (requestView, []rewrite.TraceLine) {
	switch {
	case snap == nil:
		return flowRequestView(f.Request), nil
	case !snap.tomb:
		v := requestView{method: snap.method, url: snap.url, proto: f.Request.Proto, header: snap.header, rawHost: snap.rawHost, body: f.Request.Body}
		if snap.keepBody {
			v.body = snap.body
		}
		return v, snap.lines
	case snap.reason == reasonSnapshotCapacity:
		// The request was not rewritten: the flow's request is the client's.
		return flowRequestView(f.Request), []rewrite.TraceLine{{Phase: rewrite.PhaseRequest, Outcome: rewrite.OutcomeSkipped, Reason: reasonSnapshotCapacity}}
	default:
		// Rewritten, original released: never record the rewritten request as
		// the client's. Raw() is the client's request line and Host.
		v := requestView{unavailable: true}
		if raw := f.Request.Raw(); raw != nil {
			v.method, v.url, v.proto, v.rawHost = raw.Method, raw.URL, raw.Proto, raw.Host
		}
		lines := []rewrite.TraceLine{{Phase: rewrite.PhaseRequest, Outcome: rewrite.OutcomeError, Reason: reasonOriginalUnavailable}}
		for _, id := range snap.ruleIDs {
			lines = append(lines, rewrite.TraceLine{Phase: rewrite.PhaseRequest, RuleID: id, Outcome: rewrite.OutcomeApplied})
		}
		return v, lines
	}
}

func engineRequest(r *mproxy.Request) rewrite.Request {
	return rewrite.Request{Method: r.Method, URL: r.URL, Header: r.Header, Body: r.Body}
}

// takeReplayNonce removes every occurrence of X-ARTEX-Replay-Nonce from h
// unconditionally and returns its value only when exactly one header value was
// present.
func takeReplayNonce(h http.Header) (nonce string, present bool) {
	if h == nil {
		return "", false
	}
	count := 0
	for k, vs := range h {
		if strings.EqualFold(k, replayNonceHeader) {
			present = true
			for _, v := range vs {
				count++
				if count == 1 {
					nonce = strings.TrimSpace(v)
				}
			}
			delete(h, k)
		}
	}
	if count != 1 {
		return "", present
	}
	return nonce, present
}

// Request runs the request phase. The result goes on the flow only once the
// request's snapshot slot is reserved; without one the request leaves as the
// client sent it. Rules fail open: a panic leaves the request unchanged.
func (s *sink) Request(f *mproxy.Flow) {
	if s.t == nil || f.Request == nil || f.Request.URL == nil {
		return
	}
	// Strip the internal replay bypass header unconditionally before forwarding
	// or running rules; honour it only when its value matches a registered nonce.
	if nonce, present := takeReplayNonce(f.Request.Header); present && consumeReplayNonce(nonce) {
		s.bypass.Store(keyOf(f), struct{}{})
		return
	}
	set := s.t.rewriteRules.Load()
	hooks := s.t.tamperHooks.Load()
	if set.Len(rewrite.PhaseRequest) == 0 && hooks.Len(rewrite.PhaseRequest) == 0 {
		return
	}
	host := f.Request.URL.Hostname()
	defer func() {
		if recover() != nil {
			slog.Error("[traffic] rewrite rules panicked on request, sent as-is", "host", host, "class", rewrite.ErrClassPanic)
		}
	}()
	in := rewrite.Input{Request: engineRequest(f.Request), IsBinary: rulesIsBinary}
	res := set.Apply(rewrite.PhaseRequest, in)
	if hooks.Len(rewrite.PhaseRequest) > 0 {
		hIn := in
		hIn.Request = res.Request
		hRes := hooks.Apply(rewrite.PhaseRequest, hIn, res.Tainted)
		if hRes.Changed {
			res.Changed, res.Request = true, hRes.Request
		}
		res.Lines = append(res.Lines, hRes.Lines...)
	}
	runTestHook("request")
	if len(res.Lines) == 0 {
		return
	}
	if !s.t.snaps.reserve(keyOf(f), newEntry(f, set, hooks, res)) {
		return
	}
	if res.Changed {
		r := f.Request
		r.Method, r.URL, r.Header, r.Body = res.Request.Method, res.Request.URL, res.Request.Header, res.Request.Body
	}
}

// Response records the exchange and runs the response phase: the exchange
// keeps the client's request and the target's response, the client gets the
// rewritten response. Without a slot and without response rules/hooks this is
// the plain record.
func (s *sink) Response(f *mproxy.Flow) {
	if f.Request == nil || f.Response == nil {
		return
	}
	if _, bypassed := s.bypass.LoadAndDelete(keyOf(f)); bypassed {
		s.t.record(f)
		return
	}
	snap := s.t.snaps.take(keyOf(f))
	set := s.t.rewriteRules.Load()
	hooks := s.t.tamperHooks.Load()
	if snap != nil {
		set = snap.rules
		hooks = snap.hooks
	}
	if snap == nil && set.Len(rewrite.PhaseResponse) == 0 && hooks.Len(rewrite.PhaseResponse) == 0 {
		s.t.record(f)
		return
	}
	rq, lines := originalRequest(f, snap)
	rs := flowResponseView(f.Response)
	res := s.applyResponse(f, set, hooks, rewrite.Input{
		Request:  engineRequest(f.Request), // as sent to the target
		Response: rewrite.Response{Status: rs.status, Header: rs.header, Body: rs.body},
		IsBinary: rulesIsBinary,
	})
	s.t.recordViews(rq, rs, append(lines, res.Lines...))
	if res.Changed {
		f.Response.StatusCode, f.Response.Header, f.Response.Body = res.Response.Status, res.Response.Header, res.Response.Body
	}
}

// applyResponse runs the response phase (rules first, then hooks); a panic
// yields no change and no line.
func (s *sink) applyResponse(f *mproxy.Flow, set *rewrite.Set, hooks *HookSet, in rewrite.Input) (res rewrite.Result) {
	if set.Len(rewrite.PhaseResponse) == 0 && hooks.Len(rewrite.PhaseResponse) == 0 {
		return rewrite.Result{}
	}
	defer func() {
		if recover() != nil {
			res = rewrite.Result{}
			slog.Error("[traffic] rewrite rules panicked on response, sent as-is", "host", f.Request.URL.Hostname(), "class", rewrite.ErrClassPanic)
		}
	}()
	r := set.Apply(rewrite.PhaseResponse, in)
	if hooks.Len(rewrite.PhaseResponse) > 0 {
		hIn := in
		hIn.Response = r.Response
		hRes := hooks.Apply(rewrite.PhaseResponse, hIn, r.Tainted)
		if hRes.Changed {
			r.Changed, r.Response = true, hRes.Response
		}
		r.Lines = append(r.Lines, hRes.Lines...)
	}
	runTestHook("response")
	return r
}

// rewriteStream prepares the exchange of a stream at SSEStart or
// WebSocketStart: the client's request, the target's status and headers (SSE),
// and the trace. For SSE, the response phase runs in stream mode: status and
// header actions apply (res, put on the flow by applyStreamResponse), rules
// that read or write the response body are traced "not rewritten: stream".
// WebSocketStart runs once go-mitmproxy has already answered the client's
// upgrade, with no response on the flow: nothing of the handshake can change
// there, so every candidate rule is traced "not rewritten: stream".
func (s *sink) rewriteStream(f *mproxy.Flow, kind string) (rq requestView, rs responseView, lines []rewrite.TraceLine, res rewrite.Result) {
	if _, bypassed := s.bypass.LoadAndDelete(keyOf(f)); bypassed {
		rq = flowRequestView(f.Request)
		if kind == "sse" {
			rs = flowResponseView(f.Response)
		}
		return rq, rs, nil, rewrite.Result{}
	}
	snap := s.t.snaps.take(keyOf(f))
	set := s.t.rewriteRules.Load()
	hooks := s.t.tamperHooks.Load()
	if snap != nil {
		set = snap.rules
		hooks = snap.hooks
	}
	rq, lines = originalRequest(f, snap)
	if kind == "sse" {
		rs = flowResponseView(f.Response)
	}
	cur := engineRequest(f.Request)
	if kind != "websocket" {
		res = s.applyResponse(f, set, hooks, rewrite.Input{Request: cur, Response: rewrite.Response{Status: rs.status, Header: rs.header}, Stream: true, IsBinary: rulesIsBinary})
		return rq, rs, append(lines, res.Lines...), res
	}
	if set.Len(rewrite.PhaseRequest)+set.Len(rewrite.PhaseResponse)+hooks.Len(rewrite.PhaseRequest)+hooks.Len(rewrite.PhaseResponse) == 0 {
		return rq, rs, lines, rewrite.Result{}
	}
	// The engine never changes a request with Upgrade; a ws:// stream arrives
	// on its CONNECT flow, which has none.
	if cur.Header.Get("Upgrade") == "" {
		cur.Header = cur.Header.Clone()
		if cur.Header == nil {
			cur.Header = http.Header{}
		}
		cur.Header.Set("Upgrade", "websocket")
	}
	if snap == nil {
		lines = append(lines, s.applyRequestTrace(f, set, hooks, cur)...)
	}
	r := s.applyResponse(f, set, hooks, rewrite.Input{Request: cur, Response: rewrite.Response{Status: http.StatusSwitchingProtocols}, Stream: true, IsBinary: rulesIsBinary})
	return rq, rs, append(lines, r.Lines...), rewrite.Result{}
}

// applyRequestTrace runs the request phase for its trace only.
func (s *sink) applyRequestTrace(f *mproxy.Flow, set *rewrite.Set, hooks *HookSet, req rewrite.Request) (lines []rewrite.TraceLine) {
	defer func() {
		if recover() != nil {
			lines = nil
			slog.Error("[traffic] rewrite rules panicked on request", "host", f.Request.URL.Hostname(), "class", rewrite.ErrClassPanic)
		}
	}()
	in := rewrite.Input{Request: req, IsBinary: rulesIsBinary}
	out := set.Apply(rewrite.PhaseRequest, in).Lines
	if hooks.Len(rewrite.PhaseRequest) > 0 {
		out = append(out, hooks.Apply(rewrite.PhaseRequest, in, nil).Lines...)
	}
	return out
}

// applyStreamResponse puts the rewritten status and headers of an SSE
// response on the flow, before go-mitmproxy replies to the client.
func (s *sink) applyStreamResponse(f *mproxy.Flow, res rewrite.Result) {
	if res.Changed && f.Response != nil {
		f.Response.StatusCode, f.Response.Header = res.Response.Status, res.Response.Header
	}
}

// RequestError fires when a request through an established MITM tunnel fails. If
// the failure looks proxy/protocol-caused (h2 quirks, HEAD-with-body, protocol
// errors) and not a plain target-unreachable error, the host is tunneled for
// passthroughTTL: this request has already failed, later requests in the window
// connect straight through, and the first one after the window tries
// interception again. A request a rule rewrote never flags its host: the rule,
// not the interception, may be at fault. Its log names the host, the error class
// and the rules, never the URL or the error text.
func (s *sink) RequestError(f *mproxy.Flow, err error) {
	if f != nil {
		s.bypass.Delete(keyOf(f))
		if snap := s.t.snaps.take(keyOf(f)); snap != nil && snap.requestRewritten() {
			ids := snap.appliedRuleIDs()
			for _, id := range ids {
				snap.rules.NoteError(id, rewrite.ErrClassTransport)
			}
			slog.Warn("[traffic] rewritten request failed, host stays intercepted", "host", snap.host, "rules", ids, "class", rewrite.ErrClassTransport)
			return
		}
	}
	s.t.maybePassthrough(f, err)
}

// StreamResponseModifier passes every body through as received, nil included,
// without wrapping it. A response that reached the library's stream threshold
// is never recorded: the slot of its flow, if any, is released here.
func (s *sink) StreamResponseModifier(f *mproxy.Flow, in io.Reader) (out io.Reader) {
	out = in
	defer func() {
		if recover() != nil {
			out = in
		}
	}()
	if s == nil || s.t == nil || f == nil || !f.Stream || f.SSE != nil {
		return in
	}
	s.bypass.Delete(keyOf(f))
	snap := s.t.snaps.take(keyOf(f))
	if snap == nil {
		return in
	}
	s.t.snaps.largeResponses.Add(1)
	slog.Warn("[traffic] large response passed through, not recorded", "host", snap.host, "rules", snap.appliedRuleIDs(), "size_mib", libraryStreamBody>>20)
	return in
}

// spillTrace stores the values of the trace lines as record stores bodies.
// Called under wmu, before the transaction.
func (t *Traffic) spillTrace(lines []rewrite.TraceLine) []storedBody {
	out := make([]storedBody, len(lines))
	for i, l := range lines {
		out[i] = t.spill(l.After, "")
	}
	return out
}

// writeTrace inserts an exchange's trace rows and the blob references of their
// spilled values, inside the exchange's transaction.
func writeTrace(tx *sql.Tx, id string, lines []rewrite.TraceLine, trace []storedBody) error {
	for _, b := range trace {
		if b.hash == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO blob_refs(hash,exchange_id) VALUES(?,?)`, b.hash, id); err != nil {
			return &recordError{"registering blob reference", err}
		}
	}
	for i, l := range lines {
		var ruleID, hookID, hookVer, after any
		if l.RuleID != 0 {
			ruleID = l.RuleID
		}
		if l.HookID != 0 {
			hookID = l.HookID
		}
		if l.HookVersion != 0 {
			hookVer = l.HookVersion
		}
		sourceKind := l.SourceKind
		if sourceKind == "" {
			sourceKind = rewrite.SourceKindRule
		}
		if trace[i].inline != nil {
			after = trace[i].inline
		}
		if _, err := tx.Exec(`INSERT INTO exchange_rewrites(exchange_id,seq,phase,source_kind,rule_id,hook_id,hook_version,rule_snapshot,action,field,outcome,reason,before_hash,after_hash,after_inline,after_blob)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			id, i, string(l.Phase), sourceKind, ruleID, hookID, hookVer, nullIfEmpty(l.RuleSnapshot), nullIfEmpty(l.Action), nullIfEmpty(l.Field), l.Outcome, l.Reason,
			nullIfEmpty(l.BeforeHash), nullIfEmpty(l.AfterHash), after, nullIfEmpty(trace[i].hash)); err != nil {
			return &recordError{"writing rewrite trace", err}
		}
	}
	return nil
}

// RewriteInfo reports whether rules rewrote an exchange (at least one applied
// trace line) and which rules did, by id.
func (t *Traffic) RewriteInfo(id string) (rewritten bool, ruleIDs []int64, err error) {
	if err := t.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM exchange_rewrites r WHERE r.exchange_id=? AND r.outcome='applied')`, id).Scan(&rewritten); err != nil || !rewritten {
		return false, nil, err
	}
	rows, err := t.db.Query(`SELECT DISTINCT rule_id FROM exchange_rewrites WHERE exchange_id=? AND outcome='applied' AND rule_id IS NOT NULL ORDER BY rule_id`, id)
	if err != nil {
		return false, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var rid int64
		if err := rows.Scan(&rid); err != nil {
			return false, nil, err
		}
		ruleIDs = append(ruleIDs, rid)
	}
	return true, ruleIDs, rows.Err()
}
