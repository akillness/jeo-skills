package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
)

// ConfigFrom("ollama", ...) must normalize to the keyless sentinel with our own
// defaults, never the SDK's OpenAI-public-endpoint fallback.
func TestOllamaConfigFromKeylessDefaults(t *testing.T) {
	c := agent.ConfigFrom("ollama", "", "", "", "")
	if c.Format != agent.FormatOllama {
		t.Fatalf("format=%v, want FormatOllama", c.Format)
	}
	if c.Provider() != "ollama" {
		t.Fatalf("Provider()=%q", c.Provider())
	}
	if c.BaseURL != agent.DefaultOllamaBaseURL {
		t.Fatalf("BaseURL=%q, want default %q", c.BaseURL, agent.DefaultOllamaBaseURL)
	}
	if c.Model == "" {
		t.Fatal("model must default to a non-empty value")
	}
	if c.NeedsAPIKey() {
		t.Fatal("ollama must not require an API key")
	}
	// A full endpoint URL is tolerated (the provider appends /chat/completions).
	e := agent.ConfigFrom("ollama", "llama3.2", "http://box:11434/v1/chat/completions", "", "")
	if e.BaseURL != "http://box:11434/v1" {
		t.Fatalf("full endpoint URL not normalized: %q", e.BaseURL)
	}
	// A custom key is preserved (e.g. an authenticated Ollama gateway).
	k := agent.ConfigFrom("ollama", "m", "http://box:11434", "ollama-secret", "")
	if k.APIKey != "ollama-secret" {
		t.Fatalf("custom key lost: %q", k.APIKey)
	}
	// The natural Ollama URL has no /v1, but the provider appends
	// /chat/completions, so the base must be normalized to the /v1 root.
	n := agent.ConfigFrom("ollama", "m", "http://box:11434", "", "")
	if n.BaseURL != "http://box:11434/v1" {
		t.Fatalf("bare host URL not normalized: %q", n.BaseURL)
	}
}

// The provider built from an Ollama config speaks OpenAI Chat Completions on
// the wire (the SDK appends /chat/completions) with the placeholder Bearer (no
// real key was configured, no OPENAI_API_KEY env leak).
func TestOllamaProviderWiresOpenAIProtocol(t *testing.T) {
	var gotPath, gotAuth, gotModel atomic.Value
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath.Store(r.URL.Path)
		gotAuth.Store(r.Header.Get("Authorization"))
		var body struct {
			Model string `json:"model"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotModel.Store(body.Model)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"1","object":"chat.completion","model":"llama3.2","choices":[{"index":0,"message":{"role":"assistant","content":"OK"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`))
	}))
	t.Cleanup(fake.Close)

	cfg := agent.ConfigFrom("ollama", "llama3.2", fake.URL, "", "")
	cfg.Stream = false // non-streaming: the fake answers one plain JSON body
	prov, err := cfg.NewProvider()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req := llm.CompletionRequest{
		System:   []string{"You are a connection test. Output OK."},
		Messages: []llm.Message{llm.UserText("ping")},
	}
	if _, _, _, err = prov.Complete(ctx, req); err != nil {
		t.Fatalf("Complete: %v", err)
	}
	// ConfigFrom normalizes the fake server URL (no /v1) onto the OpenAI root,
	// so the request must land on /v1/chat/completions. A path of /chat/completions
	// would mean the base URL leaked through unnormalized (or fell back to OpenAI).
	if p, _ := gotPath.Load().(string); p != "/v1/chat/completions" {
		t.Fatalf("path=%q, want /v1/chat/completions", p)
	}
	if a, _ := gotAuth.Load().(string); a != "Bearer ollama" {
		t.Fatalf("Authorization=%q, want placeholder Bearer ollama", a)
	}
	if m, _ := gotModel.Load().(string); m != "llama3.2" {
		t.Fatalf("model on wire=%q", m)
	}
}

// A keyless Ollama profile must be usable end to end: stored round-trips,
// loadProfileConfig accepts it, the task chain validates it, the failover pool
// includes it, and the connection test completes against a fake Ollama.
func TestOllamaKeylessProfileLifecycle(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	if m.pg == nil {
		db.SkipNoPG(t)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"1","object":"chat.completion","model":"llama3.2","choices":[{"index":0,"message":{"role":"assistant","content":"OK"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`))
	}))
	t.Cleanup(fake.Close)

	pid, err := m.pg.SaveProfile(&db.LLMProfile{
		Name: "ollama-local", Format: "ollama", Model: "llama3.2",
		BaseURL: fake.URL, APIKey: "", IsDefault: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.pg.Exec("DELETE FROM llm_profiles WHERE id=$1", pid) })

	stored, err := m.pg.ProfileByID(pid)
	if err != nil || stored == nil {
		t.Fatalf("ProfileByID: %v %v", stored, err)
	}

	if _, ok := s.loadProfileConfig(pid); !ok {
		t.Fatal("keyless ollama profile must load")
	}
	if err := s.validateTaskProfileIDs([]int64{pid}); err != nil {
		t.Fatalf("task chain must accept keyless ollama: %v", err)
	}
	pool, err := m.pg.PoolProfiles()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, p := range pool {
		if p.ID == pid {
			found = true
		}
	}
	if !found {
		t.Fatal("keyless ollama profile must join the failover pool")
	}

	// Connection test: no api_key in the form either.
	body, _ := json.Marshal(map[string]any{
		"profile_id": pid, "provider": "ollama", "model": "llama3.2",
		"base_url": fake.URL, "api_key": "", "streaming": false,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/llm/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.testLLM(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("handler status %d", rec.Code)
	}
	var resp struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if !resp.OK {
		t.Fatalf("connection test on keyless ollama failed: %s", resp.Error)
	}
}

// Model listing for an Ollama server works without an API key and tolerates a
// base URL with or without the /v1 suffix.
func TestOllamaListModels(t *testing.T) {
	skipWithoutDSN(t)
	var calls atomic.Value // []string paths
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		paths, _ := calls.Load().([]string)
		calls.Store(append(paths, r.URL.Path))
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"llama3.2"},{"id":"qwen2.5:14b"}]}`))
	}))
	t.Cleanup(fake.Close)

	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	if m.pg == nil {
		db.SkipNoPG(t)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	s.allowLoopbackModels = true

	call := func(baseURL string) (bool, []string) {
		body, _ := json.Marshal(map[string]any{"provider": "ollama", "base_url": baseURL, "api_key": ""})
		req := httptest.NewRequest(http.MethodPost, "/api/llm/models", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		s.pgListModels(rec, req)
		var resp struct {
			OK     bool     `json:"ok"`
			Models []string `json:"models"`
			Error  string   `json:"error"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &resp)
		return resp.OK, resp.Models
	}
	// Base WITH /v1.
	ok, models := call(fake.URL + "/v1")
	if !ok || len(models) != 2 {
		t.Fatalf("listing with /v1 base failed: ok=%v models=%v", ok, models)
	}
	// Base WITHOUT /v1 must still be normalized onto the OpenAI-compatible path
	// (/v1/models); both calls hit the same endpoint.
	ok2, models2 := call(fake.URL)
	if !ok2 || len(models2) != 2 {
		t.Fatalf("listing without /v1 base failed: ok=%v models=%v", ok2, models2)
	}
	if paths, _ := calls.Load().([]string); len(paths) != 2 || paths[0] != "/v1/models" || paths[1] != "/v1/models" {
		t.Fatalf("both calls must hit /v1/models, got %v", paths)
	}
}

// The environment path must normalize the base URL too: ARTEX_LLM_BASE_URL is
// the natural way to configure a LAN Ollama server, and it used to send chat to
// /chat/completions instead of /v1/chat/completions.
func TestOllamaFromEnvNormalizesBaseURL(t *testing.T) {
	t.Setenv("ARTEX_LLM_PROVIDER", "ollama")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ARTEX_LLM_BASE_URL", "http://box:11434")
	c, ok := agent.FromEnv()
	if !ok {
		t.Fatal("ollama env config must be usable")
	}
	if c.BaseURL != "http://box:11434/v1" {
		t.Fatalf("env base URL not normalized: %q", c.BaseURL)
	}
	t.Setenv("ARTEX_LLM_BASE_URL", "http://box:11434/v1/chat/completions")
	c, ok = agent.FromEnv()
	if !ok {
		t.Fatal("ollama env config must be usable")
	}
	if c.BaseURL != "http://box:11434/v1" {
		t.Fatalf("full endpoint URL not normalized: %q", c.BaseURL)
	}
}

// An Ollama config resolved from the environment must not inherit OPENAI_API_KEY:
// Ollama ignores the bearer token, so inheritance would only ship the cloud key
// to the local or LAN endpoint.
func TestOllamaFromEnvDoesNotInheritOpenAIKey(t *testing.T) {
	t.Setenv("ARTEX_LLM_PROVIDER", "ollama")
	t.Setenv("OPENAI_API_KEY", "sk-cloud-secret")
	t.Setenv("ARTEX_LLM_BASE_URL", "")
	c, ok := agent.FromEnv()
	if !ok {
		t.Fatal("ollama env config must be usable without a key")
	}
	if c.APIKey != "" {
		t.Fatalf("ollama inherited a cloud key: %q", c.APIKey)
	}
}
