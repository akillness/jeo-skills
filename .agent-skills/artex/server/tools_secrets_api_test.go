package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// A placeholder keeps the stored secret only for the url and kind it was saved
// with: a changed destination is refused before any write or request.
func TestCustomToolExecDestinationGuard(t *testing.T) {
	s, _, request := trafficEvidenceServer(t)
	pg := s.m.PG()
	var hits atomic.Int32
	echo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		io.WriteString(w, "auth="+r.Header.Get("Authorization"))
	}))
	t.Cleanup(echo.Close)
	t.Cleanup(func() { pg.Exec(`DELETE FROM tools WHERE key LIKE 't_secguard%'`) })
	const secret = "Bearer guard-plain-0001"
	schema := `{"type":"object","properties":{"q":{"type":"string"}}}`
	body := func(kind, url, hdr string) string {
		e, _ := json.Marshal(map[string]any{"method": "GET", "url": url, "headers": map[string]string{"Authorization": hdr}})
		return `{"key":"t_secguard","kind":"` + kind + `","enabled":true,"schema":` + schema + `,"exec":` + string(e) + `}`
	}
	storedExec := func() (url, auth string) {
		tl, err := pg.GetTool("t_secguard")
		if err != nil || tl == nil {
			t.Fatalf("GetTool: %v", err)
		}
		var e struct {
			URL     string            `json:"url"`
			Headers map[string]string `json:"headers"`
		}
		_ = json.Unmarshal(tl.Exec, &e)
		return e.URL, e.Headers["Authorization"]
	}
	if resp := request("POST", "/api/tools/custom", body("http", echo.URL, secret)); resp.Code != 200 {
		t.Fatalf("create: HTTP %d %s", resp.Code, resp.Body.String())
	}
	moved := echo.URL + "/elsewhere"

	// 1. Masked header, changed url: refused, nothing written.
	if resp := request("PUT", "/api/tools/custom/t_secguard", body("http", moved, "__masked__")); resp.Code != 400 {
		t.Fatalf("masked header with a changed url must be refused, got HTTP %d", resp.Code)
	}
	if url, auth := storedExec(); url != echo.URL || auth != secret {
		t.Fatalf("a refused update changed the stored exec: %s %s", url, auth)
	}
	// An empty url against a stored one is a change too.
	if resp := request("PUT", "/api/tools/custom/t_secguard", body("http", "", "__masked__")); resp.Code != 400 {
		t.Fatalf("masked header with an emptied url must be refused, got HTTP %d", resp.Code)
	}

	// 2. Masked header, same url: kept.
	if resp := request("PUT", "/api/tools/custom/t_secguard", body("http", echo.URL, "__masked__")); resp.Code != 200 {
		t.Fatalf("masked header with the same url: HTTP %d %s", resp.Code, resp.Body.String())
	}
	if url, auth := storedExec(); url != echo.URL || auth != secret {
		t.Fatalf("the stored secret was not kept: %s %s", url, auth)
	}

	// 3. Test endpoint, masked header, changed url: refused, no request sent.
	e, _ := json.Marshal(map[string]any{"method": "GET", "url": moved, "headers": map[string]string{"Authorization": "__masked__"}})
	if resp := request("POST", "/api/tools/custom/test", `{"key":"t_secguard","kind":"http","exec":`+string(e)+`}`); resp.Code != 400 {
		t.Fatalf("test endpoint with a changed url must be refused, got HTTP %d %s", resp.Code, resp.Body.String())
	}
	if n := hits.Load(); n != 0 {
		t.Fatalf("the echo server received %d request(s); the stored secret left", n)
	}

	// 4. Kind change while keeping a placeholder: refused.
	if resp := request("PUT", "/api/tools/custom/t_secguard", body("command", echo.URL, "__masked__")); resp.Code != 400 {
		t.Fatalf("a kind change with a placeholder must be refused, got HTTP %d", resp.Code)
	}
	if tl, _ := pg.GetTool("t_secguard"); tl == nil || tl.Kind != "http" {
		t.Fatalf("a refused kind change was written: %v", tl)
	}

	// 5. An explicit value with a changed url is allowed.
	if resp := request("PUT", "/api/tools/custom/t_secguard", body("http", moved, "Bearer typed-0002")); resp.Code != 200 {
		t.Fatalf("explicit header with a changed url: HTTP %d %s", resp.Code, resp.Body.String())
	}
	if url, auth := storedExec(); url != moved || auth != "Bearer typed-0002" {
		t.Fatalf("explicit replace not stored: %s %s", url, auth)
	}
}

// A custom tool's exec: headers, proxy and body are masked by GET /api/tools;
// the placeholder keeps the stored value on update and in the test endpoint, a
// create with it is refused, and the executor runs on the clear exec.
func TestCustomToolExecMasking(t *testing.T) {
	s, _, request := trafficEvidenceServer(t)
	pg := s.m.PG()
	echo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		io.WriteString(w, "auth="+r.Header.Get("Authorization")+" body="+string(b))
	}))
	t.Cleanup(echo.Close)
	t.Cleanup(func() { pg.Exec(`DELETE FROM tools WHERE key LIKE 't_secexec%'`) })
	secrets := []string{"hdr-plain-0001", "body-plain-0002", "proxy-plain-0003"}
	schema := `{"type":"object","properties":{"q":{"type":"string"}}}`
	execOf := func(hdr, body, proxy string) string {
		e, _ := json.Marshal(map[string]any{"method": "POST", "url": echo.URL,
			"headers": map[string]string{"Authorization": hdr, "X-Empty": ""}, "body": body, "proxy": proxy})
		return string(e)
	}
	toolBody := func(key, exec string) string {
		return `{"key":"` + key + `","kind":"http","enabled":true,"schema":` + schema + `,"exec":` + exec + `}`
	}
	stored := func() map[string]any {
		tl, err := pg.GetTool("t_secexec")
		if err != nil || tl == nil {
			t.Fatalf("GetTool: %v", err)
		}
		var e map[string]any
		_ = json.Unmarshal(tl.Exec, &e)
		return e
	}

	plain := execOf("Bearer "+secrets[0], secrets[1], "http://u:"+secrets[2]+"@127.0.0.1:1")
	if resp := request("POST", "/api/tools/custom", toolBody("t_secexec", plain)); resp.Code != 200 {
		t.Fatalf("create: HTTP %d %s", resp.Code, resp.Body.String())
	}
	var raw string
	if err := pg.QueryRow(`SELECT exec::text FROM tools WHERE key='t_secexec'`).Scan(&raw); err != nil || !strings.Contains(raw, "__artex_enc") {
		t.Fatalf("exec not sealed at rest: %s %v", raw, err)
	}

	// List: masked with *_set flags, nothing in clear.
	resp := request("GET", "/api/tools", "")
	for _, sec := range secrets {
		if resp.Code != 200 || strings.Contains(resp.Body.String(), sec) {
			t.Fatalf("GET /api/tools: HTTP %d or a secret returned in clear", resp.Code)
		}
	}
	var list struct {
		Tools []struct {
			Key  string          `json:"key"`
			Exec json.RawMessage `json:"exec"`
		}
	}
	_ = json.Unmarshal(resp.Body.Bytes(), &list)
	var masked json.RawMessage
	for _, tl := range list.Tools {
		if tl.Key == "t_secexec" {
			masked = tl.Exec
		}
	}
	var m map[string]any
	_ = json.Unmarshal(masked, &m)
	h, _ := m["headers"].(map[string]any)
	if h["Authorization"] != "__masked__" || h["X-Empty"] != "" || m["body"] != "__masked__" || m["proxy"] != "__masked__" ||
		m["headers_set"] != true || m["body_set"] != true || m["proxy_set"] != true || m["url"] != echo.URL {
		t.Fatalf("exec not masked as expected: %s", masked)
	}

	// Update echoing the masked exec: every stored value is kept, no flag stored.
	if resp := request("PUT", "/api/tools/custom/t_secexec", toolBody("t_secexec", string(masked))); resp.Code != 200 {
		t.Fatalf("update with placeholders: HTTP %d %s", resp.Code, resp.Body.String())
	}
	e := stored()
	if e["headers"].(map[string]any)["Authorization"] != "Bearer "+secrets[0] || e["body"] != secrets[1] ||
		!strings.Contains(e["proxy"].(string), secrets[2]) || e["body_set"] != nil {
		t.Fatalf("placeholders did not keep the stored exec: %v", e)
	}

	// Test endpoint: the saved tool's key resolves the placeholders.
	noProxy := execOf("__masked__", "__masked__", "")
	if resp := request("POST", "/api/tools/custom/test", `{"kind":"http","exec":`+noProxy+`}`); resp.Code != 400 {
		t.Fatalf("a placeholder without a saved tool must be refused, got HTTP %d", resp.Code)
	}
	resp = request("POST", "/api/tools/custom/test", `{"key":"t_secexec","kind":"http","exec":`+noProxy+`}`)
	if resp.Code != 200 || !strings.Contains(resp.Body.String(), "auth=Bearer "+secrets[0]+" body="+secrets[1]) {
		t.Fatalf("test endpoint did not use the stored values: HTTP %d %s", resp.Code, resp.Body.String())
	}

	// Replace the header, keep the body, clear the proxy.
	if resp := request("PUT", "/api/tools/custom/t_secexec", toolBody("t_secexec", execOf("Bearer new-0004", "__masked__", ""))); resp.Code != 200 {
		t.Fatalf("update: HTTP %d %s", resp.Code, resp.Body.String())
	}
	e = stored()
	if e["headers"].(map[string]any)["Authorization"] != "Bearer new-0004" || e["body"] != secrets[1] || e["proxy"] != "" {
		t.Fatalf("replace/keep/clear: %v", e)
	}
	if resp := request("GET", "/api/tools", ""); strings.Contains(resp.Body.String(), "new-0004") {
		t.Fatal("a replaced secret is returned in clear")
	}

	// Create with a placeholder: refused, nothing written.
	for _, ex := range []string{execOf("__masked__", "", ""), execOf("", "__masked__", ""), execOf("", "", "__masked__")} {
		if resp := request("POST", "/api/tools/custom", toolBody("t_secexec_new", ex)); resp.Code != 400 {
			t.Fatalf("create with a placeholder must be refused, got HTTP %d", resp.Code)
		}
	}
	if tl, _ := pg.GetTool("t_secexec_new"); tl != nil {
		t.Fatal("a refused create wrote a row")
	}

	// The executor receives the clear exec from the sealed row.
	tools, err := s.customTools()
	if err != nil {
		t.Fatal(err)
	}
	for _, tl := range tools {
		if tl.Name() != "t_secexec" {
			continue
		}
		res, err := tl.Call(context.Background(), json.RawMessage(`{"q":"x"}`), nil)
		if err != nil || !strings.Contains(res.Flatten(), "auth=Bearer new-0004 body="+secrets[1]) {
			t.Fatalf("executor output %q %v", res.Flatten(), err)
		}
		return
	}
	t.Fatal("t_secexec not built by customTools")
}

// The platform tools follow the API: create refuses a placeholder, update keeps the stored value.
func TestPlatformCustomToolPlaceholders(t *testing.T) {
	s, _, _ := trafficEvidenceServer(t)
	pg := s.m.PG()
	t.Cleanup(func() { pg.Exec(`DELETE FROM tools WHERE key LIKE 't_secexec%'`) })
	in := func(exec string) json.RawMessage {
		return json.RawMessage(`{"key":"t_secexec_pt","kind":"command","exec":` + exec + `}`)
	}
	create, update := s.toolCreateCustomTool(), s.toolUpdateCustomTool()
	if res, _ := create.Call(context.Background(), in(`{"command":"echo","proxy":"__masked__"}`), nil); !res.IsError {
		t.Fatalf("create with a placeholder must fail: %s", res.Flatten())
	}
	if res, _ := create.Call(context.Background(), in(`{"command":"echo","body":"pt-body-plain"}`), nil); res.IsError {
		t.Fatalf("create: %s", res.Flatten())
	}
	if res, _ := update.Call(context.Background(), in(`{"command":"echo 2","body":"__masked__"}`), nil); res.IsError {
		t.Fatalf("update: %s", res.Flatten())
	}
	tl, err := pg.GetTool("t_secexec_pt")
	if err != nil || tl == nil || !jsonHas(tl.Exec, "pt-body-plain") || !jsonHas(tl.Exec, "echo 2") {
		t.Fatalf("update with a placeholder must keep the stored body: %v %v", tl, err)
	}
}

func jsonHas(raw json.RawMessage, s string) bool { return strings.Contains(string(raw), s) }
