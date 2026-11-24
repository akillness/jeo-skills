package traffic

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/traffic/rewrite"
	mproxy "github.com/lqqyt2423/go-mitmproxy/proxy"
)

func hasNonceHeader(h http.Header) bool {
	for k := range h {
		if strings.EqualFold(k, replayNonceHeader) {
			return true
		}
	}
	return false
}

func waitExchangeIDBySuffix(t *testing.T, tr *Traffic, suffix string) string {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var id string
		err := tr.DB().QueryRow(`SELECT id FROM exchanges WHERE url LIKE ?`, "%"+suffix).Scan(&id)
		if err == nil {
			return id
		}
		if time.Now().After(deadline) {
			t.Fatalf("exchange %s not recorded: %v", suffix, err)
		}
		time.Sleep(15 * time.Millisecond)
	}
}

func TestReplayBypassesRewriteRulesByDefault(t *testing.T) {
	var mu sync.Mutex
	var gotMethod, gotBody, gotOrig, gotRuleReq string
	var sawNonce bool

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		gotMethod = r.Method
		gotBody = string(b)
		gotOrig = r.Header.Get("X-Orig")
		gotRuleReq = r.Header.Get("X-Rule-Req")
		sawNonce = hasNonceHeader(r.Header)
		mu.Unlock()
		w.Header().Set("Content-Type", "text/plain")
		_, _ = io.WriteString(w, "target-resp")
	}))
	t.Cleanup(target.Close)

	tr, s, _ := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule-Req", Value: "applied"},
			{Type: rewrite.ActionSetBody, Value: "rewritten-req"},
		}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule-Resp", Value: "applied"},
			{Type: rewrite.ActionReplaceBody, Regex: "target-resp", Value: "rewritten-resp"},
		}},
	))

	// ApplyRules omitted (false by default) -> bypass both phases.
	res, err := tr.Replay(context.Background(), ReplayRequest{
		Method:  http.MethodPost,
		URL:     target.URL + "/default-bypass",
		Headers: []ReplayHeader{{Name: "X-Orig", Value: "1"}},
		Body:    []byte("orig-body"),
	})
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if replayNonceCount() != 0 {
		t.Fatalf("nonce registry not empty after Replay: %d", replayNonceCount())
	}
	mu.Lock()
	if gotMethod != http.MethodPost || gotBody != "orig-body" || gotOrig != "1" || gotRuleReq != "" || sawNonce {
		t.Fatalf("target received method=%q body=%q X-Orig=%q X-Rule-Req=%q sawNonce=%v", gotMethod, gotBody, gotOrig, gotRuleReq, sawNonce)
	}
	mu.Unlock()
	if res.Status != 200 || !res.Recorded || strings.Contains(res.Raw, "X-Rule-Resp") || !strings.HasSuffix(res.Raw, "target-resp") {
		t.Fatalf("client received modified response: %+v", res)
	}

	id := waitExchangeIDBySuffix(t, tr, "/default-bypass")
	if rewritten, ids, err := tr.RewriteInfo(id); err != nil || rewritten || len(ids) != 0 {
		t.Fatalf("RewriteInfo = (%v, %v, %v), want (false, nil, nil)", rewritten, ids, err)
	}
	var traceCount int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM exchange_rewrites WHERE exchange_id=?`, id).Scan(&traceCount); err != nil {
		t.Fatal(err)
	}
	if traceCount != 0 {
		t.Fatalf("exchange_rewrites rows = %d, want 0", traceCount)
	}
	reqText, _, err := tr.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ToLower(reqText), strings.ToLower(replayNonceHeader)) {
		t.Fatalf("recorded request leaked internal nonce header:\n%s", reqText)
	}

	// Response-only rules must also be bypassed and the nonce header stripped.
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 3, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule-Resp", Value: "applied"},
		}},
	))
	res2, err := tr.Replay(context.Background(), ReplayRequest{
		Method: http.MethodGet,
		URL:    target.URL + "/resp-only-bypass",
	})
	if err != nil {
		t.Fatalf("Replay response-only: %v", err)
	}
	mu.Lock()
	if sawNonce {
		t.Fatal("target saw nonce header when only response rules were active")
	}
	mu.Unlock()
	if strings.Contains(res2.Raw, "X-Rule-Resp") {
		t.Fatalf("response-only rule was not bypassed: %s", res2.Raw)
	}
	id2 := waitExchangeIDBySuffix(t, tr, "/resp-only-bypass")
	if rewritten, _, err := tr.RewriteInfo(id2); err != nil || rewritten {
		t.Fatalf("response-only bypass RewriteInfo = %v %v", rewritten, err)
	}

	// RequestError clears the bypass marker.
	f := withID(&mproxy.Flow{}, 99)
	s.bypass.Store(keyOf(f), struct{}{})
	s.RequestError(f, io.EOF)
	if _, ok := s.bypass.Load(keyOf(f)); ok {
		t.Fatal("RequestError did not clear bypass marker")
	}

	// Failed Replay (unreachable target) still leaves nonce registry empty.
	_, _ = tr.Replay(context.Background(), ReplayRequest{
		Method: http.MethodGet,
		URL:    "http://127.0.0.1:1/unreachable",
	})
	if replayNonceCount() != 0 {
		t.Fatalf("nonce registry leaked after failed Replay: %d", replayNonceCount())
	}
}

func TestReplayApplyRulesTrue(t *testing.T) {
	var mu sync.Mutex
	var gotBody, gotRuleReq string
	var sawNonce bool

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		gotBody = string(b)
		gotRuleReq = r.Header.Get("X-Rule-Req")
		sawNonce = hasNonceHeader(r.Header)
		mu.Unlock()
		w.Header().Set("Content-Type", "text/plain")
		_, _ = io.WriteString(w, "target-resp")
	}))
	t.Cleanup(target.Close)

	tr, _, _ := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule-Req", Value: "applied"},
			{Type: rewrite.ActionSetBody, Value: "rewritten-req"},
		}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule-Resp", Value: "applied"},
			{Type: rewrite.ActionReplaceBody, Regex: "target-resp", Value: "rewritten-resp"},
		}},
	))

	res, err := tr.Replay(context.Background(), ReplayRequest{
		Method:     http.MethodPost,
		URL:        target.URL + "/apply-rules",
		Body:       []byte("orig-body"),
		ApplyRules: true,
	})
	if err != nil {
		t.Fatalf("Replay(ApplyRules=true): %v", err)
	}
	if replayNonceCount() != 0 {
		t.Fatalf("nonce registry not empty after Replay(ApplyRules=true): %d", replayNonceCount())
	}
	mu.Lock()
	if gotBody != "rewritten-req" || gotRuleReq != "applied" || sawNonce {
		t.Fatalf("target received body=%q X-Rule-Req=%q sawNonce=%v", gotBody, gotRuleReq, sawNonce)
	}
	mu.Unlock()
	if !strings.Contains(res.Raw, "X-Rule-Resp: applied") || !strings.HasSuffix(res.Raw, "rewritten-resp") {
		t.Fatalf("response rule did not apply on Replay(ApplyRules=true): %s", res.Raw)
	}

	id := waitExchangeIDBySuffix(t, tr, "/apply-rules")
	rewritten, ids, err := tr.RewriteInfo(id)
	if err != nil || !rewritten || !slices.Equal(ids, []int64{1, 2}) {
		t.Fatalf("RewriteInfo = (%v, %v, %v), want (true, [1 2], nil)", rewritten, ids, err)
	}
	if rows := traceRows(t, tr, id); len(rows) == 0 {
		t.Fatal("expected exchange_rewrites trace rows when ApplyRules=true")
	}
}

func TestForgedReplayNonceHeaderStrippedAndIgnored(t *testing.T) {
	var mu sync.Mutex
	var gotRuleReq string
	var sawNonce bool

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		gotRuleReq = r.Header.Get("X-Rule-Req")
		sawNonce = hasNonceHeader(r.Header)
		mu.Unlock()
		w.Header().Set("Content-Type", "text/plain")
		_, _ = io.WriteString(w, "target-resp")
	}))
	t.Cleanup(target.Close)

	tr, _, proxyURL := startProxy(t)
	tr.SetRewriteRules(rules(t, nil, nil,
		rewrite.Rule{ID: 1, Phase: rewrite.PhaseRequest, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule-Req", Value: "applied"},
		}},
		rewrite.Rule{ID: 2, Phase: rewrite.PhaseResponse, Actions: []rewrite.Action{
			{Type: rewrite.ActionSetHeader, Name: "X-Rule-Resp", Value: "applied"},
		}},
	))

	resp, _ := sendThrough(t, tr, proxyURL, http.MethodGet, target.URL+"/forged", "", http.Header{
		replayNonceHeader: {"0000000000000000000000000000000000000000000000000000000000000000"},
	})
	mu.Lock()
	if sawNonce {
		t.Fatal("forged replay nonce header reached target")
	}
	if gotRuleReq != "applied" {
		t.Fatalf("forged nonce bypassed request rule: X-Rule-Req=%q", gotRuleReq)
	}
	mu.Unlock()
	if resp.Header.Get("X-Rule-Resp") != "applied" {
		t.Fatalf("forged nonce bypassed response rule: X-Rule-Resp=%q", resp.Header.Get("X-Rule-Resp"))
	}

	id := waitExchangeIDBySuffix(t, tr, "/forged")
	rewritten, ids, err := tr.RewriteInfo(id)
	if err != nil || !rewritten || !slices.Equal(ids, []int64{1, 2}) {
		t.Fatalf("forged nonce RewriteInfo = (%v, %v, %v), want (true, [1 2], nil)", rewritten, ids, err)
	}
	reqText, _, err := tr.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ToLower(reqText), strings.ToLower(replayNonceHeader)) {
		t.Fatalf("recorded request kept forged nonce header:\n%s", reqText)
	}
}
