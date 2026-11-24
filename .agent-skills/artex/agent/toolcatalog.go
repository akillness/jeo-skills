package agent

import (
	"context"
	"encoding/json"
	"sync"

	actool "github.com/Autumn-27/norma/tool"
)

// This file turns the "built-in tools" from pure code into an enumerable,
// DB-overridable catalog:
//   - BuiltinToolSeeds(): expands the three execution agents' built-in tool sets
//     into seed records (key + description + parameter schema + the agents they
//     bind to by default), for the server to idempotently seed into the tools table
//     on startup.
//   - The ToolResolve hook: at runtime, post-processes the assembled tools against
//     the tools rows in the DB ("filter by agent + override description/schema +
//     inject parameter defaults"). key/handler stay in the code layer; the DB only
//     changes the "prose and default values".
// The handler (Call behavior) always comes from code — the DB can't change it, only
// the descriptions and default inputs the model sees.

// ToolSeed is a seedable snapshot of a built-in tool: Key is CoreTool.Name() (hard
// bound to the handler, read-only in the UI); Desc/Schema come from the tool
// definition in code; Agents lists the agents it is given to by default.
type ToolSeed struct {
	Key    string         // = CoreTool.Name(), primary key, immutable
	Desc   string         // top-level description (overridable in the UI)
	Schema map[string]any // parameter JSON-Schema (structure read-only; description/default editable in the UI)
	Agents []string       // agent keys bound by default (worker/planner/mainagent)
}

// builtinToolsByAgent builds each execution agent's domain tool set with a
// "read-only shell" ToolSet (nil stores). The tool constructors only stuff closures
// into Spec and never dereference the store at construction time, so nil is safe —
// these tools are used here only to read Name()/Description()/InputSchema(), never
// Call.
//
// Deliberately EXCLUDES the SDK general tools actool.DefaultTools() (Read/Write/
// Edit/MultiEdit/LS/Glob/Grep/Bash): every agent always has them, there is no
// "bind to whom" trade-off, and most of their documentation lives in Prompt() (this
// table only covers Description(), which would create misleading half-coverage).
// Not seeded → no DB row → ToolResolve passes them through untouched, behavior
// identical to before. Only artex's own domain tools enter the table as manageable.
func builtinToolsByAgent() map[string][]actool.CoreTool {
	ts := NewToolSet(nil, "")
	return map[string][]actool.CoreTool{
		"mainagent": ts.MainAgentTools(),
		"planner":   ts.PlannerTools(),
		"worker":    ts.WorkerTools(),
		// goals (the goal decomposer) binds set_goals + set_constraints by default: it
		// uses them to write the decomposed goals and extracted operation constraints
		// into the store. Shares the same managed tools with mainagent; the web UI can
		// edit description/schema and check them per agent.
		"goals": {ts.setGoals(), ts.setConstraints()},
		// auto binds the finding-reporting + asset-management tools by default; other
		// domain tools can be checked on demand in the UI.
		// New databases are seeded from here; old databases are migrated by seedAutoDefaultBindings.
		"auto": {ts.addFinding(), ts.insertAssets(), ts.addCompanyScope(), ts.listAssets(), ts.listCompanies()},
		// pentest (solo pentest agent) binds by default: list assets / insert assets /
		// report finding / list findings / list companies.
		// New databases are seeded from here; old databases are migrated by seedPentestDefaultBindings.
		"pentest": {ts.listAssets(), ts.insertAssets(), ts.addFinding(), ts.listFindings(), ts.listCompanies(), ts.saveTaskCredential(), ts.listTaskCredentials()},
	}
}

// defaultUnbound: these system tools still enter the catalog (visible in the web
// UI, manually checkable per agent), but are [bound to no agent] by default —
// ToolResolve drops tools with empty bindings for all agents; they need explicit
// opt-in. They still stay in some agent's base tool set (e.g. goal_met in
// PlannerTools): first so the seed can construct them to obtain desc/schema, second
// so that after the user manually binds them back, ToolResolve can keep them at
// runtime because the base set has them.
//
// goal_met: bypasses per-goal prove_goal and directly declares [the whole task
// complete] from the global level — heavyweight with misjudgment risk, and
// redundant with "prove_goal marks the last goal → automatic completion", so it is
// given to no agent by default; bind it manually when needed.
var defaultUnbound = map[string]bool{"goal_met": true}

// BuiltinToolSeeds dedupes and merges each agent's built-in tool set into the seed
// list: tools with the same name (e.g. list_assets, which several agents have)
// merge into one record, with Agents as the union; tools in defaultUnbound are
// force-bound to empty.
func BuiltinToolSeeds() []ToolSeed {
	byAgent := builtinToolsByAgent()
	order := []string{"mainagent", "goals", "planner", "worker", "auto", "pentest"}

	type acc struct {
		tool   actool.CoreTool
		agents []string
	}
	m := map[string]*acc{}
	var keys []string
	for _, ak := range order {
		for _, t := range byAgent[ak] {
			a, ok := m[t.Name()]
			if !ok {
				a = &acc{tool: t}
				m[t.Name()] = a
				keys = append(keys, t.Name())
			}
			a.agents = append(a.agents, ak)
		}
	}

	out := make([]ToolSeed, 0, len(keys))
	for _, k := range keys {
		a := m[k]
		agents := a.agents
		if defaultUnbound[k] {
			agents = []string{} // enters the catalog, manually bindable, but given to no agent by default (stored as [] rather than null, consistent with other tools)
		}
		out = append(out, ToolSeed{
			Key:    k,
			Desc:   a.tool.Description(),
			Schema: a.tool.InputSchema(),
			Agents: agents,
		})
	}
	return out
}

// ToolResolveFunc is the ToolResolve hook. If set, it post-processes an agent's
// fully-assembled tool list against
// the DB tools table: it drops tools not bound to this agent (or globally disabled)
// and wraps the rest so the model sees the DB-overridden description/schema and
// default inputs get injected. Tools with no matching DB row (MCP/skill/host tools
// like traffic) pass through untouched. nil = tools unchanged. Wired in
// server/assembly.go.
type ToolResolveFunc func(ctx context.Context, agentKey string, tools []actool.CoreTool) []actool.CoreTool

// Guarded like toolAugment: wiring can run while tasks assemble tools.
var (
	toolResolveMu sync.RWMutex
	toolResolve   ToolResolveFunc
)

// SetToolResolve installs (or, with nil, removes) the ToolResolve hook.
func SetToolResolve(f ToolResolveFunc) {
	toolResolveMu.Lock()
	toolResolve = f
	toolResolveMu.Unlock()
}

// ToolResolve returns the current ToolResolve hook, or nil when none is set.
func ToolResolve() ToolResolveFunc {
	toolResolveMu.RLock()
	defer toolResolveMu.RUnlock()
	return toolResolve
}

// DecorateTool wraps t so Description()/InputSchema() report the DB overrides and
// Call() injects scalar parameter defaults (from schema's "default" props) whenever
// the model omitted them. Name/Prompt/permission/scheduler flags delegate to t, so
// the tool's identity and handler are unchanged. Empty desc/schema fall back to t's.
func DecorateTool(t actool.CoreTool, desc string, schema map[string]any) actool.CoreTool {
	if desc == "" {
		desc = t.Description()
	}
	if len(schema) == 0 {
		schema = t.InputSchema()
	}
	if t.Name() == "record_fact" {
		schema = RepairRecordFactSchema(schema)
	}
	return &overriddenTool{CoreTool: t, desc: desc, schema: schema}
}

// overriddenTool is a CoreTool decorator: it embeds the original (so all behavioral
// methods — Prompt/IsReadOnly/IsConcurrencySafe/CheckPermissions/Name — delegate)
// and overrides only the model-facing description/schema plus default injection.
type overriddenTool struct {
	actool.CoreTool
	desc   string
	schema map[string]any
}

func (o *overriddenTool) Description() string         { return o.desc }
func (o *overriddenTool) InputSchema() map[string]any { return o.schema }

// AcceptsRawInput forwards the wrapped tool's opt-out of the harness schema
// check (record_fact validates its own input); the embedded interface alone
// would hide it from the harness's type assertion.
func (o *overriddenTool) AcceptsRawInput() bool {
	r, ok := o.CoreTool.(interface{ AcceptsRawInput() bool })
	return ok && r.AcceptsRawInput()
}

func (o *overriddenTool) Call(ctx context.Context, in json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
	return o.CoreTool.Call(ctx, injectDefaults(in, o.schema), tc)
}

// injectDefaults fills scalar parameter defaults declared in the (possibly edited)
// schema into the input JSON whenever the model omitted the field or left it empty/
// null. Structure (names/types/required) is untouched — only default values are
// merged in.
func injectDefaults(in json.RawMessage, schema map[string]any) json.RawMessage {
	defs := scalarDefaults(schema)
	if len(defs) == 0 {
		return in
	}
	m := map[string]json.RawMessage{}
	if len(in) > 0 {
		if err := json.Unmarshal(in, &m); err != nil {
			return in // non-object input: don't touch it
		}
	}
	changed := false
	for k, dv := range defs {
		if cur, ok := m[k]; !ok || isEmptyJSON(cur) {
			m[k] = dv
			changed = true
		}
	}
	if !changed {
		return in
	}
	b, err := json.Marshal(m)
	if err != nil {
		return in
	}
	return b
}

// scalarDefaults extracts properties[k]["default"] for scalar params (string/
// integer/number/boolean). Array/object defaults are skipped: merging them is
// ambiguous and not worth the surprise.
func scalarDefaults(schema map[string]any) map[string]json.RawMessage {
	props, _ := schema["properties"].(map[string]any)
	if len(props) == 0 {
		return nil
	}
	out := map[string]json.RawMessage{}
	for name, raw := range props {
		p, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		dv, ok := p["default"]
		if !ok || dv == nil {
			continue
		}
		switch p["type"] {
		case "string", "integer", "number", "boolean":
			if b, err := json.Marshal(dv); err == nil {
				out[name] = b
			}
		}
	}
	return out
}

func isEmptyJSON(raw json.RawMessage) bool {
	s := string(raw)
	return s == "null" || s == `""`
}
