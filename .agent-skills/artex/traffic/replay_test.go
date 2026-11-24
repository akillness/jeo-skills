package traffic

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// echoed is what the echo target saw.
type echoed struct {
	Method        string `json:"method"`
	Path          string `json:"path"`
	Query         string `json:"query"`
	Custom        string `json:"custom"`
	Connection    string `json:"connection"`
	ContentLength int64  `json:"content_length"`
	Body          string `json:"body"`
	Host          string `json:"host"`
	XHop          string `json:"x_hop"`
	ProxyAuth     string `json:"proxy_auth"`
}

func echoHandler(w http.ResponseWriter, r *http.Request) {
	b, _ := io.ReadAll(r.Body)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Echo", "yes")
	_ = json.NewEncoder(w).Encode(echoed{
		Method: r.Method, Path: r.URL.Path, Query: r.URL.RawQuery, Custom: r.Header.Get("X-Custom"),
		Connection: r.Header.Get("Connection"), ContentLength: r.ContentLength, Body: string(b), Host: r.Host,
		XHop: r.Header.Get("X-Hop"), ProxyAuth: r.Header.Get("Proxy-Authorization"),
	})
}

// replayBody returns the JSON body of a replayed echo response.
func replayBody(t *testing.T, res ReplayResult) echoed {
	t.Helper()
	i := strings.Index(res.Raw, "\n{")
	if i < 0 {
		t.Fatalf("no JSON body in raw response:\n%s", res.Raw)
	}
	var e echoed
	if err := json.Unmarshal([]byte(strings.TrimSpace(res.Raw[i+1:])), &e); err != nil {
		t.Fatalf("decode echo: %v in %q", err, res.Raw)
	}
	return e
}

func recordedExchanges(t *testing.T, tr *Traffic, method, url string) int {
	t.Helper()
	var n int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM exchanges WHERE method=? AND url=?`, method, url).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestReplayThroughProxy(t *testing.T) {
	tr, _, _ := startProxy(t)
	plain := httptest.NewServer(http.HandlerFunc(echoHandler))
	t.Cleanup(plain.Close)
	tlsSrv := httptest.NewTLSServer(http.HandlerFunc(echoHandler))
	t.Cleanup(tlsSrv.Close)

	for _, tc := range []struct{ name, base string }{
		{"http", plain.URL},
		{"https", localhostURL(tlsSrv.URL)}, // trusted through the proxy CA
	} {
		t.Run(tc.name, func(t *testing.T) {
			target := tc.base + "/edited/path?q=1&r=two"
			res, err := tr.Replay(t.Context(), ReplayRequest{
				Method:  "PATCH",
				URL:     target,
				Headers: []ReplayHeader{{Name: "X-Custom", Value: "edited"}, {Name: "Content-Type", Value: "text/plain"}},
				Body:    []byte("edited body"),
			})
			if err != nil {
				t.Fatal(err)
			}
			if res.Status != 200 || res.Truncated || !res.Recorded || !strings.HasPrefix(res.Raw, "HTTP/1.1 200 OK\n") || !strings.Contains(res.Raw, "X-Echo: yes") {
				t.Fatalf("result status=%d truncated=%v recorded=%v raw:\n%s", res.Status, res.Truncated, res.Recorded, res.Raw)
			}
			echoHeader := false
			for i, h := range res.Headers {
				if i > 0 && res.Headers[i-1].Name > h.Name {
					t.Fatalf("headers not sorted: %+v", res.Headers)
				}
				echoHeader = echoHeader || (h.Name == "X-Echo" && h.Value == "yes")
			}
			if !echoHeader {
				t.Fatalf("headers %+v lack X-Echo: yes", res.Headers)
			}
			got := replayBody(t, res)
			if got.Method != "PATCH" || got.Path != "/edited/path" || got.Query != "q=1&r=two" || got.Custom != "edited" || got.Body != "edited body" {
				t.Fatalf("target received %+v", got)
			}
			waitFor(t, "replayed exchange recorded", func() bool { return recordedExchanges(t, tr, "PATCH", target) == 1 })
		})
	}
}

func TestReplayDropsHopByHopHeaders(t *testing.T) {
	tr, _, _ := startProxy(t)
	srv := httptest.NewServer(http.HandlerFunc(echoHandler))
	t.Cleanup(srv.Close)
	res, err := tr.Replay(t.Context(), ReplayRequest{
		Method: "POST",
		URL:    srv.URL + "/hop",
		Headers: []ReplayHeader{
			{Name: "Connection", Value: "close, X-Hop"},
			{Name: "X-Hop", Value: "v"},
			{Name: "Proxy-Authorization", Value: "Basic dXNlcjpwYXNz"},
			{Name: "Content-Length", Value: "999"},
			{Name: "Keep-Alive", Value: "timeout=5"},
			{Name: "Host", Value: strings.TrimPrefix(srv.URL, "http://")},
		},
		Body: []byte("abc"),
	})
	if err != nil {
		t.Fatal(err)
	}
	got := replayBody(t, res)
	if got.Connection != "" || got.ContentLength != 3 || got.Body != "abc" {
		t.Fatalf("target received connection=%q content_length=%d body=%q, want no Connection and a recomputed length", got.Connection, got.ContentLength, got.Body)
	}
	if got.XHop != "" || got.ProxyAuth != "" {
		t.Fatalf("target received X-Hop=%q Proxy-Authorization=%q, want neither", got.XHop, got.ProxyAuth)
	}
	if got.Host != strings.TrimPrefix(srv.URL, "http://") {
		t.Fatalf("target saw Host %q", got.Host)
	}
}

func TestReplayDoesNotFollowRedirects(t *testing.T) {
	tr, _, _ := startProxy(t)
	var followed atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/next" {
			followed.Store(true)
			return
		}
		http.Redirect(w, r, "/next", http.StatusFound)
	}))
	t.Cleanup(srv.Close)
	res, err := tr.Replay(t.Context(), ReplayRequest{Method: "GET", URL: srv.URL + "/start"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != 302 || !strings.Contains(res.Raw, "Location: /next") || followed.Load() {
		t.Fatalf("status %d followed=%v raw:\n%s", res.Status, followed.Load(), res.Raw)
	}
}

func TestReplayTruncatesLargeResponse(t *testing.T) {
	tr, _, _ := startProxy(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, strings.Repeat("x", maxReplayResponse+100))
	}))
	t.Cleanup(srv.Close)
	res, err := tr.Replay(t.Context(), ReplayRequest{Method: "GET", URL: srv.URL + "/big"})
	if err != nil {
		t.Fatal(err)
	}
	head, body, _ := strings.Cut(res.Raw, "\n\n")
	if !res.Truncated || len(body) != maxReplayResponse || head == "" {
		t.Fatalf("truncated=%v body %d bytes, want %d", res.Truncated, len(body), maxReplayResponse)
	}
}

func TestReplayTimeoutIsRecognizable(t *testing.T) {
	tr, _, _ := startProxy(t)
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-time.After(5 * time.Second):
		}
	}))
	t.Cleanup(func() { close(release); srv.Close() })
	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
	defer cancel()
	_, err := tr.Replay(ctx, ReplayRequest{Method: "GET", URL: srv.URL + "/slow"})
	if !errors.Is(err, context.DeadlineExceeded) || errors.Is(err, ErrReplayInvalid) {
		t.Fatalf("err = %v, want a deadline error", err)
	}
}

// A passthrough host is tunneled, not intercepted: the client sees the target's
// own certificate (here an untrusted httptest one, so the TLS handshake fails)
// and nothing is recorded. Pins the documented limitation.
func TestReplayPassthroughHostIsNotIntercepted(t *testing.T) {
	tr, _, _ := startProxy(t)
	srv := httptest.NewTLSServer(http.HandlerFunc(echoHandler))
	t.Cleanup(srv.Close)
	tr.pass.Store("localhost", time.Now().Add(passthroughTTL))
	if !tr.tunneling("localhost") {
		t.Fatal("passthrough mark was not recognized before the replay")
	}
	target := localhostURL(srv.URL) + "/tunneled"
	_, err := tr.Replay(t.Context(), ReplayRequest{Method: "GET", URL: target})
	if err == nil || !strings.Contains(err.Error(), "certificate") {
		t.Fatalf("err = %v, want the target's own certificate to be rejected", err)
	}
	if n := recordedExchanges(t, tr, "GET", target); n != 0 {
		t.Fatalf("%d exchanges recorded for a passthrough host", n)
	}
}

// Validation happens before anything is sent, so the proxy need not run.
func TestReplayRejectsInvalidRequests(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tr.Close() })
	many := make([]ReplayHeader, maxReplayHeaders+1)
	for i := range many {
		many[i] = ReplayHeader{Name: fmt.Sprintf("X-H%d", i), Value: "v"}
	}
	for name, req := range map[string]ReplayRequest{
		"ftp scheme":        {Method: "GET", URL: "ftp://example.com/x"},
		"relative url":      {Method: "GET", URL: "/x"},
		"no host":           {Method: "GET", URL: "http:///x"},
		"user info":         {Method: "GET", URL: "http://user:pass@example.com/"},
		"empty method":      {Method: " ", URL: "http://example.com/"},
		"CONNECT":           {Method: "CONNECT", URL: "http://example.com/"},
		"method not token":  {Method: "GE T", URL: "http://example.com/"},
		"too many headers":  {Method: "GET", URL: "http://example.com/", Headers: many},
		"CR in header":      {Method: "GET", URL: "http://example.com/", Headers: []ReplayHeader{{Name: "X-A", Value: "a\r\nX-Injected: 1"}}},
		"LF in header":      {Method: "GET", URL: "http://example.com/", Headers: []ReplayHeader{{Name: "X-A", Value: "a\nb"}}},
		"invalid name":      {Method: "GET", URL: "http://example.com/", Headers: []ReplayHeader{{Name: "Bad Name", Value: "v"}}},
		"upgrade websocket": {Method: "GET", URL: "http://example.com/", Headers: []ReplayHeader{{Name: "Upgrade", Value: "websocket"}}},
		"host differs":      {Method: "GET", URL: "http://example.com/", Headers: []ReplayHeader{{Name: "Host", Value: "other.example"}}},
	} {
		if _, err := tr.Replay(t.Context(), req); !errors.Is(err, ErrReplayInvalid) {
			t.Errorf("%s: err = %v, want ErrReplayInvalid", name, err)
		}
	}
	_, err = tr.Replay(t.Context(), ReplayRequest{Method: "POST", URL: "http://example.com/", Body: make([]byte, maxReplayBody+1)})
	if !errors.Is(err, ErrReplayTooLarge) || errors.Is(err, ErrReplayInvalid) {
		t.Errorf("body too large: err = %v, want ErrReplayTooLarge", err)
	}
}

// Only an https host in passthrough is reported as not recorded.
func TestReplayRecordedHelper(t *testing.T) {
	tr := &Traffic{}
	tr.pass.Store("localhost", time.Now().Add(passthroughTTL))
	if !tr.tunneling("localhost") {
		t.Fatal("fresh passthrough mark was not tunneling")
	}
	tr.pass.Store("expired.example", time.Now().Add(-time.Second))
	for _, c := range []struct {
		scheme, host string
		want         bool
	}{
		{"https", "localhost:443", false},
		{"https", "example.com:443", true},
		{"http", "localhost:80", true},
		{"https", "expired.example:443", true},
	} {
		if got := tr.replayRecorded(c.scheme, c.host); got != c.want {
			t.Errorf("replayRecorded(%s, %s) = %v, want %v", c.scheme, c.host, got, c.want)
		}
	}
}
