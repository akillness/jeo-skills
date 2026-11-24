package traffic

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/traffic/rewrite"
)

func advHeaderValue(hs []ReplayHeader, name string) string {
	for _, h := range hs {
		if strings.EqualFold(h.Name, name) {
			return h.Value
		}
	}
	return ""
}

// The internal header is stripped whatever its casing and however many
// occurrences are sent, and it never bypasses rules without a live nonce.
func TestAdversarialReplayNonceHeaderDuplicatesStripped(t *testing.T) {
	var mu sync.Mutex
	var seen []string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen = append([]string{}, r.Header.Values(replayNonceHeader)...)
		mu.Unlock()
		w.Header().Set("X-Seen-Rule", r.Header.Get("X-Rule"))
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(target.Close)

	tr, _, proxyURL := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule", Value: "applied"},
		}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule-Resp", Value: "applied"},
		}},
	))

	h := http.Header{}
	h[replayNonceHeader] = []string{"aaaa", "bbbb"}
	h["x-artex-replay-nonce"] = []string{"cccc"}
	resp, _ := sendThrough(t, tr, proxyURL, http.MethodGet, target.URL+"/dup", "", h)

	mu.Lock()
	got := append([]string{}, seen...)
	mu.Unlock()
	if len(got) != 0 {
		t.Fatalf("target saw nonce header values %v", got)
	}
	if resp.Header.Get("X-Rule-Resp") != "applied" {
		t.Fatalf("duplicate forged nonce bypassed the response rule: %v", resp.Header)
	}
	if resp.Header.Get("X-Seen-Rule") != "applied" {
		t.Fatalf("duplicate forged nonce bypassed the request rule: %v", resp.Header)
	}

	id := waitExchangeIDBySuffix(t, tr, "/dup")
	reqText, _, err := tr.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ToLower(reqText), strings.ToLower(replayNonceHeader)) {
		t.Fatalf("recorded request kept a nonce header:\n%s", reqText)
	}
}

// A nonce is single use, and takeReplayNonce refuses to return a value when
// more than one occurrence is present.
func TestAdversarialReplayNonceRegistrySingleUse(t *testing.T) {
	n, err := registerReplayNonce()
	if err != nil {
		t.Fatal(err)
	}
	if len(n) != 64 {
		t.Fatalf("nonce length = %d, want 64 hex chars", len(n))
	}
	if !consumeReplayNonce(n) {
		t.Fatal("first consume did not match")
	}
	if consumeReplayNonce(n) {
		t.Fatal("second consume matched: nonce is not single use")
	}
	if consumeReplayNonce("") {
		t.Fatal("empty nonce matched")
	}

	h := http.Header{}
	h.Set(replayNonceHeader, n)
	if got, present := takeReplayNonce(h); !present || got != n || len(h) != 0 {
		t.Fatalf("single occurrence = (%q, %v, %d), want (%q, true, 0)", got, present, len(h), n)
	}

	h2 := http.Header{replayNonceHeader: {"a", "b"}, "x-artex-replay-nonce": {"c"}}
	if got, present := takeReplayNonce(h2); !present || got != "" || len(h2) != 0 {
		t.Fatalf("duplicates = (%q, %v, %d), want (\"\", true, 0)", got, present, len(h2))
	}

	h3 := http.Header{replayNonceHeader: {}}
	if got, present := takeReplayNonce(h3); !present || got != "" || len(h3) != 0 {
		t.Fatalf("empty values = (%q, %v, %d), want (\"\", true, 0)", got, present, len(h3))
	}
}

// A caller-supplied nonce header is dropped in both modes and never wins over
// the real nonce: default still bypasses, apply_rules still applies.
func TestAdversarialReplayForgedNonceHeaderCannotSteerReplay(t *testing.T) {
	var mu sync.Mutex
	var seen []string
	var rule string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		rule = r.Header.Get("X-Rule")
		seen = append([]string{}, r.Header.Values(replayNonceHeader)...)
		mu.Unlock()
		w.Header().Set("X-Seen-Rule", r.Header.Get("X-Rule"))
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(target.Close)

	tr, _, _ := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule", Value: "applied"},
		}},
	))

	forged := ReplayHeader{Name: replayNonceHeader, Value: strings.Repeat("ab", 32)}

	res, err := tr.Replay(context.Background(), ReplayRequest{
		Method:  http.MethodGet,
		URL:     target.URL + "/forged-bypass",
		Headers: []ReplayHeader{forged},
	})
	if err != nil {
		t.Fatalf("default replay: %v", err)
	}
	mu.Lock()
	if rule != "" || len(seen) != 0 {
		t.Fatalf("default replay: target saw X-Rule=%q nonce=%v", rule, seen)
	}
	mu.Unlock()
	if advHeaderValue(res.Headers, "X-Seen-Rule") != "" {
		t.Fatalf("default replay with forged header did not bypass: %v", res.Headers)
	}

	res2, err := tr.Replay(context.Background(), ReplayRequest{
		Method:     http.MethodGet,
		URL:        target.URL + "/forged-apply",
		Headers:    []ReplayHeader{forged},
		ApplyRules: true,
	})
	if err != nil {
		t.Fatalf("apply replay: %v", err)
	}
	mu.Lock()
	if rule != "applied" || len(seen) != 0 {
		t.Fatalf("apply replay: target saw X-Rule=%q nonce=%v", rule, seen)
	}
	mu.Unlock()
	if advHeaderValue(res2.Headers, "X-Seen-Rule") != "applied" {
		t.Fatalf("apply replay did not apply the rule: %v", res2.Headers)
	}
	if replayNonceCount() != 0 {
		t.Fatalf("nonce registry not empty: %d", replayNonceCount())
	}
}

// A bypassing replay and an applying replay to the same target at the same
// time must not share state, and a normal request after a bypass must still be
// rewritten.
func TestAdversarialReplayConcurrentBypassAndApply(t *testing.T) {
	var mu sync.Mutex
	seen := map[string]string{}
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen[r.URL.Path] = r.Header.Get("X-Rule")
		mu.Unlock()
		w.Header().Set("X-Seen-Rule", r.Header.Get("X-Rule"))
		_, _ = io.WriteString(w, "ok")
	}))
	t.Cleanup(target.Close)

	tr, _, pxy := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule", Value: "applied"},
		}},
	))

	var wg sync.WaitGroup
	var offRule, onRule string
	wg.Add(2)
	go func() {
		defer wg.Done()
		res, err := tr.Replay(context.Background(), ReplayRequest{Method: http.MethodGet, URL: target.URL + "/conc-off"})
		if err != nil {
			t.Errorf("bypass replay: %v", err)
			return
		}
		offRule = advHeaderValue(res.Headers, "X-Seen-Rule")
	}()
	go func() {
		defer wg.Done()
		res, err := tr.Replay(context.Background(), ReplayRequest{Method: http.MethodGet, URL: target.URL + "/conc-on", ApplyRules: true})
		if err != nil {
			t.Errorf("apply replay: %v", err)
			return
		}
		onRule = advHeaderValue(res.Headers, "X-Seen-Rule")
	}()
	wg.Wait()
	if offRule != "" {
		t.Fatalf("bypass replay saw X-Rule=%q", offRule)
	}
	if onRule != "applied" {
		t.Fatalf("apply replay saw X-Rule=%q", onRule)
	}
	if replayNonceCount() != 0 {
		t.Fatalf("nonce registry not empty after concurrent replays: %d", replayNonceCount())
	}

	// A plain request after the bypass is still rewritten: the marker is per flow.
	resp, _ := sendThrough(t, tr, pxy, http.MethodGet, target.URL+"/after", "", nil)
	if resp.Header.Get("X-Seen-Rule") != "applied" {
		t.Fatalf("normal request after a bypass was not rewritten: %v", resp.Header)
	}
	mu.Lock()
	defer mu.Unlock()
	if seen["/conc-off"] != "" || seen["/conc-on"] != "applied" || seen["/after"] != "applied" {
		t.Fatalf("target saw %v", seen)
	}
}

// An SSE response is bypassed by default and rewritten when opted in: the
// stream phase is the path the plain response test cannot reach.
func TestAdversarialReplayBypassCoversSSE(t *testing.T) {
	tr, _, _ := startProxy(t)
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(200)
		fl := w.(http.Flusher)
		for _, ev := range []string{"data: one\n\n", "data: two\n\n"} {
			_, _ = io.WriteString(w, ev)
			fl.Flush()
			time.Sleep(10 * time.Millisecond)
		}
	}))
	t.Cleanup(srv.Close)

	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule-Resp", Value: "applied"},
		}},
	))

	res, err := tr.Replay(context.Background(), ReplayRequest{
		Method: http.MethodGet,
		URL:    localhostURL(srv.URL) + "/sse-off",
	})
	if err != nil {
		t.Fatalf("bypass SSE replay: %v", err)
	}
	if got := advHeaderValue(res.Headers, "X-Rule-Resp"); got != "" {
		t.Fatalf("bypass SSE replay applied header rule: %q", got)
	}
	if !strings.Contains(res.Raw, "data: two") {
		t.Fatalf("bypass SSE body changed: %s", res.Raw)
	}
	idOff := waitExchangeIDBySuffix(t, tr, "/sse-off")
	if rewritten, ids, err := tr.RewriteInfo(idOff); err != nil || rewritten || len(ids) != 0 {
		t.Fatalf("bypass SSE RewriteInfo = (%v, %v, %v)", rewritten, ids, err)
	}

	res2, err := tr.Replay(context.Background(), ReplayRequest{
		Method:     http.MethodGet,
		URL:        localhostURL(srv.URL) + "/sse-on",
		ApplyRules: true,
	})
	if err != nil {
		t.Fatalf("apply SSE replay: %v", err)
	}
	if got := advHeaderValue(res2.Headers, "X-Rule-Resp"); got != "applied" {
		t.Fatalf("apply SSE replay header rule = %q, want applied", got)
	}
	idOn := waitExchangeIDBySuffix(t, tr, "/sse-on")
	if rows := traceRows(t, tr, idOn); len(rows) == 0 {
		t.Fatal("apply SSE replay recorded no rewrite trace")
	}
}

// A cancelled replay leaves no live nonce and no permanent bypass marker.
func TestAdversarialReplayCancelCleansUp(t *testing.T) {
	block := make(chan struct{})
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-block
		_, _ = io.WriteString(w, "late")
	}))
	t.Cleanup(target.Close)

	tr, s, _ := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule", Value: "applied"},
		}},
	))

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := tr.Replay(ctx, ReplayRequest{Method: http.MethodGet, URL: target.URL + "/cancel"}); err == nil {
		t.Fatal("cancelled replay returned no error")
	}
	close(block)
	if replayNonceCount() != 0 {
		t.Fatalf("nonce registry leaked after cancel: %d", replayNonceCount())
	}
	waitFor(t, "bypass marker cleanup", func() bool {
		empty := true
		s.bypass.Range(func(_, _ any) bool {
			empty = false
			return false
		})
		return empty
	})
}
