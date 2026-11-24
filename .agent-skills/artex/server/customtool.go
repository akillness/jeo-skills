package server

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/Autumn-27/artex/config"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/guard"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/artex/notify"
	"github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
)

// This file implements the custom tool executor (docs/custom-tool-design.md). tools rows
// with system=false are dispatched by kind: command (render the command → reuse the Bash
// low-level run), script (Python only; write a temp file, pass parameters via stdin JSON
// + env TOOL_*, use the configured interpreter), http (native request + optional proxy). Like traffic/orchestration tools they need no seeding (they already live in the tools table); they are injected via hostTools and filtered by binding.

// ---------- custom tool CRUD ----------

type customToolReq struct {
	Key         string          `json:"key"`
	Description string          `json:"description"`
	Schema      json.RawMessage `json:"schema"`
	Agents      []string        `json:"agents"`
	Enabled     bool            `json:"enabled"`
	Kind        string          `json:"kind"` // command | script | http
	Exec        json.RawMessage `json:"exec"`
	Deferred    bool            `json:"deferred"`
}

var reToolKey = reAgentKey // same rule as agent key: starts with a lowercase letter, lowercase letters/digits/underscores only

func (s *Server) pgCreateCustomTool(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req customToolReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	req.Key = strings.TrimSpace(req.Key)
	if !reToolKey.MatchString(req.Key) {
		writeErr(w, 400, "key must start with a lowercase letter and contain only lowercase letters/digits/underscores")
		return
	}
	if req.Kind != "command" && req.Kind != "script" && req.Kind != "http" && req.Kind != "shell" {
		writeErr(w, 400, "kind must be command / script / http / shell")
		return
	}
	if req.Kind == "http" && !hasSchemaProps(req.Schema) {
		writeErr(w, 400, "http tools must provide a parameter JSON Schema (cannot be left empty)")
		return
	}
	if exist, _ := pg.GetTool(req.Key); exist != nil {
		writeErr(w, 409, "this key already exists (built-in or custom tool)")
		return
	}
	var err error
	if req.Exec, err = unmaskToolExec("", nil, req.Kind, req.Exec); err != nil { // nothing stored: a placeholder is refused
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.CreateCustomTool(&db.Tool{
		Key: req.Key, Description: req.Description, Schema: req.Schema, Agents: req.Agents,
		Enabled: req.Enabled, Kind: req.Kind, Exec: req.Exec, Deferred: req.Deferred,
	}); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"key": req.Key})
}

func (s *Server) pgUpdateCustomTool(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	key := r.PathValue("key")
	existing, err := pg.GetTool(key)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if existing == nil || existing.System {
		writeErr(w, 400, "only custom tools can be edited")
		return
	}
	var req customToolReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.Kind != "command" && req.Kind != "script" && req.Kind != "http" && req.Kind != "shell" {
		writeErr(w, 400, "kind must be command / script / http / shell")
		return
	}
	if req.Kind == "http" && !hasSchemaProps(req.Schema) {
		writeErr(w, 400, "http tools must provide a parameter JSON Schema (cannot be left empty)")
		return
	}
	if req.Exec, err = unmaskToolExec(existing.Kind, existing.Exec, req.Kind, req.Exec); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.UpdateCustomTool(&db.Tool{
		Key: key, Description: req.Description, Schema: req.Schema, Agents: req.Agents,
		Enabled: req.Enabled, Kind: req.Kind, Exec: req.Exec, Deferred: req.Deferred,
	}); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) pgDeleteCustomTool(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	key := r.PathValue("key")
	if err := pg.DeleteCustomTool(key); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": key})
}

// testToolReq is a dry-run request from the editor: run the given (possibly unsaved)
// exec spec with sample params, without persisting the tool. Same executor path as a
// real tool call — it runs arbitrary command/script/http on the server, which the
// custom-tool feature already allows, so no new capability is granted.
type testToolReq struct {
	Key    string          `json:"key"`  // the saved tool being edited, if any: its stored values replace placeholders
	Kind   string          `json:"kind"` // command | script | http
	Exec   json.RawMessage `json:"exec"`
	Params map[string]any  `json:"params"`
}

// pgTestCustomTool executes an exec spec once and returns its raw output + error
// flag, so the editor can debug a tool before saving it. Per-kind timeouts still
// apply from the exec spec (with defaults); the outer ceiling is a hard backstop.
func (s *Server) pgTestCustomTool(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req testToolReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid request body")
		return
	}
	var storedKind string
	var stored json.RawMessage
	if req.Key != "" {
		t, err := pg.GetTool(req.Key)
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		if t != nil && !t.System {
			storedKind, stored = t.Kind, t.Exec
		}
	}
	var err error
	if req.Exec, err = unmaskToolExec(storedKind, stored, req.Kind, req.Exec); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	params := req.Params
	if params == nil {
		params = map[string]any{}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()
	tc := &actool.ToolContext{WorkingDir: s.m.dir} // run in the project dir, like a real call
	var res actool.Result
	switch req.Kind {
	case "command":
		res, _ = s.runCommandTool(ctx, "test", req.Exec, params, tc)
	case "script":
		res, _ = s.runScriptTool(ctx, "test", req.Exec, params, tc)
	case "http":
		res, _ = s.runHTTPTool(ctx, "test", req.Exec, params, tc)
	case "shell":
		writeErr(w, 400, "shell-kind tools are bash environment declarations with no executable content")
		return
	default:
		writeErr(w, 400, "unknown tool kind: "+req.Kind)
		return
	}
	writeJSON(w, 200, map[string]any{"output": res.Flatten(), "is_error": res.IsError})
}

// ---------- Python interpreter (detect + persist + override) ----------

const settingPythonInterp = "python_interpreter"

// detectPython finds a python interpreter absolute path (python3 preferred).
func detectPython() string {
	for _, c := range []string{"python3", "python"} {
		if p, err := exec.LookPath(c); err == nil {
			return p
		}
	}
	return ""
}

// pythonInterpreter resolves the interpreter: user-set > stored auto-detect > live
// detect. "" only when truly none found.
func (s *Server) pythonInterpreter() string {
	if v, ok, _ := s.m.pg.GetSetting(settingPythonInterp); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return detectPython()
}

// seedPythonInterpreter stores the auto-detected interpreter on startup if unset
// (never clobbers a user-set value).
func (s *Server) seedPythonInterpreter() {
	if v, ok, _ := s.m.pg.GetSetting(settingPythonInterp); ok && strings.TrimSpace(v) != "" {
		return
	}
	if p := detectPython(); p != "" {
		_ = s.m.pg.SetSetting(settingPythonInterp, p)
		log.Printf("[custom-tool] auto-detected python interpreter: %s", p)
	}
}

// ---------- exec spec ----------

type commandExec struct {
	Command   string `json:"command"`
	TimeoutMs int    `json:"timeout_ms"`
}
type scriptExec struct {
	Code      string `json:"code"`
	TimeoutMs int    `json:"timeout_ms"`
}
type httpExec struct {
	Method            string            `json:"method"`
	URL               string            `json:"url"`
	Headers           map[string]string `json:"headers"`
	Body              string            `json:"body"`
	TimeoutMs         int               `json:"timeout_ms"`
	Proxy             string            `json:"proxy"`
	UseRecordingProxy bool              `json:"use_recording_proxy"`
}

// toolExecFlags are the response-only *_set flags of maskToolExec; never stored.
var toolExecFlags = []string{"headers_set", "proxy_set", "body_set"}

// maskToolExec is what the API shows of a custom tool's exec: every header value,
// the proxy and the body become the placeholder, each with a *_set flag.
func maskToolExec(raw json.RawMessage) json.RawMessage {
	var e map[string]any
	if json.Unmarshal(raw, &e) != nil || e == nil {
		return raw
	}
	if h, ok := e["headers"].(map[string]any); ok {
		set := false
		for k, v := range h {
			if v != "" {
				h[k], set = notify.MaskedPrefix, true
			}
		}
		e["headers_set"] = set
	}
	for _, k := range []string{"proxy", "body"} {
		if s, ok := e[k].(string); ok {
			e[k], e[k+"_set"] = maskedSecret(s), s != ""
		}
	}
	out, _ := json.Marshal(e)
	return out
}

// unmaskToolExec puts the stored value back for every header, proxy or body sent
// as the placeholder, so a client echoing the list response keeps the stored
// secret; an explicit value replaces it and "" clears it. A placeholder with
// nothing stored to keep (stored nil on create) is refused. As for the MCP env,
// a stored secret is only kept for the destination it was configured for: when
// the url (exact string) or the kind changes, a placeholder is refused.
func unmaskToolExec(storedKind string, stored json.RawMessage, kind string, in json.RawMessage) (json.RawMessage, error) {
	var e, old map[string]any
	if json.Unmarshal(in, &e) != nil || e == nil {
		return in, nil // not an object: stored or refused as before
	}
	_ = json.Unmarshal(stored, &old)
	changed, kept := false, false
	for _, k := range toolExecFlags {
		if _, ok := e[k]; ok {
			delete(e, k)
			changed = true
		}
	}
	oldHeaders, _ := old["headers"].(map[string]any)
	headers, _ := e["headers"].(map[string]any)
	for k, v := range headers {
		if s, ok := v.(string); !ok || !isMaskedSecret(s) {
			continue
		}
		prev, ok := oldHeaders[k]
		if !ok {
			return nil, fmt.Errorf("header %q: masked value but nothing stored to keep", k)
		}
		headers[k], changed, kept = prev, true, true
	}
	for _, k := range []string{"proxy", "body"} {
		if s, ok := e[k].(string); !ok || !isMaskedSecret(s) {
			continue
		}
		prev, _ := old[k].(string)
		if prev == "" {
			return nil, fmt.Errorf("%s: masked value but nothing stored to keep", k)
		}
		e[k], changed, kept = prev, true, true
	}
	oldURL, _ := old["url"].(string)
	newURL, _ := e["url"].(string)
	if kept && (oldURL != newURL || storedKind != kind) {
		return nil, fmt.Errorf("destination changed (url or kind) while a stored secret was kept: re-enter the masked header/proxy/body or clear it; stored secrets are not sent to a new destination")
	}
	if !changed {
		return in, nil
	}
	return json.Marshal(e)
}

func timeoutOr(ms, def int) time.Duration {
	if ms <= 0 {
		return time.Duration(def) * time.Millisecond
	}
	return time.Duration(ms) * time.Millisecond
}

// ---------- common tool construction ----------

// customTools builds CoreTools for every user-defined (system=false) tool row.
// shell-kind tools are environment hints only — they surface in the Bash tool
// description via ToolResolve and do NOT create callable tool entries here.
func (s *Server) customTools() ([]actool.CoreTool, error) {
	rows, err := s.m.pg.ListCustomTools()
	if err != nil {
		return nil, err
	}
	out := make([]actool.CoreTool, 0, len(rows))
	for _, t := range rows {
		if t.Kind == "shell" {
			continue // shell hints are handled by ToolResolve → Bash description
		}
		out = append(out, s.buildCustomTool(t))
	}
	return out, nil
}

// buildCustomTool turns one custom-tool row into a CoreTool. Empty schema → a thin
// {args:string} (thin-wrapper tool), so command/http templates can use {args}.
func (s *Server) buildCustomTool(t *db.Tool) actool.CoreTool {
	schema := ensureSchema(t.Schema)
	key, kind, execRaw := t.Key, t.Kind, t.Exec
	run := func(ctx context.Context, in json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
		var params map[string]any
		if len(in) > 0 {
			_ = json.Unmarshal(in, &params)
		}
		if params == nil {
			params = map[string]any{}
		}
		switch kind {
		case "command":
			return s.runCommandTool(ctx, key, execRaw, params, tc)
		case "script":
			return s.runScriptTool(ctx, key, execRaw, params, tc)
		case "http":
			return s.runHTTPTool(ctx, key, execRaw, params, tc)
		default:
			return actool.Errorf("unknown custom tool kind: " + kind), nil
		}
	}
	return actool.Build(actool.Spec{
		Name: key, Description: t.Description, Schema: schema,
		Permissions: func(context.Context, json.RawMessage, permission.Context) permission.Decision {
			return permission.Allowed()
		},
		Run: run,
	})
}

// hasSchemaProps reports whether raw is a JSON-Schema object with ≥1 property.
// http tools require an explicit schema (the auto {args} shell can't name the
// {param} placeholders in URL/headers/body), so an empty schema is rejected.
func hasSchemaProps(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return false
	}
	props, _ := m["properties"].(map[string]any)
	return len(props) > 0
}

// ensureSchema returns the tool's schema, or a thin {args:string} when none given.
func ensureSchema(raw json.RawMessage) map[string]any {
	var m map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &m)
	}
	props, _ := m["properties"].(map[string]any)
	if len(props) > 0 {
		return m
	}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"args": map[string]any{"type": "string", "description": "command/parameters (free text)"},
		},
	}
}

// ---------- command: render the command → reuse the Bash low-level run ----------

func (s *Server) runCommandTool(ctx context.Context, key string, execRaw json.RawMessage, params map[string]any, tc *actool.ToolContext) (actool.Result, error) {
	var spec commandExec
	_ = json.Unmarshal(execRaw, &spec)
	if strings.TrimSpace(spec.Command) == "" {
		return actool.Errorf("command is empty"), nil
	}
	cmd := renderTemplate(spec.Command, params, shellQuote)
	// The hook saw the parameters, not the command they render: the target gate
	// reads the rendered command here, also without the quoting of the parameters.
	if res := intercept.GateRenderedCommand(ctx, key, cmd, renderTemplate(spec.Command, params, identity)); res.Code != "" {
		return actool.Errorf(guard.TargetBlockMessage(res)), nil
	}
	// Reuse the low-level run Bash also uses (via the Bash CoreTool.Call): it
	// automatically inherits the safety floor/timeout/proxy env/output overflow. The tool is a peer of Bash sharing that low level, not routed through the Bash tool for the model to call.
	bashIn, _ := json.Marshal(map[string]any{"command": cmd})
	if spec.TimeoutMs > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeoutOr(spec.TimeoutMs, 120000))
		defer cancel()
	}
	return actool.NewBash().Call(ctx, bashIn, tc)
}

// ---------- script (Python only): temp file + stdin JSON + env ----------

func (s *Server) runScriptTool(ctx context.Context, key string, execRaw json.RawMessage, params map[string]any, tc *actool.ToolContext) (actool.Result, error) {
	var spec scriptExec
	_ = json.Unmarshal(execRaw, &spec)
	if strings.TrimSpace(spec.Code) == "" {
		return actool.Errorf("script code is empty"), nil
	}
	interp := s.pythonInterpreter()
	if interp == "" {
		return actool.Errorf("no python interpreter configured or detected (set it in system settings)"), nil
	}
	workDir := s.m.dir
	var sessionEnv []string
	if tc != nil {
		if tc.WorkingDir != "" {
			workDir = tc.WorkingDir
		}
		sessionEnv = tc.Env
	}
	body, err := execPython(ctx, interp, key, spec.Code, params, workDir, sessionEnv, timeoutOr(spec.TimeoutMs, 120000), s.execPriv)
	if err != nil {
		return actool.Errorf(err.Error()), nil
	}
	return actool.Text(actool.Capture(tc, body)), nil
}

// execPython writes the code to a temp .py under workDir/.tools, runs it via interp
// with the params JSON on stdin + scalar params mirrored to TOOL_<NAME> env, and
// returns combined stdout+stderr (with a timeout/exit note). Standalone + testable.
// When agent processes run as the executor, the script goes to priv.ScriptDir
// instead: the executor can write workDir, so it could make workDir/.tools a
// symlink and have the server, which is root, create and chown a file through it.
func execPython(ctx context.Context, interp, key, code string, params map[string]any, workDir string, sessionEnv []string, timeout time.Duration, priv ExecPrivilege) (string, error) {
	toolsDir := filepath.Join(workDir, ".tools")
	if priv.Enabled {
		if priv.ScriptDir == "" {
			return "", errors.New("the executor script directory is not prepared")
		}
		toolsDir = priv.ScriptDir
	} else if err := os.MkdirAll(toolsDir, 0o755); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(toolsDir, key+"-*.py")
	if err != nil {
		return "", err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if _, err := f.WriteString(code); err != nil {
		f.Close()
		return "", err
	}
	f.Close()
	if err := prepareExecScript(priv, tmp); err != nil {
		return "", err
	}

	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	c := exec.CommandContext(runCtx, interp, tmp)
	c.Dir = workDir
	// The allowlist as the executor (execenv_unix.go), then the session proxy env.
	c.Env = append(agentProcessEnv(priv), sessionEnv...)
	for k, v := range params { // scalar params mirrored as TOOL_<NAME>
		if sv, ok := scalarStr(v); ok {
			c.Env = append(c.Env, "TOOL_"+strings.ToUpper(k)+"="+sv)
		}
	}
	applyExecCredential(c, priv) // after c.Env: it sets the executor's HOME there
	pj, _ := json.Marshal(params)
	c.Stdin = bytes.NewReader(pj) // parameter JSON goes via stdin
	out, err := c.CombinedOutput()
	body := string(out)
	if runCtx.Err() == context.DeadlineExceeded {
		body += "\n... [terminated on timeout] ..."
	} else if err != nil {
		body += "\n[exit: " + err.Error() + "]"
	}
	return body, nil
}

// ---------- http: native request + proxy ----------

func (s *Server) runHTTPTool(ctx context.Context, key string, execRaw json.RawMessage, params map[string]any, tc *actool.ToolContext) (actool.Result, error) {
	var spec httpExec
	_ = json.Unmarshal(execRaw, &spec)
	method := strings.ToUpper(strings.TrimSpace(spec.Method))
	if method == "" {
		method = "GET"
	}
	rawURL := renderTemplate(spec.URL, params, identity)
	if strings.TrimSpace(rawURL) == "" {
		return actool.Errorf("http url is empty"), nil
	}
	// The hook saw the parameters, not the URL they render (nor a URL written in
	// the template): the target gate reads the rendered URL here, before the
	// tool's own timeout starts, so a wait for an approval does not consume it.
	if res := intercept.GateRenderedURL(ctx, key, rawURL); res.Code != "" {
		return actool.Errorf(guard.TargetBlockMessage(res)), nil
	}
	var bodyReader io.Reader
	if spec.Body != "" {
		bodyReader = strings.NewReader(renderTemplate(spec.Body, params, identity))
	}
	runCtx, cancel := context.WithTimeout(ctx, timeoutOr(spec.TimeoutMs, 30000))
	defer cancel()
	req, err := http.NewRequestWithContext(runCtx, method, rawURL, bodyReader)
	if err != nil {
		return actool.Errorf(err.Error()), nil
	}
	for k, v := range spec.Headers {
		req.Header.Set(k, renderTemplate(v, params, identity))
	}
	client := &http.Client{Timeout: timeoutOr(spec.TimeoutMs, 30000)}
	// Every redirect hop goes through the target gate, as the rendered URL did.
	client.CheckRedirect = intercept.RedirectCheck(key)
	if intercept.ApplyAssessmentUserAgent(req) {
		client.CheckRedirect = assessmentRedirectCheck(client.CheckRedirect)
	}
	// The current egress governor paces every request and redirect hop per host
	// under the noise profile (off by default: the base transport itself). It is
	// resolved per request, so a changed profile applies to the next call.
	var base http.RoundTripper = http.DefaultTransport
	if tr := s.httpToolTransport(ctx, key, spec); tr != nil {
		base = tr
	}
	client.Transport = egress.Current().Transport(key, base)
	resp, err := client.Do(req)
	if err != nil {
		return actool.Errorf("request failed: " + err.Error()), nil
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	out := map[string]any{"status": resp.StatusCode, "body": string(respBody)}
	b, _ := json.Marshal(out)
	return actool.Text(actool.Capture(tc, string(b))), nil
}

// assessmentRedirectCheck sheds the generated identifier on the first redirect
// to another origin. net/http copies headers from the initial request for each
// hop, so check the previous hop to keep the identifier off after that point.
func assessmentRedirectCheck(check func(*http.Request, []*http.Request) error) func(*http.Request, []*http.Request) error {
	return func(req *http.Request, via []*http.Request) error {
		previous := via[len(via)-1]
		if previous.Header.Get("User-Agent") == "" || !config.SameAssessmentOrigin(previous.URL, req.URL) {
			req.Header.Del("User-Agent")
		}
		return check(req, via)
	}
}

// httpToolTransport is the transport of one http tool call, or nil
// (http.DefaultTransport). A call through a proxy keeps httpProxyTransport: it
// dials the proxy, which makes the connection to the target. A direct call in
// a gated scope connects through the pinned dialer, to addresses a pin covers.
func (s *Server) httpToolTransport(ctx context.Context, key string, spec httpExec) *http.Transport {
	if tr := s.httpProxyTransport(spec); tr != nil {
		return tr
	}
	if !intercept.GateOn(ctx) {
		return nil
	}
	base, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		base = &http.Transport{}
	}
	tr := base.Clone()
	// An environment proxy would be dialled instead of the target.
	tr.Proxy = nil
	tr.DialContext = intercept.PinnedDialer(key, true)
	// One request per call: no idle connection outlives the call.
	tr.DisableKeepAlives = true
	return tr
}

// httpProxyTransport builds a Transport for the http tool's proxy config, or nil
// (direct). use_recording_proxy routes through the recording proxy + trusts its CA.
func (s *Server) httpProxyTransport(spec httpExec) *http.Transport {
	proxyStr := proxyURLString(spec.Proxy)
	var caFile string
	if spec.UseRecordingProxy {
		if tr := s.m.Traffic(); tr != nil && s.m.TrafficEnabled() {
			proxyStr = proxyURLString(tr.ProxyAddr())
			caFile = tr.CACertPath()
		} else if addr := proxyURLString(s.m.GlobalProxy()); addr != "" {
			proxyStr = addr
		}
	}
	if proxyStr == "" {
		return nil
	}
	pu, err := url.Parse(proxyStr)
	if err != nil {
		return nil
	}
	tr := &http.Transport{Proxy: http.ProxyURL(pu)}
	if caFile != "" {
		// Keep recorded HTTP requests on separate connections across redirects.
		tr.DisableKeepAlives = true
		if pem, err := os.ReadFile(caFile); err == nil {
			pool := x509.NewCertPool()
			if pool.AppendCertsFromPEM(pem) {
				tr.TLSClientConfig = &tls.Config{RootCAs: pool}
			}
		}
	}
	return tr
}

// proxyURLString returns a proxy address as a URL: a bare host:port gets
// "http://", an address that already has a scheme (as ProxyAddr returns it) is
// kept as is.
func proxyURLString(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || strings.Contains(s, "://") {
		return s
	}
	return "http://" + s
}

// ---------- helpers ----------

func identity(s string) string { return s }

// shellQuote single-quotes a value for safe shell interpolation.
func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }

// renderTemplate replaces {name} placeholders with each param's rendered value.
func renderTemplate(tmpl string, params map[string]any, quote func(string) string) string {
	out := tmpl
	for k, v := range params {
		out = strings.ReplaceAll(out, "{"+k+"}", quote(valToStr(v)))
	}
	return out
}

// valToStr renders a param value: scalars as-is, arrays/objects as compact JSON.
func valToStr(v any) string {
	if sv, ok := scalarStr(v); ok {
		return sv
	}
	b, _ := json.Marshal(v)
	return string(b)
}

// scalarStr returns (string, true) for scalar values, ("", false) for arrays/objects.
func scalarStr(v any) (string, bool) {
	switch x := v.(type) {
	case string:
		return x, true
	case bool:
		return fmt.Sprintf("%t", x), true
	case float64:
		if x == float64(int64(x)) {
			return fmt.Sprintf("%d", int64(x)), true
		}
		return fmt.Sprintf("%g", x), true
	case nil:
		return "", true
	default:
		return "", false
	}
}
