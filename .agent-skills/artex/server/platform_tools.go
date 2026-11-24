package server

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

// Platform operation tools (for the built-in Auto agent): create/edit skills,
// custom tools, MCP. All are host tools, seeded into the tools table, bound to auto by default, and injected via hostTools. They reuse the existing db/filesystem logic.

func (s *Server) platformTools() []actool.CoreTool {
	return []actool.CoreTool{
		s.toolMCPStatus(),
		s.toolAskOperator(),
		s.toolCreateSkill(),
		s.toolUpdateSkillFile(),
		s.toolCreateCustomTool(),
		s.toolUpdateCustomTool(),
		s.toolCreateMCP(),
		s.toolUpdateMCP(),
		s.toolDeleteAssetsByHost(),
	}
}

// platformToolKeys are the tool keys the Auto agent gets bound by default.
var platformToolKeys = []string{
	"create_skill", "update_skill_file",
	"create_custom_tool", "update_custom_tool",
	"create_mcp", "update_mcp",
	"delete_assets_by_host",
}

// ---- assets ----

// toolDeleteAssetsByHost hard-deletes every asset tied to one host (exact match).
// Platform-level (not a per-task tool): operates on the global, cross-task asset library.
func (s *Server) toolDeleteAssetsByHost() actool.CoreTool {
	return wrTool("delete_assets_by_host",
		"Delete assets by exact host: removes the host's domains/subdomains plus the services (service) and endpoints (endpoint) under them.\n"+
			"host must match exactly (lowercased, whitespace-trimmed); no fuzzy or wildcard matching.\n"+
			"Passing a root domain (e.g. example.com) also deletes its subdomains and their services/endpoints; passing a subdomain (e.g. a.example.com) or an IP deletes only that host itself and its services/endpoints.\n"+
			"⚠️ Hard delete, applies to the global asset library (shared across tasks), irreversible.",
		objSchema(map[string]any{
			"host": strParam("The host to delete: domain/subdomain/IP. Exact match, e.g. example.com, a.example.com, or 1.2.3.4"),
		}, "host"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			as := s.assetStore()
			if as == nil {
				return actool.Errorf("asset library not initialized"), nil
			}
			var a struct {
				Host string `json:"host"`
			}
			_ = json.Unmarshal(in, &a)
			if strings.TrimSpace(a.Host) == "" {
				return actool.Errorf("host must not be empty"), nil
			}
			counts, err := as.DeleteByHost(a.Host)
			if err != nil {
				return actool.Errorf("delete failed: " + err.Error()), nil
			}
			var total int64
			for _, n := range counts {
				total += n
			}
			return jsonResult(map[string]any{
				"host":            a.Host,
				"deleted":         total,
				"deleted_by_type": counts,
			})
		})
}

// ---- skills ----

func (s *Server) toolCreateSkill() actool.CoreTool {
	return wrTool("create_skill",
		"Create a new skill (writes SKILL.md, agentskills.io spec). name is lowercase letters/digits/hyphens.",
		objSchema(map[string]any{
			"name":         strParam("skill name (starts with a lowercase letter; letters/digits/hyphens)"),
			"description":  strParam("skill description (required; what it does / when to use it)"),
			"instructions": strParam("Markdown body instructions (optional)"),
		}, "name", "description"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct{ Name, Description, Instructions string }
			_ = json.Unmarshal(in, &a)
			if !validSkillName(a.Name) {
				return actool.Errorf("invalid skill name (must start with a lowercase letter, only letters/digits/hyphens, max 64)"), nil
			}
			if strings.TrimSpace(a.Description) == "" {
				return actool.Errorf("description is required"), nil
			}
			dirCP, err := resolveSkillDir(s.skillDir, a.Name)
			if err != nil {
				return actool.Errorf("invalid skill path"), nil
			}
			if dirCP.exists {
				return actool.Errorf("skill already exists: " + a.Name), nil
			}
			path := filepath.Join(s.skillDir, a.Name)
			if err := os.MkdirAll(path, 0o755); err != nil {
				return actool.Errorf(safeFSErr(err)), nil
			}
			var b strings.Builder
			b.WriteString("---\n")
			fmt.Fprintf(&b, "name: %s\n", a.Name)
			fmt.Fprintf(&b, "description: %s\n", a.Description)
			b.WriteString("---\n")
			if strings.TrimSpace(a.Instructions) != "" {
				b.WriteString(a.Instructions)
			} else {
				fmt.Fprintf(&b, "## %s\n\n1. \n2. \n3. \n", a.Name)
			}
			if err := os.WriteFile(filepath.Join(path, "SKILL.md"), []byte(b.String()), 0o644); err != nil {
				_ = os.RemoveAll(path)
				return actool.Errorf(safeFSErr(err)), nil
			}
			return actool.Text("skill created: " + a.Name), nil
		})
}

func (s *Server) toolUpdateSkillFile() actool.CoreTool {
	return wrTool("update_skill_file",
		"Write/overwrite one file inside a skill (SKILL.md by default). Used to modify skill content or add scripts/references.",
		objSchema(map[string]any{
			"name":    strParam("skill name"),
			"file":    strParam("relative path (optional, SKILL.md by default, e.g. scripts/run.py)"),
			"content": strParam("full file content"),
		}, "name", "content"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct{ Name, File, Content string }
			_ = json.Unmarshal(in, &a)
			if !validSkillName(a.Name) {
				return actool.Errorf("invalid skill name"), nil
			}
			rel := strings.TrimSpace(a.File)
			if rel == "" {
				rel = "SKILL.md"
			}
			clean, msg := skillRelPath(rel)
			if msg != "" {
				return actool.Errorf("illegal path: " + msg), nil
			}
			skillExists, cp, err := resolveSkillFile(s.skillDir, a.Name, clean)
			if err != nil {
				return actool.Errorf("illegal path: invalid path"), nil
			}
			if !skillExists {
				return actool.Errorf("skill does not exist: " + a.Name), nil
			}
			if cp.realPath == cp.realRoot {
				return actool.Errorf("illegal path: invalid path"), nil
			}
			if err := os.MkdirAll(filepath.Dir(cp.realPath), 0o755); err != nil {
				return actool.Errorf(safeFSErr(err)), nil
			}
			if err := os.WriteFile(cp.realPath, []byte(a.Content), 0o644); err != nil {
				return actool.Errorf(safeFSErr(err)), nil
			}
			return actool.Text("skill file written: " + a.Name + "/" + clean), nil
		})
}

// ---- custom tools ----

type customToolToolInput struct {
	Key         string          `json:"key"`
	Description string          `json:"description"`
	Kind        string          `json:"kind"`
	Exec        json.RawMessage `json:"exec"`
	Schema      json.RawMessage `json:"schema"`
	Agents      []string        `json:"agents"`
	Deferred    bool            `json:"deferred"`
	Enabled     *bool           `json:"enabled"`
}

func customToolSchema(keyDesc string) map[string]any {
	return objSchema(map[string]any{
		"key":         strParam(keyDesc),
		"description": strParam("description shown to the model"),
		"kind":        strParam("shell | command | script (Python only) | http. shell = a bash environment declaration (merely tells the model this tool can be called directly in bash, no exec/schema needed); the other three require exec"),
		"exec":        map[string]any{"type": "object", "description": "execution spec (not needed for the shell kind): command→{command}; script→{code}; http→{method,url,headers,body,proxy,use_recording_proxy}"},
		"schema":      map[string]any{"type": "object", "description": "parameter JSON-Schema (optional for shell/command/script; required for http and must contain properties)"},
		"agents":      map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "agent keys to bind (optional)"},
		"deferred":    map[string]any{"type": "boolean", "description": "whether to defer (no effect for the shell kind; enable only for rarely used command/script/http tools)"},
		"enabled":     map[string]any{"type": "boolean", "description": "whether enabled (default true)"},
	}, "key", "kind")
}

func toDBTool(a customToolToolInput) *db.Tool {
	enabled := true
	if a.Enabled != nil {
		enabled = *a.Enabled
	}
	return &db.Tool{
		Key: a.Key, Description: a.Description, Schema: a.Schema, Agents: a.Agents,
		Enabled: enabled, Kind: a.Kind, Exec: a.Exec, Deferred: a.Deferred,
	}
}

func (s *Server) toolCreateCustomTool() actool.CoreTool {
	return wrTool("create_custom_tool", "[Important] When installing tools the platform does not have, call this tool to put the installed tool into the platform so the platform can call it! Creates a custom tool (shell/command/script/http). shell = a bash environment declaration, needing only key+description+agents, no exec/schema.",
		customToolSchema("tool key (starts with a lowercase letter; letters/digits/underscores)"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a customToolToolInput
			_ = json.Unmarshal(in, &a)
			a.Key = strings.TrimSpace(a.Key)
			if !reToolKey.MatchString(a.Key) {
				return actool.Errorf("key must start with a lowercase letter and contain only lowercase letters/digits/underscores"), nil
			}
			if a.Kind != "shell" && a.Kind != "command" && a.Kind != "script" && a.Kind != "http" {
				return actool.Errorf("kind must be shell / command / script / http"), nil
			}
			if a.Kind == "http" && !hasSchemaProps(a.Schema) {
				return actool.Errorf("http tools must provide a parameter JSON Schema (cannot be empty)"), nil
			}
			if exist, _ := s.m.pg.GetTool(a.Key); exist != nil {
				return actool.Errorf("this key already exists: " + a.Key), nil
			}
			var err error
			if a.Exec, err = unmaskToolExec("", nil, a.Kind, a.Exec); err != nil { // nothing stored: a placeholder is refused
				return actool.Errorf(err.Error()), nil
			}
			if err := s.m.pg.CreateCustomTool(toDBTool(a)); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return actool.Text("custom tool created: " + a.Key), nil
		})
}

func (s *Server) toolUpdateCustomTool() actool.CoreTool {
	return wrTool("update_custom_tool", "Update an existing custom tool (by key).",
		customToolSchema("the key of the custom tool to modify"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a customToolToolInput
			_ = json.Unmarshal(in, &a)
			existing, _ := s.m.pg.GetTool(a.Key)
			if existing == nil || existing.System {
				return actool.Errorf("only custom tools can be modified: " + a.Key), nil
			}
			if a.Kind != "shell" && a.Kind != "command" && a.Kind != "script" && a.Kind != "http" {
				return actool.Errorf("kind must be shell / command / script / http"), nil
			}
			if a.Kind == "http" && !hasSchemaProps(a.Schema) {
				return actool.Errorf("http tools must provide a parameter JSON Schema (cannot be empty)"), nil
			}
			var err error
			if a.Exec, err = unmaskToolExec(existing.Kind, existing.Exec, a.Kind, a.Exec); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if err := s.m.pg.UpdateCustomTool(toDBTool(a)); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return actool.Text("custom tool updated: " + a.Key), nil
		})
}

// ---- MCP health ----

// toolMCPStatus reports each MCP server's last connect outcome so a worker can
// notice a missing server (and say so) instead of silently degrading when the
// catalog is cached but the server is unreachable.
func (s *Server) toolMCPStatus() actool.CoreTool {
	return wrTool("mcp_status",
		"Report the health of every configured MCP server: name, transport, enabled, cached tool count, and the outcome of the last connect attempt (time, ok/error). Use this when tools you expect are missing or before relying on a skill-gated server.",
		map[string]any{"type": "object", "properties": map[string]any{}},
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			servers, err := s.m.pg.ListMCP()
			if err != nil {
				return actool.Errorf("Error: " + err.Error()), nil
			}
			var b strings.Builder
			fmt.Fprintf(&b, "%d MCP server(s):\n", len(servers))
			for _, m := range servers {
				status := "never connected"
				switch {
				case m.LastConnectOK != nil && *m.LastConnectOK:
					status = "connected ok"
				case m.LastConnectOK != nil && !*m.LastConnectOK:
					status = "DOWN: " + strings.TrimSpace(coalesceStr(m.LastConnectErr, "connect failed"))
				}
				fmt.Fprintf(&b, "- %s [%s, %s, %d cached tools]: %s", m.Name, m.Transport, enabledWord(m.Enabled), len(m.Tools), status)
				if m.LastConnectAt != nil {
					fmt.Fprintf(&b, " (last attempt %s)", m.LastConnectAt.UTC().Format(time.RFC3339))
				}
				b.WriteByte('\n')
			}
			b.WriteString("If a server you need is DOWN, tell the operator in your final report instead of working around it.")
			return actool.Text(b.String()), nil
		})
}

func coalesceStr(p *string, fallback string) string {
	if p == nil {
		return fallback
	}
	return *p
}

func enabledWord(b bool) string {
	if b {
		return "enabled"
	}
	return "disabled"
}

// ---- MCP ----

type mcpToolInput struct {
	ID        int64           `json:"id"`
	Name      string          `json:"name"`
	Transport string          `json:"transport"`
	Command   string          `json:"command"`
	Args      json.RawMessage `json:"args"`
	Env       json.RawMessage `json:"env"`
	URL       string          `json:"url"`
	Enabled   *bool           `json:"enabled"`
	Insecure  *bool           `json:"insecure"`
}

func mcpSchema(withID bool) map[string]any {
	props := map[string]any{
		"name":      strParam("MCP server name"),
		"transport": strParam("stdio | http / sse"),
		"command":   strParam("launch command for stdio (e.g. npx)"),
		"args":      map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "array of command arguments"},
		"env":       map[string]any{"type": "object", "description": "environment variables {KEY:VALUE}"},
		"url":       strParam("URL for http/sse"),
		"enabled":   map[string]any{"type": "boolean", "description": "whether enabled (default true)"},
		"insecure":  map[string]any{"type": "boolean", "description": "http: skip TLS certificate verification (set true for self-signed certificates, default false)"},
	}
	required := []string{"name", "transport"}
	if withID {
		props["id"] = map[string]any{"type": "integer", "description": "id of the MCP server to modify"}
		required = []string{"id", "name", "transport"}
	}
	return objSchema(props, required...)
}

func (a mcpToolInput) toDB() *db.MCPServer {
	enabled := true
	if a.Enabled != nil {
		enabled = *a.Enabled
	}
	insecure := false
	if a.Insecure != nil {
		insecure = *a.Insecure
	}
	return &db.MCPServer{
		ID: a.ID, Name: a.Name, Transport: a.Transport, Command: a.Command,
		Args: a.Args, Env: a.Env, URL: a.URL, Enabled: enabled, Insecure: insecure,
	}
}

func (s *Server) toolCreateMCP() actool.CoreTool {
	return wrTool("create_mcp", "Create an MCP server (stdio/http/sse). Its tools must be authorized per agent visibility after creation.",
		mcpSchema(false),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a mcpToolInput
			_ = json.Unmarshal(in, &a)
			a.ID = 0
			if strings.TrimSpace(a.Name) == "" || strings.TrimSpace(a.Transport) == "" {
				return actool.Errorf("name / transport are required"), nil
			}
			id, err := s.m.pg.SaveMCP(a.toDB())
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return actool.Text(fmt.Sprintf("mcp created: id=%d name=%s", id, a.Name)), nil
		})
}

func (s *Server) toolUpdateMCP() actool.CoreTool {
	return wrTool("update_mcp", "Update an existing MCP server (by id).",
		mcpSchema(true),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a mcpToolInput
			_ = json.Unmarshal(in, &a)
			if a.ID == 0 {
				return actool.Errorf("id is required"), nil
			}
			if _, err := s.m.pg.SaveMCP(a.toDB()); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return actool.Text(fmt.Sprintf("mcp updated: id=%d", a.ID)), nil
		})
}
