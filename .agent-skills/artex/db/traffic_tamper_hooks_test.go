package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestTrafficTamperHookCRUDSealedAndVersions(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { _ = d.Close() })

	const srcV1 = `package hook
const apiSecret = "super-secret-hmac-key-v1"
func OnRequest(req *Request) error { req.SetHeader("X-V", "1"); return nil }`
	const srcV2 = `package hook
const apiSecret = "super-secret-hmac-key-v2"
func OnRequest(req *Request) error { req.SetHeader("X-V", "2"); return nil }`

	h, err := d.CreateTrafficTamperHook(TrafficTamperHook{
		Name:     "t-hook-sealed",
		Enabled:  true, // Create always forces disabled
		Phase:    "request",
		Priority: 5,
		Matchers: json.RawMessage(`{"host":"api.example.test"}`),
		Source:   srcV1,
		Note:     "v1",
	})
	if err != nil {
		t.Fatalf("CreateTrafficTamperHook: %v", err)
	}
	t.Cleanup(func() { _ = d.DeleteTrafficTamperHook(h.ID) })

	if h.Enabled || h.Version != 1 || h.Source != srcV1 {
		t.Fatalf("created hook = %+v", h)
	}

	// Verify BOTH traffic_tamper_hooks AND traffic_tamper_hook_versions seal source & matchers at rest.
	var rawSrc, rawMatchers string
	if err := d.QueryRow(`SELECT source, matchers::text FROM traffic_tamper_hooks WHERE id=$1`, h.ID).Scan(&rawSrc, &rawMatchers); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(rawSrc, secretPrefix) || strings.Contains(rawSrc, "super-secret-hmac-key") {
		t.Fatalf("traffic_tamper_hooks.source is not sealed at rest: %q", rawSrc)
	}
	if !strings.Contains(rawMatchers, sealedJSONKey) || strings.Contains(rawMatchers, "api.example.test") {
		t.Fatalf("traffic_tamper_hooks.matchers is not sealed at rest: %q", rawMatchers)
	}

	var verRawSrc, verRawMatchers string
	if err := d.QueryRow(`SELECT source, matchers::text FROM traffic_tamper_hook_versions WHERE hook_id=$1 AND version=1`, h.ID).Scan(&verRawSrc, &verRawMatchers); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(verRawSrc, secretPrefix) || strings.Contains(verRawSrc, "super-secret-hmac-key") {
		t.Fatalf("traffic_tamper_hook_versions.source is not sealed at rest: %q", verRawSrc)
	}
	if !strings.Contains(verRawMatchers, sealedJSONKey) || strings.Contains(verRawMatchers, "api.example.test") {
		t.Fatalf("traffic_tamper_hook_versions.matchers is not sealed at rest: %q", verRawMatchers)
	}

	// Update -> version 2 + toggle enabled.
	v2, err := d.UpdateTrafficTamperHook(h.ID, func(stored TrafficTamperHook) (TrafficTamperHook, error) {
		stored.Source = srcV2
		stored.Note = "v2"
		return stored, nil
	})
	if err != nil || v2.Version != 2 || v2.Source != srcV2 {
		t.Fatalf("update = (%+v, %v)", v2, err)
	}
	if err := d.ToggleTrafficTamperHook(h.ID, true); err != nil {
		t.Fatalf("toggle: %v", err)
	}
	got, err := d.GetTrafficTamperHook(h.ID)
	if err != nil || !got.Enabled || got.Version != 2 {
		t.Fatalf("get after toggle = (%+v, %v)", got, err)
	}

	// Rollback to version 1 -> creates version 3 with v1 source & keeps enabled=true.
	v3, err := d.RollbackTrafficTamperHook(h.ID, 1)
	if err != nil || v3.Version != 3 || v3.Source != srcV1 || !v3.Enabled {
		t.Fatalf("rollback = (%+v, %v)", v3, err)
	}
	vers, err := d.ListTrafficTamperHookVersions(h.ID)
	if err != nil || len(vers) != 3 || vers[0].Version != 3 || vers[2].Version != 1 {
		t.Fatalf("versions = (%+v, %v)", vers, err)
	}

	// Delete cascades versions.
	if err := d.DeleteTrafficTamperHook(h.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := d.GetTrafficTamperHook(h.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("after delete err = %v, want sql.ErrNoRows", err)
	}
}
