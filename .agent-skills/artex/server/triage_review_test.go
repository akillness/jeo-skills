package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// A triage profile is a stored base_url, so the decision endpoint has to pass the
// same guard the model-list path uses: without it, pointing the profile at an
// internal host makes the server dial that host on every report_finding.
func TestTriageHTTPClientGuard(t *testing.T) {
	s := &Server{}
	t.Setenv(LLMPrivateEndpointsEnv, "")
	if c := s.triageHTTPClient("http://127.0.0.1:8099/v1"); c != nil {
		t.Fatal("private triage endpoint was accepted without an allow-list entry")
	}
	if c := s.triageHTTPClient("http://169.254.169.254/latest"); c != nil {
		t.Fatal("metadata address was accepted as a triage endpoint")
	}
	t.Setenv(LLMPrivateEndpointsEnv, "127.0.0.1:8099")
	if c := s.triageHTTPClient("http://127.0.0.1:8099/v1"); c == nil {
		t.Fatal("allow-listed private triage endpoint was refused")
	}
}

// A stored profile id that matches nothing resolves to "off" at run time, which
// reads as a broken dedup instead of a rejected setting; out-of-range thresholds
// are silently ignored by the agent. Both are rejected at save time now.
func TestTriageSettingsValidation(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	clear := func() {
		for _, k := range []string{settingTriageProfile, settingTriageMinConfidence} {
			if _, err := m.pg.Exec(`DELETE FROM settings WHERE key=$1`, k); err != nil {
				t.Error(err)
			}
		}
	}
	clear()
	defer clear()

	pid, err := m.pg.SaveProfile(&db.LLMProfile{Name: "triage-test", Format: "openai",
		BaseURL: "http://127.0.0.1:8099/v1", Model: "pplx-decider", APIKey: "sk-test"})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	defer stopTestServer(t, s, cancel)
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	do := func(body string) int {
		t.Helper()
		req := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		return rec.Code
	}

	for _, bad := range []string{
		`{"triage_profile_id":-5}`,
		`{"triage_profile_id":999888777}`,
		`{"triage_min_confidence":-0.2}`,
		`{"triage_min_confidence":1.7}`,
	} {
		if code := do(bad); code != 400 {
			t.Errorf("PUT %s: %d, want 400", bad, code)
		}
	}
	if v, ok, _ := m.pg.GetSetting(settingTriageProfile); ok {
		t.Fatalf("rejected PUT stored triage_profile_id=%q", v)
	}

	good := `{"triage_profile_id":` + strconv.FormatInt(pid, 10) + `,"triage_min_confidence":0.45}`
	if code := do(good); code != 200 {
		t.Fatalf("PUT %s: %d, want 200", good, code)
	}
	if v, _, _ := m.pg.GetSetting(settingTriageProfile); v != strconv.FormatInt(pid, 10) {
		t.Fatalf("stored triage_profile_id = %q, want %d", v, pid)
	}
	if v, _, _ := m.pg.GetSetting(settingTriageMinConfidence); v != "0.450" {
		t.Fatalf("stored triage_min_confidence = %q, want 0.450", v)
	}
	// 0 is the documented way to turn the check off and must stay accepted.
	if code := do(`{"triage_profile_id":0}`); code != 200 {
		t.Fatalf("PUT triage_profile_id=0: %d, want 200", code)
	}
	var got map[string]any
	req := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if v, _ := got["triage_profile_id"].(float64); int64(v) != 0 {
		t.Fatalf("GET settings triage_profile_id = %v, want 0", got["triage_profile_id"])
	}
}
