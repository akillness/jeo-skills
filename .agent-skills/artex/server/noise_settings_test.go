package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/egress"
)

func TestNoiseProfileSettingHTTP(t *testing.T) {
	skipWithoutDSN(t)
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	t.Setenv("ARTEX_NOISE_PROFILE", "quiet")
	t.Setenv("ARTEX_TARGET_USER_AGENT", "artex-noise-test/1")

	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	clear := func() {
		if _, err := m.pg.Exec(`DELETE FROM settings WHERE key=$1`, settingNoiseProfile); err != nil {
			t.Error(err)
		}
	}
	clear()
	defer clear() // before m.Close

	// Precedence: no setting -> env; a valid setting wins; an invalid one falls back to env.
	if p := startupNoiseProfile(m.pg); p.Name != "quiet" {
		t.Fatalf("no setting: %q, want env quiet", p.Name)
	}
	if err := m.pg.SetSetting(settingNoiseProfile, "balanced"); err != nil {
		t.Fatal(err)
	}
	m2, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	m2.Close()
	if p := egress.CurrentProfile(); p.Name != "balanced" || p.UserAgent != "artex-noise-test/1" {
		t.Fatalf("NewManager with setting balanced applied %+v", p)
	}
	if err := m.pg.SetSetting(settingNoiseProfile, "loud"); err != nil {
		t.Fatal(err)
	}
	if p := startupNoiseProfile(m.pg); p.Name != "quiet" {
		t.Fatalf("invalid setting: %q, want env quiet", p.Name)
	}
	if err := m.pg.SetSetting(settingNoiseProfile, "balanced"); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	defer stopTestServer(t, s, cancel)
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	do := func(method, path, body string) (int, map[string]any) {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out
	}
	egress.SetProfile(egress.Profiles["balanced"])
	if code, out := do(http.MethodGet, "/api/settings", ""); code != 200 || out["noise_profile"] != "balanced" {
		t.Fatalf("GET settings: %d noise_profile=%v", code, out["noise_profile"])
	}
	if code, out := do(http.MethodPut, "/api/settings", `{"noise_profile":"Aggressive"}`); code != 200 || out["noise_profile"] != "aggressive" {
		t.Fatalf("PUT aggressive: %d noise_profile=%v", code, out["noise_profile"])
	}
	if v, _, _ := m.pg.GetSetting(settingNoiseProfile); v != "aggressive" || egress.CurrentProfile().Name != "aggressive" {
		t.Fatalf("after PUT: stored %q, current %q", v, egress.CurrentProfile().Name)
	}
	for _, bad := range []string{`{"noise_profile":"loud"}`, `{"noise_profile":""}`, `{"noise_profile":1}`} {
		if code, _ := do(http.MethodPut, "/api/settings", bad); code != 400 {
			t.Errorf("PUT %s: %d, want 400", bad, code)
		}
	}
	if code, out := do(http.MethodPut, "/api/settings", `{"noise_profile":null}`); code != 200 || out["noise_profile"] != "aggressive" {
		t.Fatalf("PUT null: %d noise_profile=%v, want unchanged", code, out["noise_profile"])
	}
	if v, _, _ := m.pg.GetSetting(settingNoiseProfile); v != "aggressive" || egress.CurrentProfile().Name != "aggressive" {
		t.Fatalf("after invalid and null PUTs: stored %q, current %q", v, egress.CurrentProfile().Name)
	}

	// The noise endpoint reads the current governor's counters.
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer target.Close()
	req, _ := http.NewRequest(http.MethodGet, target.URL, nil)
	resp, err := egress.Current().Transport("noise-test", nil).RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	code, out := do(http.MethodGet, "/api/settings/noise", "")
	hosts, _ := out["hosts"].([]any)
	if code != 200 || out["profile"] != "aggressive" || len(hosts) != 1 {
		t.Fatalf("GET noise: %d %v", code, out)
	}
	host, _ := hosts[0].(map[string]any)
	for _, key := range []string{"host", "rpm", "peak_rpm", "peak_inflight", "inflight", "duplicates_avoided"} {
		if _, ok := host[key]; !ok {
			t.Errorf("noise host misses %q: %v", key, host)
		}
	}
	if host["host"] != strings.TrimPrefix(target.URL, "http://") || host["rpm"] != float64(1) || host["inflight"] != float64(0) {
		t.Fatalf("noise host = %v", host)
	}
	// A second read does not reset the minute.
	if _, again := do(http.MethodGet, "/api/settings/noise", ""); again["hosts"].([]any)[0].(map[string]any)["rpm"] != float64(1) {
		t.Fatalf("second GET noise reset the counter: %v", again)
	}
}
