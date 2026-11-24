package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
)

// jsonResult marshals v to a JSON tool result.
func jsonResult(v any) (actool.Result, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return actool.Errorf(err.Error()), nil
	}
	return actool.Text(string(b)), nil
}

// This file implements the P2 "cross-task orchestration tool set" (docs/benchmark-orchestration §2 P2). These are host tools — they need
// access to the Manager (any task's Store), the Engine (pause), and the task-creation flow, so they live in the server layer.
// Read tools redirect "the existing per-task tools" to run against the target task's store (build a temporary ToolSet
// and Call its corresponding tool), reusing exactly the same logic; control tools (spawn/pause) call Manager/Engine directly.
// Like the traffic tools, they are seeded into the tools table and bound per agent (visible only to agents they are bound to).

// hostTools is the runtime host-tool provider fed to ToolAugment: traffic tools
// (gated by capture) + cross-task orchestration tools + user-defined custom tools.
// The second return is the names of custom tools flagged `deferred` (schema
// withheld, routed via SearchExtraTools/ExecuteExtraTool). Per-agent binding still
// decides who actually sees any of them.
//
//nolint:unused // used as the hostTools provider in wireAgentAugment
func (s *Server) hostTools() ([]actool.CoreTool, map[string][]string) {
	tools := append(s.m.HostTools(), s.orchestrationTools()...)
	tools = append(tools, s.findingRetestTools()...)
	tools = append(tools, s.platformTools()...) // platform operation tools (create/edit skills/tools/MCP, for Auto)
	custom, err := s.customTools()
	if err != nil {
		log.Printf("[custom-tool] load failed: %v", err)
		return tools, nil
	}
	tools = append(tools, custom...)
	// deferred custom tools → name -> its bound agent keys. ToolAugment turns a
	// name into a deferred entry only for agents it's actually bound to (so we don't
	// advertise a tool the per-agent binding will drop from the callable set).
	deferred := map[string][]string{}
	rows, _ := s.m.pg.ListCustomTools()
	for _, t := range rows {
		if t.Deferred && t.Enabled {
			deferred[t.Key] = t.Agents
		}
	}
	return tools, deferred
}

// orchestrationTools returns the cross-task tool set. Bound per-agent via the
// tools table (default: no binding — opt-in for orchestration agents).
func (s *Server) orchestrationTools() []actool.CoreTool {
	return []actool.CoreTool{
		s.toolListTasks(),
		s.toolListLLMProfiles(),
		s.toolSpawnTask(),
		s.toolPauseTask(),
		s.toolGetTaskGraph(),
		s.toolListTaskFindings(),
		s.toolAddHint(),
		s.toolGetWorkerTrace(),
		s.toolListWorkerTraces(),
		s.toolSearchWorkerTraces(),
		s.toolGetTaskNodeDetail(),
		s.toolUpdateFindingReport(),
		s.toolGetFindingTraffic(),
		s.toolBindFindingTraffic(),
	}
}

// --- schema helpers ---

func strParam(desc string) map[string]any {
	return map[string]any{"type": "string", "description": desc}
}

// parseProfileID reads an LLM profile id from a tool arg that may arrive as a JSON
// number (5) or a numeric string ("5"); returns 0 when absent/unparseable.
func parseProfileID(raw json.RawMessage) int64 {
	if len(raw) == 0 {
		return 0
	}
	var n int64
	if json.Unmarshal(raw, &n) == nil {
		return n
	}
	var str string
	if json.Unmarshal(raw, &str) == nil {
		v, _ := strconv.ParseInt(strings.TrimSpace(str), 10, 64)
		return v
	}
	return 0
}

func objSchema(props map[string]any, required ...string) map[string]any {
	m := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		req := make([]any, len(required))
		for i, r := range required {
			req[i] = r
		}
		m["required"] = req
	}
	return m
}

func roTool(name, desc string, schema map[string]any, run func(context.Context, json.RawMessage) (actool.Result, error)) actool.CoreTool {
	return actool.Build(actool.Spec{
		Name: name, Description: desc, Schema: schema,
		ReadOnly:   func(json.RawMessage) bool { return true },
		Concurrent: func(json.RawMessage) bool { return true },
		Permissions: func(context.Context, json.RawMessage, permission.Context) permission.Decision {
			return permission.Allowed()
		},
		Run: func(ctx context.Context, in json.RawMessage, _ *actool.ToolContext) (actool.Result, error) {
			return run(ctx, in)
		},
	})
}

func wrTool(name, desc string, schema map[string]any, run func(context.Context, json.RawMessage) (actool.Result, error)) actool.CoreTool {
	return actool.Build(actool.Spec{
		Name: name, Description: desc, Schema: schema,
		Permissions: func(context.Context, json.RawMessage, permission.Context) permission.Decision {
			return permission.Allowed()
		},
		Run: func(ctx context.Context, in json.RawMessage, _ *actool.ToolContext) (actool.Result, error) {
			return run(ctx, in)
		},
	})
}

// delegateToTask resolves the `task_id` in the input, builds a ToolSet bound to
// that task's store, strips task_id, and calls the chosen per-task tool — so the
// cross-task read reuses the exact in-task logic against another task.
func (s *Server) delegateToTask(ctx context.Context, in json.RawMessage, pick func(*agent.ToolSet) actool.CoreTool) (actool.Result, error) {
	var head struct {
		TaskID string `json:"task_id"`
	}
	_ = json.Unmarshal(in, &head)
	if strings.TrimSpace(head.TaskID) == "" {
		return actool.Errorf("task_id is required"), nil
	}
	t, ok := s.m.Task(head.TaskID)
	if !ok {
		return actool.Errorf("task not found: " + head.TaskID), nil
	}
	var m map[string]json.RawMessage
	_ = json.Unmarshal(in, &m)
	delete(m, "task_id")
	inner, _ := json.Marshal(m)
	tsx := agent.NewToolSet(t.Store, "orchestrator")
	if s.m.Assets() != nil {
		tsx.SetAssetStore(s.m.Assets(), s.m.Assets().Companies())
	}
	tsx.SetNotify(t.Notify)         // generic wake-up (write ops without a dedicated callback go through it; no-op for read tools)
	tsx.SetNotifyHint(t.NotifyHint) // add_hint → records an "orchestrator added N strategic hints: ..." entry and wakes the planner
	return pick(tsx).Call(ctx, inner, nil)
}

// --- tools ---

func (s *Server) toolListTasks() actool.CoreTool {
	return roTool("list_tasks",
		"List all tasks (id/description/goal/status/run duration/parent task/LLM profile). The orchestration agent uses it to keep the big picture, see which tasks have been stuck too long, and which LLM each task uses. Run duration: running = created→now, terminal = created→last activity (seconds). llm_profile: the profile name used by the task's planner/worker; (active profile) = follows the global active one.",
		objSchema(map[string]any{}),
		func(context.Context, json.RawMessage) (actool.Result, error) {
			lastAct, _ := s.m.PG().LastActivityAll()
			// id -> name to resolve each task's pinned LLM profile.
			profName := map[int64]string{}
			if profs, err := s.m.pg.ListProfiles(); err == nil {
				for _, p := range profs {
					profName[p.ID] = p.Name
				}
			}
			out := make([]map[string]any, 0)
			for _, t := range s.m.List() {
				status := s.deriveTaskStatus(t)
				end := lastAct[t.ExpID]
				if live := s.engine.LastActivity(t.ID); live > end {
					end = live
				}
				dur := int64(0)
				if status == "running" {
					dur = time.Now().Unix() - t.CreatedAt
				} else if end > t.CreatedAt {
					dur = end - t.CreatedAt
				}
				row := map[string]any{"id": t.ID, "description": t.Description, "goal": t.Goal, "status": status, "run_seconds": dur}
				if t.ParentRef != "" {
					row["parent_ref"] = t.ParentRef
				}
				llmState := t.llmStateSnapshot()
				if llmState.ProfileID == nil {
					row["llm_profile"] = "(active profile)"
				} else if n, ok := profName[*llmState.ProfileID]; ok {
					row["llm_profile"] = n
				} else {
					row["llm_profile"] = fmt.Sprintf("#%d(deleted)", *llmState.ProfileID)
				}
				out = append(out, row)
			}
			return jsonResult(out)
		})
}

// toolListLLMProfiles lists the available LLM profiles (name/model/active) so an
// orchestration agent can pick one for spawn_task's llm_profile. Never leaks keys.
func (s *Server) toolListLLMProfiles() actool.CoreTool {
	return roTool("list_llm_profiles",
		"List the available LLM profiles: id, name, model, format, and whether one is the currently active profile. Use the id for spawn_task's llm_profile_id parameter to give a subtask its own LLM (e.g. a cheap model for recon, a strong model for exploitation). Never includes API keys.",
		objSchema(map[string]any{}),
		func(context.Context, json.RawMessage) (actool.Result, error) {
			profs, err := s.m.pg.ListProfiles()
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			out := make([]map[string]any, 0, len(profs))
			for _, p := range profs {
				out = append(out, map[string]any{
					"id": p.ID, "name": p.Name, "model": p.Model, "format": p.Format, "is_active": p.IsDefault,
				})
			}
			return jsonResult(map[string]any{"profiles": out})
		})
}

func (s *Server) toolSpawnTask() actool.CoreTool {
	return wrTool("spawn_task",
		"Create a subtask and start its exploration engine; returns task_id. Use it to spin one piece of work (e.g. a challenge/a goal) off into an independent task. parent_ref is optional: set the parent task id of the current orchestration to link parent and child.",
		objSchema(map[string]any{
			"description":            strParam("task description (short title)"),
			"goal":                   strParam("task goal (what to achieve)"),
			"parent_ref":             strParam("optional: parent task id (for parent-child linking)"),
			"source_task_ids":        map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": fmt.Sprintf("optional: ids of source tasks to inherit read-only (at most %d). The subtask may read the assets/conclusions those tasks already explored as its starting point; unlike parent_ref's plain parent-child pointer, this is content inheritance.", db.MaxTaskSourceCount)},
			"llm_profile_id":         map[string]any{"type": "integer", "description": "optional: the LLM profile id this subtask's planner/worker uses (see list_llm_profiles); empty inherits the parent task, then falls back to the global active profile"},
			"timeout_seconds":        map[string]any{"type": "integer", "description": "optional: task-level timeout (seconds). When it fires, a graceful wrap-up runs and the task enters the timeout terminal state; empty or 0 = no time limit"},
			"plan_heartbeat_seconds": map[string]any{"type": "integer", "description": "optional: planner heartbeat interval (seconds). When this much time has passed since the last planning round ended/the task started with no trigger in between → run one planning round (deadlock backstop + wakes the planner to supervise in-flight workers). Empty or 0 = default 600 (10min);"},
			"seed_first_intent":      map[string]any{"type": "boolean", "description": "optional: enable for simple tasks to issue one seed intent at creation (content = description + goal) so a worker can start testing right away without waiting for the first planner round; default false (the standard plan-then-execute flow)."},
		}, "description", "goal"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				Description          string          `json:"description"`
				Goal                 string          `json:"goal"`
				ParentRef            string          `json:"parent_ref"`
				SourceTaskIDs        []string        `json:"source_task_ids"`
				LLMProfileID         json.RawMessage `json:"llm_profile_id"`
				TimeoutSeconds       int             `json:"timeout_seconds"`
				PlanHeartbeatSeconds int             `json:"plan_heartbeat_seconds"`
				SeedFirstIntent      bool            `json:"seed_first_intent"`
			}
			_ = json.Unmarshal(in, &a)
			if strings.TrimSpace(a.Description) == "" {
				a.Description = "Unnamed task"
			}
			if strings.TrimSpace(a.Goal) == "" {
				return actool.Errorf("goal is required"), nil
			}
			if a.TimeoutSeconds < 0 {
				a.TimeoutSeconds = 0
			}
			// Read-only source-task inheritance: count cap + each id valid/deduped/existing, the same validation rules as HTTP task creation.
			if len(a.SourceTaskIDs) > db.MaxTaskSourceCount {
				return actool.Errorf(fmt.Sprintf("at most %d source tasks may be selected", db.MaxTaskSourceCount)), nil
			}
			sourceIDs := make([]int64, 0, len(a.SourceTaskIDs))
			seenSources := map[int64]bool{}
			for _, raw := range a.SourceTaskIDs {
				id, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
				if err != nil || id <= 0 || seenSources[id] {
					return actool.Errorf("invalid or duplicate source task id"), nil
				}
				if _, ok := s.m.Task(strconv.FormatInt(id, 10)); !ok {
					return actool.Errorf(fmt.Sprintf("source task #%d not found", id)), nil
				}
				seenSources[id] = true
				sourceIDs = append(sourceIDs, id)
			}
			// LLM profile resolution: explicit id > inherit parent's pin > active(nil).
			var pin *int64
			if id := parseProfileID(a.LLMProfileID); id > 0 {
				if _, ok := s.loadProfileConfig(id); !ok {
					return actool.Errorf(fmt.Sprintf("LLM profile #%d not found or not usable (no API key for the key-requiring formats)", id)), nil
				}
				pin = &id
			} else if a.ParentRef != "" {
				if pt, ok := s.m.Task(a.ParentRef); ok {
					pin = pt.LLMProfileID
				}
			}
			var llmIDs []int64
			if pin != nil {
				llmIDs = []int64{*pin}
			}
			// Target gate: a child spawned from a gated scope is gated too, and keeps
			// the block rules of the calling task. Read from the caller's scope, never
			// from parent_ref (optional and written by the model). Pins and allow rules
			// are never copied. Gate-off caller or no scope: created as before.
			var gate *bool
			var blockRules []db.TaskInterceptRuleInput
			if scope, ok := intercept.TargetScopeFromContext(ctx); ok && scope.Enabled != nil && scope.Enabled() {
				on := true
				gate = &on
				if callerID, err := strconv.ParseInt(scope.TaskID, 10, 64); err == nil && callerID > 0 {
					block, _, err := s.m.Assets().TaskInterceptRulesSplit(callerID)
					if err != nil {
						return actool.Errorf("read the block rules of the calling task: " + err.Error()), nil
					}
					for _, r := range block {
						blockRules = append(blockRules, db.TaskInterceptRuleInput{Enabled: r.Enabled, Action: r.Action, Kind: r.Kind, Pattern: r.Pattern, Note: r.Note})
					}
				}
			}
			t, err := s.m.CreateTaskWithOptions(a.Description, a.Goal, db.TaskCreateOptions{
				SourceTaskIDs:        sourceIDs,
				LLMProfileIDs:        llmIDs,
				TimeoutSeconds:       a.TimeoutSeconds,
				PlanHeartbeatSeconds: a.PlanHeartbeatSeconds,
				InterceptRules:       blockRules,
				TargetGate:           gate,
			})
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if a.ParentRef != "" {
				t.ParentRef = a.ParentRef
				if id, e := strconv.ParseInt(t.ID, 10, 64); e == nil {
					_ = s.m.PG().SetParentRef(id, a.ParentRef)
				}
			}
			// Shared post-create flow: HTTP task creation (server.go createTask) reuses this same launchTask:
			// seed + a visibly-in-background goal decomposition (round 0 / LLM steps / per-goal) + engine.Run.
			// seed_first_intent defaults to false (the standard plan-then-execute flow); simple tasks may enable it to issue one work test directly.
			s.launchTask(t, a.Description+" "+a.Goal, a.SeedFirstIntent)
			return actool.Text(fmt.Sprintf("task created: %s", t.ID)), nil
		})
}

func (s *Server) toolPauseTask() actool.CoreTool {
	return wrTool("pause_task", "Pause the given task (stops its planner/worker loops).",
		objSchema(map[string]any{"task_id": strParam("the id of the task to pause")}, "task_id"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				TaskID string `json:"task_id"`
			}
			_ = json.Unmarshal(in, &a)
			t, ok := s.m.Task(a.TaskID)
			if !ok {
				return actool.Errorf("task not found: " + a.TaskID), nil
			}
			if _, err := s.applyTaskControlWithCause(t, "pause", agent.AbortPausedByOrchestrator); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return actool.Text("task paused: " + a.TaskID), nil
		})
}

func (s *Server) toolGetTaskGraph() actool.CoreTool {
	return roTool("get_task_graph", "Read the exploration-graph overview of the given task (same as graph_overview: asset counts / frontier / findings / coverage etc.), selecting the task via task_id.",
		objSchema(map[string]any{"task_id": strParam("task id")}, "task_id"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			return s.delegateToTask(ctx, in, (*agent.ToolSet).GraphOverviewTool)
		})
}

func (s *Server) toolListTaskFindings() actool.CoreTool {
	return roTool("list_task_findings", "Read the confirmed vulnerabilities of the given task (with flags/PoCs; each carries id/task_id/intent_id/vulnclass/severity/summary/status), selecting the task via task_id.",
		objSchema(map[string]any{"task_id": strParam("task id")}, "task_id"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			return s.delegateToTask(ctx, in, (*agent.ToolSet).ListFindingsTool)
		})
}

func (s *Server) toolAddHint() actool.CoreTool {
	return wrTool("add_task_hint", "Inject a strategic hint into the given task (that task's planner will read it when generating intents next round).\n"+
		"★Batch first: submit several hints at once in the hints array (returns an ids array, same length and order as hints, failed entries id=0); for a single hint, omit hints and pass the top-level text directly.",
		objSchema(map[string]any{
			"task_id":      strParam("task id"),
			"hints":        map[string]any{"type": "array", "description": "[Prefer this] Array of hints; each element has the same fields as the top level (text/asset_ids/traffic_refs).", "items": objSchema(map[string]any{"text": strParam("hint text"), "asset_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}}, "traffic_refs": agent.HintTrafficSchema()})},
			"text":         strParam("[single] hint text"),
			"traffic_refs": agent.HintTrafficSchema(),
			"asset_ids":    map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "anchored asset ids (optional, 0/1/many; asset ids within that task)"},
		}, "task_id"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			return s.delegateToTask(ctx, in, (*agent.ToolSet).AddHintTool)
		})
}

func (s *Server) toolGetWorkerTrace() actool.CoreTool {
	return roTool("get_task_worker_trace",
		"View how one work (intent) in the given task ran: get_task_worker_trace(task_id, intent_id) shows step summaries; then pass step_ids=[...] to fetch the full content of those steps (at most 5 per call; passing more returns only the first 5).",
		objSchema(map[string]any{
			"task_id":   strParam("task id"),
			"intent_id": map[string]any{"type": "integer", "description": "intent id (the work within that task)"},
			"step_ids":  map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "optional: step ids to fetch full content for (at most 5 per call; passing more returns only the first 5, the rest are listed in omitted_step_ids)"},
		}, "task_id", "intent_id"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			return s.delegateToTask(ctx, in, (*agent.ToolSet).GetWorkerTraceTool)
		})
}

func (s *Server) toolListWorkerTraces() actool.CoreTool {
	return roTool("list_task_worker_traces", "List which works (intents) have run in the given task + each one's step count, to find which works are worth reviewing (then use get_task_worker_trace).",
		objSchema(map[string]any{"task_id": strParam("task id")}, "task_id"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			return s.delegateToTask(ctx, in, (*agent.ToolSet).ListWorkerTracesTool)
		})
}

func (s *Server) toolSearchWorkerTraces() actool.CoreTool {
	return roTool("search_task_worker_traces", "Search the execution traces of all works in the given task by keyword (returns matching step summaries + intent_id).",
		objSchema(map[string]any{"task_id": strParam("task id"), "q": strParam("search keyword")}, "task_id", "q"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			return s.delegateToTask(ctx, in, (*agent.ToolSet).SearchWorkerTracesTool)
		})
}

func (s *Server) toolGetTaskNodeDetail() actool.CoreTool {
	return roTool("get_task_node_detail",
		"Read the full content of one exploration-graph node in the given task (finding/fact/intent/goal: summary + details/evidence/PoC). id is the exploration node id (e.g. as returned by report_finding, or the id in list_task_findings). Use it to fetch a vulnerability's full evidence before writing its report.",
		objSchema(map[string]any{
			"task_id": strParam("task id"),
			"id":      map[string]any{"type": "integer", "description": "exploration-graph node id (not an asset id)"},
		}, "task_id", "id"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			return s.delegateToTask(ctx, in, (*agent.ToolSet).NodeDetailTool)
		})
}

// toolUpdateFindingReport writes/overwrites a finding's detailed Markdown report.
// finding_id is the id report_finding returned ("finding recorded: <id>", the
// finding node id). The write (SetFindingReportByNodeID) is keyed by node_id and
// task-agnostic, so this host tool needs no task_id / exploration store.
func (s *Server) toolUpdateFindingReport() actool.CoreTool {
	return wrTool("update_finding_report",
		"Write/update the [detailed report] of a registered vulnerability (full Markdown text, replaces the old content wholesale). Pass as finding_id the id report_finding returned (the number in \"finding recorded: <id>\"). A report should cover: vulnerability overview, impact and harm, reproduction steps, evidence/PoC, and fix recommendations.",
		objSchema(map[string]any{
			"finding_id":       map[string]any{"type": "integer", "description": "target vulnerability id (the id returned by report_finding)"},
			"report":           strParam("full report text, Markdown format"),
			"evidence_version": map[string]any{"type": "integer", "description": "evidence version returned by get_finding_traffic; prevents the report from overwriting newer evidence changes"},
			"poe_level":        map[string]any{"type": "integer", "description": "proof-of-exploitation level 0-4: 1 error/timing/response variation, 2 structural manipulation, 3 actual data extracted, 4 critical impact. L3 is the minimum for verified. Omit or 0 when not proven."},
			"evidence_quotes":  map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "exact lines copied from a bound proof/verification response body (get_finding_traffic). Never from memory; the server checks each one verbatim after whitespace normalization."},
		}, "finding_id", "report"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				EvidenceVersion *int64          `json:"evidence_version"`
				FindingID       json.RawMessage `json:"finding_id"`
				Report          string          `json:"report"`
				PoELevel        *int            `json:"poe_level"`
				EvidenceQuotes  []string        `json:"evidence_quotes"`
			}
			_ = json.Unmarshal(in, &a)
			nodeID := parseProfileID(a.FindingID) // reuses the "number or numeric string" parser
			if nodeID <= 0 {
				return actool.Errorf("invalid finding_id"), nil
			}
			poe := 0
			if a.PoELevel != nil {
				poe = *a.PoELevel
			}
			if poe < 0 || poe > 4 {
				return actool.Errorf(fmt.Sprintf("invalid poe_level %d (want 0-4)", poe)), nil
			}
			notFound := actool.Errorf(fmt.Sprintf("no vulnerability record found for finding_id=%d (register it with report_finding first)", nodeID))
			findingID, err := s.m.pg.FindingIDByNodeID(nodeID)
			if errors.Is(err, sql.ErrNoRows) {
				return notFound, nil
			}
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			n, err := s.m.pg.SetFindingReportVersionByNodeID(ctx, nodeID, a.Report, a.EvidenceVersion)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if n == 0 {
				return notFound, nil
			}
			// The report is saved above; verification only decides the status. A
			// downgrade is recorded and reported, never used to drop the report.
			status, note := s.assessFindingVerification(ctx, findingID, poe, a.EvidenceQuotes)
			if err := s.m.pg.SetFindingVerification(findingID, status, poe, note); err != nil {
				return actool.Errorf("report saved, but verification not recorded: " + err.Error()), nil
			}
			msg := fmt.Sprintf("finding %d report updated (%d chars)\nverification: %s", nodeID, len(a.Report), status)
			if status == db.VerificationVerified {
				msg += fmt.Sprintf(" (POE L%d)", poe)
			} else {
				msg += " - " + note + "\nwarning: the report is saved but the finding is not verified. To reach verified, declare poe_level 3 or 4 and pass exact quotes copied from a bound proof/verification response body."
			}
			return actool.Text(msg), nil
		})
}

// deriveTaskStatus mirrors listTasks' status derivation for the list_tasks tool.
func (s *Server) deriveTaskStatus(t *Task) string {
	lifecycle := t.lifecycleSnapshot()
	switch {
	case isTerminalStatus(lifecycle.Status):
		return lifecycle.Status
	case lifecycle.Paused || s.engine.IsPaused(t.ID):
		return "paused"
	case s.engine.ReadyFor(t) && s.engine.Started(t.ID):
		return "running"
	}
	return "created"
}

// orchestrationToolSeeds seeds the cross-task tools into the tools table so they
// are bindable per-agent (default: bound to nobody — opt-in for orchestration
// agents). First-insert only, like the traffic seeds.
func (s *Server) seedOrchestrationTools() {
	// task-op + platform tools default-bind to the built-in Auto agent (it exists to
	// operate the platform). SeedTool takes effect on first insert; rows already seeded in old DBs get the binding backfilled by seedAutoDefaultBindings.
	autoAgents, _ := json.Marshal([]string{"auto"})
	for _, t := range s.orchestrationTools() {
		schema, _ := json.Marshal(t.InputSchema())
		bindings := autoAgents
		if t.Name() == "bind_finding_traffic" {
			bindings = json.RawMessage(`["reporter"]`)
		}
		_ = s.m.PG().SeedTool(t.Name(), t.Description(), schema, bindings)
	}
	for _, t := range s.platformTools() {
		schema, _ := json.Marshal(t.InputSchema())
		bindings := autoAgents
		if t.Name() == "mcp_status" {
			// health visibility is for the executors too, not just the platform agent
			bindings = json.RawMessage(`["auto","worker","pentest"]`)
		}
		if t.Name() == "ask_operator" {
			// operator input requests are an executor concern (captcha/OTP walls)
			bindings = json.RawMessage(`["worker","pentest"]`)
		}
		_ = s.m.PG().SeedTool(t.Name(), t.Description(), schema, bindings)
	}
	s.refreshBuiltinToolSchemas()
	s.seedAutoDefaultBindings()
	s.seedPlannerDefaultBindings()
	s.seedPlannerListAssetsBinding()
	s.seedCompanyScopeRebind()
	s.seedWorkerReadToolsUnbind()  // list_facts/list_companies/list_worker_traces unbound from worker's defaults (one-time)
	s.seedWorkerReadbackRebind()   // repairs an old migration's wrong removal: re-binds search_all_worker_traces/get_worker_trace/node_detail back onto worker (one-time)
	s.seedTaskCredentialBindings() // save/list_task_credential onto worker + pentest (one-time, #3)
	s.healListTaskCredentialsSchema()
	s.seedAutoReportFindingBinding()
	s.unbindGoalMetDefault()
	s.reseedGoalsPrompt()             // goals prompt gains the "extract operation constraints" step → old DBs append a new default version (one-time)
	s.reseedMainAgentPrompt()         // mainagent prompt gains "after goals are met, ask via add_intent whether to register a goal" (one-time)
	s.reseedPlannerPrompt()           // planner prompt: rewrites the "zero intents" justification rules + adds quantitative acceptance checks (one-time)
	s.reseedWorkerPrompt()            // worker prompt: adds the evidence bar for negative conclusions (one-time)
	s.seedReporterAgent()             // seeds the "report writer" agent + tool bindings + finding trigger (one-time)
	s.upgradeReporterTriggerMessage() // backfill migration for old DBs: makes the reporter send evidence_version back (one-time)
	s.seedFindingTrafficTools()       // adds optional evidence params and read-only evidence tools, preserving user config
	s.seedFindingWorkflowTools()
	s.seedFindingVerificationSchema() // S1: poe_level / evidence_quotes on update_finding_report, added once per DB
	s.seedFindingEvidenceSchema()     // optional counterevidence / confidence_rationale on report_finding, added once per DB
	s.seedFactInputSchema()           // restore record_fact single/batch contracts
	s.seedFactSourceSchema()          // source enum on record_fact, added once per DB
	s.refreshRecordFactContract()     // record_fact publishes the facts-only contract (one-time)
	s.seedTaskScopeDescription()      // add_task_scope: "coverage scope, not enforced" replaces the authorization-boundary text
	// Note: pentest's default tool bindings need no migration — BuiltinToolSeeds already seeds
	// list_assets/insert_assets/report_finding/list_findings/list_companies together with
	// pentest at fresh initialization (no old DBs exist in this project, so no migration).
}

// seedFactSourceSchema adds the source property (closed enum) to the record_fact
// schema of existing databases (SeedTool is first-insert only, and ToolResolve
// serves the stored schema, so without this the model would never see the enum).
// Idempotent: the property is added only when the stored schema lacks it, and user
// edits are preserved.
func (s *Server) seedFactSourceSchema() {
	for _, seed := range agent.BuiltinToolSeeds() {
		if seed.Key != "record_fact" {
			continue
		}
		raw, err := json.Marshal(seed.Schema)
		if err != nil {
			log.Printf("[facts] record_fact schema: %v", err)
			return
		}
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(raw, &obj); err != nil {
			return
		}
		var properties map[string]json.RawMessage
		if err := json.Unmarshal(obj["properties"], &properties); err != nil {
			return
		}
		// The source enum lives on the facts[] items (facts-only contract); the
		// top level has no fact fields any more.
		var facts map[string]json.RawMessage
		var items map[string]json.RawMessage
		var itemProps map[string]json.RawMessage
		if err := json.Unmarshal(properties["facts"], &facts); err != nil {
			return
		}
		if err := json.Unmarshal(facts["items"], &items); err != nil {
			return
		}
		if err := json.Unmarshal(items["properties"], &itemProps); err != nil || len(itemProps["source"]) == 0 {
			return
		}
		_, err = s.m.pg.Exec(`UPDATE tools SET schema=jsonb_set(schema,ARRAY['properties','facts','items','properties','source'],$1::jsonb,true),updated_at=now()
WHERE key='record_fact' AND system AND (schema->'properties'->'facts'->'items') ? 'properties'
  AND NOT(COALESCE(schema->'properties'->'facts'->'items'->'properties','{}'::jsonb) ? 'source')`, string(itemProps["source"]))
		if err != nil {
			log.Printf("[facts] upgrade record_fact.source: %v", err)
		}
		return
	}
}

// oldTaskScopeDescription is the add_task_scope description as seeded up to commit
// 0dc8bdf, which called task_scope the task's authorization boundary. Kept verbatim:
// seedTaskScopeDescription replaces only a row that still holds exactly this text.
const oldTaskScopeDescription = "Add test scope to [this task] — this is the task's authorization boundary, and also the denominator of asset test coverage.\n" +
	"Supported kinds: company (all assets under the company) / root_domain (a whole root domain, including all subdomains) / subdomain (a single precise subdomain) / ip / cidr / icp / keyword.\n" +
	"Note: hosts a worker touches one by one are [automatically] added to the scope by the system (precise subdomains); this tool is for [deliberate widening] — pulling in a whole root domain / whole company, or adding a specific subdomain/IP.\n" +
	"value: for company pass the company name or id (the company must already exist); for root_domain/subdomain pass a domain; for ip/cidr pass an IP or range; for icp/keyword pass an ICP number or company keyword.\n" +
	"Always give reason explaining the basis (auditable). Use the entries array for multiple entries."

// seedTaskScopeDescription brings the add_task_scope description of existing
// databases to the code text (SeedTool is first-insert only, and ToolResolve serves
// the stored description, so without this the model would keep reading
// "authorization boundary"). Idempotent: only a system row still holding the old
// seeded text is replaced; an absent row or an operator-edited text is left alone.
func (s *Server) seedTaskScopeDescription() {
	for _, seed := range agent.BuiltinToolSeeds() {
		if seed.Key != "add_task_scope" {
			continue
		}
		_, err := s.m.pg.Exec(`UPDATE tools SET description=$1,updated_at=now()
WHERE key='add_task_scope' AND system AND description=$2`, seed.Desc, oldTaskScopeDescription)
		if err != nil {
			log.Printf("[tools] upgrade add_task_scope description: %v", err)
		}
		return
	}
}

// refreshBuiltinToolSchemas propagates code schema/description changes on the
// orchestration + platform tools into already-seeded rows ONCE per version flag —
// SeedTool is first-insert-only, so a new param (e.g. spawn_task's llm_profile) never
// reaches an old DB otherwise. Preserves each tool's agent binding + enabled flag.
// Bump the flag whenever these tools' schemas/descriptions change in code.
func (s *Server) refreshBuiltinToolSchemas() {
	const flag = "tool_schema_refresh_v7_list_facts_paging"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	tools := append(s.orchestrationTools(), s.platformTools()...)
	for _, t := range tools {
		schema, _ := json.Marshal(t.InputSchema())
		if err := s.m.pg.RefreshToolDefaults(t.Name(), t.Description(), schema); err != nil {
			log.Printf("[tools] refresh %s schema failed: %v", t.Name(), err)
		}
	}
	// Also refresh some built-in agent tools to the code defaults:
	//   - goal_met: the description seeded in old DBs carries the misleading "end this planning round", making the planner treat it as
	//     a way to "end an empty round" and wrongly declare the whole task done right after start.
	//   - insert_assets: new related param (marks whether the asset relates to the current task and decides whether it counts toward coverage),
	//     SeedTool is first-insert-only, so schemas already seeded in old DBs would otherwise miss this new param.
	//   - list_facts: now paginated with new limit/before/q params; the empty schema already seeded in old DBs would otherwise
	//     show "no parameters" on the tools page, and the model would never see those param descriptions.
	refreshBuiltin := map[string]bool{"goal_met": true, "insert_assets": true, "list_facts": true}
	for _, sd := range agent.BuiltinToolSeeds() {
		if !refreshBuiltin[sd.Key] {
			continue
		}
		schema, _ := json.Marshal(sd.Schema)
		if err := s.m.pg.RefreshToolDefaults(sd.Key, sd.Desc, schema); err != nil {
			log.Printf("[tools] refresh %s desc failed: %v", sd.Key, err)
		}
	}
	_ = s.m.pg.SetSetting(flag, "true")
	log.Printf("[tools] refreshed orchestration/platform tool schemas to code defaults (one-time)")
}

// unbindGoalMetDefault removes goal_met's default "planner" binding ONCE (guarded by
// a settings flag), so existing DBs match the new default of NO agent. goal_met bypasses
// per-goal prove_goal to declare the whole task done — powerful/risky and redundant with
// the prove_goal→auto-complete path — so it ships unbound; users can re-bind it per agent
// in the UI. A user's own binding to another agent is untouched (we only strip planner).
func (s *Server) unbindGoalMetDefault() {
	const flag = "goal_met_unbind_default_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	if err := s.m.pg.RemoveAgentFromTool("planner", "goal_met"); err != nil {
		log.Printf("[tools] failed to unbind goal_met from planner: %v", err)
		return
	}
	_ = s.m.pg.SetSetting(flag, "true")
}

// reseedGoalsPrompt refreshes the goals decomposer's prompt to [the current code default] — the default body gained the step
// "extract operation constraints (set_constraints) before decomposing goals", and SeedPromptIfEmpty is first-insert-only, so old DBs
// with an existing version 1 never got it. Here we use version management to [append a new version] and switch to it (ResetPromptToDefault),
// old versions stay in history, and users who customized can recover from the version record. settings flag guard → done only once;
// bump this flag whenever the default changes again. Fresh DBs need nothing (SeedPromptIfEmpty already seeds the latest default).
func (s *Server) reseedGoalsPrompt() {
	const flag = "goals_prompt_constraint_step_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	defer func() { _ = s.m.pg.SetSetting(flag, "true") }() // attempt only once regardless of outcome
	a, err := s.m.pg.GetAgentByKey("goals")
	if err != nil || a == nil {
		return // fresh DB without agent rows yet: seedPrompts seeds the latest default directly, this migration is unnecessary
	}
	tmpl := agent.BuiltinPromptSeeds()["goals"]
	if tmpl == "" {
		return
	}
	// Fresh DB: seedPrompts already seeded the latest default → the current version equals the code default, no duplicate version needed.
	if cur, err := s.m.pg.CurrentPrompt(a.ID); err == nil && cur == tmpl {
		return
	}
	if _, err := s.m.pg.ResetPromptToDefault(a.ID, tmpl); err != nil {
		log.Printf("[prompts] failed to refresh goals prompt to the new default: %v", err)
		return
	}
	log.Printf("[prompts] goals prompt: appended a new default version (adds the extract-constraints step, one-time)")
}

// reseedMainAgentPrompt refreshes the mainagent prompt to [the current code default] — the default body gained the guidance "after all goals are
// met, when injecting an intent directly via add_intent, ask the human whether to register it as a formal goal", and SeedPromptIfEmpty is first-insert
// only, so versions already in old DBs never got it. Version management [appends a new version] and switches to it (ResetPromptToDefault); old versions stay
// in history, and users who customized can recover from the version record. settings flag guard → done only once. Fresh DBs need nothing
// (SeedPromptIfEmpty already seeds the latest default). Structurally identical to reseedGoalsPrompt.
func (s *Server) reseedMainAgentPrompt() {
	const flag = "mainagent_prompt_goalless_intent_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	defer func() { _ = s.m.pg.SetSetting(flag, "true") }() // attempt only once regardless of outcome
	a, err := s.m.pg.GetAgentByKey("mainagent")
	if err != nil || a == nil {
		return // fresh DB without agent rows yet: seedPrompts seeds the latest default directly, this migration is unnecessary
	}
	tmpl := agent.BuiltinPromptSeeds()["mainagent"]
	if tmpl == "" {
		return
	}
	// Fresh DB: seedPrompts already seeded the latest default → the current version equals the code default, no duplicate version needed.
	if cur, err := s.m.pg.CurrentPrompt(a.ID); err == nil && cur == tmpl {
		return
	}
	if _, err := s.m.pg.ResetPromptToDefault(a.ID, tmpl); err != nil {
		log.Printf("[prompts] failed to refresh mainagent prompt to the new default: %v", err)
		return
	}
	log.Printf("[prompts] mainagent prompt: appended a new default version (adds the ask-about-registering-a-goal-after-met step, one-time)")
}

// reseedPlannerPrompt refreshes the planner prompt to [the current code default] — the default body was slimmed down and "restraint" demoted to
// dedup-only, adding "depth over coverage" and the "hard floor: with unmet goals and no running intents, output is mandatory", and bounding the re-check of negative conclusions.
// Bump the flag below (currently v2) whenever the default changes materially so existing old DBs refresh once more. SeedPromptIfEmpty is first-insert-only; versions already in old DBs never got it, so version management
// [appends a new version] and switches to it (ResetPromptToDefault); old versions stay in history, and users who customized can recover from the version record.
// settings flag guard → done only once. Fresh DBs need nothing (SeedPromptIfEmpty already seeds the latest default). Structurally identical to
// reseedGoalsPrompt.
func (s *Server) reseedPlannerPrompt() {
	const flag = "planner_prompt_compact_realistic_v2"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	defer func() { _ = s.m.pg.SetSetting(flag, "true") }() // attempt only once regardless of outcome
	a, err := s.m.pg.GetAgentByKey("planner")
	if err != nil || a == nil {
		return // fresh DB without agent rows yet: seedPrompts seeds the latest default directly, this migration is unnecessary
	}
	tmpl := agent.BuiltinPromptSeeds()["planner"]
	if tmpl == "" {
		return
	}
	// Fresh DB: seedPrompts already seeded the latest default → the current version equals the code default, no duplicate version needed.
	if cur, err := s.m.pg.CurrentPrompt(a.ID); err == nil && cur == tmpl {
		return
	}
	if _, err := s.m.pg.ResetPromptToDefault(a.ID, tmpl); err != nil {
		log.Printf("[prompts] failed to refresh planner prompt to the new default: %v", err)
		return
	}
	log.Printf("[prompts] planner prompt: appended a new default version (slimmed rework + restraint demoted to dedup + depth-first + bounded negative re-checks, one-time)")
}

// reseedWorkerPrompt refreshes the worker prompt to [the current code default] — the record_fact section of the default body dropped the whole "for negative conclusions,
// write observations + tentative readings" sentence and decoupled confidence (observed/inferred) from "whether this intent's options are exhausted" (these easily mislead the planner),
// and tightened per-item facts arrays to the rare exception of "fully independent of each other, impossible to merge". Bumped the flag to v3 so existing old DBs refresh once more.
// SeedPromptIfEmpty is first-insert-only; versions already in old DBs never got it, so version management [appends a new version] and switches to it; old versions stay in history and can be recovered.
// settings flag guard → done only once. Fresh DBs need nothing. Structurally identical to reseedGoalsPrompt.
func (s *Server) reseedWorkerPrompt() {
	const flag = "worker_prompt_compact_v4"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	defer func() { _ = s.m.pg.SetSetting(flag, "true") }() // attempt only once regardless of outcome
	a, err := s.m.pg.GetAgentByKey("worker")
	if err != nil || a == nil {
		return // fresh DB without agent rows yet: seedPrompts seeds the latest default directly, this migration is unnecessary
	}
	tmpl := agent.BuiltinPromptSeeds()["worker"]
	if tmpl == "" {
		return
	}
	// Fresh DB: seedPrompts already seeded the latest default → the current version equals the code default, no duplicate version needed.
	if cur, err := s.m.pg.CurrentPrompt(a.ID); err == nil && cur == tmpl {
		return
	}
	if _, err := s.m.pg.ResetPromptToDefault(a.ID, tmpl); err != nil {
		log.Printf("[prompts] failed to refresh worker prompt to the new default: %v", err)
		return
	}
	log.Printf("[prompts] worker prompt: appended a new default version (context-lookup section narrowed to list_assets/list_findings, dropping list_facts/node_detail/asset_neighbors, one-time)")
}

// reporterToolCallMessage must unconditionally require reading get_finding_traffic once before writing the report.
// That tool is read-only and "does not depend on the capture switch": manually bound evidence is readable whether auto-binding is on or off. If this said
// "read only when auto-binding is enabled", with the default-off config the reporter would not pass evidence_version,
// SetFindingReportVersionByNodeID would then write -1 with legacy semantics, and the vulnerability details and Markdown export
// would be stuck on "evidence changed, report needs updating" forever, with no UI entry able to clear it.
const reporterToolCallMessage = "A vulnerability was just registered via report_finding. Read finding_id (the standalone vulnerability record ID) and finding_node_id (the exploration node ID) from the returned JSON, " +
	"then read the current evidence list and its version with get_finding_traffic(finding_id) first (an empty list is normal — write the report as usual); " +
	"if your run instructions enable auto-binding, verify and associate this vulnerability's traffic before reading. Use finding_node_id for node details." +
	"Finally call update_finding_report(finding_id=finding_node_id, report, evidence_version=the version actually read) to save; " +
	"evidence_version must be passed, or the report will be permanently marked as needing an update. Do not mix up the two kinds of id."

// Legacy trigger message (0.3.8 and earlier). Only records still matching it verbatim are migrated/overwritten; user-modified ones stay as-is.
const reporterToolCallMessageV1 = "A vulnerability was just registered via report_finding. Take finding_id out of the trigger context" +
	" (the number in the tool's returned \"finding recorded: <id>\") and the task id, write that vulnerability's detailed report per your duties," +
	" and finally call update_finding_report(finding_id, report) to save it."

// upgradeReporterTriggerMessage refreshes reporter trigger messages that still carry the default copy in old DBs to the new version.
// seedReporterAgent is guarded by reporter_agent_seed_v1 and only writes the trigger when creating the agent, so
// upgraded DBs never got the new copy — seedFindingTrafficTools backfilled the tool schema with
// evidence_version, but nothing told the reporter to use it. One-time, and it only overwrites unmodified copy.
func (s *Server) upgradeReporterTriggerMessage() {
	const flag = "reporter_trigger_evidence_version_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	defer func() { _ = s.m.pg.SetSetting(flag, "true") }() // attempt once
	triggers, err := s.m.pg.ListTriggersFor("reporter")
	if err != nil {
		log.Printf("[reporter] failed to read triggers: %v", err)
		return
	}
	for _, t := range triggers {
		if !t.OnToolCall || t.ToolCallMessage != reporterToolCallMessageV1 {
			continue // user-modified or not a finding trigger — leave it alone.
		}
		t.ToolCallMessage = reporterToolCallMessage
		if err := s.m.pg.UpdateTrigger(t); err != nil {
			log.Printf("[reporter] failed to upgrade trigger message: %v", err)
			return
		}
		log.Printf("[reporter] trigger message upgraded to read and return evidence_version")
	}
}

// seedReporterAgent presets a "report writer" custom agent (builtin=false, editable/deletable in the UI):
// it binds update_finding_report + the task-query tools and carries a trigger that fires "whenever report_finding is called"
// — every registered vulnerability wakes it to write the detailed report. One-time (settings flag guard): once the user deletes it, it is never recreated.
// Dependency: the orchestration tools were seeded via SeedTool just above this function, so the binding can attach.
func (s *Server) seedReporterAgent() {
	const flag = "reporter_agent_seed_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	defer func() { _ = s.m.pg.SetSetting(flag, "true") }() // attempt only once regardless of outcome

	if exist, _ := s.m.pg.GetAgentByKey("reporter"); exist != nil {
		return // key already taken (user created it) — do not overwrite
	}
	a, err := s.m.pg.CreateAgent("reporter", "Report writer",
		"Detailed vulnerability report writing: triggers automatically when a vulnerability is found, fetches evidence and execution traces, then writes a Markdown report and writes it back.")
	if err != nil {
		log.Printf("[reporter] failed to create agent: %v", err)
		return
	}
	if err := s.m.pg.SeedPromptIfEmpty(a.ID, agent.ReporterDefaultPrompt); err != nil {
		log.Printf("[reporter] seed prompt failed: %v", err)
	}
	// Trigger run policy: parallel + none — one report per vulnerability, several findings concurrently each writing its own.
	// merge must be none: otherwise (default all) a wave of findings merges into one run and parallelism is pointless.
	// maxParallel=5: at most 5 report sessions at once, avoiding a burst of too many LLM calls.
	if err := s.m.pg.SetAgentTriggerBehavior("reporter", "parallel", "none", 5); err != nil {
		log.Printf("[reporter] failed to set trigger run policy: %v", err)
	}
	// Bind the tools it needs: report writing + reading evidence/execution traces/situation.
	if err := s.m.pg.AddAgentToToolBinding("reporter", []string{
		"update_finding_report", "get_task_node_detail", "list_task_findings",
		"get_task_worker_trace", "list_task_worker_traces", "search_task_worker_traces",
		"get_task_graph",
	}); err != nil {
		log.Printf("[reporter] failed to bind tools: %v", err)
	}
	// Trigger: fires whenever report_finding is called (the tool returns "finding recorded: <id>" carrying the finding_id,
	// and the task id is also in the trigger message).
	if _, err := s.m.pg.CreateTrigger(&db.AgentTrigger{
		AgentKey:        "reporter",
		Enabled:         true,
		OnToolCall:      true,
		ToolNames:       []string{"report_finding"},
		ToolCallMessage: reporterToolCallMessage,
	}); err != nil {
		log.Printf("[reporter] failed to create trigger: %v", err)
	}
	log.Printf("[reporter] seeded the 'report writer' agent + finding trigger")
}

// seedAutoReportFindingBinding adds "auto" to report_finding's binding ONCE so
// conversation-context agents can call it without requiring an intent_id.
func (s *Server) seedAutoReportFindingBinding() {
	const flag = "auto_report_finding_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	if err := s.m.pg.AddAgentToToolBinding("auto", []string{"report_finding"}); err != nil {
		log.Printf("[auto] report_finding default binding failed: %v", err)
		return
	}
	_ = s.m.pg.SetSetting(flag, "true")
}

// seedPlannerDefaultBindings adds "planner" to report_finding's binding ONCE
// (guarded by a settings flag), so existing DBs — whose report_finding row was
// seeded as worker-only — also let the planner record findings. Fresh DBs already
// get it via PlannerTools(); this only backfills without overriding a user unbind.
func (s *Server) seedPlannerDefaultBindings() {
	const flag = "planner_report_finding_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	if err := s.m.pg.AddAgentToToolBinding("planner", []string{"report_finding"}); err != nil {
		log.Printf("[planner] report_finding default binding failed: %v", err)
		return
	}
	_ = s.m.pg.SetSetting(flag, "true")
}

// seedPlannerListAssetsBinding adds "planner" to list_assets's binding ONCE
// (guarded by a settings flag), so existing DBs — whose list_assets row was seeded
// as auto/pentest-only — also let the planner query the asset store by DSL. Fresh
// DBs already get it via PlannerTools(); this only backfills without overriding a
// user unbind.
func (s *Server) seedPlannerListAssetsBinding() {
	const flag = "planner_list_assets_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	if err := s.m.pg.AddAgentToToolBinding("planner", []string{"list_assets"}); err != nil {
		log.Printf("[planner] list_assets default binding failed: %v", err)
		return
	}
	_ = s.m.pg.SetSetting(flag, "true")
}

// seedCompanyScopeRebind changes add_company_scope's default binding ONCE on
// existing DBs (guarded by a settings flag): the tool moves off worker and onto
// planner — defining a company's asset scope is a planning/main/auto concern, not
// something a worker does mid-exploration. Fresh DBs already get planner via
// PlannerTools() and lack worker via WorkerTools(); this only backfills old rows.
// One-shot + flag-guarded so a user who later re-binds worker isn't overridden.
func (s *Server) seedCompanyScopeRebind() {
	const flag = "company_scope_rebind_v1" // worker→planner default-binding switch
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	if err := s.m.pg.AddAgentToToolBinding("planner", []string{"add_company_scope"}); err != nil {
		log.Printf("[planner] add_company_scope default binding failed: %v", err)
		return
	}
	if err := s.m.pg.RemoveAgentFromTool("worker", "add_company_scope"); err != nil {
		log.Printf("[worker] failed to unbind add_company_scope: %v", err)
		return
	}
	_ = s.m.pg.SetSetting(flag, "true")
}

// seedWorkerReadToolsUnbind strips the read-context tools off worker's default
// binding ONCE on existing DBs (guarded by a settings flag): a worker executes one
// intent and writes back — reading facts/companies and listing all workers' traces is
// a planning/main concern, not the executor's. Fresh DBs already lack these via
// WorkerTools(); this only backfills old rows without overriding a user who
// deliberately re-binds worker. Each RemoveAgentFromTool is per-tool +
// membership-guarded, so planner/mainagent bindings of the same tool are untouched.
//
// NOTE: search_all_worker_traces / get_worker_trace / node_detail are intentionally NOT
// unbound — worker owns them for cross-work look-back + node drill-down (see WorkerTools).
// They used to be in this list back when worker lacked them; seedWorkerReadbackRebind
// repairs DBs whose old run stripped them.
func (s *Server) seedWorkerReadToolsUnbind() {
	const flag = "worker_readtools_unbind_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	for _, k := range []string{
		"list_facts", "list_companies", "list_worker_traces",
	} {
		if err := s.m.pg.RemoveAgentFromTool("worker", k); err != nil {
			log.Printf("[worker] failed to unbind %s from worker: %v", k, err)
			return // on error the flag is not set; retried on next startup
		}
	}
	_ = s.m.pg.SetSetting(flag, "true")
}

// seedWorkerReadbackRebind re-binds the cross-work look-back / drill-down tools onto
// worker ONCE (guarded by a settings flag): an earlier seedWorkerReadToolsUnbind wrongly
// stripped search_all_worker_traces / get_worker_trace / node_detail from worker after
// they had been added to WorkerTools(), so any DB that ran that migration lost them.
// Fresh DBs already have them via WorkerTools() and this is a harmless no-op there.
// One-shot + flag-guarded so a user who later deliberately unbinds them isn't overridden.
// seedTaskCredentialBindings binds the task-credential tools onto worker and
// pentest ONCE (guarded by a settings flag), so existing DBs seeded before #3
// still get them — fresh DBs already have them via WorkerTools()/the pentest
// catalog seed. A user who deliberately unbinds them is not overridden.
func (s *Server) seedTaskCredentialBindings() {
	const flag = "task_credential_bindings_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	for _, agentKey := range []string{"worker", "pentest"} {
		if err := s.m.pg.AddAgentToToolBinding(agentKey, []string{"save_task_credential", "list_task_credentials"}); err != nil {
			log.Printf("[%s] task-credential default binding failed: %v", agentKey, err)
			return // flag not set; retried on next startup
		}
	}
	_ = s.m.pg.SetSetting(flag, "true")
}

// healListTaskCredentialsSchema repairs the list_task_credentials row seeded by
// older builds, whose schema carried "required": [""] — strict providers reject
// it, which fails every worker run. SeedTool is first-insert-only, so the code fix
// alone never reaches an already-seeded row. Only that exact malformed value on
// that one key matches, and only the "required" key is dropped: the rest of the
// schema, the description, bindings and enabled flag are untouched. A healed row
// no longer matches, so this needs no settings flag and is a no-op afterwards.
func (s *Server) healListTaskCredentialsSchema() {
	if _, err := s.m.pg.Exec(`UPDATE tools SET schema = schema - 'required', updated_at=now() WHERE key='list_task_credentials' AND schema->'required' = '[""]'::jsonb`); err != nil {
		log.Printf("[tools] heal list_task_credentials schema failed: %v", err)
	}
}

func (s *Server) seedWorkerReadbackRebind() {
	const flag = "worker_readback_rebind_v2" // v2: adds node_detail
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	if err := s.m.pg.AddAgentToToolBinding("worker", []string{
		"search_all_worker_traces", "get_worker_trace", "node_detail",
	}); err != nil {
		log.Printf("[worker] failed to re-bind look-back/detail tools: %v", err)
		return // on error the flag is not set; retried on next startup
	}
	_ = s.m.pg.SetSetting(flag, "true")
}

// seedAutoDefaultBindings adds "auto" to the task-op + platform tools' bindings
// ONCE (guarded by a settings flag), so existing DBs whose tool rows were seeded
// before Auto existed still give Auto its default toolset — without re-adding it
// after a user deliberately unbinds.
func (s *Server) seedAutoDefaultBindings() {
	const flag = "auto_default_bindings_v3" // v3: replaces old asset tool names, adds insert_assets/add_company_scope
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	keys := make([]string, 0, len(platformToolKeys)+12)
	for _, t := range s.orchestrationTools() {
		keys = append(keys, t.Name())
	}
	keys = append(keys, platformToolKeys...)
	// Asset tools: Auto operating the platform often views/registers assets and manages company scopes.
	keys = append(keys, "insert_assets", "add_company_scope", "list_assets")
	if err := s.m.pg.AddAgentToToolBinding("auto", keys); err != nil {
		log.Printf("[auto] default binding failed: %v", err)
		return
	}
	_ = s.m.pg.SetSetting(flag, "true")
}
