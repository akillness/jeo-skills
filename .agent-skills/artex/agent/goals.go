package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/llm"
	acperm "github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
	"github.com/Autumn-27/norma/transcript"
)

// goalsDefaultTmpl is the built-in EDITABLE body (section [A]) of the goals-decomposer
// prompt, seeded into agent_prompts. No template vars are used today.
const goalsDefaultTmpl = `You are a penetration-testing goal decomposer. Your job is to identify the **final results to achieve** from the user's input, not to plan attack steps.

**Step one (before decomposing goals): extract operation constraints**
From the "task goal / task description", identify the operator's explicit rules about [what may and may not be done], and register them one by one via set_constraints (if the description and goal involve no operation constraints, skip constraint extraction):
- type=deny: forbidden operations (e.g. "no port scanning", "no write/delete operations on production", "no brute forcing", "do not touch a certain subdomain").
- type=allow: explicitly allowed/bounded operation scope (e.g. "passive recon only", "only against a certain domain").
- A constraint is neither a goal nor an attack step: it is a rule about the boundaries of operational behavior.
- **Constraints must be [self-contained, with concrete targets written in]**: replace **deictic words** like "current target/current port/current IP/current domain/this site" with the **concrete values** from the task goal/description. Constraints are injected separately into the execution-phase prompts; out of context, deictic words cannot be resolved.
  Example: if the goal is https://abc.example.net → write "only test abc.example.net", not "only test the current target"; "only test port 443 of the target, do not scan other ports", not "only test the current port". If the original text only says "current target" but the target address is clear, fill the address in.
- **Only register constraints [explicitly written or emphasized] in the goal/description — never invent any**; when unsure of the type, use deny (more conservative).
- If the goal/description truly contains no operation constraints, do **not** call set_constraints.
After registering constraints (if any), proceed to goal decomposition below.

**A goal = a final deliverable / verifiable result**

**What is NOT a goal (forbidden as sub-goals)**:
- Information gathering, reconnaissance, endpoint scanning
- Vulnerability analysis and verification processes
- Attack steps, exploitation means
- Result verification steps

**Decomposition principles**:
- The user's described final goal is single → output one
- Multiple **mutually independent** final deliverables → list them separately
- Annotate vulnclass when it maps to a clear vulnerability class; leave empty for information-gathering / business-logic goals
- Never invent goals the user did not mention

Call set_goals to submit the results.`

// goalsScopeTail is the code-owned tail appended after the editable goals body
// WHEN an asset store + task context are available. It teaches the decomposer to
// also lift the explicit asset scope out of the goal/description and register it
// via add_task_scope. Kept in code (not the DB-editable body) so it always applies
// on released DBs and can't be edited away — same pattern as the trafficTool tail.
const goalsScopeTail = `

**Extra duty: register the test asset scope**
Besides decomposing goals, you must also identify the **explicitly stated test asset scope** from the "task goal / task description" and register it via add_task_scope (this task's ` + taskScopeLabel + `: the denominator of asset test coverage, and the root under which auto-added hosts count). **Minimal-scope principle: register only the one target the user explicitly named — never enlarge it on your own.**
- The goal is a URL or a host-bearing address (e.g. https://xxx.example.com/path, app.example.com) → take its **full hostname**, kind=subdomain, value=full hostname.
  Example: goal https://a1b2c3.lab.example.net/path → kind=subdomain, value=a1b2c3.lab.example.net (**not** example.net).
  **Never** shrink a subdomain-bearing hostname to its root domain — registering all of example.com upon seeing xxx.example.com expands the scope beyond the user's target, violating the minimal-scope principle.
- Only when the user gives a **bare root domain with no subdomain** (e.g. simply example.com), or explicitly says "the whole site / all subdomains / the entire domain" → use kind=root_domain, value=example.com.
- A bare IP or network range → kind=ip / cidr, value=IP or CIDR.
- Do **not** register a company scope (company) — the task has just been created and the asset system usually has no such company yet, so registration would fail; company-level scope is handled in the later plan phase.
Other rules:
- Only register scope **explicitly written in the goal/description**; never invent or infer unmentioned domains/IPs.
- In reason, briefly state which sentence the entry is based on, for auditing.
- If the goal/description contains no explicit asset scope, do **not** call add_task_scope.
Register the scope via add_task_scope first (if any), then call set_goals to submit the goals.`

// GoalSpec is one decomposed objective.
type GoalSpec struct {
	Text      string `json:"text"`
	VulnClass string `json:"vulnclass,omitempty"`
}

// DecomposeGoals asks the LLM to break a pentest task goal into discrete,
// independently-verifiable objectives (each becomes a goal node). Returns nil if
// no provider is configured or the call yields nothing — the caller then falls
// back to a rule-based split so goal nodes always exist.
//
// prov is supplied by the caller (rather than built here from a Config) so goal
// decomposition rides the SAME provider instance as the rest of the engine — it
// shares the rate limiter, gets recorded by llmrec, and participates in LLM
// failover instead of quietly bypassing all three.
//
// desc is the task's free-text description (background: target scope / flag count / engagement notes, etc.).
// It is fed alongside the goal so the decomposer no longer splits blind — the
// prompt still forbids inventing anything the two texts don't state.
//
// emit, when non-nil, receives every LLM step (thinking/tool_use/result) with
// Worker="planner" so the round-0 goal-decomposition activity is visible in the UI.
//
// as + taskID, when non-nil/positive, wire the add_task_scope tool so the
// decomposer can register the explicit asset scope it extracts from the goal.
//
// ts is the task's exploration store: set_goals writes the decomposed goal nodes
// straight into it (the same managed tool the main agent uses to add goals at
// runtime). The returned specs are read back from the store so callers can emit
// per-goal activity and detect the "LLM produced nothing" case for their fallback.
func DecomposeGoals(ctx context.Context, prov llm.Provider, dataDir, goalText, desc string, as *db.AssetStore, ts *db.ExplorationStore, taskID int64, emit func(db.Activity)) []GoalSpec {
	if prov == nil {
		return nil
	}
	return DecomposeGoalsWithProvider(ctx, prov, dataDir, goalText, desc, as, ts, taskID, false, 0, emit)
}

// DecomposeGoalsWithProvider is the task-runtime variant used when a task has an
// ordered provider chain. It preserves the same tools and write behavior while
// letting the caller own provider selection/failover. maxTokens is the profile's
// per-reply output cap (0 = send none).
func DecomposeGoalsWithProvider(ctx context.Context, prov llm.Provider, dataDir, goalText, desc string, as *db.AssetStore, ts *db.ExplorationStore, taskID int64, nonStreaming bool, maxTokens int, emit func(db.Activity)) []GoalSpec {
	if prov == nil {
		return nil
	}
	// Goal decomposition is a one-shot call: it does not attach a transcript store, so
	// agentcore does not put a session id on the ctx (it only does when there is a
	// writer, see agentcore.Prompt). Gateways that do prompt caching / sticky routing by
	// session-id header (opencode zen returns 400 MissingSessionID when
	// x-opencode-session is missing) read exactly this value on the ctx — without
	// attaching one you get "conversations fine, decomposition 400". Attach a stable id
	// explicitly: decomposition requests of the same exploration share it (good for
	// cache hits), the naming does not collide with planner/worker, and
	// llmrec.parseSession can attribute it correctly.
	if ts != nil {
		ctx = transcript.WithSessionID(ctx, fmt.Sprintf("exp%d-goals", ts.ID()))
	}
	// worker="goals" tags the goal nodes' provenance; ts/taskID let set_goals link
	// each goal under the task root. This is the catalog's real set_goals tool, so a
	// web-edited description/schema on it applies here too.
	tsx := &ToolSet{as: as, ts: ts, taskID: taskID, worker: "goals"}
	// Description rides in the user message (same channel as the goal), NOT via the
	// {{.EngagementDescription}} template var — else a prompt that references the var
	// would inject the description twice. System prompt stays pure static instructions.
	sys := renderSystem("goals", goalsDefaultTmpl, GoalsVars{DataDir: dataDir, Now: nowStr()})
	// set_constraints is always available (it does not depend on the asset store): the body
	// already contains the "extract operation constraints before decomposing goals" step
	// (wording editable on the agent edit page); here we only need to wire the tool.
	tools := []actool.CoreTool{tsx.setGoals(), tsx.setConstraints()}
	// Wire add_task_scope only when we have a real asset store + task to write to.
	// The scope-extraction tail is appended in lockstep so the prompt never asks for
	// a tool that isn't present.
	if as != nil && taskID > 0 {
		tools = append(tools, tsx.addTaskScope())
		sys += goalsScopeTail
	}
	userMsg := "Task goal:\n" + goalText
	if d := strings.TrimSpace(desc); d != "" {
		userMsg += "\n\nTask description (background information, may include target scope / flag count / engagement notes; for reference only — do not invent anything it does not mention):\n" + d
	}
	// Use captureRun so every LLM step is emitted as an activity record (visible in
	// the plan tab under the round-0 marker). Falls back gracefully when emit is nil.
	captureEmit := func(r db.Activity) {
		if emit != nil {
			r.Worker = "planner"
			emit(r)
		}
	}
	captureRun(ctx, agentcore.Options{
		Provider:               prov,
		SystemPrompt:           []string{sys},
		Tools:                  tools,
		PermissionMode:         acperm.ModeBypass,
		DisableBackgroundTasks: true,
		// 3 steps (extract constraints → register scope → decompose goals) each need one tool call; give enough turns so set_goals is not missed before wrap-up.
		MaxTurns:     8,
		NonStreaming: nonStreaming, // when this profile selects non-streaming, use Provider.Complete
		MaxTokens:    maxTokens,    // 0 = send no cap, the server's default decides
	}, userMsg, captureEmit)
	// set_goals persisted the goals directly; read them back so the caller sees what
	// was written (empty slice ⇒ the LLM produced nothing ⇒ caller falls back).
	if ts == nil {
		return nil
	}
	nodes, _ := ts.ListByKind(db.KindGoal, 10000)
	var out []GoalSpec
	for _, n := range nodes {
		var p struct {
			Text      string `json:"text"`
			VulnClass string `json:"vulnclass"`
		}
		_ = json.Unmarshal(n.Payload, &p)
		if strings.TrimSpace(p.Text) != "" {
			out = append(out, GoalSpec{Text: p.Text, VulnClass: p.VulnClass})
		}
	}
	return out
}
