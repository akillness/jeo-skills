package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/artex/traffic"
	actool "github.com/Autumn-27/norma/tool"
)

// The gate wired into the server: the exemption API, the exemptions derived
// from the configuration, and the hooks of a task's guards.

// exemptionsOf decodes the "exemptions" (or "derived") list of a response.
func exemptionsOf(t *testing.T, body map[string]any, field string) []db.TargetExemption {
	t.Helper()
	raw, err := json.Marshal(body[field])
	if err != nil {
		t.Fatal(err)
	}
	var out []db.TargetExemption
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("%s = %s: %v", field, raw, err)
	}
	return out
}

func TestTargetGateExemptionsAPI(t *testing.T) {
	g := newGateServer(t)
	pg := g.m.pg
	original, _, err := pg.TargetExemptions()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.ReplaceTargetExemptions(original, "test", "restore") })

	// The routes are behind the session, like the rest of the API.
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/target-gate/exemptions"}, {"PUT", "/api/target-gate/exemptions"}, {"GET", "/api/target-gate/exemptions/history"},
	} {
		rec := httptest.NewRecorder()
		g.s.Handler().ServeHTTP(rec, httptest.NewRequest(c.method, c.path, strings.NewReader(`{"exemptions":[]}`)))
		if rec.Code != 401 {
			t.Fatalf("%s %s without a token: %d, want 401", c.method, c.path, rec.Code)
		}
	}

	code, body := g.do(t, "GET", "/api/target-gate/exemptions", "")
	if code != 200 || !slices.Equal(exemptionsOf(t, body, "exemptions"), original) || body["digest"] == "" || body["derived"] == nil {
		t.Fatalf("GET: %d %v, want the stored list %+v", code, body, original)
	}

	// PUT replaces the list. Hosts are normalised; host and port are exact.
	code, body = g.do(t, "PUT", "/api/target-gate/exemptions",
		`{"exemptions":[{"host":"Mirror.Example.ORG.","port":443,"note":"internal mirror"},{"host":"10.0.0.5","port":8080},{"host":"FD12:3456::5","port":8080}]}`)
	want := []db.TargetExemption{{Host: "mirror.example.org", Port: 443, Note: "internal mirror"}, {Host: "10.0.0.5", Port: 8080}, {Host: "fd12:3456::5", Port: 8080}}
	if code != 200 || !slices.Equal(exemptionsOf(t, body, "exemptions"), want) {
		t.Fatalf("PUT: %d %v, want %+v", code, body, want)
	}
	digest, _ := body["digest"].(string)
	code, body = g.do(t, "GET", "/api/target-gate/exemptions", "")
	if code != 200 || !slices.Equal(exemptionsOf(t, body, "exemptions"), want) || body["digest"] != digest || digest == "" {
		t.Fatalf("GET after PUT: %d %v", code, body)
	}

	// Refused entries: 400, and the stored list does not change.
	for name, entry := range map[string]string{
		"metadata address":         `{"host":"169.254.169.254","port":80}`,
		"metadata address, v6":     `{"host":"fd00:ec2::254","port":80}`,
		"metadata address, cloud":  `{"host":"100.100.100.200","port":80}`,
		"link-local v6":            `{"host":"fe80::1","port":80}`,
		"loopback":                 `{"host":"127.0.0.1","port":8080}`,
		"loopback as a number":     `{"host":"2130706433","port":8080}`,
		"loopback v6":              `{"host":"::1","port":8080}`,
		"unspecified":              `{"host":"0.0.0.0","port":80}`,
		"multicast":                `{"host":"224.0.0.1","port":80}`,
		"wildcard":                 `{"host":"*.example.org","port":443}`,
		"suffix":                   `{"host":".example.org","port":443}`,
		"range":                    `{"host":"10.0.0.0/8","port":443}`,
		"url":                      `{"host":"https://mirror.example.org/","port":443}`,
		"host with a port":         `{"host":"mirror.example.org:443","port":443}`,
		"no port":                  `{"host":"mirror.example.org"}`,
		"port out of range":        `{"host":"mirror.example.org","port":70000}`,
		"no host":                  `{"port":443}`,
		"one bad entry among good": `{"host":"pypi.org","port":443},{"host":"169.254.169.254","port":80}`,
	} {
		code, body := g.do(t, "PUT", "/api/target-gate/exemptions", `{"exemptions":[`+entry+`]}`)
		if code != 400 || body["error"] == nil {
			t.Errorf("%s: %d %v, want 400", name, code, body)
		}
	}
	if code, _ := g.do(t, "PUT", "/api/target-gate/exemptions", `not json`); code != 400 {
		t.Fatalf("malformed body: %d, want 400", code)
	}
	if list, _, err := pg.TargetExemptions(); err != nil || !slices.Equal(list, want) {
		t.Fatalf("stored list after the refused changes = %+v, %v; want it unchanged", list, err)
	}

	// The history holds the one change that was made, with who made it.
	code, body = g.do(t, "GET", "/api/target-gate/exemptions/history", "")
	changes, _ := body["changes"].([]any)
	if code != 200 || len(changes) == 0 {
		t.Fatalf("history: %d %v", code, body)
	}
	last, _ := changes[0].(map[string]any)
	if last["changed_by"] != "ARTEX" || last["digest"] != digest || len(exemptionsOf(t, last, "after")) != 3 || !slices.Equal(exemptionsOf(t, last, "before"), original) {
		t.Fatalf("last change = %v", last)
	}

	// An empty list is a valid list.
	if code, body := g.do(t, "PUT", "/api/target-gate/exemptions", `{}`); code != 200 || len(exemptionsOf(t, body, "exemptions")) != 0 {
		t.Fatalf("empty list: %d %v", code, body)
	}
	if code, body := g.do(t, "GET", "/api/target-gate/exemptions", ""); code != 200 || body["exemptions"] == nil || len(exemptionsOf(t, body, "exemptions")) != 0 {
		t.Fatalf("GET of the empty list: %d %v", code, body)
	}
}

// The exemptions of the platform's own endpoints are derived from the
// configuration on every call: LLM gateways, profile proxies, the search
// backend in use, the search proxy and the global egress proxy.
func TestTargetGateEndpointsFollowConfig(t *testing.T) {
	g := newGateServer(t)
	derived := func() []string {
		var out []string
		for _, e := range g.m.interceptor.DerivedExemptions() {
			out = append(out, db.TargetKey(e.Host, e.Port))
		}
		return out
	}
	has := func(key string) bool { return slices.Contains(derived(), key) }

	name := fmt.Sprintf("target-gate-endpoints-%d", time.Now().UnixNano())
	id, err := g.m.pg.SaveProfile(&db.LLMProfile{Name: name, Format: "openai", BaseURL: "https://LLM-gateway.example.net:8443/v1",
		Proxy: "http://user:secret@llm-proxy.example.net:3128", Model: "m", APIKey: "k"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = g.m.pg.DeleteProfile(id) })
	for _, key := range []string{"llm-gateway.example.net:8443", "llm-proxy.example.net:3128"} {
		if !has(key) {
			t.Fatalf("derived = %v, want the profile endpoint %s", derived(), key)
		}
	}
	for _, e := range derived() {
		if strings.Contains(e, "secret") || strings.Contains(e, "user") {
			t.Fatalf("a derived exemption carries credentials: %s", e)
		}
	}

	on, backend, _, _, _, proxy := g.m.WebSearch()
	globalProxy := g.m.GlobalProxy()
	t.Cleanup(func() {
		_ = g.m.SetWebSearch(on, backend, nil, nil, nil, &proxy)
		_ = g.m.SetGlobalProxy(globalProxy)
	})
	searchProxy := "http://search-proxy.example.net:8118"
	if err := g.m.SetWebSearch(true, "tavily", nil, nil, nil, &searchProxy); err != nil {
		t.Fatal(err)
	}
	if err := g.m.SetGlobalProxy("socks5://egress.example.net:1080"); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"api.tavily.com:443", "search-proxy.example.net:8118", "egress.example.net:1080"} {
		if !has(key) {
			t.Fatalf("derived = %v, want %s", derived(), key)
		}
	}
	// The configuration changes: so do the exemptions.
	none := ""
	if err := g.m.SetWebSearch(true, "ddgs", nil, nil, nil, &none); err != nil {
		t.Fatal(err)
	}
	if err := g.m.SetGlobalProxy(""); err != nil {
		t.Fatal(err)
	}
	if err := g.m.pg.DeleteProfile(id); err != nil {
		t.Fatal(err)
	}
	if !has("html.duckduckgo.com:443") {
		t.Fatalf("derived = %v, want the keyless search backend", derived())
	}
	for _, key := range []string{"api.tavily.com:443", "search-proxy.example.net:8118", "egress.example.net:1080", "llm-gateway.example.net:8443", "llm-proxy.example.net:3128"} {
		if has(key) {
			t.Fatalf("derived = %v, still holds %s after the configuration changed", derived(), key)
		}
	}
	// Search off: its backend is not exempt.
	if err := g.m.SetWebSearch(false, "ddgs", nil, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	if has("html.duckduckgo.com:443") {
		t.Fatalf("derived = %v, want no search backend while search is off", derived())
	}
	// The API shows them, read-only.
	if code, body := g.do(t, "GET", "/api/target-gate/exemptions", ""); code != 200 || body["derived"] == nil {
		t.Fatalf("GET: %d %v", code, body)
	}
}

// An approval of a request that displays no address is refused with 422. The
// request stays open and nothing is pinned.
func TestInterceptDecideRefusesEmptyPinOverHTTP(t *testing.T) {
	g := newGateServer(t)
	task := g.newTask(t, db.TaskCreateOptions{})
	scope := taskRef(t, task)
	id := openTargetRow(t, g.m.pg, scope, "no-address.example.com")
	code, body := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"allowed"}`)
	if msg, _ := body["error"].(string); code != 422 || !strings.Contains(msg, "never pins an empty address list") {
		t.Fatalf("approve: %d %v, want 422", code, body)
	}
	if row, err := g.m.pg.GetInterceptPending(id); err != nil || row == nil || row.Status != "pending" {
		t.Fatalf("row = %+v, %v; want still pending", row, err)
	}
	if pins, err := g.m.pg.ListTargetPins(scope); err != nil || len(pins) != 0 {
		t.Fatalf("pins = %+v, %v; want none", pins, err)
	}
	if code, _ := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"denied"}`); code != 200 {
		t.Fatalf("deny: %d", code)
	}
}

// The hooks of a task run the gate with the task's own scope: the worker
// guard and the target-only guard of the planner and the main agent. The flag
// is the task's, read on every call.
func TestTaskGuardsRunTargetGate(t *testing.T) {
	g := newGateServer(t)
	task := g.newTask(t, db.TaskCreateOptions{})
	scope := taskRef(t, task)
	pg := g.m.pg
	const fetch = `{"url":"http://203.0.113.7:8080/admin"}`
	ctxOf := func(agentName string, wait time.Duration) context.Context {
		return intercept.WithTargetScope(intercept.WithTaskContext(context.Background(), task.ID, agentName, nil), task.targetScope(wait))
	}
	targetRows := func() int {
		t.Helper()
		var n int
		if err := pg.QueryRow(`SELECT count(*) FROM intercept_pending WHERE task_id=$1 AND decision_source='target'`, task.ID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	hook := func(hooks interface {
		PreToolUse(context.Context, string, []byte) (bool, string, []byte)
	}, ctx context.Context) (bool, string) {
		block, msg, _ := hooks.PreToolUse(ctx, "WebFetch", []byte(fetch))
		return block, msg
	}

	// Gate off, the default: both guards pass the call and write nothing.
	for name, hooks := range map[string]interface {
		PreToolUse(context.Context, string, []byte) (bool, string, []byte)
	}{"worker": task.Guard.Hooks(), "planner": task.TargetGuard.Hooks()} {
		if block, msg := hook(hooks, ctxOf(name, 0)); block {
			t.Fatalf("gate off, %s: blocked: %s", name, msg)
		}
	}
	if n := targetRows(); n != 0 {
		t.Fatalf("gate off: %d target rows, want none", n)
	}

	// Gate on through the API: the next call of each guard is stopped. With
	// wait bound 0 it does not wait, and the one request stays open.
	if code, _ := g.do(t, "PATCH", "/api/tasks/"+task.ID, `{"target_gate":true}`); code != 200 {
		t.Fatalf("switch the gate on: %d", code)
	}
	for _, c := range []struct {
		name  string
		hooks interface {
			PreToolUse(context.Context, string, []byte) (bool, string, []byte)
		}
	}{{"planner", task.TargetGuard.Hooks()}, {"worker", task.Guard.Hooks()}} {
		block, msg := hook(c.hooks, ctxOf(c.name, 0))
		if !block || !strings.Contains(msg, "TARGET_APPROVAL_PENDING: target 203.0.113.7:8080: ") {
			t.Fatalf("gate on, %s: block=%v msg=%q", c.name, block, msg)
		}
	}
	var id int64
	var agentName string
	var open int
	if err := pg.QueryRow(`SELECT count(*), min(id), min(agent_name) FROM intercept_pending
WHERE task_id=$1 AND status='pending' AND target_key='203.0.113.7:8080'`, task.ID).Scan(&open, &id, &agentName); err != nil {
		t.Fatal(err)
	}
	if open != 1 || agentName != "planner" {
		t.Fatalf("%d open requests by %q, want one, opened by the planner's call", open, agentName)
	}
	// The planner's block is in the ring of its own guard, not in the task's.
	if audit := task.TargetGuard.Audit(); len(audit) != 1 || audit[0].Action != "block" {
		t.Fatalf("target-only ring = %+v, want the one block", audit)
	}
	for _, e := range task.Guard.Audit() {
		if e.Action == "block" && !strings.Contains(e.Reason, "TARGET_APPROVAL_PENDING") {
			t.Fatalf("unexpected entry in the task ring: %+v", e)
		}
	}

	// One click through the API pins the address for the task; both guards pass.
	if code, _ := g.do(t, "POST", fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"allowed"}`); code != 200 {
		t.Fatalf("decide: %d", code)
	}
	if pins, err := pg.ListTargetPins(scope); err != nil || len(pins) != 1 || pins[0].Host != "203.0.113.7" || pins[0].Port != 8080 ||
		!slices.Equal(pins[0].PinnedIPs, []string{"203.0.113.7"}) || pins[0].DecidedBy != "ARTEX" {
		t.Fatalf("pins = %+v, %v", pins, err)
	}
	ring := len(task.TargetGuard.Audit())
	for name, hooks := range map[string]interface {
		PreToolUse(context.Context, string, []byte) (bool, string, []byte)
	}{"worker": task.Guard.Hooks(), "planner": task.TargetGuard.Hooks()} {
		if block, msg := hook(hooks, ctxOf(name, 0)); block {
			t.Fatalf("pinned, %s: blocked: %s", name, msg)
		}
	}
	if n := len(task.TargetGuard.Audit()); n != ring {
		t.Fatalf("a passing planner call added %d entries to the ring", n-ring)
	}
	// Gate off again: the gate is out of the way at once.
	if code, _ := g.do(t, "PATCH", "/api/tasks/"+task.ID, `{"target_gate":false}`); code != 200 {
		t.Fatal("switch the gate off")
	}
	rows := targetRows()
	if block, _, _ := task.Guard.Hooks().PreToolUse(ctxOf("worker", 0), "WebFetch", []byte(`{"url":"http://198.51.100.200/"}`)); block || targetRows() != rows {
		t.Fatalf("gate off again: block=%v, %d new target rows", block, targetRows()-rows)
	}
}

// The platform's own tools read and write the platform's records: the gate
// must find no target in their input, or every finding and every intent that
// mentions a URL would ask for an approval. A tool added to these sets has to
// be added to the gate's list of tools without a target.
func TestHostToolsDeclareNoTarget(t *testing.T) {
	s := &Server{}
	var tools []actool.CoreTool
	tools = append(tools, s.orchestrationTools()...)
	tools = append(tools, s.findingRetestTools()...)
	tools = append(tools, s.platformTools()...)
	tools = append(tools, traffic.SeedToolMetas()...)
	if len(tools) < 25 {
		t.Fatalf("only %d host tools found", len(tools))
	}
	// The tools that set up a custom tool or an MCP server take an endpoint of
	// the model's choosing. They are scanned like any unknown tool: that
	// endpoint is a target.
	scanned := map[string]bool{"create_custom_tool": true, "update_custom_tool": true, "create_mcp": true, "update_mcp": true, "mcp_status": true}
	input := []byte(`{"task_id":1,"description":"test https://app.example.com/ and 203.0.113.7:8443","command":"curl https://app.example.com/","q":"host:app.example.com:443"}`)
	for _, tool := range tools {
		targets := intercept.ExtractTargets(tool.Name(), input)
		if scanned[tool.Name()] {
			if len(targets) == 0 {
				t.Errorf("%s: no target read", tool.Name())
			}
			delete(scanned, tool.Name())
		} else if len(targets) != 0 {
			t.Errorf("%s: the gate reads targets %+v from a platform tool", tool.Name(), targets)
		}
	}
	if len(scanned) != 0 {
		t.Errorf("tools that no longer exist: %v", scanned)
	}
}
