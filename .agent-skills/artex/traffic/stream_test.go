package traffic

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	mproxy "github.com/lqqyt2423/go-mitmproxy/proxy"
)

// localhostURL names an httptest server by host name: the MITM leaf certificate
// carries a DNS name, not an IP SAN (as in pace_test.go).
func localhostURL(u string) string { return strings.Replace(u, "127.0.0.1", "localhost", 1) }

// waitFor polls cond until it holds or 10 seconds pass.
func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// wsDialer dials through the recording proxy and trusts its CA.
func wsDialer(t *testing.T, tr *Traffic, proxyURL string) *websocket.Dialer {
	t.Helper()
	pem, err := os.ReadFile(tr.CACertPath())
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		t.Fatal("no CA in", tr.CACertPath())
	}
	u, _ := url.Parse(proxyURL)
	return &websocket.Dialer{Proxy: http.ProxyURL(u), TLSClientConfig: &tls.Config{RootCAs: pool}, HandshakeTimeout: 5 * time.Second}
}

type streamExchange struct {
	id, url, contentType string
	status               int
	reqLen, respLen      int64
}

// streamExchanges returns the exchanges recorded with a stream content type.
func streamExchanges(t *testing.T, tr *Traffic, contentLike string) []streamExchange {
	t.Helper()
	rows, err := tr.DB().Query(`SELECT id,url,content_type,status,req_len,resp_len FROM exchanges WHERE content_type LIKE ? ORDER BY id`, contentLike)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []streamExchange
	for rows.Next() {
		var e streamExchange
		if err := rows.Scan(&e.id, &e.url, &e.contentType, &e.status, &e.reqLen, &e.respLen); err != nil {
			t.Fatal(err)
		}
		out = append(out, e)
	}
	return out
}

func allMessages(t *testing.T, tr *Traffic, id string) []StreamMessage {
	t.Helper()
	var out []StreamMessage
	for offset := 0; ; offset += 200 {
		page, total, err := tr.StreamMessages(id, offset, 200)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, page...)
		if len(out) >= total || len(page) == 0 {
			return out
		}
	}
}

// echoWSServer echoes every message back with the same type: text prefixed
// with "echo:", binary reversed.
func echoWSServer(t *testing.T) *httptest.Server {
	t.Helper()
	up := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
			if mt == websocket.BinaryMessage {
				rev := make([]byte, len(msg))
				for i := range msg {
					rev[len(msg)-1-i] = msg[i]
				}
				msg = rev
			} else {
				msg = append([]byte("echo:"), msg...)
			}
			if err := c.WriteMessage(mt, msg); err != nil {
				return
			}
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func closeWS(c *websocket.Conn) {
	_ = c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	for {
		if _, _, err := c.ReadMessage(); err != nil {
			break
		}
	}
	_ = c.Close()
}

func TestWebSocketMessagesRecorded(t *testing.T) {
	tr, _, proxyURL := startProxy(t)
	srv := echoWSServer(t)
	target := "wss://" + strings.TrimPrefix(localhostURL(srv.URL), "https://") + "/ws?room=1"
	c, _, err := wsDialer(t, tr, proxyURL).Dial(target, nil)
	if err != nil {
		t.Fatal(err)
	}
	exchange := func(mt int, msg []byte) []byte {
		if err := c.WriteMessage(mt, msg); err != nil {
			t.Fatal(err)
		}
		gotType, got, err := c.ReadMessage()
		if err != nil || gotType != mt {
			t.Fatalf("read type=%d err=%v", gotType, err)
		}
		return got
	}
	before := time.Now().Unix()
	if got := exchange(websocket.TextMessage, []byte("hello")); string(got) != "echo:hello" {
		t.Fatalf("echo %q", got)
	}
	if got := exchange(websocket.BinaryMessage, []byte{0, 1, 2, 255}); !bytes.Equal(got, []byte{255, 2, 1, 0}) {
		t.Fatalf("binary echo %v", got)
	}
	closeWS(c)

	var ex streamExchange
	waitFor(t, "websocket end", func() bool {
		exs := streamExchanges(t, tr, "websocket")
		if len(exs) != 1 || exs[0].reqLen == 0 {
			return false
		}
		ex = exs[0]
		return true
	})
	if ex.status != 101 || ex.url != target {
		t.Fatalf("exchange %+v, want status 101 and url %s", ex, target)
	}
	// c2s: "hello" (5) + 4 binary bytes; s2c: "echo:hello" (10) + 4.
	if ex.reqLen != 9 || ex.respLen != 14 {
		t.Fatalf("req_len=%d resp_len=%d, want 9 and 14", ex.reqLen, ex.respLen)
	}
	var respHead string
	if err := tr.DB().QueryRow(`SELECT resp_head FROM exchange_bodies WHERE id=?`, ex.id).Scan(&respHead); err != nil || !strings.HasPrefix(respHead, "HTTP/1.1 101 Switching Protocols") {
		t.Fatalf("resp_head %q err=%v", respHead, err)
	}
	if count, kind, err := tr.StreamInfo(ex.id); err != nil || count != 4 || kind != "websocket" {
		t.Fatalf("StreamInfo = %d %q %v", count, kind, err)
	}

	msgs := allMessages(t, tr, ex.id)
	want := []struct {
		dir, typ, payload string
		kind              int
	}{
		{"c2s", "text", "hello", 1},
		{"s2c", "text", "echo:hello", 1},
		{"c2s", "binary", base64.StdEncoding.EncodeToString([]byte{0, 1, 2, 255}), 2},
		{"s2c", "binary", base64.StdEncoding.EncodeToString([]byte{255, 2, 1, 0}), 2},
	}
	if len(msgs) != len(want) {
		t.Fatalf("got %d messages: %+v", len(msgs), msgs)
	}
	last := before
	for i, w := range want {
		m := msgs[i]
		if m.Seq != int64(i+1) || m.Direction != w.dir || m.Type != w.typ || m.Kind != w.kind || m.Payload != w.payload {
			t.Fatalf("message %d = %+v, want %+v", i, m, w)
		}
		if (w.typ == "binary") != (m.Encoding == "base64") {
			t.Fatalf("message %d encoding %q", i, m.Encoding)
		}
		if m.TS < last {
			t.Fatalf("message %d ts %d before %d", i, m.TS, last)
		}
		last = m.TS
	}
}

func TestSSEEventsRecorded(t *testing.T) {
	tr, _, proxyURL := startProxy(t)
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(200)
		fl := w.(http.Flusher)
		for _, ev := range []string{
			"retry: 1500\nid: 1\nevent: greet\ndata: hello\ndata: world\n\n",
			"id: 2\ndata: second\n\n",
			"event: done\ndata: bye\n\n",
		} {
			_, _ = io.WriteString(w, ev)
			fl.Flush()
			time.Sleep(10 * time.Millisecond)
		}
	}))
	t.Cleanup(srv.Close)

	resp, err := proxyClient(t, tr, proxyURL).Get(localhostURL(srv.URL) + "/events")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(body), "data: bye") {
		t.Fatalf("client body %q", body)
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
	if ex.status != 200 || !strings.HasPrefix(ex.url, localhostURL(srv.URL)+"/events") {
		t.Fatalf("exchange %+v", ex)
	}
	if n, _ := tr.Count(); n != 1 {
		t.Fatalf("%d exchanges recorded, want the single SSE exchange", n)
	}
	msgs := allMessages(t, tr, ex.id)
	want := []struct {
		event, id, data string
		retry           int
	}{
		{"greet", "1", "hello\nworld", 1500},
		{"message", "2", "second", 0},
		{"done", "", "bye", 0},
	}
	if len(msgs) != len(want) {
		t.Fatalf("got %d events: %+v", len(msgs), msgs)
	}
	for i, w := range want {
		m := msgs[i]
		if m.Seq != int64(i+1) || m.Direction != "s2c" || m.Kind != 0 || m.Type != "event" ||
			m.Event != w.event || m.EventID != w.id || m.Payload != w.data || m.Retry != w.retry || m.Size != len(w.data) {
			t.Fatalf("event %d = %+v, want %+v", i, m, w)
		}
	}
}

// unitStream opens a recorder without starting the proxy and drives its hooks
// directly with a synthetic WebSocket flow.
func unitStream(t *testing.T, host string) (*Traffic, *sink, *mproxy.Flow) {
	t.Helper()
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tr.Close() })
	u, _ := url.Parse("https://" + host + "/ws")
	f := &mproxy.Flow{Request: &mproxy.Request{Method: "GET", URL: u, Proto: "HTTP/1.1", Header: http.Header{}}, WebScoket: &mproxy.WebSocketData{}}
	s := tr.proxy.Addons[0].(*sink)
	s.WebSocketStart(f)
	return tr, s, f
}

func addWS(f *mproxy.Flow, fromClient bool, mt int, content []byte) {
	f.WebScoket.Messages = append(f.WebScoket.Messages, &mproxy.WebSocketMessage{Type: mt, Content: content, FromClient: fromClient, Timestamp: time.Now()})
}

func onlyExchange(t *testing.T, tr *Traffic) string {
	t.Helper()
	exs := streamExchanges(t, tr, "websocket")
	if len(exs) != 1 {
		t.Fatalf("%d websocket exchanges", len(exs))
	}
	return exs[0].id
}

func metaCounts(t *testing.T, m StreamMessage) (msgs, bytes int64) {
	t.Helper()
	var v struct {
		DroppedMessages int64 `json:"dropped_messages"`
		DroppedBytes    int64 `json:"dropped_bytes"`
	}
	if err := json.Unmarshal([]byte(m.Payload), &v); err != nil {
		t.Fatalf("meta payload %q: %v", m.Payload, err)
	}
	return v.DroppedMessages, v.DroppedBytes
}

func TestStreamPayloadTruncatedToLimit(t *testing.T) {
	tr, s, f := unitStream(t, "trunc.test")
	big := bytes.Repeat([]byte("a"), maxStreamPayload+10)
	addWS(f, true, websocket.TextMessage, big)
	s.WebSocketMessage(f)
	id := onlyExchange(t, tr)
	msgs := allMessages(t, tr, id)
	if len(msgs) != 1 {
		t.Fatalf("%d messages", len(msgs))
	}
	m := msgs[0]
	if !m.Truncated || m.Size != maxStreamPayload+10 || m.Blob == "" || len(m.Payload) > streamPreview {
		t.Fatalf("message = seq %d size %d truncated %v blob %q payload %d bytes", m.Seq, m.Size, m.Truncated, m.Blob, len(m.Payload))
	}
	data, total, err := tr.BlobRange(m.Blob, 0, 16)
	if err != nil || total != maxStreamPayload || string(data) != strings.Repeat("a", 16) {
		t.Fatalf("blob total=%d data=%q err=%v, want the kept %d-byte prefix", total, data, err, maxStreamPayload)
	}
}

func TestStreamMessageLimitStoresOneMetaRow(t *testing.T) {
	tr, s, f := unitStream(t, "count.test")
	for i := 0; i < maxStreamMessages+5; i++ {
		addWS(f, i%2 == 0, websocket.TextMessage, []byte("m"))
	}
	s.WebSocketMessage(f)
	addWS(f, true, websocket.TextMessage, []byte("late"))
	s.WebSocketMessage(f)
	s.WebSocketEnd(f)
	id := onlyExchange(t, tr)
	msgs := allMessages(t, tr, id)
	if len(msgs) != maxStreamMessages+1 {
		t.Fatalf("%d rows, want %d messages and one meta row", len(msgs), maxStreamMessages)
	}
	meta := msgs[len(msgs)-1]
	if meta.Direction != "meta" || meta.Type != "meta" || meta.Kind != 0 || meta.Seq != maxStreamMessages+1 {
		t.Fatalf("last row %+v, want the meta row", meta)
	}
	if n, b := metaCounts(t, meta); n != 6 || b != 5+4 {
		t.Fatalf("meta dropped_messages=%d dropped_bytes=%d, want 6 and 9", n, b)
	}
	for _, m := range msgs[:len(msgs)-1] {
		if m.Direction == "meta" {
			t.Fatalf("more than one meta row: %+v", m)
		}
	}
}

func TestStreamByteLimitStoresOneMetaRow(t *testing.T) {
	tr, s, f := unitStream(t, "bytes.test")
	chunk := bytes.Repeat([]byte{7}, maxStreamPayload)
	// Each kept 1 MiB payload spills and also keeps its inline tag, so the cap
	// admits floor(maxStreamBytes / (payload + tag)) of them.
	cost := streamStoredCost(streamRow{payload: chunk, ctype: "application/octet-stream"})
	if cost <= maxStreamPayload {
		t.Fatalf("cost %d does not count the inline preview", cost)
	}
	kept := int(maxStreamBytes / cost)
	n := kept + 1
	for i := 0; i < n; i++ {
		addWS(f, false, websocket.BinaryMessage, chunk)
	}
	s.WebSocketMessage(f)
	addWS(f, false, websocket.BinaryMessage, []byte{1})
	s.WebSocketMessage(f)
	s.WebSocketEnd(f)
	id := onlyExchange(t, tr)
	msgs := allMessages(t, tr, id)
	if len(msgs) != kept+1 {
		t.Fatalf("%d rows, want %d stored and one meta row", len(msgs), kept)
	}
	meta := msgs[len(msgs)-1]
	if meta.Direction != "meta" {
		t.Fatalf("last row %+v, want the meta row", meta)
	}
	if dn, db := metaCounts(t, meta); dn != 2 || db != maxStreamPayload+1 {
		t.Fatalf("meta dropped_messages=%d dropped_bytes=%d", dn, db)
	}
	var stored, inline int64
	if err := tr.DB().QueryRow(`SELECT SUM(size), SUM(LENGTH(payload)) FROM stream_messages WHERE exchange_id=? AND direction<>'meta'`, id).Scan(&stored, &inline); err != nil ||
		stored != int64(kept*maxStreamPayload) || stored+inline > maxStreamBytes {
		t.Fatalf("stored %d payload bytes + %d inline err=%v, want %d within %d", stored, inline, err, kept*maxStreamPayload, maxStreamBytes)
	}
	var respLen int64
	if err := tr.DB().QueryRow(`SELECT resp_len FROM exchanges WHERE id=?`, id).Scan(&respLen); err != nil || respLen != int64(n*maxStreamPayload+1) {
		t.Fatalf("resp_len %d err=%v, want every observed byte", respLen, err)
	}
}

// A payload over maxStreamInline goes to the blob store; the row returns at
// most 4 KiB and the hash, and the blob holds the whole payload.
func TestStreamPayloadSpillsAboveInlineLimit(t *testing.T) {
	tr, s, f := unitStream(t, "spill.test")
	bigText := []byte(strings.Repeat("0123456789", 1024)) // 10 KiB
	bigBin := make([]byte, 10*1024)
	for i := range bigBin {
		bigBin[i] = byte(i)
	}
	small := []byte(strings.Repeat("s", 1024))
	addWS(f, true, websocket.TextMessage, bigText)
	addWS(f, false, websocket.BinaryMessage, bigBin)
	addWS(f, true, websocket.TextMessage, small)
	s.WebSocketMessage(f)
	msgs := allMessages(t, tr, onlyExchange(t, tr))
	if len(msgs) != 3 {
		t.Fatalf("%d messages", len(msgs))
	}
	text, bin, inline := msgs[0], msgs[1], msgs[2]
	if text.Blob == "" || len(text.Payload) > streamPreview || text.Payload != string(bigText[:streamPreview]) || text.Size != len(bigText) || text.Truncated {
		t.Fatalf("10 KiB text row: blob %q payload %d bytes size %d truncated %v", text.Blob, len(text.Payload), text.Size, text.Truncated)
	}
	if data, total, err := tr.BlobRange(text.Blob, 0, int64(len(bigText))); err != nil || total != int64(len(bigText)) || !bytes.Equal(data, bigText) {
		t.Fatalf("text blob total=%d err=%v, want the full 10 KiB", total, err)
	}
	raw, err := base64.StdEncoding.DecodeString(bin.Payload)
	if bin.Blob == "" || err != nil || !bytes.Equal(raw, bigBin[:streamPreview]) {
		t.Fatalf("10 KiB binary row: blob %q preview %d bytes err=%v, want its first 4 KiB", bin.Blob, len(raw), err)
	}
	if data, total, err := tr.BlobRange(bin.Blob, 0, int64(len(bigBin))); err != nil || total != int64(len(bigBin)) || !bytes.Equal(data, bigBin) {
		t.Fatalf("binary blob total=%d err=%v", total, err)
	}
	if inline.Blob != "" || inline.Payload != string(small) {
		t.Fatalf("1 KiB row: blob %q payload %d bytes, want inline and complete", inline.Blob, len(inline.Payload))
	}
}

// The server writes a message and closes at once; the message the client read
// must be recorded even though WebSocketEnd fires as soon as one direction ends.
func TestWebSocketFinalMessageOnClose(t *testing.T) {
	tr, _, proxyURL := startProxy(t)
	up := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := up.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		_ = c.WriteMessage(websocket.TextMessage, []byte("final"))
		_ = c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		_ = c.Close()
	}))
	t.Cleanup(srv.Close)
	c, _, err := wsDialer(t, tr, proxyURL).Dial("wss://"+strings.TrimPrefix(localhostURL(srv.URL), "https://")+"/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, got, err := c.ReadMessage(); err != nil || string(got) != "final" {
		t.Fatalf("read %q err=%v", got, err)
	}
	_ = c.Close()
	var id string
	waitFor(t, "websocket end", func() bool {
		exs := streamExchanges(t, tr, "websocket")
		if len(exs) != 1 || exs[0].respLen == 0 {
			return false
		}
		id = exs[0].id
		return true
	})
	msgs := allMessages(t, tr, id)
	if len(msgs) != 1 || msgs[0].Direction != "s2c" || msgs[0].Payload != "final" {
		t.Fatalf("messages %+v, want the final server message", msgs)
	}
}

func TestDeleteHostRemovesStreamMessagesAndBlobs(t *testing.T) {
	tr, s, f := unitStream(t, "gone.test")
	addWS(f, false, websocket.BinaryMessage, bytes.Repeat([]byte{9}, maxInlineBody+1))
	addWS(f, true, websocket.TextMessage, []byte("small"))
	s.WebSocketMessage(f)
	s.WebSocketEnd(f)
	id := onlyExchange(t, tr)
	msgs := allMessages(t, tr, id)
	if len(msgs) != 2 || msgs[0].Blob == "" {
		t.Fatalf("messages %+v, want a spilled first payload", msgs)
	}
	blobPath := filepath.Join(tr.dir, "_blobs", "sha256", msgs[0].Blob[:2], msgs[0].Blob+".bin")
	if _, err := os.Stat(blobPath); err != nil {
		t.Fatalf("payload blob missing: %v", err)
	}
	if n, err := tr.DeleteHost("gone.test"); err != nil || n != 1 {
		t.Fatalf("DeleteHost = %d, %v", n, err)
	}
	var rows int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM stream_messages`).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("%d stream rows left, err=%v", rows, err)
	}
	if _, err := os.Stat(blobPath); !os.IsNotExist(err) {
		t.Fatalf("payload blob not collected: %v", err)
	}
}

// A recording failure must never reach the proxied connection.
func TestWebSocketSurvivesRecordingFailure(t *testing.T) {
	tr, _, proxyURL := startProxy(t)
	srv := echoWSServer(t)
	c, _, err := wsDialer(t, tr, proxyURL).Dial("wss://"+strings.TrimPrefix(localhostURL(srv.URL), "https://")+"/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer closeWS(c)
	if err := c.WriteMessage(websocket.TextMessage, []byte("before")); err != nil {
		t.Fatal(err)
	}
	if _, got, err := c.ReadMessage(); err != nil || string(got) != "echo:before" {
		t.Fatalf("echo %q err=%v", got, err)
	}
	if err := tr.DB().Close(); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		msg := fmt.Sprintf("after-%d", i)
		if err := c.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
			t.Fatalf("write %s: %v", msg, err)
		}
		_ = c.SetReadDeadline(time.Now().Add(5 * time.Second))
		if _, got, err := c.ReadMessage(); err != nil || string(got) != "echo:"+msg {
			t.Fatalf("echo %q err=%v after the index closed", got, err)
		}
	}
}

// Both forwarding goroutines fire the message hook at once; every message must
// be stored exactly once, each direction in order.
func TestWebSocketConcurrentDirections(t *testing.T) {
	const n = 200
	tr, _, proxyURL := startProxy(t)
	up := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := up.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close()
		go func() {
			for i := 0; i < n; i++ {
				if c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("s-%d", i))) != nil {
					return
				}
			}
		}()
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				return
			}
		}
	}))
	t.Cleanup(srv.Close)

	c, _, err := wsDialer(t, tr, proxyURL).Dial("wss://"+strings.TrimPrefix(localhostURL(srv.URL), "https://")+"/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < n; i++ {
			if err := c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("c-%d", i))); err != nil {
				t.Errorf("write: %v", err)
				return
			}
		}
	}()
	for i := 0; i < n; i++ {
		if _, _, err := c.ReadMessage(); err != nil {
			t.Fatalf("read %d: %v", i, err)
		}
	}
	wg.Wait()
	var id string
	waitFor(t, "all client messages recorded", func() bool {
		exs := streamExchanges(t, tr, "websocket")
		if len(exs) != 1 {
			return false
		}
		id = exs[0].id
		count, _, _ := tr.StreamInfo(id)
		return count == 2*n
	})
	closeWS(c)

	msgs := allMessages(t, tr, id)
	next := map[string]int{"c2s": 0, "s2c": 0}
	for i, m := range msgs {
		if m.Seq != int64(i+1) {
			t.Fatalf("row %d has seq %d", i, m.Seq)
		}
		prefix := "s-"
		if m.Direction == "c2s" {
			prefix = "c-"
		}
		if want := fmt.Sprintf("%s%d", prefix, next[m.Direction]); m.Payload != want {
			t.Fatalf("row %d %s payload %q, want %q", i, m.Direction, m.Payload, want)
		}
		next[m.Direction]++
	}
	if next["c2s"] != n || next["s2c"] != n {
		t.Fatalf("stored %v, want %d each way", next, n)
	}
}

// The library's unexported lock is what makes reading its message slices safe;
// a go-mitmproxy upgrade that renames it must fail here, not race silently.
func TestLibMutexFound(t *testing.T) {
	if libMutex(&mproxy.WebSocketData{}) == nil || libMutex(&mproxy.SSEData{}) == nil {
		t.Fatal("go-mitmproxy WebSocketData/SSEData no longer have a sync.Mutex field named mu")
	}
	// Without the lock nothing is read: no unlocked fallback.
	if _, ok := lockLib(&struct{ Messages []int }{}); ok {
		t.Fatal("lockLib reported a lock on a type without mu")
	}
}
