package agent

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

const findingIDGuidance = "\n\n**Finding ID conventions**: finding_id is the standalone vulnerability record ID; finding_node_id is the exploration node ID. The id returned by list_findings / list_task_findings / node_detail / get_task_node_detail remains the exploration node ID; read the standalone ID from the finding_id in the same response. get_finding_traffic / bind_finding_traffic use the standalone finding_id. The legacy update_finding_report's finding_id parameter still takes finding_node_id. Do not feed the number on the first line of report_finding to the evidence tools, and do not guess other numbers after an ID error."

// The server supplies the persisted setting. A missing setting/host is off.
// Consulted at assembly and again on writes so an already-running session
// cannot keep binding after the user switches the feature off.
// Note: when finding traffic binding is disabled in configuration, findings
// remain saved and visible but cannot close a goal via prove_goal unless
// traffic is bound manually later (non-HTTP goals still close via an observed
// tool_output fact).
// Guarded by a lock for the same reason as the tool hooks.
var (
	findingTrafficBindingMu   sync.RWMutex
	findingTrafficBindingHook func() bool
)

// SetFindingTrafficBindingEnabled installs (or, with nil, removes) the hook.
func SetFindingTrafficBindingEnabled(f func() bool) {
	findingTrafficBindingMu.Lock()
	findingTrafficBindingHook = f
	findingTrafficBindingMu.Unlock()
}

// FindingTrafficBindingEnabled returns the current hook, or nil when none is set.
func FindingTrafficBindingEnabled() func() bool {
	findingTrafficBindingMu.RLock()
	defer findingTrafficBindingMu.RUnlock()
	return findingTrafficBindingHook
}

func findingTrafficBindingEnabled() bool {
	f := FindingTrafficBindingEnabled()
	return f != nil && f()
}

var (
	trafficCaptureMu   sync.RWMutex
	trafficCaptureHook func() bool
)

// SetTrafficCaptureEnabled installs (or, with nil, removes) the hook that
// reports whether the server's global traffic capture switch is currently on.
func SetTrafficCaptureEnabled(f func() bool) {
	trafficCaptureMu.Lock()
	trafficCaptureHook = f
	trafficCaptureMu.Unlock()
}

// TrafficCaptureEnabled returns the current hook, or nil when none is set.
func TrafficCaptureEnabled() func() bool {
	trafficCaptureMu.RLock()
	defer trafficCaptureMu.RUnlock()
	return trafficCaptureHook
}

func trafficCaptureExplicitlyOff() bool {
	f := TrafficCaptureEnabled()
	return f != nil && !f()
}

const (
	trafficCaptureOffProveGoalNote     = "\nNote: traffic capture is currently OFF on this server, so no HTTP traffic is being recorded and findings cannot be bound to captured traffic to prove HTTP goals. Recorded findings stay visible, and non-HTTP goals can still be proved with an observed tool_output fact; enable traffic capture in System settings to make HTTP findings provable."
	trafficCaptureOffReportFindingNote = "\nNote: traffic capture is currently OFF on this server, so no HTTP traffic is being recorded. Findings still save with textual/command evidence, but cannot prove goals via prove_goal until traffic capture is enabled in System settings and verified traffic is bound."
)

func trafficCaptureOffToolNote(toolName string, captureOff bool) string {
	if !captureOff {
		return ""
	}
	switch toolName {
	case "prove_goal":
		return trafficCaptureOffProveGoalNote
	case "report_finding":
		return trafficCaptureOffReportFindingNote
	default:
		return ""
	}
}

// Automatic traffic binding off is a DIFFERENT switch from capture off: capture
// can be on while binding is off, and then the disabled branch below strips
// bind_finding_traffic and every traffic parameter from the schemas while the
// tool descriptions keep promising the binding path. An agent then chases a tool
// that is not in its toolset (observed: "the tool bind_finding_traffic must be
// invoked as a tool", a bare Bash true, then grepping the transcripts and the
// binary). These notes ride on the tool descriptions, exactly like the capture
// notes above, so the standing guidance stays empty when the feature is off.
const (
	findingBindingOffProveGoalNote     = "\nNote: automatic traffic binding is OFF on this server, so a finding cannot be bound to captured traffic here and cannot close an HTTP goal. Recorded findings stay visible; non-HTTP goals still close with an observed tool_output fact. An operator can enable binding (System settings) or bind captured traffic manually on the finding page, after which a bound finding closes the goal."
	findingBindingOffReportFindingNote = "\nNote: automatic traffic binding is OFF on this server, so report_finding carries no traffic parameters and the bind_finding_traffic tool is not in your toolset. Findings still save with their evidence, but stay unverified and cannot prove a goal. Register a reproducible PoC in evidence as usual; do not guess traffic IDs and do not re-probe only to capture packets."
	findingBindingOffHintNote          = "\nNote: automatic traffic binding is OFF on this server, so hint traffic parameters are not in this schema. Keep the verified evidence and the known real traffic IDs in the hint text; the receiving task registers the finding and the operator can bind captured traffic later."
)

func findingBindingOffToolNote(toolName string) string {
	switch toolName {
	case "prove_goal":
		return findingBindingOffProveGoalNote
	case "report_finding":
		return findingBindingOffReportFindingNote
	case "add_hint", "add_task_hint":
		return findingBindingOffHintNote
	default:
		return ""
	}
}

// Applied after ToolResolve: user descriptions and prompts remain intact, while
// all actual reporters (including Planner and custom chat agents) see the same
// API contract. Disabled/unbound tools are never reintroduced here.
func findingWorkflowTools(agentKey string, tools []actool.CoreTool) ([]actool.CoreTool, string) {
	captureOff := trafficCaptureExplicitlyOff()
	if !findingTrafficBindingEnabled() {
		out := make([]actool.CoreTool, 0, len(tools))
		for _, tool := range tools {
			if tool.Name() == "bind_finding_traffic" {
				continue
			}
			if agentKey == "reporter" && (tool.Name() == "traffic_search" || tool.Name() == "traffic_get" || tool.Name() == "traffic_blob" || tool.Name() == "traffic_messages") {
				continue
			}
			desc := tool.Description()
			schema := tool.InputSchema()
			decorated := false
			switch tool.Name() {
			case "report_finding", "add_hint", "add_task_hint":
				// Work on a copy: toggling back on must restore the original schema.
				raw, _ := json.Marshal(tool.InputSchema())
				var s map[string]any
				if json.Unmarshal(raw, &s) == nil {
					stripTrafficParameters(s)
					schema = s
					decorated = true
				}
			}
			if note := trafficCaptureOffToolNote(tool.Name(), captureOff); note != "" {
				desc += note
				decorated = true
			}
			if note := findingBindingOffToolNote(tool.Name()); note != "" {
				desc += note
				decorated = true
			}
			if decorated {
				tool = DecorateTool(tool, desc, schema)
			}
			out = append(out, tool)
		}
		// The standing guidance stays empty: the binding-off notes ride on the
		// tool descriptions, so a disabled deployment keeps the same contract the
		// PG test asserts (def.FindingGuidance == "").
		return out, ""
	}
	out := append([]actool.CoreTool(nil), tools...)
	has := map[string]bool{}
	for i, tool := range out {
		has[tool.Name()] = true
		note := ""
		switch tool.Name() {
		case "report_finding":
			note = "\nBy default the report agent verifies and binds traffic before writing the report. The reporter keeps verification commands, key output, any known real traffic IDs and their purpose in evidence, so the report agent can check them against the execution records; no extra packet capture is needed for binding. Explicit immediate binding is still supported: traffic_refs or evidence_hint_id may submit already-verified references, the latter reading the structured references of the given hint in this task; if either is invalid the whole report fails. A finding without bound traffic stays recorded and visible, but cannot close a goal via prove_goal until verified traffic matching its asset host is bound (non-HTTP goals close via an observed tool_output fact). The returned finding_id and finding_node_id denote the standalone record and the exploration node respectively."
		case "add_hint", "add_task_hint":
			note = "\nWhen handing off a confirmed vulnerability, keep the verified traffic's IDs, purpose, notes, and order in the corresponding hint's traffic_refs (top-level for a single hint, inside the corresponding hints element for a batch), and state in text exactly which vulnerability it proves. The caller must not hand off only text while dropping existing traffic references. Unverified candidates must not be passed as evidence."
		case "get_finding_traffic", "bind_finding_traffic", "list_findings", "list_task_findings", "node_detail", "get_task_node_detail", "update_finding_report":
			note = findingIDGuidance
		}
		if capNote := trafficCaptureOffToolNote(tool.Name(), captureOff); capNote != "" {
			note += capNote
		}
		if note != "" {
			out[i] = DecorateTool(tool, tool.Description()+note, tool.InputSchema())
		}
	}
	guidance := ""
	if has["report_finding"] || has["add_task_hint"] || has["add_hint"] {
		guidance = "\n\n**Traffic evidence handoff (optional)**: automatic binding is done by default by the report agent after the vulnerability is stored and before the report is written. Reporters should keep verification commands, key output, known real traffic IDs and their purpose in evidence, with the intent_id in the task, so the report agent can trace them; no extra packet capture is needed for binding. When Auto / Planner reports on someone's behalf, do not drop the executor's existing references. add_hint / add_task_hint can hand off via traffic_refs; explicit immediate binding via report_finding's traffic_refs / evidence_hint_id is still supported. For TCP or no-capture cases, register normally — do not guess IDs, and do not re-probe just to capture packets."
		if has["add_task_hint"] && !has["add_hint"] {
			guidance += "\nWhen a platform conversation has no task context, do not call report_finding directly; hand off via add_task_hint to the existing corresponding task, let the task agent register it, and verify the result with list_task_findings."
		}
		if has["prove_goal"] || has["goal_met"] {
			guidance += "\nBefore judging a goal complete, finish reporting/handing off the evidence at hand. A finding only closes a goal via prove_goal once it has at least one server-verified bound traffic_ref matching its asset host (an unbound finding stays recorded and visible, and non-HTTP goals close via an observed tool_output fact). Do not end the task or cancel Workers while evidence binding is still pending."
		}
	}
	if has["update_finding_report"] && has["bind_finding_traffic"] && has["get_finding_traffic"] {
		guidance += "\n\n**Auto-link traffic before reporting (enabled)**: you are responsible for verifying and binding traffic for the vulnerability that triggered this run, then writing the report. First obtain the unambiguous finding_id and finding_node_id from the report_finding return JSON or get_task_node_detail / list_task_findings. Read the vulnerability details, the corresponding intent's execution records, and the existing evidence list, preferring the real IDs handed off by the reporter. If this verification is HTTP and the traffic tools are available, use traffic_search to filter candidates, then traffic_get to verify item by item that the request/response truly supports the vulnerability; domains and times are only for filtering and do not prove attribution. Bind the confirmed evidence in reproduction order via bind_finding_traffic(finding_id, traffic_refs), choosing baseline / proof / verification / supporting and stating the purpose. Operate only on this vulnerability — do not recreate vulnerabilities or re-probe the target. After a successful bind, call get_finding_traffic again for the latest version, read the bodies you need, then pass the version you actually read as evidence_version to update_finding_report (whose finding_id parameter still takes finding_node_id). Do not re-append existing bindings. For TCP, no-capture, unavailable tools, or no exact match, skip auto-binding, write the report from textual/command evidence with the reason stated, and never guess to force traffic in. Do not claim success when binding fails; keep the existing evidence and explain in the report why nothing was bound."
	}
	if has["update_finding_report"] {
		guidance += findingVerificationGuidance
	}
	if guidance != "" || has["get_finding_traffic"] || has["update_finding_report"] {
		guidance += findingIDGuidance
	}
	return out, guidance
}

func stripTrafficParameters(schema map[string]any) {
	props, _ := schema["properties"].(map[string]any)
	delete(props, "traffic_refs")
	delete(props, "evidence_hint_id")
	if required, ok := schema["required"].([]any); ok {
		kept := required[:0]
		for _, key := range required {
			if key != "traffic_refs" && key != "evidence_hint_id" {
				kept = append(kept, key)
			}
		}
		schema["required"] = kept
	}
	if hints, ok := props["hints"].(map[string]any); ok {
		if items, ok := hints["items"].(map[string]any); ok {
			stripTrafficParameters(items)
		}
	}
}

// HintTrafficSchema is shared by the task-local and cross-task hint tools.
func HintTrafficSchema() map[string]any {
	return map[string]any{"type": "array", "description": "Optional: verified traffic references corresponding to the specific vulnerability in this hint, order preserved; after handoff, report_finding can carry these references via evidence_hint_id.", "items": obj(map[string]any{"traffic_id": str("real traffic ID"), "role": str("baseline / proof / verification / supporting"), "note": str("which conclusion this traffic supports")}, "traffic_id")}
}

func (t *ToolSet) findingRefsFromHint(hintID int64, explicit []db.TrafficRef) ([]db.TrafficRef, error) {
	if hintID <= 0 {
		return db.NormalizeTrafficRefs(explicit)
	}
	n, err := t.ts.GetNode(hintID) // local store only: inherited hints cannot supply evidence
	if err != nil {
		return nil, err
	}
	if n == nil || n.Kind != db.KindHint {
		return nil, fmt.Errorf("evidence_hint_id=%d must be a hint node of this task (inherited hints cannot be bound directly)", hintID)
	}
	var payload struct {
		Refs []db.TrafficRef `json:"traffic_refs"`
	}
	if err := json.Unmarshal(n.Payload, &payload); err != nil {
		return nil, err
	}
	return db.NormalizeTrafficRefs(append(append([]db.TrafficRef{}, explicit...), payload.Refs...))
}

// findingVerificationGuidance tells the report writer how to declare proof
// (S1). The server downgrades any finding whose declaration does not hold up,
// so the agent must never state a level or quote it cannot read in the bound body.
const findingVerificationGuidance = "\n\n**Verification (S1)**: when you call update_finding_report, also declare poe_level (0-4) and evidence_quotes. poe_level 1 = error, timing or response variation; 2 = structural manipulation (boolean, UNION, parser difference); 3 = actual data extracted; 4 = critical impact (admin credentials, code execution). L3 is the minimum for a verified finding. evidence_quotes must be exact lines copied from a bound proof or verification response body (read it with get_finding_traffic first), never from memory or from the report text; the server checks each quote verbatim after whitespace normalization. If you cannot quote the proof, omit the quotes: the finding then stays unverified, which is acceptable. Do not raise poe_level to get a verified status."
