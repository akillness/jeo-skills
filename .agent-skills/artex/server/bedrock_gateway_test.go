package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestBedrockGatewaySavedProfileAndConnection(t *testing.T) {
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
	defer cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	const token = "synthetic-gateway-token"
	const header = "X-Example-Route: synthetic-route"
	var calls atomic.Int32
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/bedrock/model/test.model/invoke" || r.Header.Get("Authorization") != "Bearer "+token || r.Header.Get("X-Example-Route") != "synthetic-route" {
			t.Errorf("unexpected gateway request")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"m","type":"message","role":"assistant","model":"test.model","content":[{"type":"text","text":"OK"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}`))
	}))
	defer fake.Close()
	id, err := m.pg.SaveProfile(&db.LLMProfile{Name: "t-bedrock-server", Format: "bedrock-gateway", Model: "test.model", BaseURL: fake.URL + "/bedrock", APIKey: token, CustomHeaders: header, Streaming: false})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.pg.Exec(`DELETE FROM llm_profiles WHERE id=$1`, id) })
	list, err := m.pg.ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range list {
		if p.ID != id {
			continue
		}
		b, _ := json.Marshal(llmProfileDTO(p))
		if !strings.Contains(string(b), `"custom_headers_set":true`) || strings.Contains(string(b), token) || strings.Contains(string(b), "synthetic-route") {
			t.Fatal("profile DTO exposed a secret or omitted header status")
		}
	}
	body, _ := json.Marshal(map[string]any{"profile_id": id})
	rec := httptest.NewRecorder()
	s.testLLM(rec, httptest.NewRequest(http.MethodPost, "/api/llm/test", bytes.NewReader(body)))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"ok":true`) || calls.Load() != 1 {
		t.Fatalf("stored profile test failed: HTTP %d %s calls=%d", rec.Code, rec.Body.String(), calls.Load())
	}
	otherCalls := atomic.Int32{}
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { otherCalls.Add(1) }))
	defer other.Close()
	body, _ = json.Marshal(map[string]any{"provider": "bedrock-gateway", "model": "test.model", "base_url": other.URL + "/bedrock", "profile_id": id, "streaming": false})
	rec = httptest.NewRecorder()
	s.testLLM(rec, httptest.NewRequest(http.MethodPost, "/api/llm/test", bytes.NewReader(body)))
	if otherCalls.Load() != 0 || !strings.Contains(rec.Body.String(), `"ok":false`) {
		t.Fatal("stored bearer token was used at a different endpoint")
	}
	body, _ = json.Marshal(map[string]any{"id": id, "name": "t-bedrock-server", "format": "bedrock-gateway", "model": "test.model", "base_url": other.URL + "/bedrock", "api_key": ""})
	rec = httptest.NewRecorder()
	s.pgSaveProfile(rec, httptest.NewRequest(http.MethodPost, "/api/llm/profiles", bytes.NewReader(body)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("endpoint edit without a new token accepted: HTTP %d", rec.Code)
	}
	stored, err := m.pg.ProfileByID(id)
	if err != nil || stored.BaseURL != fake.URL+"/bedrock" {
		t.Fatal("rejected endpoint edit changed the saved profile")
	}
	body, _ = json.Marshal(map[string]any{"id": id, "name": "t-bedrock-server", "format": "bedrock-gateway", "model": "test.model", "base_url": other.URL + "/bedrock", "api_key": "synthetic-new-token"})
	rec = httptest.NewRecorder()
	s.pgSaveProfile(rec, httptest.NewRequest(http.MethodPost, "/api/llm/profiles", bytes.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("endpoint edit with new token returned HTTP %d: %s", rec.Code, rec.Body.String())
	}
	stored, err = m.pg.ProfileByID(id)
	if err != nil || stored.BaseURL != other.URL+"/bedrock" || stored.CustomHeaders != "" {
		t.Fatalf("endpoint edit retained old gateway headers: %v", err)
	}
}

func TestLegacyLLMEndpointDoesNotCarryGatewayHeaders(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	const header = "X-Example-Route: synthetic-route"
	oldBase := "http://127.0.0.1:40111/old"
	newBase := "http://127.0.0.1:40112/new"
	id, err := m.pg.SaveProfile(&db.LLMProfile{
		Name: "default", Format: "bedrock-gateway", Model: "test.model",
		BaseURL: oldBase, APIKey: "synthetic-old-token", CustomHeaders: header,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = m.pg.Exec(`DELETE FROM llm_profiles WHERE id=$1`, id) })
	if err := m.pg.SetActiveProfile(id); err != nil {
		t.Fatal(err)
	}
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	post := func(baseURL, token string) {
		t.Helper()
		body, _ := json.Marshal(map[string]string{
			"provider": "bedrock-gateway", "model": "test.model", "base_url": baseURL, "api_key": token,
		})
		rec := httptest.NewRecorder()
		s.setLLM(rec, httptest.NewRequest(http.MethodPost, "/api/llm", bytes.NewReader(body)))
		if rec.Code != http.StatusOK {
			t.Fatalf("legacy update returned HTTP %d: %s", rec.Code, rec.Body.String())
		}
	}
	post(oldBase, "")
	stored, err := m.pg.ProfileByID(id)
	if err != nil || stored.CustomHeaders != header {
		t.Fatalf("same-endpoint update lost gateway headers: %v", err)
	}
	post(oldBase, "synthetic-rotated-token")
	stored, err = m.pg.ProfileByID(id)
	if err != nil || stored.CustomHeaders != header {
		t.Fatalf("same-endpoint token rotation lost gateway headers: %v", err)
	}
	post(newBase, "synthetic-new-token")
	stored, err = m.pg.ProfileByID(id)
	if err != nil || stored.BaseURL != newBase || stored.CustomHeaders != "" {
		t.Fatalf("endpoint change retained gateway headers: %v", err)
	}
}
