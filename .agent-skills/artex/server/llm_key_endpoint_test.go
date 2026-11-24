package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

func TestSameLLMEndpoint(t *testing.T) {
	for _, tc := range []struct {
		provA, baseA, provB, baseB string
		want                       bool
	}{
		{"anthropic", "https://gw.example", "anthropic", "https://gw.example/", true},
		{"anthropic", "https://gw.example/v1/messages", "anthropic", "https://gw.example", true},
		{"", "", "anthropic", "", true}, // empty provider defaults to anthropic
		{"openai", " https://gw.example/v1/chat/completions ", "openai", "https://gw.example/v1", true},
		{"anthropic", "https://evil.example", "anthropic", "https://gw.example", false},
		{"anthropic", "", "anthropic", "https://gw.example", false}, // canonical host != saved host
		{"openai", "", "anthropic", "", false},                      // different canonical hosts
		{"openai", "https://gw.example/v1", "openai-responses", "https://gw.example/v1", false},
	} {
		if got := sameLLMEndpoint(tc.provA, tc.baseA, tc.provB, tc.baseB); got != tc.want {
			t.Errorf("sameLLMEndpoint(%q,%q,%q,%q)=%v want %v", tc.provA, tc.baseA, tc.provB, tc.baseB, got, tc.want)
		}
	}
}

// keyRecorder is a fake Anthropic endpoint that records the x-api-key it receives.
func keyRecorder(t *testing.T) (*httptest.Server, *atomic.Int32, *atomic.Value) {
	var hits atomic.Int32
	var key atomic.Value
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		key.Store(r.Header.Get("x-api-key"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"m","type":"message","role":"assistant","model":"m","content":[{"type":"text","text":"OK"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1},"data":[]}`))
	}))
	t.Cleanup(srv.Close)
	return srv, &hits, &key
}

func postJSON(t *testing.T, h http.HandlerFunc, path string, body map[string]any) map[string]any {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h(rec, req)
	var resp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	return resp
}

// The global key must not follow a base_url typed into the test form.
func TestLLMTestGlobalKeyOnlyForGlobalEndpoint(t *testing.T) {
	saved, savedHits, savedKey := keyRecorder(t)
	other, otherHits, _ := keyRecorder(t)
	s := &Server{}
	s.llmCfg = agent.ConfigFrom("anthropic", "m", saved.URL, "global-secret", "")

	resp := postJSON(t, s.testLLM, "/api/llm/test", map[string]any{
		"provider": "anthropic", "model": "m", "base_url": other.URL, "api_key": "", "streaming": false,
	})
	if otherHits.Load() != 0 || resp["ok"] != false {
		t.Fatalf("global key went to a form-supplied host: hits=%d resp=%v", otherHits.Load(), resp)
	}

	postJSON(t, s.testLLM, "/api/llm/test", map[string]any{
		"provider": "anthropic", "model": "m", "base_url": saved.URL + "/", "api_key": "", "streaming": false,
	})
	if k, _ := savedKey.Load().(string); savedHits.Load() != 1 || k != "global-secret" {
		t.Fatalf("global key not used for its own endpoint: hits=%d key=%q", savedHits.Load(), k)
	}
}

// The connection test applies the same User-Agent rule as saving a profile: a
// value with a control character is a 400 before any request leaves, and a
// printable value reaches the wire exactly as given.
func TestLLMTestValidatesUserAgent(t *testing.T) {
	var hits atomic.Int32
	var gotUA atomic.Value
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		gotUA.Store(r.Header.Get("User-Agent"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"m","type":"message","role":"assistant","model":"m","content":[{"type":"text","text":"OK"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}`))
	}))
	t.Cleanup(fake.Close)
	s := &Server{}
	post := func(ua string) *httptest.ResponseRecorder {
		b, _ := json.Marshal(map[string]any{
			"provider": "anthropic", "model": "m", "base_url": fake.URL, "api_key": "k", "streaming": false, "user_agent": ua,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/llm/test", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		s.testLLM(rec, req)
		return rec
	}

	if rec := post("good/1.0\r\nX-Injected: 1"); rec.Code != http.StatusBadRequest || hits.Load() != 0 {
		t.Fatalf("control character in user_agent: status %d hits=%d body=%s", rec.Code, hits.Load(), rec.Body.String())
	}

	const want = "MyTool/1.0 (contact-free)"
	if rec := post("  " + want + "  "); rec.Code != http.StatusOK {
		t.Fatalf("printable user_agent: status %d body=%s", rec.Code, rec.Body.String())
	}
	if ua, _ := gotUA.Load().(string); hits.Load() != 1 || ua != want {
		t.Fatalf("test request User-Agent = %q (hits=%d), want %q", ua, hits.Load(), want)
	}
}

// A stored profile's key goes only to that profile's base URL, for both the
// connection test and the model listing.
func TestStoredProfileKeyOnlyForStoredEndpoint(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { m.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	s.allowLoopbackModels = true
	s.cfgMu.Lock()
	s.llmCfg = agent.Config{} // no global key to fall back on
	s.cfgMu.Unlock()

	saved, savedHits, savedKey := keyRecorder(t)
	other, otherHits, _ := keyRecorder(t)
	pid, err := m.pg.SaveProfile(&db.LLMProfile{
		Name: "key-endpoint", Format: "anthropic", Model: "m", BaseURL: saved.URL, APIKey: "profile-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.pg.Exec("DELETE FROM llm_profiles WHERE id=$1", pid) })

	for _, ep := range []struct {
		path string
		h    http.HandlerFunc
	}{{"/api/llm/test", s.testLLM}, {"/api/llm/models", s.pgListModels}} {
		resp := postJSON(t, ep.h, ep.path, map[string]any{
			"provider": "anthropic", "model": "m", "base_url": other.URL, "api_key": "", "profile_id": pid, "streaming": false,
		})
		if otherHits.Load() != 0 || resp["ok"] != false {
			t.Fatalf("%s: stored key went to a form-supplied host: hits=%d resp=%v", ep.path, otherHits.Load(), resp)
		}
		before := savedHits.Load()
		postJSON(t, ep.h, ep.path, map[string]any{
			"provider": "anthropic", "model": "m", "base_url": saved.URL, "api_key": "", "profile_id": pid, "streaming": false,
		})
		if k, _ := savedKey.Load().(string); savedHits.Load() == before || k != "profile-secret" {
			t.Fatalf("%s: stored key not used for its own endpoint: key=%q", ep.path, k)
		}
	}
}
