package traffic

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"reflect"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
	"unsafe"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic/rewrite"
	mproxy "github.com/lqqyt2423/go-mitmproxy/proxy"
)

// Stream recording (WebSocket and Server-Sent Events). go-mitmproxy reports a
// stream as Start, one Message hook per message, then End; a stream never reaches
// the Response hook, so record() never sees it. Each stream becomes one exchange
// (status 101 "websocket", or the real text/event-stream response) whose messages
// go to stream_messages in arrival order.

const (
	// wsText and wsBinary are the WebSocket data opcodes (RFC 6455 §5.2), the
	// values go-mitmproxy reports in WebSocketMessage.Type.
	wsText   = 1
	wsBinary = 2
	// streamPreview caps one message's payload in a StreamMessages row; a longer
	// payload lives in the blob store and the row carries its hash.
	streamPreview = 4 * 1024
	// maxStreamInline is the inline threshold for message payloads: anything
	// longer spills to the blob store, so a page of 200 rows stays bounded.
	maxStreamInline = streamPreview
	// toolStreamPreview caps one message's preview in traffic_messages, so a page
	// of messages stays small in the agent's context.
	toolStreamPreview = 1024
)

// streamState tracks one live stream. mu serializes the two WebSocket forwarding
// goroutines, which both fire WebSocketMessage on the same flow.
type streamState struct {
	mu       sync.Mutex
	id       string // exchange id; "" when the stream could not be recorded
	kind     string // "websocket" | "sse"
	consumed int    // library messages/events already handled
	seq      int64
	stored   int
	// storedBytes counts what the kept messages occupy: the payload after
	// truncation, plus the inline preview spill keeps for a spilled payload.
	storedBytes  int64
	dropped      bool
	droppedMsgs  int64
	droppedBytes int64
	// reqBytes and respBytes are the bytes observed in each direction, dropped
	// messages included.
	reqBytes, respBytes int64
}

// streamRow is one stream_messages row before it is written.
type streamRow struct {
	ts        int64 // unix seconds, like exchanges.ts; seq carries the order
	direction string
	kind      int
	event     string
	eventID   string
	retry     int
	size      int
	payload   []byte // kept bytes (after maxStreamPayload truncation)
	truncated bool
	ctype     string // content type handed to spill for the binary check
}

func (s *sink) WebSocketStart(f *mproxy.Flow) { s.startStream(f, "websocket") }
func (s *sink) SSEStart(f *mproxy.Flow)       { s.startStream(f, "sse") }

func (s *sink) WebSocketMessage(f *mproxy.Flow) {
	st := s.stream(f)
	if st == nil || f.WebScoket == nil {
		return
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	s.t.persistStream(st, wsMessagesSince(f.WebScoket, st))
}

func (s *sink) SSEMessage(f *mproxy.Flow) {
	st := s.stream(f)
	if st == nil || f.SSE == nil {
		return
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	s.t.persistStream(st, sseEventsSince(f.SSE, st))
}

func (s *sink) WebSocketEnd(f *mproxy.Flow) {
	v, ok := s.streams.LoadAndDelete(f)
	if !ok {
		return
	}
	st := v.(*streamState)
	st.mu.Lock()
	defer st.mu.Unlock()
	if f.WebScoket != nil {
		s.t.persistStream(st, wsMessagesSince(f.WebScoket, st))
	}
	s.t.finishStream(st)
}

func (s *sink) SSEEnd(f *mproxy.Flow) {
	v, ok := s.streams.LoadAndDelete(f)
	if !ok {
		return
	}
	st := v.(*streamState)
	st.mu.Lock()
	defer st.mu.Unlock()
	if f.SSE != nil {
		s.t.persistStream(st, sseEventsSince(f.SSE, st))
	}
	s.t.finishStream(st)
}

func (s *sink) stream(f *mproxy.Flow) *streamState {
	v, ok := s.streams.Load(f)
	if !ok {
		return nil
	}
	return v.(*streamState)
}

// startStream registers the flow before recording its exchange, so a message
// hook racing the start waits on st.mu instead of being dropped.
func (s *sink) startStream(f *mproxy.Flow, kind string) {
	st := &streamState{kind: kind}
	st.mu.Lock()
	defer st.mu.Unlock()
	s.streams.Store(f, st)
	if f.Request == nil || f.Request.URL == nil || (kind == "sse" && f.Response == nil) {
		return
	}
	rq, rs, lines, res := s.rewriteStream(f, kind)
	id, err := s.t.recordStreamStart(rq, rs, kind, lines)
	s.applyStreamResponse(f, res)
	if err != nil {
		if rewritten, ruleIDs := appliedRules(lines); rewritten {
			var re *recordError
			errors.As(err, &re)
			slog.Error("[traffic] failed to record rewritten stream", "kind", kind, "host", f.Request.URL.Hostname(), "step", re.step, "rules", ruleIDs)
			return
		}
		slog.Error("[traffic] failed to record stream", "kind", kind, "url", f.Request.URL.String(), "err", err)
		return
	}
	st.id = id
	if kind == "sse" {
		st.reqBytes = int64(len(rq.body))
	}
}

// recordError names the step of a recording that failed. Its text is the step
// and the cause, as recordStreamStart always reported.
type recordError struct {
	step string
	err  error
}

func (e *recordError) Error() string { return e.step + ": " + e.err.Error() }
func (e *recordError) Unwrap() error { return e.err }

// libMutex returns the unexported mu sync.Mutex that go-mitmproxy holds while it
// appends to WebSocketData.Messages / SSEData.Events. The library exposes no
// accessor, and the two WebSocket goroutines append concurrently, so reading the
// slice without that lock is a data race. Reaching a private field ties this to
// the pinned go-mitmproxy v1.9.2: TestLibMutexFound is the upgrade guard. Nil
// when the field is absent, and then nothing is read (see lockLib).
func libMutex(v any) *sync.Mutex {
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Pointer || rv.IsNil() {
		return nil
	}
	f := rv.Elem().FieldByName("mu")
	if !f.IsValid() || f.Type() != reflect.TypeOf(sync.Mutex{}) || !f.CanAddr() {
		return nil
	}
	return (*sync.Mutex)(unsafe.Pointer(f.UnsafeAddr()))
}

var libMutexMissing sync.Once

// lockLib takes the library's lock on v. ok is false when the lock cannot be
// found; callers then read nothing rather than race the library.
func lockLib(v any) (unlock func(), ok bool) {
	mu := libMutex(v)
	if mu == nil {
		libMutexMissing.Do(func() {
			slog.Warn("[traffic] go-mitmproxy stream data has no mu field; stream messages are not recorded")
		})
		return nil, false
	}
	mu.Lock()
	return mu.Unlock, true
}

// wsMessagesSince returns every WebSocket message appended since the last call,
// in the library's order, so each is handled exactly once whichever goroutine's
// hook gets there first. The library slice itself is never modified.
func wsMessagesSince(ws *mproxy.WebSocketData, st *streamState) []streamRow {
	unlock, ok := lockLib(ws)
	if !ok {
		return nil
	}
	msgs := ws.Messages
	if st.consumed > len(msgs) {
		st.consumed = len(msgs)
	}
	fresh := append([]*mproxy.WebSocketMessage(nil), msgs[st.consumed:]...)
	st.consumed = len(msgs)
	unlock()
	rows := make([]streamRow, 0, len(fresh))
	for _, m := range fresh {
		if m == nil {
			continue
		}
		dir, ctype := "s2c", "text/plain; charset=utf-8"
		if m.FromClient {
			dir = "c2s"
			st.reqBytes += int64(len(m.Content))
		} else {
			st.respBytes += int64(len(m.Content))
		}
		if m.Type == wsBinary {
			ctype = "application/octet-stream"
		}
		rows = append(rows, streamRow{ts: m.Timestamp.Unix(), direction: dir, kind: m.Type, size: len(m.Content), payload: m.Content, ctype: ctype})
	}
	return rows
}

// sseEventsSince is wsMessagesSince for Server-Sent Events.
func sseEventsSince(sse *mproxy.SSEData, st *streamState) []streamRow {
	unlock, ok := lockLib(sse)
	if !ok {
		return nil
	}
	events := sse.Events
	if st.consumed > len(events) {
		st.consumed = len(events)
	}
	fresh := append([]*mproxy.SSEEvent(nil), events[st.consumed:]...)
	st.consumed = len(events)
	unlock()
	rows := make([]streamRow, 0, len(fresh))
	for _, e := range fresh {
		if e == nil {
			continue
		}
		st.respBytes += int64(len(e.Raw))
		rows = append(rows, streamRow{ts: e.Time.Unix(), direction: "s2c", event: e.Event, eventID: e.ID,
			retry: e.Retry, size: len(e.Data), payload: []byte(e.Data), ctype: "text/event-stream"})
	}
	return rows
}

// streamDisplayURL is the URL shown for a WebSocket exchange: http→ws and
// https→wss. A plain ws:// connection reaches the WebSocket hooks through its
// CONNECT tunnel, where only the target authority is known, not the path.
func streamDisplayURL(reqMethod string, reqURL *url.URL, kind string) (method, display, tmpl string) {
	u := *reqURL
	method = reqMethod
	if kind == "websocket" && strings.EqualFold(method, "CONNECT") {
		host := u.Host
		if host == "" {
			host = u.Opaque
		}
		return "GET", (&url.URL{Scheme: "ws", Host: host, Path: "/"}).String(), "/"
	}
	if kind == "websocket" {
		switch strings.ToLower(u.Scheme) {
		case "http", "":
			u.Scheme = "ws"
		case "https":
			u.Scheme = "wss"
		}
	}
	return method, u.String(), db.TemplatePath(reqURL.EscapedPath())
}

// recordStreamStart writes the stream's exchange: metadata, request head and
// body, the response head (synthetic 101 for WebSocket), the rewrite trace,
// and the header text in the full-text index. Messages are never indexed. rq
// is the request the client sent and rs (SSE only) the status and headers the
// target sent, whatever the rules changed.
func (t *Traffic) recordStreamStart(rq requestView, rs responseView, kind string, lines []rewrite.TraceLine) (string, error) {
	now := time.Now()
	id := t.newExchangeID(now)
	method, display, tmpl, host, target := rq.method, "", "", "", ""
	if rq.url != nil {
		method, display, tmpl = streamDisplayURL(rq.method, rq.url, kind)
		host = rq.url.Hostname()
		target = rq.url.RequestURI()
		if strings.EqualFold(rq.method, "CONNECT") {
			target = rq.url.Host // authority-form, as on the wire
		}
	}
	reqHead := requestHead(rq, target)
	status, ct, respHead := 101, "websocket", "HTTP/1.1 101 Switching Protocols\n"
	if kind == "sse" {
		status = rs.status
		ct = rs.header.Get("Content-Type")
		respHead = fmt.Sprintf("HTTP %d\n%s", status, headerLines(rs.header))
	}

	t.wmu.Lock()
	defer t.wmu.Unlock()
	reqB := t.spill(rq.body, rq.header.Get("Content-Type"))
	trace := t.spillTrace(lines)
	tx, err := t.db.Begin()
	if err != nil {
		return "", &recordError{"beginning transaction", err}
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed
	// An id can repeat (seconds plus a rolling counter); the trace of the
	// exchange it replaces must not stay attached to this one.
	if _, err := tx.Exec(`DELETE FROM exchange_rewrites WHERE exchange_id=?`, id); err != nil {
		return "", &recordError{"clearing rewrite trace", err}
	}
	res, err := tx.Exec(`INSERT OR REPLACE INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES(?,?,?,?,?,?,?,?,?,?,'')`, id, now.Unix(), host, method, tmpl, display, status, ct, len(rq.body), 0)
	if err != nil {
		return "", &recordError{"writing index", err}
	}
	rowid, err := res.LastInsertId()
	if err != nil {
		return "", &recordError{"fetching rowid", err}
	}
	if _, err := tx.Exec(`INSERT OR REPLACE INTO exchange_bodies(id,req_head,req_body,req_blob,resp_head,resp_body,resp_blob)
VALUES(?,?,?,?,?,NULL,NULL)`, id, reqHead, reqB.inline, nullIfEmpty(reqB.hash), respHead); err != nil {
		return "", &recordError{"writing body", err}
	}
	if reqB.hash != "" {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO blob_refs(hash,exchange_id) VALUES(?,?)`, reqB.hash, id); err != nil {
			return "", &recordError{"registering blob reference", err}
		}
	}
	if err := writeTrace(tx, id, lines, trace); err != nil {
		return "", err
	}
	if t.fts {
		idx := strings.Join([]string{display, reqHead, reqB.index, respHead}, "\n")
		if _, err := tx.Exec(`INSERT INTO ex_fts(rowid,content) VALUES(?,?)`, rowid, idx); err != nil {
			return "", &recordError{"writing full-text index", err}
		}
	}
	if err := tx.Commit(); err != nil {
		return "", &recordError{"committing", err}
	}
	return id, nil
}

// persistStream applies the per-message and per-exchange limits to rows and
// writes what is kept. The first message past a per-exchange limit stores one
// 'meta' row instead; nothing is stored after it. Caller holds st.mu. Errors are
// logged: a recording failure never interrupts the stream.
func (t *Traffic) persistStream(st *streamState, rows []streamRow) {
	if st.id == "" || len(rows) == 0 {
		return
	}
	keep := make([]streamRow, 0, len(rows))
	addMeta := false
	for _, r := range rows {
		if len(r.payload) > maxStreamPayload {
			r.payload = r.payload[:maxStreamPayload]
			r.truncated = true
		}
		cost := streamStoredCost(r)
		if st.dropped || st.stored >= maxStreamMessages || st.storedBytes+cost > maxStreamBytes {
			if !st.dropped {
				st.dropped = true
				addMeta = true
			}
			st.droppedMsgs++
			st.droppedBytes += int64(r.size)
			continue
		}
		st.stored++
		st.storedBytes += cost
		keep = append(keep, r)
	}
	var meta []byte
	if addMeta {
		meta = streamMetaPayload(st)
	}
	if len(keep) == 0 && meta == nil {
		return
	}

	t.wmu.Lock()
	defer t.wmu.Unlock()
	// Sequence numbers and blob writes come first, as in record(): blob writes are
	// filesystem work and must not sit inside the SQLite transaction. Holding wmu
	// keeps gcBlobs from collecting a blob before its reference is committed.
	type preparedRow struct {
		streamRow
		seq  int64
		body storedBody
	}
	prepared := make([]preparedRow, 0, len(keep))
	for _, r := range keep {
		st.seq++
		prepared = append(prepared, preparedRow{streamRow: r, seq: st.seq, body: t.spillAt(r.payload, r.ctype, maxStreamInline)})
	}
	var metaSeq int64
	if meta != nil {
		st.seq++
		metaSeq = st.seq
	}

	tx, err := t.db.Begin()
	if err != nil {
		slog.Error("[traffic] failed to record stream messages", "exchange_id", st.id, "step", "begin tx", "err", err)
		return
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed
	for _, p := range prepared {
		inline := p.body.inline
		if inline == nil {
			inline = []byte{}
		}
		if _, err := tx.Exec(`INSERT INTO stream_messages(exchange_id,seq,ts,direction,kind,event,event_id,retry,size,payload,payload_blob,truncated)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, st.id, p.seq, p.ts, p.direction, p.kind, p.event, p.eventID, p.retry, p.size,
			inline, nullIfEmpty(p.body.hash), boolInt(p.truncated)); err != nil {
			slog.Error("[traffic] failed to record stream message", "seq", p.seq, "exchange_id", st.id, "err", err)
			return
		}
		if p.body.hash != "" {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO blob_refs(hash,exchange_id) VALUES(?,?)`, p.body.hash, st.id); err != nil {
				slog.Error("[traffic] failed to register stream message blob ref", "seq", p.seq, "exchange_id", st.id, "err", err)
				return
			}
		}
	}
	if meta != nil {
		if _, err := tx.Exec(`INSERT INTO stream_messages(exchange_id,seq,ts,direction,kind,size,payload)
VALUES(?,?,?,'meta',0,?,?)`, st.id, metaSeq, time.Now().Unix(), len(meta), meta); err != nil {
			slog.Error("[traffic] failed to record stream limit marker", "exchange_id", st.id, "err", err)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		slog.Error("[traffic] failed to record stream messages", "exchange_id", st.id, "step", "commit", "err", err)
	}
}

// streamStoredCost is what keeping r adds to the index and blob store: the
// payload, plus the inline preview spillAt keeps when the payload spills (a text
// prefix of at most blobPreview, or a one-line tag for binary).
func streamStoredCost(r streamRow) int64 {
	n := int64(len(r.payload))
	if len(r.payload) <= maxStreamInline {
		return n
	}
	if isBinaryBody(r.ctype, r.payload) {
		return n + int64(len(binaryTag(r.ctype, r.payload)))
	}
	return n + int64(len(truncateUTF8(r.payload, blobPreview)))
}

func streamMetaPayload(st *streamState) []byte {
	b, _ := json.Marshal(map[string]int64{"dropped_messages": st.droppedMsgs, "dropped_bytes": st.droppedBytes})
	return b
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// finishStream records the bytes observed in each direction and the final
// counts of the limit marker. Caller holds st.mu.
func (t *Traffic) finishStream(st *streamState) {
	if st.id == "" {
		return
	}
	t.wmu.Lock()
	defer t.wmu.Unlock()
	if _, err := t.db.Exec(`UPDATE exchanges SET req_len=?, resp_len=? WHERE id=?`, st.reqBytes, st.respBytes, st.id); err != nil {
		slog.Error("[traffic] failed to record stream sizes", "exchange_id", st.id, "err", err)
	}
	if st.dropped {
		meta := streamMetaPayload(st)
		if _, err := t.db.Exec(`UPDATE stream_messages SET payload=?, size=? WHERE exchange_id=? AND direction='meta'`, meta, len(meta), st.id); err != nil {
			slog.Error("[traffic] failed to update stream limit marker", "exchange_id", st.id, "err", err)
		}
	}
}

// StreamMessage is one recorded WebSocket message or SSE event.
type StreamMessage struct {
	Seq       int64  `json:"seq"`
	TS        int64  `json:"ts"` // unix seconds, like an exchange's ts; Seq orders
	Direction string `json:"direction"`
	Kind      int    `json:"kind"`
	// Type is "text" or "binary" (WebSocket), "event" (SSE), or "meta" (the
	// limit marker).
	Type    string `json:"type"`
	Event   string `json:"event,omitempty"`
	EventID string `json:"event_id,omitempty"`
	Retry   int    `json:"retry,omitempty"`
	Size    int    `json:"size"`
	Payload string `json:"payload"`
	// Encoding is "base64" for binary payloads, empty for UTF-8 text.
	Encoding  string `json:"encoding,omitempty"`
	Blob      string `json:"blob,omitempty"`
	Truncated bool   `json:"truncated,omitempty"`
}

// StreamMessagePage keeps row totals for pagination separate from message
// totals for display. Items and Total include any 'meta' limit marker;
// MessageTotal counts only recorded WebSocket messages or SSE events.
type StreamMessagePage struct {
	Items        []StreamMessage `json:"items"`
	Total        int             `json:"total"`
	MessageTotal int             `json:"message_total"`
}

// StreamMessages returns one page of an exchange's stream messages in order.
// limit is 1..200 (default 50) and offset >= 0. Every payload comes back as at
// most streamPreview (4 KiB); a longer one lives in the blob store and the row
// carries its hash for the rest (traffic_blob, GET /api/traffic/blob).
func (t *Traffic) StreamMessages(exchangeID string, offset, limit int) ([]StreamMessage, int, error) {
	return t.StreamMessagesByDirection(exchangeID, "", offset, limit)
}

// ErrBadStreamDirection is returned by StreamMessagesByDirection for a
// direction other than "", "c2s" or "s2c".
var ErrBadStreamDirection = errors.New(`direction must be "c2s", "s2c" or empty`)

// streamDirectionFilter returns the SQL condition (after exchange_id=?) and its
// argument for a direction filter. A filtered page keeps the 'meta' limit
// marker, so a reader never misses that messages were dropped.
func streamDirectionFilter(direction string) (cond string, args []any, err error) {
	switch direction {
	case "":
		return "", nil, nil
	case "c2s", "s2c":
		return ` AND direction IN (?, 'meta')`, []any{direction}, nil
	default:
		return "", nil, ErrBadStreamDirection
	}
}

// StreamMessagesByDirection is StreamMessages restricted to one direction:
// "c2s" (client to server), "s2c" (server to client), or "" for both. total
// counts only the matching rows, so offset pages through the filtered list.
// The 'meta' row (messages dropped past the recorder's limits) is kept in a
// filtered page. Seq stays the message's position in the whole stream.
func (t *Traffic) StreamMessagesByDirection(exchangeID, direction string, offset, limit int) ([]StreamMessage, int, error) {
	page, err := t.StreamMessagePageByDirection(exchangeID, direction, offset, limit)
	return page.Items, page.Total, err
}

// StreamMessagePageByDirection returns the same rows and pagination total as
// StreamMessagesByDirection, plus a message total that excludes limit markers.
// Both totals cover the entire filtered stream, regardless of offset or limit.
func (t *Traffic) StreamMessagePageByDirection(exchangeID, direction string, offset, limit int) (StreamMessagePage, error) {
	cond, dirArgs, err := streamDirectionFilter(direction)
	if err != nil {
		return StreamMessagePage{}, err
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	var page StreamMessagePage
	args := append([]any{exchangeID}, dirArgs...)
	if err := t.db.QueryRow(`SELECT COUNT(*), COUNT(CASE WHEN direction <> 'meta' THEN 1 END)
FROM stream_messages WHERE exchange_id=?`+cond, args...).Scan(&page.Total, &page.MessageTotal); err != nil {
		return StreamMessagePage{}, err
	}
	rows, err := t.db.Query(`SELECT seq,ts,direction,kind,event,event_id,retry,size,payload,payload_blob,truncated
FROM stream_messages WHERE exchange_id=?`+cond+` ORDER BY seq LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return StreamMessagePage{}, err
	}
	defer rows.Close()
	page.Items = []StreamMessage{}
	for rows.Next() {
		var m StreamMessage
		var payload []byte
		var blob sql.NullString
		var truncated int
		if err := rows.Scan(&m.Seq, &m.TS, &m.Direction, &m.Kind, &m.Event, &m.EventID, &m.Retry, &m.Size, &payload, &blob, &truncated); err != nil {
			return StreamMessagePage{}, err
		}
		m.Truncated = truncated != 0
		m.Blob = blob.String
		switch {
		case m.Direction == "meta":
			m.Type = "meta"
		case m.Kind == wsBinary:
			m.Type = "binary"
		case m.Kind == wsText:
			m.Type = "text"
		default:
			m.Type = "event"
		}
		if m.Type == "binary" {
			if m.Blob != "" {
				// A spilled binary payload keeps only a descriptive tag inline;
				// the preview is the payload's own leading bytes.
				payload, _, _ = t.BlobRange(m.Blob, 0, streamPreview)
			}
			m.Payload, m.Encoding = base64.StdEncoding.EncodeToString(clipBytes(payload, streamPreview)), "base64"
		} else {
			m.Payload = truncateUTF8(payload, streamPreview)
		}
		page.Items = append(page.Items, m)
	}
	return page, rows.Err()
}

// StreamInfo reports how many stream messages an exchange holds and whether it
// is a WebSocket or SSE exchange ("" for an ordinary exchange).
func (t *Traffic) StreamInfo(exchangeID string) (count int, kind string, err error) {
	var ct sql.NullString
	err = t.db.QueryRow(`SELECT content_type FROM exchanges WHERE id=?`, exchangeID).Scan(&ct)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, "", err
	}
	switch c := strings.ToLower(ct.String); {
	case c == "websocket":
		kind = "websocket"
	case strings.Contains(c, "text/event-stream"):
		kind = "sse"
	}
	if err := t.db.QueryRow(`SELECT COUNT(*) FROM stream_messages WHERE exchange_id=?`, exchangeID).Scan(&count); err != nil {
		return 0, "", err
	}
	return count, kind, nil
}

// streamToolPreview renders one message for traffic_messages: at most 1 KiB of
// text (hex for binary), plus the blob hash when the payload spilled.
func streamToolPreview(m StreamMessage) string {
	if m.Encoding == "base64" {
		raw, _ := base64.StdEncoding.DecodeString(m.Payload)
		return "hex:" + fmt.Sprintf("%x", clipBytes(raw, toolStreamPreview/2))
	}
	p := m.Payload
	if len(p) > toolStreamPreview {
		p = truncateUTF8([]byte(p), toolStreamPreview)
	}
	if !utf8.ValidString(p) {
		p = strings.ToValidUTF8(p, "�")
	}
	return p
}
