package traffic

import (
	"bytes"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/traffic/rewrite"
)

func TestTamperHookHeaderAndBodyMutationAndTrace(t *testing.T) {
	var seenHeader, seenBody string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		seenHeader = r.Header.Get("X-Hook")
		seenBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer target.Close()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	proxyAddr := ln.Addr().String()
	_ = ln.Close()

	tr, err := Open(t.TempDir(), proxyAddr)
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()
	go func() { _ = tr.Start() }()
	waitProxyReady(t, proxyAddr)

	reqSrc := `package hook
import "encoding/json"
func OnRequest(req *Request) error {
	req.SetHeader("X-Hook", "v1")
	v, err := json.Decode(req.Body)
	if err != nil {
		return err
	}
	m, _ := v.(map[string]any)
	m["tampered"] = true
	out, err := json.Marshal(m)
	if err != nil {
		return err
	}
	req.Body = out
	return nil
}`
	respSrc := `package hook
func OnResponse(req *Request, resp *Response) error {
	resp.SetHeader("X-Resp-Hook", "done")
	resp.Status = 201
	return nil
}`
	hs, loadErrs := CompileHooks([]HookDef{
		{ID: 11, Name: "req-hook", Enabled: true, Phase: rewrite.PhaseRequest, Priority: 1, Source: reqSrc, Version: 2},
		{ID: 12, Name: "resp-hook", Enabled: true, Phase: rewrite.PhaseResponse, Priority: 1, Source: respSrc, Version: 3},
	}, []byte("test-trace-key-32-bytes-long-000"))
	if len(loadErrs) != 0 {
		t.Fatalf("unexpected load errors: %v", loadErrs)
	}
	tr.SetTamperHooks(hs)

	pURL, _ := url.Parse(tr.ProxyAddr())
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(pURL)}}
	req, _ := http.NewRequest(http.MethodPost, target.URL+"/api/item", strings.NewReader(`{"tampered":false}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("proxy do: %v", err)
	}
	_, _ = io.ReadAll(resp.Body)
	resp.Body.Close()

	if seenHeader != "v1" || !strings.Contains(seenBody, `"tampered":true`) {
		t.Fatalf("target saw header=%q body=%q", seenHeader, seenBody)
	}
	if resp.StatusCode != 201 || resp.Header.Get("X-Resp-Hook") != "done" {
		t.Fatalf("client saw status=%d header=%q", resp.StatusCode, resp.Header.Get("X-Resp-Hook"))
	}

	// Verify original request preserved in exchange_bodies and hook trace rows in exchange_rewrites.
	var origBody []byte
	if err := tr.DB().QueryRow(`SELECT req_body FROM exchange_bodies LIMIT 1`).Scan(&origBody); err != nil {
		t.Fatal(err)
	}
	if string(origBody) != `{"tampered":false}` {
		t.Fatalf("stored original req_body = %q, want original client body", origBody)
	}

	var hookRows int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM exchange_rewrites WHERE source_kind='hook' AND outcome='applied' AND hook_id IN (11,12)`).Scan(&hookRows); err != nil || hookRows < 4 {
		t.Fatalf("hook applied trace rows = (%d, %v), want >= 4", hookRows, err)
	}
}

func TestTamperHookFailOpenRollbackForbiddenMutationsAndSkips(t *testing.T) {
	makeReqInput := func(body []byte, hdr http.Header) rewrite.Input {
		u, _ := url.Parse("https://api.example.test/v1/test")
		if hdr == nil {
			hdr = http.Header{"Content-Type": {"application/json"}}
		}
		return rewrite.Input{
			Request: rewrite.Request{Method: "POST", URL: u, Header: hdr, Body: body},
			Response: rewrite.Response{
				Status: 200,
				Header: http.Header{"Content-Type": {"application/json"}},
				Body:   []byte(`{"ok":true}`),
			},
		}
	}

	t.Run("error_rolls_back_all_mutations", func(t *testing.T) {
		src := `package hook
import "errors"
func OnRequest(req *Request) error {
	req.SetHeader("X-Partial", "leaked")
	req.Body = []byte("mutated")
	return errors.New("abort")
}`
		hs, _ := CompileHooks([]HookDef{{ID: 1, Name: "err", Enabled: true, Phase: rewrite.PhaseRequest, Source: src}}, nil)
		in := makeReqInput([]byte("orig"), nil)
		res := hs.Apply(rewrite.PhaseRequest, in, nil)
		if res.Changed || string(res.Request.Body) != "orig" || res.Request.Header.Get("X-Partial") != "" {
			t.Fatalf("partial mutation leaked on error: %+v", res)
		}
		if len(res.Lines) != 1 || res.Lines[0].Outcome != rewrite.OutcomeError || hs.LastError(1) == nil {
			t.Fatalf("expected error trace + LastError, got %+v / %+v", res.Lines, hs.LastError(1))
		}
	})

	t.Run("panic_and_timeout_fail_open", func(t *testing.T) {
		panicSrc := `package hook
func OnRequest(req *Request) error {
	req.SetHeader("X-Partial", "leaked")
	panic("kaboom")
}`
		loopSrc := `package hook
func OnRequest(req *Request) error {
	for {}
	return nil
}`
		hs, _ := CompileHooks([]HookDef{
			{ID: 2, Name: "panic", Enabled: true, Phase: rewrite.PhaseRequest, Priority: 1, Source: panicSrc},
			{ID: 3, Name: "loop", Enabled: true, Phase: rewrite.PhaseRequest, Priority: 2, Source: loopSrc},
		}, nil)
		hs.hookTimeout = 15 * time.Millisecond
		hs.maxSteps = 1000
		res := hs.Apply(rewrite.PhaseRequest, makeReqInput([]byte("orig"), nil), nil)
		if res.Changed || len(res.Lines) != 2 {
			t.Fatalf("expected fail-open with 2 error lines, got changed=%v lines=%+v", res.Changed, res.Lines)
		}
		if res.Lines[0].Reason != rewrite.ErrClassPanic || (res.Lines[1].Reason != "step_limit" && res.Lines[1].Reason != "timeout") {
			t.Fatalf("unexpected error reasons: %+v", res.Lines)
		}
	})

	t.Run("forbidden_http_mutations_rejected_atomically", func(t *testing.T) {
		cases := []struct {
			name  string
			phase rewrite.Phase
			src   string
			want  string
		}{
			{"host_change", rewrite.PhaseRequest, `package hook; func OnRequest(req *Request) error { req.SetHeader("X-Leak","1"); req.Host = "evil.test"; return nil }`, "forbidden_mutation"},
			{"scheme_change", rewrite.PhaseRequest, `package hook; func OnRequest(req *Request) error { req.SetHeader("X-Leak","1"); req.Scheme = "http"; return nil }`, "forbidden_mutation"},
			{"port_change", rewrite.PhaseRequest, `package hook; func OnRequest(req *Request) error { req.SetHeader("X-Leak","1"); req.Port = "8080"; return nil }`, "forbidden_mutation"},
			{"crlf_header", rewrite.PhaseRequest, `package hook; func OnRequest(req *Request) error { req.SetHeader("X-Leak","1"); req.SetHeader("X-Bad", "a\r\nInjected: 1"); return nil }`, "invalid_header"},
			{"connect_method", rewrite.PhaseRequest, `package hook; func OnRequest(req *Request) error { req.SetHeader("X-Leak","1"); req.Method = "CONNECT"; return nil }`, "forbidden_method"},
			{"forbidden_te_header", rewrite.PhaseRequest, `package hook; func OnRequest(req *Request) error { req.SetHeader("Transfer-Encoding", "chunked"); return nil }`, "forbidden_header"},
			{"status_204", rewrite.PhaseResponse, `package hook; func OnResponse(req *Request, resp *Response) error { resp.SetHeader("X-Leak","1"); resp.Status = 204; return nil }`, "invalid_status"},
			{"status_304", rewrite.PhaseResponse, `package hook; func OnResponse(req *Request, resp *Response) error { resp.SetHeader("X-Leak","1"); resp.Status = 304; return nil }`, "invalid_status"},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				hs, errs := CompileHooks([]HookDef{{ID: 10, Name: tc.name, Enabled: true, Phase: tc.phase, Source: tc.src}}, nil)
				if len(errs) != 0 {
					t.Fatalf("compile errs: %v", errs)
				}
				res := hs.Apply(tc.phase, makeReqInput([]byte("orig"), nil), nil)
				if res.Changed {
					t.Fatalf("%s must not apply any mutation", tc.name)
				}
				if len(res.Lines) != 1 || res.Lines[0].Outcome != rewrite.OutcomeError || res.Lines[0].Reason != tc.want {
					t.Fatalf("%s lines = %+v, want error/%s", tc.name, res.Lines, tc.want)
				}
			})
		}
	})

	t.Run("oversized_compressed_and_binary_bodies_skipped", func(t *testing.T) {
		src := `package hook; func OnRequest(req *Request) error { req.SetHeader("X-Should-Skip","1"); return nil }`
		hs, _ := CompileHooks([]HookDef{{ID: 20, Name: "skip", Enabled: true, Phase: rewrite.PhaseRequest, Source: src}}, nil)

		// > 1 MiB
		resLarge := hs.Apply(rewrite.PhaseRequest, makeReqInput(bytes.Repeat([]byte("a"), rewrite.MaxBodySize+1), nil), nil)
		if resLarge.Changed || len(resLarge.Lines) != 1 || resLarge.Lines[0].Reason != rewrite.ReasonBodyTooLarge {
			t.Fatalf("large body = %+v", resLarge.Lines)
		}
		// Compressed
		resGzip := hs.Apply(rewrite.PhaseRequest, makeReqInput([]byte("abc"), http.Header{"Content-Encoding": {"gzip"}}), nil)
		if resGzip.Changed || len(resGzip.Lines) != 1 || resGzip.Lines[0].Reason != rewrite.ReasonContentEncoding {
			t.Fatalf("compressed body = %+v", resGzip.Lines)
		}
		// Binary
		resBin := hs.Apply(rewrite.PhaseRequest, makeReqInput([]byte{0x89, 'P', 'N', 'G', 0x00, 0x01}, http.Header{"Content-Type": {"image/png"}}), nil)
		if resBin.Changed || len(resBin.Lines) != 1 || resBin.Lines[0].Reason != rewrite.ReasonBinary {
			t.Fatalf("binary body = %+v", resBin.Lines)
		}
	})
}

func TestTamperHookRulesFirstTaintedMaskingDeterminismAndNoHookBaseline(t *testing.T) {
	traceKey := []byte("0123456789abcdef0123456789abcdef")

	// 1. Rules run first (setting a sensitive Authorization header -> taints header:Authorization),
	// then hook reads & transforms Authorization: trace must stay HMAC-masked (no plaintext secret!).
	ruleSet := rewrite.Compile([]rewrite.Rule{{
		ID: 1, Name: "auth", Enabled: true, Phase: rewrite.PhaseRequest,
		Actions: []rewrite.Action{{Type: rewrite.ActionSetHeader, Name: "Authorization", Value: "Bearer super-secret-tok", Sensitive: true}},
	}}, rewrite.Options{TraceKey: traceKey})

	hookSrc := `package hook
func OnRequest(req *Request) error {
	tok := req.GetHeader("Authorization")
	req.SetHeader("Authorization", tok + "-signed")
	return nil
}`
	hs, _ := CompileHooks([]HookDef{{ID: 5, Name: "sign-auth", Enabled: true, Phase: rewrite.PhaseRequest, Source: hookSrc, Version: 1}}, traceKey)

	u, _ := url.Parse("https://api.example.test/v1/secret")
	in := rewrite.Input{Request: rewrite.Request{Method: "GET", URL: u, Header: http.Header{}}}

	r1 := ruleSet.Apply(rewrite.PhaseRequest, in)
	hIn := in
	hIn.Request = r1.Request
	h1 := hs.Apply(rewrite.PhaseRequest, hIn, r1.Tainted)

	if h1.Request.Header.Get("Authorization") != "Bearer super-secret-tok-signed" {
		t.Fatalf("rules-first-then-hooks failed: got %q", h1.Request.Header.Get("Authorization"))
	}
	if len(h1.Lines) != 1 || h1.Lines[0].After != nil || strings.Contains(h1.Lines[0].AfterHash, "super-secret") {
		t.Fatalf("tainted field was not masked in hook trace: %+v", h1.Lines)
	}
	if h1.Lines[0].AfterHash == rewrite.SHA256Hex([]byte("Bearer super-secret-tok-signed")) {
		t.Fatal("tainted field used plain SHA-256 instead of keyed HMAC fingerprint")
	}

	// 2. Determinism: two runs on identical input produce identical output and trace hashes.
	h2 := hs.Apply(rewrite.PhaseRequest, hIn, r1.Tainted)
	if h1.Lines[0].BeforeHash != h2.Lines[0].BeforeHash || h1.Lines[0].AfterHash != h2.Lines[0].AfterHash {
		t.Fatalf("non-deterministic hashes: %+v vs %+v", h1.Lines[0], h2.Lines[0])
	}

	// 3. No-hook baseline byte-identical (kill switch off / nil HookSet).
	t.Setenv(TamperHooksEnabledEnv, "")
	if TamperHooksEnabledFromEnv() {
		t.Fatal("ARTEX_TAMPER_HOOKS_ENABLED must default to false")
	}
	var nilHooks *HookSet
	base := nilHooks.Apply(rewrite.PhaseRequest, in, nil)
	if base.Changed || len(base.Lines) != 0 {
		t.Fatalf("nil HookSet must be a no-op, got %+v", base)
	}
}

func waitProxyReady(t *testing.T, addr string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if c, err := net.DialTimeout("tcp", addr, 100*time.Millisecond); err == nil {
			_ = c.Close()
			return
		}
		time.Sleep(15 * time.Millisecond)
	}
	t.Fatalf("proxy at %s did not start", addr)
}
