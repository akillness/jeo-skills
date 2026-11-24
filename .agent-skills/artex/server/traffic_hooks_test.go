package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic"
)

func TestTamperHooksAPIValidationKillSwitchCRUDVersionsRollbackDryRun(t *testing.T) {
	t.Setenv(traffic.TamperHooksEnabledEnv, "")
	m, err := NewManager(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { _ = m.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	do := func(method, path string, body any) (int, map[string]any) {
		t.Helper()
		var rdr *bytes.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			rdr = bytes.NewReader(b)
		} else {
			rdr = bytes.NewReader(nil)
		}
		req := httptest.NewRequest(method, path, rdr)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out
	}

	// 1. Forbidden constructs/imports rejected at AST validation with HTTP 400.
	forbidden := []string{
		`package hook; import "os"; func OnRequest(req *Request) error { _ = os.Getenv("X"); return nil }`,
		`package hook; import "io/fs"; func OnRequest(req *Request) error { return nil }`,
		`package hook; import "net"; func OnRequest(req *Request) error { return nil }`,
		`package hook; import "os/exec"; func OnRequest(req *Request) error { return nil }`,
		`package hook; import "syscall"; func OnRequest(req *Request) error { return nil }`,
		`package hook; import "unsafe"; func OnRequest(req *Request) error { return nil }`,
		`package hook; import "reflect"; func OnRequest(req *Request) error { return nil }`,
		`package hook; import "time"; func OnRequest(req *Request) error { _ = time.Now(); return nil }`,
		`package hook; import "math/rand"; func OnRequest(req *Request) error { _ = rand.Int(); return nil }`,
		`package hook; func f(){}; func OnRequest(req *Request) error { go f(); return nil }`,
		`package hook; func OnRequest(req *Request) error { var c chan int; _ = c; return nil }`,
		`package hook; func OnRequest(req *Request) error { select {}; return nil }`,
		`package hook; func f(){}; func OnRequest(req *Request) error { defer f(); return nil }`,
		`package hook; func OnRequest(req *Request) error { goto end; end: return nil }`,
		`package hook; func init() {}; func OnRequest(req *Request) error { return nil }`,
		`package hook; var g = 1; func OnRequest(req *Request) error { g++; return nil }`,
	}
	for i, src := range forbidden {
		code, _ := do("POST", "/api/traffic/hooks", map[string]any{
			"name": fmt.Sprintf("bad-%d", i), "phase": "request", "source": src,
		})
		if code != 400 {
			t.Fatalf("forbidden hook %d returned HTTP %d, want 400", i, code)
		}
	}

	// 2. Create valid hook (always created disabled, version 1).
	const srcV1 = `package hook
func OnRequest(req *Request) error {
	req.SetHeader("X-Ver", "1")
	return nil
}`
	const srcV2 = `package hook
func OnRequest(req *Request) error {
	req.SetHeader("X-Ver", "2")
	return nil
}`
	code, created := do("POST", "/api/traffic/hooks", map[string]any{
		"name": "p42-api-hook", "enabled": true, "phase": "request", "priority": 5,
		"matchers": map[string]any{"host": "api.example.test"},
		"source":   srcV1, "note": "v1",
	})
	if code != 200 {
		t.Fatalf("create hook HTTP %d: %v", code, created)
	}
	id := int64(created["id"].(float64))
	t.Cleanup(func() { _ = m.pg.DeleteTrafficTamperHook(id) })
	if created["enabled"] != false || created["version"].(float64) != 1 {
		t.Fatalf("expected created disabled v1, got %v", created)
	}

	// 3. Toggle enabled while kill switch is OFF: zero hooks loaded onto proxy.
	code, toggled := do("POST", fmt.Sprintf("/api/traffic/hooks/%d/toggle", id), map[string]any{"enabled": true})
	if code != 200 || toggled["enabled"] != true {
		t.Fatalf("toggle HTTP %d: %v", code, toggled)
	}
	if m.traffic.TamperHooks() != nil {
		t.Fatal("expected nil TamperHooks on proxy when ARTEX_TAMPER_HOOKS_ENABLED is off")
	}

	// 4. Enable kill switch and reload: snapshot now holds 1 request hook.
	t.Setenv(traffic.TamperHooksEnabledEnv, "1")
	m.reloadTamperHooks()
	if m.traffic.TamperHooks().Len("request") != 1 {
		t.Fatalf("expected 1 loaded request hook when kill switch on, got %d", m.traffic.TamperHooks().Len("request"))
	}

	// 5. Update -> v2, list versions, rollback to v1 -> v3.
	code, upd := do("PUT", fmt.Sprintf("/api/traffic/hooks/%d", id), map[string]any{
		"name": "p42-api-hook", "enabled": true, "phase": "request", "priority": 5,
		"matchers": map[string]any{"host": "api.example.test"},
		"source":   srcV2, "note": "v2",
	})
	if code != 200 || upd["version"].(float64) != 2 {
		t.Fatalf("update HTTP %d: %v", code, upd)
	}
	code, vers := do("GET", fmt.Sprintf("/api/traffic/hooks/%d/versions", id), nil)
	if code != 200 || len(vers["versions"].([]any)) != 2 {
		t.Fatalf("versions HTTP %d: %v", code, vers)
	}
	code, rb := do("POST", fmt.Sprintf("/api/traffic/hooks/%d/rollback", id), map[string]any{"version": 1})
	if code != 200 || rb["version"].(float64) != 3 || rb["source"] != srcV1 {
		t.Fatalf("rollback HTTP %d: %v", code, rb)
	}

	// 6. Dry-run endpoint against stored hook_id.
	code, dry := do("POST", "/api/traffic/hooks/dry-run", map[string]any{
		"hook_id": id,
		"request": map[string]any{"method": "GET", "url": "https://api.example.test/v1/ping"},
	})
	if code != 200 || dry["changed"] != true {
		t.Fatalf("dry-run HTTP %d: %v", code, dry)
	}
	reqMap := dry["request"].(map[string]any)
	hdrs := reqMap["headers"].(map[string]any)
	if xver := hdrs["X-Ver"].([]any); len(xver) != 1 || xver[0] != "1" {
		t.Fatalf("dry-run X-Ver = %v, want [1]", xver)
	}

	// 7. Delete cleans up and updates proxy snapshot.
	code, _ = do("DELETE", fmt.Sprintf("/api/traffic/hooks/%d", id), nil)
	if code != 200 {
		t.Fatalf("delete HTTP %d", code)
	}
	if m.traffic.TamperHooks().Len("request") != 0 {
		t.Fatalf("expected 0 loaded hooks after delete, got %d", m.traffic.TamperHooks().Len("request"))
	}
}
