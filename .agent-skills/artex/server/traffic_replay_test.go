package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/traffic"
	"github.com/Autumn-27/artex/traffic/rewrite"
)

// replayServer wires a Server like ingestServer. With traffic off,
// s.m.Traffic() is nil. With trafficOn but not live, the store is open and the
// proxy is not listening. With live, NewManager opens the store and starts the
// recording proxy on a free loopback port, as in production; the proxy has no
// exported stop, so it keeps listening until the test binary exits.
func replayServer(t *testing.T, trafficOn, live bool) (*Server, func(body string) *httptest.ResponseRecorder) {
	t.Helper()
	skipWithoutDSN(t)
	proxyAddr := ""
	if live {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		proxyAddr = ln.Addr().String()
		ln.Close()
	}
	m, err := NewManager(t.TempDir(), proxyAddr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	if live {
		if m.traffic == nil {
			t.Fatal("NewManager did not open the traffic store")
		}
		deadline := time.Now().Add(5 * time.Second)
		for {
			c, err := net.Dial("tcp", proxyAddr)
			if err == nil {
				c.Close()
				break
			}
			if time.Now().After(deadline) {
				t.Fatalf("proxy did not listen on %s: %v", proxyAddr, err)
			}
			time.Sleep(10 * time.Millisecond)
		}
	} else if trafficOn {
		if m.traffic, err = traffic.Open(filepath.Join(m.dir, "traffic"), ":0"); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	s.archiveWG.Wait()
	<-s.side.done
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	return s, func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/traffic/replay", strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		return w
	}
}

func TestTrafficReplayRouteTrafficOff(t *testing.T) {
	_, replay := replayServer(t, false, false)
	if w := replay(`{"method":"GET","url":"http://example.com/"}`); w.Code != 503 {
		t.Fatalf("traffic off = %d %s, want 503", w.Code, w.Body)
	}
}

func TestTrafficReplayRouteValidation(t *testing.T) {
	_, replay := replayServer(t, true, false)
	for name, c := range map[string]struct {
		body string
		want int
	}{
		"bad json":     {`{"method":`, 400},
		"CONNECT":      {`{"method":"CONNECT","url":"http://example.com/"}`, 400},
		"ftp url":      {`{"method":"GET","url":"ftp://example.com/x"}`, 400},
		"no host":      {`{"method":"GET","url":"http:///x"}`, 400},
		"bad base64":   {`{"method":"POST","url":"http://example.com/","body":"%%%","body_base64":true}`, 400},
		"header CRLF":  {`{"method":"GET","url":"http://example.com/","headers":[{"name":"X-A","value":"a\r\nb"}]}`, 400},
		"too large":    {`{"method":"POST","url":"http://example.com/","body":"` + strings.Repeat("a", 17<<20) + `"}`, 413},
		"proxy down":   {`{"method":"GET","url":"http://127.0.0.1:1/"}`, 502},
		"body too big": {`{"method":"POST","url":"http://example.com/","body":"` + base64.StdEncoding.EncodeToString(make([]byte, 9<<20)) + `","body_base64":true}`, 413},
	} {
		if w := replay(c.body); w.Code != c.want {
			t.Errorf("%s: %d %s, want %d", name, w.Code, strings.TrimSpace(w.Body.String()), c.want)
		}
	}
}

func TestTrafficReplayRouteEndToEnd(t *testing.T) {
	s, replay := replayServer(t, true, true)
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		w.Header().Set("X-Seen", r.Method+" "+r.Header.Get("X-Custom"))
		_, _ = w.Write(append([]byte("got:"), b...))
	}))
	t.Cleanup(target.Close)
	url := target.URL + "/replayed?x=1"
	req, _ := json.Marshal(map[string]any{
		"method": "PUT", "url": url,
		"headers": []map[string]string{{"name": "X-Custom", "value": "edited"}},
		"body":    base64.StdEncoding.EncodeToString([]byte("payload")), "body_base64": true,
	})
	w := replay(string(req))
	if w.Code != 200 {
		t.Fatalf("replay = %d %s", w.Code, w.Body)
	}
	var res struct {
		Status     int                    `json:"status"`
		Headers    []traffic.ReplayHeader `json:"headers"`
		Raw        string                 `json:"raw"`
		DurationMS int64                  `json:"duration_ms"`
		Truncated  bool                   `json:"truncated"`
		Recorded   bool                   `json:"recorded"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res.Status != 200 || res.Truncated || !res.Recorded || !strings.Contains(res.Raw, "X-Seen: PUT edited") || !strings.HasSuffix(res.Raw, "got:payload") {
		t.Fatalf("result %+v", res)
	}
	seen := false
	for _, h := range res.Headers {
		seen = seen || (h.Name == "X-Seen" && h.Value == "PUT edited")
	}
	if !seen {
		t.Fatalf("headers %+v lack X-Seen", res.Headers)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		var n int
		if err := s.m.Traffic().DB().QueryRow(`SELECT COUNT(*) FROM exchanges WHERE method='PUT' AND url=?`, url).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("replayed exchange not recorded (%d rows)", n)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestGetTrafficExposesRewriteStats(t *testing.T) {
	// Traffic disabled: rewrite object still present with zero counters.
	sOff := &Server{m: &Manager{}}
	wOff := httptest.NewRecorder()
	sOff.getTraffic(wOff, httptest.NewRequest(http.MethodGet, "/api/traffic", nil))
	if wOff.Code != http.StatusOK {
		t.Fatalf("getTraffic(off) status = %d", wOff.Code)
	}
	var bodyOff map[string]any
	if err := json.Unmarshal(wOff.Body.Bytes(), &bodyOff); err != nil {
		t.Fatal(err)
	}
	rwOff, ok := bodyOff["rewrite"].(map[string]any)
	if !ok {
		t.Fatalf("getTraffic(off) missing rewrite object: %s", wOff.Body.String())
	}
	for _, k := range []string{"large_responses", "capacity_refusals", "tombstone_drops", "conversions", "sweeps"} {
		if _, exists := rwOff[k]; !exists {
			t.Fatalf("getTraffic(off) rewrite object missing key %q: %v", k, rwOff)
		}
	}

	// Traffic store open: rewrite counters mirror tr.RewriteStats().
	tr, err := traffic.Open(t.TempDir(), ":0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { tr.Close() })
	sOn := &Server{m: &Manager{traffic: tr}}
	wOn := httptest.NewRecorder()
	sOn.getTraffic(wOn, httptest.NewRequest(http.MethodGet, "/api/traffic", nil))
	if wOn.Code != http.StatusOK {
		t.Fatalf("getTraffic(on) status = %d", wOn.Code)
	}
	var bodyOn struct {
		Rewrite traffic.RewriteStats `json:"rewrite"`
	}
	if err := json.Unmarshal(wOn.Body.Bytes(), &bodyOn); err != nil {
		t.Fatal(err)
	}
	if bodyOn.Rewrite != tr.RewriteStats() {
		t.Fatalf("getTraffic rewrite = %+v, want %+v", bodyOn.Rewrite, tr.RewriteStats())
	}
}

func TestTrafficReplayRouteApplyRulesToggle(t *testing.T) {
	s, replay := replayServer(t, true, true)
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Seen-Rule", r.Header.Get("X-Rule-Tag"))
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(target.Close)

	set := rewrite.Compile([]rewrite.Rule{{
		ID: 7, Name: "tag", Enabled: true, Phase: rewrite.PhaseRequest,
		Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "X-Rule-Tag", Value: "on"}},
	}}, rewrite.Options{})
	if len(set.LoadErrors()) != 0 {
		t.Fatalf("load errors: %v", set.LoadErrors())
	}
	s.m.Traffic().SetRewriteRules(set)

	// Default (apply_rules absent -> false): bypasses rule.
	reqOff, _ := json.Marshal(map[string]any{"method": "GET", "url": target.URL + "/toggle-off"})
	wOff := replay(string(reqOff))
	if wOff.Code != 200 || strings.Contains(wOff.Body.String(), `"X-Seen-Rule","value":"on"`) {
		t.Fatalf("default replay applied rewrite rule: %d %s", wOff.Code, wOff.Body.String())
	}

	// Opt-in (apply_rules: true): applies rule.
	reqOn, _ := json.Marshal(map[string]any{"method": "GET", "url": target.URL + "/toggle-on", "apply_rules": true})
	wOn := replay(string(reqOn))
	if wOn.Code != 200 || !strings.Contains(wOn.Body.String(), `"value":"on"`) {
		t.Fatalf("apply_rules=true did not apply rewrite rule: %d %s", wOn.Code, wOn.Body.String())
	}
}
