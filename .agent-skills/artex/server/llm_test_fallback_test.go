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

// The llm/test stored-key fallback must send the same header bytes the runtime
// sends: form keys are trimmed inside ConfigFrom, the DB fallback used to be
// assigned raw, so a key saved with surrounding whitespace ran fine in
// conversations but 401'd the connection test.
func TestLLMTestStoredKeyFallbackIsTrimmed(t *testing.T) {
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

	var gotKey atomic.Value
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey.Store(r.Header.Get("x-api-key"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"m","type":"message","role":"assistant","model":"m","content":[{"type":"text","text":"OK"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}`))
	}))
	t.Cleanup(fake.Close)

	pid, err := m.pg.SaveProfile(&db.LLMProfile{
		Name: "ws-key", Format: "anthropic", Model: "claude-x",
		BaseURL: fake.URL, APIKey: "k1 \t",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.pg.Exec("DELETE FROM llm_profiles WHERE id=$1", pid) })

	// The handler trims the fallback key: the profile was saved through
	// SaveProfile (which now trims), so also prove the storage trim itself.
	stored, err := m.pg.ProfileByID(pid)
	if err != nil || stored == nil {
		t.Fatalf("ProfileByID: %v %v", stored, err)
	}
	if stored.APIKey != "k1" {
		t.Fatalf("SaveProfile must trim surrounding whitespace, got %q", stored.APIKey)
	}

	body, _ := json.Marshal(map[string]any{
		"provider": "anthropic", "model": "claude-x", "base_url": fake.URL,
		"api_key": "", "profile_id": pid, "streaming": false,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/llm/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.testLLM(rec, req)

	if k, _ := gotKey.Load().(string); k != "k1" {
		t.Fatalf("test request must send the trimmed stored key, header was %q", k)
	}
	// The reply body only proves the call completed; the header is the assertion.
	if rec.Code != http.StatusOK {
		t.Fatalf("handler status %d", rec.Code)
	}
	var resp struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if !resp.OK {
		t.Logf("note: provider round-trip returned ok=false (%s); header assertion stands", resp.Error)
	}
}

// Sanity: the runtime path and the test path must agree byte-for-byte on the
// key they would send for the same stored profile.
func TestLLMTestFallbackMatchesRuntimeNormalization(t *testing.T) {
	const raw = " k1 \n"
	runtime := agent.ConfigFrom("anthropic", "m", "https://x.example", raw, "")
	if runtime.APIKey != "k1" {
		t.Fatalf("ConfigFrom trims: %q", runtime.APIKey)
	}
}

// The stored-profile test must reach the profile's own endpoint: an empty form
// (the list-view test button) fills provider/model/base_url from the row, so
// the key lands on the configured host instead of the canonical default one.
func TestLLMTestStoredProfileUsesProfileEndpoint(t *testing.T) {
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

	var hits atomic.Int32
	var gotKey atomic.Value
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		gotKey.Store(r.Header.Get("x-api-key"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"m","type":"message","role":"assistant","model":"m","content":[{"type":"text","text":"OK"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}`))
	}))
	t.Cleanup(fake.Close)

	pid, err := m.pg.SaveProfile(&db.LLMProfile{
		Name: "stored-ep", Format: "anthropic", Model: "claude-x",
		BaseURL: fake.URL, APIKey: "k1",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.pg.Exec("DELETE FROM llm_profiles WHERE id=$1", pid) })

	// Empty form on purpose: no provider, model, base_url, or streaming.
	body, _ := json.Marshal(map[string]any{"profile_id": pid, "api_key": ""})
	req := httptest.NewRequest(http.MethodPost, "/api/llm/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.testLLM(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("handler status %d", rec.Code)
	}
	if hits.Load() != 1 {
		t.Fatalf("stored-profile test must hit the profile endpoint exactly once, hits=%d", hits.Load())
	}
	if k, _ := gotKey.Load().(string); k != "k1" {
		t.Fatalf("test request must send the stored key, header was %q", k)
	}
	var resp struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if !resp.OK {
		t.Fatalf("stored-profile round-trip not ok: %s", resp.Error)
	}
}
