package server

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// No read endpoint returns a stored secret in clear, and a masked placeholder
// sent back on write never replaces the stored secret.
func TestSecretsNeverReturnedInClear(t *testing.T) {
	s, _, request := trafficEvidenceServer(t)
	pg := s.m.PG()
	secrets := []string{"sk-llm-plain-0001", "mcp-env-plain-0002", "cred-plain-0003", "SECding-plain-0004", "tok-plain-0005"}
	task, err := s.m.CreateTask("secrets api", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	llmID, err := pg.SaveProfile(&db.LLMProfile{Name: "t-secapi", Format: "openai", Model: "m", APIKey: secrets[0]})
	mcpID, err2 := pg.SaveMCP(&db.MCPServer{Name: "t-secapi", Transport: "http", Env: json.RawMessage(`{"X-API-Key":"` + secrets[1] + `","EMPTY":""}`)})
	_, err3 := pg.UpsertTaskCredential(taskID, db.TaskCredentialInput{Domain: "x.example", Username: "u", Password: secrets[2]})
	chID, err4 := pg.SaveNotificationChannel(context.Background(), &db.NotificationChannel{Name: "t-secapi", Kind: "dingtalk",
		Config: json.RawMessage(`{"webhook":"https://oapi.example/send?access_token=` + secrets[4] + `","secret":"` + secrets[3] + `"}`)})
	t.Cleanup(func() {
		pg.Exec(`DELETE FROM llm_profiles WHERE id=$1`, llmID)
		pg.Exec(`DELETE FROM mcp_servers WHERE id=$1`, mcpID)
		pg.Exec(`DELETE FROM notification_channels WHERE id=$1`, chID)
		pg.DeleteTask(taskID)
	})
	for _, e := range []error{err, err2, err3, err4} {
		if e != nil {
			t.Fatal(e)
		}
	}

	for _, path := range []string{"/api/llm/profiles", "/api/llm", "/api/mcp", "/api/notify/channels", "/api/tasks/" + task.ID + "/credentials"} {
		resp := request("GET", path, "")
		for _, sec := range secrets {
			if resp.Code != 200 || strings.Contains(resp.Body.String(), sec) {
				t.Fatalf("GET %s: HTTP %d or a secret returned in clear", path, resp.Code)
			}
		}
	}

	// MCP: echo the masked list entry back with a name change; the key survives.
	var list struct{ Servers []db.MCPServer }
	_ = json.Unmarshal(request("GET", "/api/mcp", "").Body.Bytes(), &list)
	for _, m := range list.Servers {
		if m.ID != mcpID {
			continue
		}
		if string(m.Env) != `{"EMPTY":"","X-API-Key":"__masked__"}` {
			t.Fatalf("mcp env not masked as expected: %s", m.Env)
		}
		m.Name = "t-secapi-renamed"
		body, _ := json.Marshal(m)
		if resp := request("POST", "/api/mcp", string(body)); resp.Code != 200 {
			t.Fatalf("mcp save: HTTP %d %s", resp.Code, resp.Body.String())
		}
	}
	all, _ := pg.ListMCP()
	for _, m := range all {
		if m.ID == mcpID && !strings.Contains(string(m.Env), secrets[1]) {
			t.Fatal("masked placeholder replaced the stored MCP secret")
		}
	}
	if resp := request("POST", "/api/mcp", `{"name":"t-secapi-new","transport":"http","env":{"K":"__masked__"}}`); resp.Code != 400 {
		t.Fatalf("a placeholder with nothing stored must be refused, got HTTP %d", resp.Code)
	}

	// Task credential: a masked password on write is refused, the stored one kept.
	if resp := request("POST", "/api/tasks/"+task.ID+"/credentials", `{"domain":"x.example","username":"u","password":"__masked__"}`); resp.Code != 400 {
		t.Fatalf("masked credential write must be refused, got HTTP %d", resp.Code)
	}
	if creds, _ := pg.TaskCredentials(taskID); len(creds) != 1 || creds[0].Password != secrets[2] {
		t.Fatal("stored credential changed")
	}
}

// A masked MCP env value is only kept while the destination (transport,
// command, args, url) is unchanged; otherwise the secrets must be re-entered.
func TestMCPMaskedEnvDestinationGuard(t *testing.T) {
	s, _, request := trafficEvidenceServer(t)
	pg := s.m.PG()
	const secret = "mcp-guard-secret-0006"
	httpID, err := pg.SaveMCP(&db.MCPServer{Name: "t-guard-http", Transport: "http", URL: "http://127.0.0.1:9/a",
		Env: json.RawMessage(`{"K":"` + secret + `"}`)})
	if err != nil {
		t.Fatal(err)
	}
	stdioID, err := pg.SaveMCP(&db.MCPServer{Name: "t-guard-stdio", Transport: "stdio", Command: "npx",
		Args: json.RawMessage(`["pkg"]`), Env: json.RawMessage(`{"K":"` + secret + `"}`)})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pg.DeleteMCP(httpID); pg.DeleteMCP(stdioID) })
	stored := func(id int64) db.MCPServer {
		all, _ := pg.ListMCP()
		for _, m := range all {
			if m.ID == id {
				return *m
			}
		}
		t.Fatalf("mcp %d missing", id)
		return db.MCPServer{}
	}
	save := func(id int64, edit func(*db.MCPServer), want int) {
		t.Helper()
		m := stored(id)
		m.Env = maskMCPEnv(m.Env)
		edit(&m)
		body, _ := json.Marshal(m)
		if resp := request("POST", "/api/mcp", string(body)); resp.Code != want {
			t.Fatalf("want HTTP %d, got %d %s", want, resp.Code, resp.Body.String())
		}
	}
	keeps := func(id int64, url string) {
		t.Helper()
		if m := stored(id); !strings.Contains(string(m.Env), secret) || m.URL != url {
			t.Fatalf("stored row changed: url=%q", m.URL)
		}
	}

	save(httpID, func(m *db.MCPServer) { m.Name = "t-guard-http2" }, 200)
	keeps(httpID, "http://127.0.0.1:9/a")
	save(httpID, func(m *db.MCPServer) { m.URL = "http://127.0.0.1:9/evil" }, 400)
	keeps(httpID, "http://127.0.0.1:9/a")
	save(httpID, func(m *db.MCPServer) { m.Transport = "sse" }, 400)
	keeps(httpID, "http://127.0.0.1:9/a")
	save(stdioID, func(m *db.MCPServer) { m.Command = "sh" }, 400)
	save(stdioID, func(m *db.MCPServer) { m.Args = json.RawMessage(`["other"]`) }, 400)
	keeps(stdioID, "")
	save(stdioID, func(m *db.MCPServer) { m.Args = json.RawMessage(`[ "pkg" ]`) }, 200) // same args, other spacing
	keeps(stdioID, "")
	save(httpID, func(m *db.MCPServer) {
		m.URL, m.Env = "http://127.0.0.1:9/b", json.RawMessage(`{"K":"new-explicit-value"}`)
	}, 200)
	if m := stored(httpID); m.URL != "http://127.0.0.1:9/b" || !strings.Contains(string(m.Env), "new-explicit-value") {
		t.Fatal("explicit env with a new url was not saved")
	}
}

// Secret settings and the LLM profile proxy: stored encrypted, never returned
// in clear; on write the placeholder keeps, an explicit value replaces, ""
// clears.
func TestProxySecretsAPI(t *testing.T) {
	s, _, request := trafficEvidenceServer(t)
	pg := s.m.PG()
	t.Cleanup(func() {
		pg.Exec(`DELETE FROM settings WHERE key IN ('brave_search_api_key','tavily_search_api_key','keenable_search_api_key','web_search_proxy','global_proxy')`)
		pg.Exec(`DELETE FROM llm_profiles WHERE name='t-proxy'`)
	})
	secrets := []string{"brave-api-0007", "tavily-api-0008", "keenable-api-0012", "wsp-pass-0009", "gp-pass-0010", "llmp-pass-0011"}
	put := func(body string) {
		t.Helper()
		resp := request("PUT", "/api/settings", body)
		for _, sec := range secrets {
			if resp.Code != 200 || strings.Contains(resp.Body.String(), sec) {
				t.Fatalf("PUT /api/settings %s: HTTP %d or a secret returned in clear", body, resp.Code)
			}
		}
	}
	setting := func(k string) string {
		t.Helper()
		var raw string
		if err := pg.QueryRow(`SELECT value FROM settings WHERE key=$1`, k).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		v, _, err := pg.GetSetting(k)
		if err != nil || (raw != "" && !strings.HasPrefix(raw, "enc:v1:")) {
			t.Fatalf("setting %s stored as %q (%v)", k, raw, err)
		}
		return v
	}
	put(`{"brave_search_api_key":"brave-api-0007","tavily_search_api_key":"tavily-api-0008","keenable_search_api_key":"keenable-api-0012",
"web_search_proxy":"socks5://u:wsp-pass-0009@ws.example:1080","global_proxy":"http://u:gp-pass-0010@gp.example:3128"}`)
	var got map[string]any
	resp := request("GET", "/api/settings", "")
	_ = json.Unmarshal(resp.Body.Bytes(), &got)
	for _, sec := range secrets {
		if strings.Contains(resp.Body.String(), sec) {
			t.Fatal("GET /api/settings returned a secret in clear")
		}
	}
	if got["global_proxy"] != "__masked__" || got["global_proxy_set"] != true || got["web_search_proxy"] != "__masked__" || got["web_search_proxy_set"] != true {
		t.Fatalf("proxies not masked with a presence flag: %v", got)
	}

	put(`{"web_search_proxy":"__masked__","global_proxy":"__masked__","brave_search_api_key":"__masked__","keenable_search_api_key":"__masked__"}`)
	if setting("web_search_proxy") != "socks5://u:wsp-pass-0009@ws.example:1080" || setting("global_proxy") != "http://u:gp-pass-0010@gp.example:3128" ||
		setting("brave_search_api_key") != "brave-api-0007" || setting("tavily_search_api_key") != "tavily-api-0008" ||
		setting("keenable_search_api_key") != "keenable-api-0012" {
		t.Fatal("a masked placeholder replaced a stored secret")
	}
	put(`{"global_proxy":"http://gp2.example:3128","web_search_proxy":""}`)
	if setting("global_proxy") != "http://gp2.example:3128" || setting("web_search_proxy") != "" {
		t.Fatal("explicit value must replace and \"\" must clear")
	}
	_ = json.Unmarshal(request("GET", "/api/settings", "").Body.Bytes(), &got)
	if got["web_search_proxy"] != "" || got["web_search_proxy_set"] != false {
		t.Fatalf("cleared proxy shown as %v / %v", got["web_search_proxy"], got["web_search_proxy_set"])
	}

	// LLM profile proxy.
	id, err := pg.SaveProfile(&db.LLMProfile{Name: "t-proxy", Format: "openai", Model: "m", APIKey: "k", Proxy: "http://u:llmp-pass-0011@llm.example:3128"})
	if err != nil {
		t.Fatal(err)
	}
	proxy := func() string {
		var raw *string
		if err := pg.QueryRow(`SELECT proxy FROM llm_profiles WHERE id=$1`, id).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		if raw != nil && !strings.HasPrefix(*raw, "enc:v1:") {
			t.Fatalf("profile proxy stored in clear: %q", *raw)
		}
		p, err := pg.ProfileByID(id)
		if err != nil {
			t.Fatal(err)
		}
		return p.Proxy
	}
	for _, path := range []string{"/api/llm/profiles", "/api/llm"} {
		if resp := request("GET", path, ""); resp.Code != 200 || strings.Contains(resp.Body.String(), "llmp-pass-0011") {
			t.Fatalf("GET %s: HTTP %d or the proxy returned in clear", path, resp.Code)
		}
	}
	var list struct{ Profiles []LLMProfileDTO }
	_ = json.Unmarshal(request("GET", "/api/llm/profiles", "").Body.Bytes(), &list)
	for _, p := range list.Profiles {
		if p.Name == "t-proxy" && (p.Proxy != "__masked__" || !p.ProxySet) {
			t.Fatalf("profile proxy not masked: %+v", p)
		}
	}
	save := func(proxyJSON string, want int) {
		t.Helper()
		body := `{"id":` + strconv.FormatInt(id, 10) + `,"name":"t-proxy","format":"openai","model":"m","proxy":` + proxyJSON + `}`
		if resp := request("POST", "/api/llm/profiles", body); resp.Code != want {
			t.Fatalf("save proxy %s: want HTTP %d, got %d %s", proxyJSON, want, resp.Code, resp.Body.String())
		}
	}
	save(`"__masked__"`, 200)
	if proxy() != "http://u:llmp-pass-0011@llm.example:3128" {
		t.Fatal("the placeholder replaced the stored profile proxy")
	}
	save(`"socks5://llm2.example:1080"`, 200)
	if proxy() != "socks5://llm2.example:1080" {
		t.Fatal("explicit proxy not saved")
	}
	save(`""`, 200)
	if proxy() != "" {
		t.Fatal("empty proxy must clear")
	}
	if resp := request("POST", "/api/llm/profiles", `{"name":"t-proxy","format":"openai","model":"m","proxy":"__masked__"}`); resp.Code != 400 {
		t.Fatalf("a placeholder on a new profile must be refused, got HTTP %d", resp.Code)
	}
}
