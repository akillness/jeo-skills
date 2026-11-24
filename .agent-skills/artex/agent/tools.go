package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
	acperm "github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
)

// compactIntents distills intents to {id, summary, state, asset_ids, parents,
// yields} so the planner sees both the direction and its LINEAGE — parents (the
// upstream nodes it derived from: facts/intents/findings) and yields (the facts/
// findings it produced) — without pulling full payloads. parentsOf/yieldsOf are
// built from the exploration edges in graph_overview.
// normalizeDirection fingerprints an intent summary for stagnation detection:
// case-folded, all digits collapsed to '#', whitespace collapsed. Two intents
// aimed at the same thing with different IDs/counts/URLs fingerprint the same.
func normalizeDirection(summary string) string {
	var b strings.Builder
	digit := false
	for _, r := range strings.ToLower(strings.Join(strings.Fields(summary), " ")) {
		if r >= '0' && r <= '9' {
			if !digit {
				b.WriteByte('#')
			}
			digit = true
			continue
		}
		digit = false
		b.WriteRune(r)
	}
	return b.String()
}

// detectStagnation (ouroboros take, #99) flags directions whose normalized
// summary repeats stagnationMinRepeats times among finished intents while no
// finding has been produced since the FIRST attempt at that direction: the
// planner is grinding the same shape of work without yield. Pure function over
// (finished intents, findings) so it is unit-testable without a store.
const stagnationMinRepeats = 3

func detectStagnation(done, findings []*db.Node) []map[string]any {
	type dir struct {
		firstID int64
		repeats int
		summary string
	}
	dirs := map[string]*dir{}
	order := []string{}
	for _, n := range done {
		var payload map[string]any
		_ = json.Unmarshal(n.Payload, &payload)
		summ, _ := payload["summary"].(string)
		if strings.TrimSpace(summ) == "" {
			continue
		}
		fp := normalizeDirection(summ)
		if fp == "" {
			continue
		}
		d, ok := dirs[fp]
		if !ok {
			d = &dir{firstID: n.ID, summary: summ}
			dirs[fp] = d
			order = append(order, fp)
		}
		if n.ID < d.firstID {
			d.firstID = n.ID
			d.summary = summ
		}
		d.repeats++
	}
	var out []map[string]any
	for _, fp := range order {
		d := dirs[fp]
		if d.repeats < stagnationMinRepeats {
			continue
		}
		produced := false
		for _, f := range findings {
			if f.ID > d.firstID {
				produced = true
				break
			}
		}
		if produced {
			continue
		}
		out = append(out, map[string]any{
			"direction": d.summary,
			"repeats":   d.repeats,
			"since":     d.firstID,
		})
		if len(out) >= 3 {
			break
		}
	}
	return out
}

func compactIntents(ns []*db.Node, parentsOf, yieldsOf map[int64][]int64) []map[string]any {
	out := make([]map[string]any, 0, len(ns))
	for _, n := range ns {
		var p map[string]any
		_ = json.Unmarshal(n.Payload, &p)
		m := map[string]any{"id": n.ID, "summary": p["summary"], "state": n.State}
		if n.Inherited {
			m["source_task_id"] = n.SourceTaskID
			m["inherited"] = true
		}
		// asset_ids is the structured "which assets this direction covers" signal for
		// dedup; fall back to legacy payload keys (target_ids plural, then target_id
		// single) so intents stored before the rename still surface their anchors.
		if tg, ok := p["asset_ids"]; ok && tg != nil {
			m["asset_ids"] = tg
		} else if tg, ok := p["target_ids"]; ok && tg != nil {
			m["asset_ids"] = tg
		} else if tg, ok := p["target_id"]; ok && tg != nil && tg != "" {
			m["asset_ids"] = []any{tg}
		}
		if ps := parentsOf[n.ID]; len(ps) > 0 {
			m["parents"] = ps // upstream: which nodes this intent derived from (multiple facts can jointly produce one intent)
		}
		if ys := yieldsOf[n.ID]; len(ys) > 0 {
			m["yields"] = ys // downstream: which facts/findings this intent produced
		}
		out = append(out, m)
	}
	return out
}

// ToolSet exposes the PG-backed dual graph (asset + exploration) to an LLM agent.
// One ToolSet is created per planner/worker run; per-run signals live here.
type ToolSet struct {
	findingRecorder FindingRecorder
	// triage, if set, is an advisory decision-model client used for closed-list
	// judgements (currently the duplicate check in report_finding). nil = the
	// judgement is left to the main model, exactly as before. See agent/triage.go.
	triage TriageClient
	// trafficProofChecker verifies that a bound snapshot's source_traffic_id
	// exists in the live capture store during prove_goal. Planner.Plan wires it
	// from the finding recorder; nil or any error fails closed.
	trafficProofChecker func(ctx context.Context, trafficID string) (bool, error)
	as                  *db.AssetStore   // asset store (optional; nil = asset tools not available)
	cs                  *db.CompanyStore // company store (optional)
	ts                  *db.ExplorationStore
	factTraffic         FactTrafficLookup // proxy capture store for fact classification; nil = activity-only
	worker              string
	taskID              int64 // PG tasks.id; 0 when unknown (tests / orchestrator cross-task reads)
	// coverageDisabled mirrors tasks.coverage_enabled=false. Stored inverted so the
	// zero value (all existing ToolSet constructions) means ENABLED — matching the
	// DB default (true). When true: graphOverviewData drops the coverage block, the
	// auto-scope hook (insertAssets) is skipped, and add_task_scope/list_untested_assets
	// are filtered out of the agent's tool list. The scope field stays regardless.
	coverageDisabled bool
	// workBase is the data directory the run directories live in, the base of the
	// file tools (defaultTools). ingest_bbot opens its file through the run's working
	// directory below it; empty = the tool refuses every path.
	workBase string
	// ownerNode is the exploration node that writes attach to: assets this run
	// touches get anchored to it as lineage/provenance (NOT visibility — the asset
	// graph is global and shared). Worker = its claimed intent; planner = begin root.
	ownerNode int64
	GoalMet   bool
	Reason    string
	writes    WriteCounts
	// killWork, if set, terminates a running work by intent id (engine callback,
	// wired by the planner). nil = the kill_work tool reports unavailable.
	killWork func(intentID int64) error
	// steerWork, if set, queues a mid-run course-correction for the work running an
	// intent id (engine callback, wired by the planner): the worker injects it before
	// its next tool call and re-plans, without being killed. nil = tool unavailable.
	steerWork func(intentID int64, msg string) error
	// enrich, if set, receives async auto-completion triggers (DNS resolve for a
	// domain, HTTP probe for a site). nil = no engine enrichment.
	enrich EnrichTrigger
	// notify, if set, wakes the task's planner after a graph change that should be
	// re-planned promptly (currently: a new hint). nil = no wake (the hint is still
	// stored and read on the next round triggered by other events). debounced.
	notify func()
	// notifyFinding, if set, wakes the task's planner when this run reports a finding,
	// carrying (intentID, summary) so the round can spell out which intent found what.
	// Wired for workers; nil elsewhere → falls back to notify (bare wake).
	notifyFinding func(intentID int64, summary string)
	// resumeTask, if set, revives the task after a graph change that should make a
	// stopped task run again (currently: set_goals adds a goal). It flips a terminal/
	// paused task back to running and (re)starts the engine loops — a plain notify()
	// can't, because the planner's terminal gate swallows wakes. Wired ONLY for the
	// main agent (human steering); nil for the goals decomposer and workers.
	resumeTask func()
	// notifyGoal, if set, wakes the planner AND records ONE "human added N goals: …"
	// trigger for a whole set_goals call (batch-aware — one call, one trigger, not
	// one per goal) so the next round spells out the added goals (instead of the
	// planner having to spot new open goals in the overview). Wired ONLY for the main
	// agent; nil for the goals decomposer (round-0 has no running planner to inform)
	// and workers → those fall back to the bare notify.
	notifyGoal func(texts []string)
	// notifyHint, if set, wakes the planner AND records ONE "<origin> added N strategic
	// hints: …" trigger for a whole add_hint call (batch-aware — one call, one
	// trigger) so the next round is told the round was fired by a new hint and spells
	// the hint out, instead of the planner having to spot it folded into the graph
	// overview. origin is the ToolSet's worker (human, orchestrator, or an agent name).
	// Wired for the main agent + cross-task orchestration; nil elsewhere → falls back
	// to the bare notify.
	notifyHint func(origin string, texts []string)
}

// SetNotifyGoal wires the goal-add trigger callback (see ToolSet.notifyGoal). Set only
// by the main-agent chat, so runtime-added goals are announced to the planner by name.
func (t *ToolSet) SetNotifyGoal(fn func([]string)) { t.notifyGoal = fn }

// SetNotifyHint wires the hint-add trigger callback (see ToolSet.notifyHint). Set by
// the main-agent chat and cross-task orchestration, so a runtime-added hint fires a
// planner round announced by name instead of a bare wake.
func (t *ToolSet) SetNotifyHint(fn func(string, []string)) { t.notifyHint = fn }

// SetResumeTask wires the task-revive callback (see ToolSet.resumeTask). Set only by
// the main-agent chat, so runtime-added goals can pull a finished task back to running.
func (t *ToolSet) SetResumeTask(fn func()) { t.resumeTask = fn }

// SetNotify wires the planner-wake callback (see ToolSet.notify). Set by callers
// that hold the task handle (main-agent chat, cross-task orchestration).
func (t *ToolSet) SetNotify(fn func()) { t.notify = fn }

// SetNotifyFinding wires the finding-wake callback (see ToolSet.notifyFinding).
func (t *ToolSet) SetNotifyFinding(fn func(int64, string)) { t.notifyFinding = fn }

// EnrichTrigger is the enrichment engine seen from the tool layer (see package
// enrich). Kept as an interface here to avoid coupling agent → enrich.
type EnrichTrigger interface {
	ResolveDomain(id int64, host string)
	ProbeSite(ctx context.Context, id int64, url string)
}

// WriteCounts breaks down what a worker persisted this run, by node kind, so the
// engine can log an accurate "wrote back" summary instead of lumping assets and
// findings under "facts" (record_fact → Facts, insert_assets → Assets,
// report_finding → Findings; each element of a batch counts once).
type WriteCounts struct {
	Facts    int
	Assets   int
	Findings int
}

// Total is every node persisted this run, regardless of kind — the
// "explored but persisted nothing" signal (Total == 0).
func (w WriteCounts) Total() int { return w.Facts + w.Assets + w.Findings }

// String renders the per-kind breakdown for logs, e.g. "facts=1 assets=25 findings=0".
func (w WriteCounts) String() string {
	return fmt.Sprintf("facts=%d assets=%d findings=%d", w.Facts, w.Assets, w.Findings)
}

// Writes reports what this run wrote back, split by node kind (so the engine can
// tell "explored but persisted nothing" apart from a completed intent, and log an
// honest breakdown instead of calling assets/findings "facts").
func (t *ToolSet) Writes() WriteCounts { return t.writes }

func NewToolSet(ts *db.ExplorationStore, worker string) *ToolSet {
	return &ToolSet{ts: ts, worker: worker}
}

// SetFactTraffic wires the proxy capture store used to relabel facts whose
// evidence came back from the target (#124 row 1, step 3). Callers pass the
// process traffic store; nil leaves classification activity-only.
func (t *ToolSet) SetFactTraffic(l FactTrafficLookup) { t.factTraffic = l }

// SetTaskID sets the PG task id on this ToolSet so that report_finding can
// dual-write to the standalone findings table (which survives task deletion).
func (t *ToolSet) SetTaskID(id int64) { t.taskID = id }

// SetCoverageEnabled records whether this task has the asset-coverage feature on
// (default enabled). Passing false makes graphOverviewData omit the coverage block
// and DropCoverageTools filter the two coverage-only tools out of the agent's tool
// list. It does NOT stop scope accumulation: insertAssets' auto-scope hook runs
// either way, because task_scope is the task's range boundary (the filter basis for
// asset queries), not merely a coverage denominator.
func (t *ToolSet) SetCoverageEnabled(enabled bool) { t.coverageDisabled = !enabled }

// CoverageDisabled reports whether the coverage feature is off for this task.
func (t *ToolSet) CoverageDisabled() bool { return t.coverageDisabled }

// coverageOnlyTools are the LLM tools that only make sense when asset coverage is
// on. When the feature is off they are filtered out of the agent's tool list so
// they neither pollute the prompt nor let the model build a disabled denominator.
// add_task_scope is deliberately NOT here: task_scope is the task's range boundary
// (the filter basis for asset queries), not merely a coverage denominator, so the
// agents that own scope definition keep it either way — in lockstep with
// insertAssets' auto-scope hook, which also runs regardless of the switch.
var coverageOnlyTools = map[string]bool{"list_untested_assets": true, "record_coverage": true}

// DropCoverageTools returns tools with the coverage-only ones removed when this
// task has the feature disabled; otherwise it returns tools unchanged.
func (t *ToolSet) DropCoverageTools(tools []actool.CoreTool) []actool.CoreTool {
	if !t.coverageDisabled {
		return tools
	}
	out := tools[:0:0]
	for _, tool := range tools {
		if coverageOnlyTools[tool.Name()] {
			continue
		}
		out = append(out, tool)
	}
	return out
}

// Cross-task reuse: exported accessors returning the per-task tool logic bound to
// THIS ToolSet's store. Host-side orchestration tools build a ToolSet for an
// arbitrary task, then Call these — so cross-task reads/hint reuse the exact
// same logic as the in-task tools. (readTool ignores ToolContext, so Call(…,nil)
// is safe; add_hint is a writeTool but also doesn't deref the context here.)
func (t *ToolSet) GraphOverviewTool() actool.CoreTool      { return t.graphOverview() }
func (t *ToolSet) ListFindingsTool() actool.CoreTool       { return t.listFindings() }
func (t *ToolSet) GetWorkerTraceTool() actool.CoreTool     { return t.getWorkerTrace() }
func (t *ToolSet) ListWorkerTracesTool() actool.CoreTool   { return t.listWorkerTraces() }
func (t *ToolSet) SearchWorkerTracesTool() actool.CoreTool { return t.searchAllWorkerTraces() }
func (t *ToolSet) NodeDetailTool() actool.CoreTool         { return t.nodeDetail() }
func (t *ToolSet) AddHintTool() actool.CoreTool            { return t.addHint() }

// SetEnrich wires the async enrichment engine (DNS/HTTP auto-completion).
func (t *ToolSet) SetEnrich(e EnrichTrigger) { t.enrich = e }

// SetOwnerNode sets the exploration node that writes anchor to (worker: its
// intent node; planner/main: the begin root). Assets created/referenced while
// ownerNode is set are anchored to it as lineage (not visibility).
func (t *ToolSet) SetOwnerNode(id int64) { t.ownerNode = id }

// SetWorkBase sets the data directory the run directories live in (see
// ToolSet.workBase): the same base the run's file tools are confined under.
func (t *ToolSet) SetWorkBase(base string) { t.workBase = base }

// anchorOwner records a lineage edge from this run's owner node to an asset
// (no-op if unset). Provenance only — the asset graph is global and shared, so
// this no longer affects which assets a task can read.
func (t *ToolSet) anchorOwner(assetID int64) {
	if t.ts != nil && t.ownerNode > 0 && assetID > 0 {
		_ = t.ts.Anchor(t.ownerNode, assetID)
	}
}

// pid parses an id that may arrive as a JSON number or string ("" / 0 → 0).
func pid(raw json.RawMessage) int64 {
	if len(raw) == 0 {
		return 0
	}
	var n int64
	if json.Unmarshal(raw, &n) == nil {
		return n
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		v, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
		return v
	}
	return 0
}

// pidList parses a list of ids (number|string), dropping zeros/invalids.
func pidList(raw []json.RawMessage) []int64 {
	var out []int64
	for _, r := range raw {
		if v := pid(r); v > 0 {
			out = append(out, v)
		}
	}
	return out
}

func obj(props map[string]any, required ...string) map[string]any {
	m := map[string]any{"type": "object", "properties": props}
	// Blank names are dropped, and "required" is omitted when nothing is left:
	// strict providers reject "required": [""] and fail every run carrying the tool.
	req := make([]string, 0, len(required))
	for _, r := range required {
		if strings.TrimSpace(r) != "" {
			req = append(req, r)
		}
	}
	if len(req) > 0 {
		m["required"] = req
	}
	return m
}
func str(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
func intp(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}
func idp(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}

func readTool(name, desc string, schema map[string]any, run func(context.Context, json.RawMessage) (actool.Result, error)) actool.CoreTool {
	return actool.Build(actool.Spec{
		Name: name, Description: desc, Schema: schema,
		ReadOnly:    func(json.RawMessage) bool { return true },
		Concurrent:  func(json.RawMessage) bool { return true },
		Permissions: func(context.Context, json.RawMessage, acperm.Context) acperm.Decision { return acperm.Allowed() },
		Run: func(ctx context.Context, in json.RawMessage, _ *actool.ToolContext) (actool.Result, error) {
			return run(ctx, in)
		},
	})
}

func writeTool(name, desc string, schema map[string]any, run func(context.Context, json.RawMessage) (actool.Result, error)) actool.CoreTool {
	return buildWriteTool(name, desc, schema, false, run)
}

// writeRawTool is writeTool for a handler that validates its own input: the
// harness skips its schema check (Spec.RawInput), so the published schema can
// be stricter (required properties) than the legacy shapes the handler still
// accepts, and refusals carry the handler's own message instead of the
// SDK's generic one.
func writeRawTool(name, desc string, schema map[string]any, run func(context.Context, json.RawMessage) (actool.Result, error)) actool.CoreTool {
	return buildWriteTool(name, desc, schema, true, run)
}

func buildWriteTool(name, desc string, schema map[string]any, raw bool, run func(context.Context, json.RawMessage) (actool.Result, error)) actool.CoreTool {
	return actool.Build(actool.Spec{
		Name: name, Description: desc, Schema: schema, RawInput: raw,
		Permissions: func(context.Context, json.RawMessage, acperm.Context) acperm.Decision { return acperm.Allowed() },
		Run: func(ctx context.Context, in json.RawMessage, _ *actool.ToolContext) (actool.Result, error) {
			return run(ctx, in)
		},
	})
}

// readExpTool / writeExpTool build a domain tool whose handler dereferences the
// task-bound ExplorationStore. Two ToolSets carry a nil store: the catalog's
// seed-only shell (never called) and the server-level one behind buildDomainReg,
// which the tools table can bind to ANY agent — including ones that never run
// inside a task (auto/pentest/reporter/custom agents/side questions). Refusing
// there keeps a mis-bound tool a bad tool call; without the guard it was a nil
// deref, and tool handlers run on the harness's own goroutine, so the panic is out
// of reach of every recover() in the server and kills the whole process.
func (t *ToolSet) readExpTool(name, desc string, schema map[string]any, run func(context.Context, json.RawMessage) (actool.Result, error)) actool.CoreTool {
	return readTool(name, desc, schema, t.needExploration(name, run))
}

func (t *ToolSet) writeExpTool(name, desc string, schema map[string]any, run func(context.Context, json.RawMessage) (actool.Result, error)) actool.CoreTool {
	return writeTool(name, desc, schema, t.needExploration(name, run))
}

// writeExpToolRaw is writeExpTool with the harness schema check skipped (see
// writeRawTool); the handler validates the input itself.
func (t *ToolSet) writeExpToolRaw(name, desc string, schema map[string]any, run func(context.Context, json.RawMessage) (actool.Result, error)) actool.CoreTool {
	return writeRawTool(name, desc, schema, t.needExploration(name, run))
}

// needExploration wraps a handler so it only runs with an exploration store.
// Tools that degrade more usefully than "unavailable" (report_finding points at
// add_task_hint, set_goals/set_constraints at the task itself) keep their own
// bespoke guard instead.
func (t *ToolSet) needExploration(name string, run func(context.Context, json.RawMessage) (actool.Result, error)) func(context.Context, json.RawMessage) (actool.Result, error) {
	return func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
		if t.ts == nil {
			return actool.Errorf(name + " requires a task context (exploration graph): the current agent is not running inside a task, so the task's exploration graph is unavailable and this tool cannot be used. Use it inside a task, or switch to a cross-task read tool that takes a task_id (get_task_node_detail / list_task_findings / get_task_graph etc.)."), nil
		}
		return run(ctx, in)
	}
}

func jsonResult(v any) (actool.Result, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return actool.Errorf(err.Error()), nil
	}
	return actool.Text(string(b)), nil
}

// --- read tools (planner + worker) ---

func (t *ToolSet) graphOverview() actool.CoreTool {
	return t.readExpTool("graph_overview",
		"(Exploration graph) distilled situational summary: asset counts, sites without endpoints, frontier, findings, hints (strategic hints from the human/main agent — must be incorporated when generating intents). Call it first when planning.",
		obj(map[string]any{}),
		func(context.Context, json.RawMessage) (actool.Result, error) {
			return jsonResult(t.graphOverviewData())
		})
}

// graphOverviewData computes the distilled situational snapshot shared by the
// graph_overview tool and the planner's wake-up prompt (which pre-injects it so
// the model needn't spend a turn calling the tool — every plan round starts with
// an empty context and always needs this first).
func (t *ToolSet) graphOverviewData() map[string]any {
	out := map[string]any{}
	// goals summary folded in so the planner needn't call list_goals each round.
	goals, _ := t.ts.ListByKind(db.KindGoal, 100)
	gsum := make([]map[string]any, 0, len(goals))
	for _, g := range goals {
		var p map[string]any
		_ = json.Unmarshal(g.Payload, &p)
		gsum = append(gsum, map[string]any{"id": g.ID, "state": g.State, "text": p["text"]})
	}
	out["goals"] = gsum
	// hints: strategic hints attached to the graph by the human/main agent via
	// add_hint; folded in so the planner reads them every round when generating
	// intents (otherwise they'd be write-only).
	hints, _ := t.ts.ListByKind(db.KindHint, 50)
	hsum := make([]map[string]any, 0, len(hints))
	for _, h := range hints {
		var p map[string]any
		_ = json.Unmarshal(h.Payload, &p)
		// origin lets the user-message renderers keep the operator's own hints
		// outside the data envelope (#124, F3).
		hint := map[string]any{"id": h.ID, "state": h.State, "text": p["text"], "origin": h.Origin}
		if findingTrafficBindingEnabled() && p["traffic_refs"] != nil {
			hint["traffic_refs"] = p["traffic_refs"]
		}
		hsum = append(hsum, hint)
	}
	out["hints"] = hsum
	// lineage from the exploration edges: an intent's parents (what it
	// derived_from — possibly several facts combined) and its yields (the
	// facts/findings it produced). factFrom maps a fact → the intent that
	// produced it. This is the relationship layer the flat lists lacked.
	edges, _ := t.ts.Edges(5000)
	parentsOf := map[int64][]int64{}
	yieldsOf := map[int64][]int64{}
	factFrom := map[int64]int64{}
	for _, e := range edges {
		switch e.Rel {
		case db.RelDerivedFrom, db.RelSpawns: // upstream: derived_from (fact/finding/intent→intent) or spawns (origin fact→goal, legacy begin→intent)
			parentsOf[e.To] = append(parentsOf[e.To], e.From)
		case db.RelYields: // intent --yields--> fact/finding
			yieldsOf[e.From] = append(yieldsOf[e.From], e.To)
			factFrom[e.To] = e.From
		}
	}
	// cold-digest §6: members folded into an active digest are shown via cold_digests
	// (below), not the flat recent_* lists. `covered` maps member id → its digest id.
	// §6 render-time revival check: a covered member that has become hot again (a new
	// intent derived from it) must reappear this round — so `hidden` folds a member out
	// only when it is covered AND still cold.
	covered, _ := t.ts.CoveredMembers()
	// Render-time hot set (ancestor of a live intent / fact under a live intent).
	// §6 revival check: a covered member that revived (now hot) must NOT stay folded
	// — hidden() only folds a member out when it is covered AND still cold. Computed
	// every round (cheap for real graph sizes); nil map degrades safely.
	var hotAtRender map[int64]bool
	if cg, _, err := loadColdGraph(t.ts); err == nil {
		hotAtRender = cg.hotSet()
	}
	hidden := func(id int64) bool { _, c := covered[id]; return c && !hotAtRender[id] }
	const openIntentsCap = 30
	fr, _ := t.ts.Frontier(openIntentsCap) // priority DESC, id ASC — the top N by priority; the real total is in frontier_open
	out["open_intents"] = compactIntents(fr, parentsOf, yieldsOf)
	all, _ := t.ts.ListByKind(db.KindIntent, 300)
	var running, recentDone []*db.Node
	for _, n := range all {
		switch n.State {
		case "running":
			running = append(running, n)
		case "done", "blocked", "exhausted":
			if hidden(n.ID) {
				continue // in a cold_digest and still cold — shown via cold_digests (§6.2)
			}
			recentDone = append(recentDone, n) // newest first (all is id-DESC); folded ones are dropped, output truncated to the latest N
		}
	}
	out["running_intents"] = compactIntents(running, parentsOf, yieldsOf)
	// done_intents_total: the total number of finished intents (done/blocked/exhausted),
	// named in parallel with recent_done_intents — the latter is just its newest windowed
	// view. Side by side the two keys are self-describing: "you're seeing N of total", so
	// the planner doesn't mistake "not shown" for "never dispatched" when deduping, with
	// no extra explanation needed in the prompt.
	if dt, err := t.ts.CountFinishedIntents(); err == nil {
		out["done_intents_total"] = dt
	}
	// frontier_open: the real total of open intents (open_intents is just the top-N-by-priority truncated view).
	if fo, err := t.ts.CountOpenIntents(); err == nil {
		out["frontier_open"] = fo
	} else {
		out["frontier_open"] = len(fr)
	}
	// findings (confirmed vulns) and facts (worker exploration results) are
	// now distinct node kinds. recent_facts surfaces fact summaries (esp.
	// negative results) so the planner sees them in one call; full content
	// via node_detail(id).
	vulnNodes, _ := t.ts.ListByKind(db.KindFinding, 1000)
	factNodes, _ := t.ts.ListByKind(db.KindFact, 1000) // newest first
	// findings_total is what goal judgment reads. A false_positive, duplicate,
	// or ignored triage label is not an open finding, so it does not count.
	// finding_list still shows those rows, with status, so the planner can see them.
	out["findings_total"] = countActionableFindings(vulnNodes)
	out["facts"] = len(factNodes) // number of exploration facts/conclusions (including negative conclusions)
	// Stagnation surfacing (#99): repeated finished directions with no findings
	// since their first attempt. Self-describing payload — the instruction ships
	// with the data so no prompt-template change is needed on deployed installs.
	if stale := detectStagnation(recentDone, vulnNodes); len(stale) > 0 {
		out["stagnation_warning"] = map[string]any{
			"directions":  stale,
			"instruction": "these directions were dispatched repeatedly with zero findings produced since their first attempt — do NOT re-dispatch the same approach again; open a materially different direction, or judge the goal on the existing evidence instead of grinding",
		}
	}
	// findings are the task's highest-value output → the overview carries the latest
	// window (≤10 entries; vulnNodes is id-DESC, i.e. newest first) so the planner sees
	// the recently confirmed findings at a glance each round when judging goals; use
	// list_findings for the full/older set. Each entry keeps {id, summary,
	// status?, from_intent?}: status is the triage label mirrored onto the
	// node, and from_intent is the intent that produced this finding.
	// evidence/assets/vulnclass/severity/state etc. remain available via
	// list_findings / node_detail(id).
	const findingListCap = 10
	findingList := make([]map[string]any, 0, findingListCap)
	for _, n := range vulnNodes {
		if len(findingList) >= findingListCap {
			break
		}
		var fp map[string]any
		_ = json.Unmarshal(n.Payload, &fp)
		m := map[string]any{"id": n.ID, "summary": fp["summary"]}
		if st, ok := fp["status"].(string); ok && strings.TrimSpace(st) != "" {
			m["status"] = st
		}
		if from := factFrom[n.ID]; from > 0 {
			m["from_intent"] = from // which intent produced this finding
		}
		findingList = append(findingList, m)
	}
	out["finding_list"] = findingList
	// recent_facts: the latest window (≤N) of non-folded facts (factNodes is id-DESC,
	// i.e. newest first). Ones folded into a digest and still cold (hidden) go through
	// cold_digests and aren't repeated here. Each entry {id, summary, origin?, source?,
	// from_intent?, confidence?}; details like evidence via node_detail(id). Older ones
	// via list_facts.
	const recentFactsCap = 20
	recentFacts := make([]map[string]any, 0, recentFactsCap)
	for _, n := range factNodes {
		if len(recentFacts) >= recentFactsCap {
			break
		}
		if hidden(n.ID) {
			continue // folded into a digest and still cold — see cold_digests
		}
		m := compactFact(n) // summary capped at factSummaryMax (#124, F3)
		if from := factFrom[n.ID]; from > 0 {
			m["from_intent"] = from // which intent produced this fact
		}
		// confidence rides in the overview: lets the planner see at a glance which
		// conclusion is only inferred (especially negative conclusions — don't treat
		// them as ironclad); evidence is long, left to node_detail(id).
		var fp map[string]any
		if json.Unmarshal(n.Payload, &fp) == nil {
			if c, ok := fp["confidence"].(string); ok && c != "" {
				m["confidence"] = c
			}
		}
		recentFacts = append(recentFacts, m)
	}
	out["recent_facts"] = recentFacts
	// recent_done_intents: the latest window (≤N) of non-folded finished intents
	// (recentDone is already id-DESC). For older ones see the done_intents_total count
	// + node_detail(id).
	const recentDoneCap = 12
	if len(recentDone) > recentDoneCap {
		recentDone = recentDone[:recentDoneCap]
	}
	out["recent_done_intents"] = compactIntents(recentDone, parentsOf, yieldsOf)
	// cold-digest §6.1: the folded cold region's digest bodies, newest-member first,
	// capped at N; truncated older digests are given as bare ids (still expandable via
	// expand_digest) so the cold region's only exit doesn't grow without bound.
	const coldDigestsCap = 15
	if cds, more := coldDigestsRecent(t.ts, coldDigestsCap); len(cds) > 0 {
		out["cold_digests"] = cds // [{id, body, member_count}] — read body directly (§6.1)
		if len(more) > 0 {
			out["cold_digests_more"] = more // ids of truncated older digests; expand with expand_digest(id)
		}
	}
	// the original task (root) so the planner always has it, not just the
	// decomposed goals.
	if description, goal, err := t.ts.Root(); err == nil {
		out["task"] = map[string]any{"description": description, "goal": goal}
	}
	// Direct source tasks are a live, read-only blackboard view. Keep their
	// summaries in a separate field so their intents never enter this task's
	// frontier or get mistaken for locally claimable work.
	out["related_tasks"] = t.relatedTaskOverviews()
	// coverage: a rough reference for asset test coverage — among the assets inside
	// the scope (task_scope), the share touched by facts + by_type (total/tested per
	// type). To see the concrete untested assets, the agent calls list_untested_assets
	// on demand and judges itself. Only available in a task context.
	// When the asset-coverage feature is off (coverageDisabled): keep only host_count
	// (awareness of the target host count) and drop the coverage metrics
	// denominator/tested/pct/by_type/note — avoids polluting the context and doesn't
	// invite the hidden add_task_scope/list_untested_assets.
	if t.as != nil && t.ts != nil && t.taskID > 0 {
		{
			m := map[string]any{}
			if !t.coverageDisabled {
				if cov, err := t.as.TaskCoverageWithSources(t.taskID); err == nil {
					m["denominator"] = cov.Denominator
					m["tested"] = cov.Tested
					m["by_type"] = cov.ByType
					m["note"] = "coverage = asset test coverage (including endpoints and all kinds of related assets), a rough estimate for reference only: includes the current task's and directly related tasks' scopes and fact anchors; related scopes are read-only. Container-type assets/mass enumeration skew it low — don't take it as fully tested; use add_task_scope to extend this task's scope, list_untested_assets to see untested assets [usually no need to call list_untested_assets; just proceed with the task];"
					if cov.Denominator == 0 {
						m["pct"] = nil
						m["status"] = "scope not anchored"
					} else {
						m["pct"] = cov.Pct
					}
				}
			}
			if hosts, err := t.as.HostsByTaskWithSources(t.taskID); err == nil {
				// Only the host count is given; the host list is no longer flattened into
				// graph_overview (in large-scope tasks that's a lot of repeated strings every
				// round, of limited value to planning decisions); query concrete hosts via
				// list_assets on demand.
				m["host_count"] = len(hosts)
			}
			if len(m) > 0 {
				out["coverage"] = m
			}
		}
	}
	// Task credentials (#3): test accounts for this target — user-declared (e.g. a
	// program alias) plus accounts recorded by earlier runs. Surfaced every round so
	// authenticated testing reuses them instead of re-registering, and so accounts
	// this run registers get saved back (see save_task_credential).
	if creds := t.taskCredentialOverview(); creds != nil {
		out["task_credentials"] = creds
		out["task_credentials_note"] = "test accounts for this task; use the matching entry for authenticated testing instead of registering a new account; entries with an empty password mean you must register that account first (strong unique password) and record it via save_task_credential; ALWAYS record accounts you register via save_task_credential"
	}
	return out
}

func inheritedMap(m map[string]any, sourceTaskID int64) map[string]any {
	m["source_task_id"] = sourceTaskID
	m["inherited"] = true
	return m
}

const (
	relatedOverviewTotalTextRunes      = 48_000
	relatedOverviewMaxTextPerSource    = 8_000
	relatedOverviewMaxGoalsPerSource   = 8
	relatedOverviewMaxHintsPerSource   = 6
	relatedOverviewMaxFactsPerSource   = 12
	relatedOverviewMaxFindingsPerTask  = 6
	relatedOverviewMaxIntentsPerTask   = 8
	relatedOverviewMaxScopePerSource   = 12
	relatedOverviewMaxDigestsPerSource = 6
)

// overviewTextBudget bounds inherited prompt text while preserving a fair slice
// for every direct source. Full evidence remains available through the on-demand
// read tools, so truncation here does not discard persisted blackboard data.
type overviewTextBudget struct {
	remaining int
	truncated bool
}

func relatedOverviewBudgetForSources(sourceCount int) int {
	if sourceCount <= 0 {
		return 0
	}
	if sourceCount > db.MaxTaskSourceCount {
		sourceCount = db.MaxTaskSourceCount
	}
	perSource := relatedOverviewTotalTextRunes / sourceCount
	if perSource > relatedOverviewMaxTextPerSource {
		perSource = relatedOverviewMaxTextPerSource
	}
	return perSource
}

func (b *overviewTextBudget) take(value any, fieldLimit int) string {
	var text string
	switch value := value.(type) {
	case string:
		text = strings.TrimSpace(value)
	case nil:
		return ""
	default:
		text = strings.TrimSpace(fmt.Sprint(value))
	}
	if text == "" {
		return ""
	}
	if b.remaining <= 0 || fieldLimit <= 0 {
		b.truncated = true
		return ""
	}
	runes := []rune(text)
	limit := fieldLimit
	if limit > b.remaining {
		limit = b.remaining
	}
	if len(runes) > limit {
		b.truncated = true
		if limit == 1 {
			text = "…"
		} else {
			text = string(runes[:limit-1]) + "…"
		}
		runes = []rune(text)
	}
	b.remaining -= len(runes)
	return text
}

func recentTerminalIntents(store *db.ExplorationStore, limit int) []*db.Node {
	if limit <= 0 {
		return []*db.Node{}
	}
	const batch = 300
	cursor := int64(0)
	out := make([]*db.Node, 0, limit)
	for len(out) < limit {
		page, more, err := store.ListByKindPage(db.KindIntent, cursor, batch)
		if err != nil || len(page) == 0 {
			break
		}
		for _, intent := range page {
			switch intent.State {
			case "done", "blocked", "exhausted", "stopped":
				out = append(out, intent)
			}
			if len(out) >= limit {
				break
			}
		}
		if !more {
			break
		}
		cursor = page[len(page)-1].ID
	}
	return out
}

// relatedTaskOverviews distills persistent blackboard state from direct source
// tasks. It intentionally reads each source's local store methods, never its own
// related sources, so inheritance is one level only.
func (t *ToolSet) relatedTaskOverviews() []map[string]any {
	sources, err := t.ts.DirectSourceStores()
	if err != nil {
		return []map[string]any{}
	}
	if len(sources) > db.MaxTaskSourceCount {
		sources = sources[:db.MaxTaskSourceCount]
	}
	perSourceTextBudget := relatedOverviewBudgetForSources(len(sources))
	out := make([]map[string]any, 0, len(sources))
	for _, source := range sources {
		ts := source.Store
		// §2 cross-task: render the source task's OWN folded view — fold out the
		// members it has already folded, and surface its cold_digests read-only.
		hidden := hiddenMembersFor(ts)
		budget := overviewTextBudget{remaining: perSourceTextBudget}
		item := map[string]any{
			"source_task_id": source.Task.TaskID,
			"inherited":      true,
			"task": map[string]any{
				"description": budget.take(source.Task.Description, 800),
				"goal":        budget.take(source.Task.Goal, 800),
				"status":      source.Task.Status,
			},
		}
		stats, statsErr := ts.Stats()

		edges, _ := ts.Edges(5000)
		parentsOf := map[int64][]int64{}
		yieldsOf := map[int64][]int64{}
		factFrom := map[int64]int64{}
		for _, edge := range edges {
			switch edge.Rel {
			case db.RelDerivedFrom, db.RelSpawns:
				parentsOf[edge.To] = append(parentsOf[edge.To], edge.From)
			case db.RelYields:
				yieldsOf[edge.From] = append(yieldsOf[edge.From], edge.To)
				factFrom[edge.To] = edge.From
			}
		}

		goals, _ := ts.ListByKind(db.KindGoal, relatedOverviewMaxGoalsPerSource)
		goalSummary := make([]map[string]any, 0, len(goals))
		for _, goal := range goals {
			var payload map[string]any
			_ = json.Unmarshal(goal.Payload, &payload)
			goalSummary = append(goalSummary, inheritedMap(map[string]any{
				"id": goal.ID, "state": goal.State, "text": budget.take(payload["text"], 400),
			}, source.Task.TaskID))
		}
		item["goals"] = goalSummary

		hints, _ := ts.ListByKind(db.KindHint, relatedOverviewMaxHintsPerSource)
		hintSummary := make([]map[string]any, 0, len(hints))
		for _, hint := range hints {
			var payload map[string]any
			_ = json.Unmarshal(hint.Payload, &payload)
			hintSummary = append(hintSummary, inheritedMap(map[string]any{
				"id": hint.ID, "state": hint.State, "text": budget.take(payload["text"], 400),
			}, source.Task.TaskID))
		}
		item["hints"] = hintSummary

		facts, _ := ts.ListByKind(db.KindFact, relatedOverviewMaxFactsPerSource)
		findings, _ := ts.ListByKind(db.KindFinding, relatedOverviewMaxFindingsPerTask)
		intentNodes, _ := ts.ListByKind(db.KindIntent, 300)
		terminalIntent := make(map[int64]bool, len(intentNodes))
		for _, intent := range intentNodes {
			terminalIntent[intent.ID] = inheritedIntentSummaryState(intent.State)
		}
		item["facts"] = len(facts)
		item["findings"] = len(findings)
		if statsErr == nil {
			item["facts"] = stats[db.KindFact]
			item["findings"] = stats[db.KindFinding]
			if stats[db.KindGoal] > len(goals) || stats[db.KindHint] > len(hints) ||
				stats[db.KindFact] > len(facts) || stats[db.KindFinding] > len(findings) {
				budget.truncated = true
			}
		}
		recentFindings := make([]map[string]any, 0, len(findings))
		for _, finding := range findings {
			entry := inheritedMap(compactFinding(finding), source.Task.TaskID)
			entry["summary"] = budget.take(entry["summary"], 400)
			recentFindings = append(recentFindings, entry)
		}
		item["recent_findings"] = recentFindings
		recentFacts := make([]map[string]any, 0, len(facts))
		for _, fact := range facts {
			if hidden(fact.ID) {
				continue // folded into this source's cold_digests — shown there (§2/§6.2)
			}
			m := inheritedMap(compactNode(fact), source.Task.TaskID)
			m["summary"] = budget.take(m["summary"], 400)
			if from := factFrom[fact.ID]; from > 0 && terminalIntent[from] {
				m["from_intent"] = from
			}
			var payload map[string]any
			if json.Unmarshal(fact.Payload, &payload) == nil {
				if confidence, ok := payload["confidence"].(string); ok && confidence != "" {
					m["confidence"] = confidence
				}
			}
			recentFacts = append(recentFacts, m)
		}
		item["recent_facts"] = recentFacts

		recentDoneRaw := recentTerminalIntents(ts, relatedOverviewMaxIntentsPerTask)
		recentDone := recentDoneRaw[:0] // in-place filter: drop this source's folded intents (§2)
		for _, intent := range recentDoneRaw {
			if hidden(intent.ID) {
				continue
			}
			recentDone = append(recentDone, intent)
		}
		for _, intent := range recentDone {
			intent.Inherited = true
			intent.SourceTaskID = source.Task.TaskID
		}
		intentResults := compactIntents(recentDone, parentsOf, yieldsOf)
		for i, intent := range recentDone {
			intentResults[i]["summary"] = budget.take(intentResults[i]["summary"], 400)
			acts, _, err := ts.ActivityPageForTerminalIntent(intent.ID, 0, 20)
			if err != nil {
				continue
			}
			var resultSummary, textFallback string
			for _, activity := range acts {
				switch activity.Kind {
				case "result":
					resultSummary = activity.Summary
				case "text":
					textFallback = activity.Summary
				}
			}
			if resultSummary == "" {
				resultSummary = textFallback
			}
			if resultSummary != "" {
				intentResults[i]["result_summary"] = budget.take(resultSummary, 800)
			}
		}
		item["recent_intent_results"] = intentResults
		// §2 cross-task: the source task's folded cold region, read-only, newest-member
		// first & capped like the current task's. Members (and overflow digests) are
		// resolvable via expand_digest(id)/node_detail(id), which search source tasks.
		if cds, more := coldDigestsRecent(ts, relatedOverviewMaxDigestsPerSource); len(cds) > 0 {
			for _, cd := range cds {
				cd["inherited"] = true
				cd["source_task_id"] = source.Task.TaskID
			}
			item["cold_digests"] = cds
			if len(more) > 0 {
				item["cold_digests_more"] = more // ids of truncated older digests; expand with expand_digest(id)
			}
		}
		if statsErr == nil {
			item["node_stats"] = stats
		}

		if t.as != nil {
			if scopeRows, err := t.as.ListTaskScope(source.Task.TaskID); err == nil && len(scopeRows) > 0 {
				scopeCount := len(scopeRows)
				if len(scopeRows) > relatedOverviewMaxScopePerSource {
					scopeRows = scopeRows[:relatedOverviewMaxScopePerSource]
					budget.truncated = true
				}
				scope := make([]map[string]any, 0, len(scopeRows))
				for _, row := range scopeRows {
					entry := map[string]any{"kind": row.Kind, "source": budget.take(row.Source, 300)}
					switch {
					case row.Domain != "":
						entry["value"] = budget.take(row.Domain, 400)
					case row.Net != "":
						entry["value"] = budget.take(row.Net, 400)
					case row.Value != "":
						entry["value"] = budget.take(row.Value, 400)
					case row.CompanyID != nil:
						entry["company_id"] = *row.CompanyID
					}
					scope = append(scope, entry)
				}
				item["asset_scope"] = scope
				item["asset_scope_count"] = scopeCount
			}
			if coverage, err := t.as.TaskCoverage(source.Task.TaskID, source.Task.ExplorationID); err == nil {
				item["asset_coverage"] = map[string]any{
					"denominator": coverage.Denominator,
					"tested":      coverage.Tested,
					"pct":         coverage.Pct,
					"by_type":     coverage.ByType,
				}
			}
		}
		if budget.truncated {
			item["summary_truncated"] = true
		}
		out = append(out, item)
	}
	return out
}

func inheritedIntentSummaryState(state string) bool {
	switch state {
	case "done", "blocked", "exhausted", "stopped":
		return true
	default:
		return false
	}
}

// compactNode distills any exploration node to id + summary + state, dropping the
// big detail/evidence (fetch that on demand via node_detail). It also carries the
// provenance (#124, F4): origin is the writer recorded by the server (worker-N,
// planner, human, orchestrator), source is the declared source of a fact.
func compactNode(n *db.Node) map[string]any {
	var p map[string]any
	_ = json.Unmarshal(n.Payload, &p)
	m := map[string]any{"id": n.ID, "state": n.State, "summary": p["summary"]}
	if n.Origin != "" {
		m["origin"] = n.Origin
	}
	if s, ok := p["source"].(string); ok && s != "" {
		m["source"] = s
	}
	if prov, ok := p["provenance"].(string); ok && prov != "" {
		m["provenance"] = prov
		if id, ok := p["provenance_activity_id"]; ok && id != nil {
			m["provenance_activity_id"] = id
		}
		if tid, ok := p["provenance_traffic_id"].(string); ok && tid != "" {
			m["provenance_traffic_id"] = tid
		}
	}
	if n.Inherited {
		inheritedMap(m, n.SourceTaskID)
	}
	return m
}

// compactFinding is compactNode plus the vuln-specific vulnclass/severity and
// the triage status mirrored onto the node payload by SetFindingStatus.
func compactFinding(n *db.Node) map[string]any {
	var p map[string]any
	_ = json.Unmarshal(n.Payload, &p)
	m := map[string]any{"id": n.ID, "state": n.State, "summary": p["summary"]}
	if n.Inherited {
		inheritedMap(m, n.SourceTaskID)
	}
	if vc, ok := p["vulnclass"]; ok && vc != nil && vc != "" {
		m["vulnclass"] = vc
	}
	if sv, ok := p["severity"]; ok && sv != nil && sv != "" {
		m["severity"] = sv
	}
	if st, ok := p["status"]; ok && st != nil && st != "" {
		m["status"] = st
	}
	return m
}

func findingPayloadStatus(n *db.Node) string {
	var p map[string]any
	_ = json.Unmarshal(n.Payload, &p)
	st, _ := p["status"].(string)
	return strings.ToLower(strings.TrimSpace(st))
}

// findingTriageBlocksGoal is true when the finding's triage label says it is
// not a vulnerability to close a goal on. Delegates to db.FindingStatusInvalidatesGoal
// so prove_goal and DB goal-reopen logic share one list and cannot drift (#269).
func findingTriageBlocksGoal(status string) bool {
	return db.FindingStatusInvalidatesGoal(status)
}

func countActionableFindings(nodes []*db.Node) int {
	n := 0
	for _, node := range nodes {
		if !findingTriageBlocksGoal(findingPayloadStatus(node)) {
			n++
		}
	}
	return n
}

func (t *ToolSet) listFindings() actool.CoreTool {
	return t.readExpTool("list_findings", "List the [confirmed findings] of this task and directly related tasks (compact: id+task_id+intent_id+vulnclass+severity+summary+state+status). Related-task entries carry source_task_id/inherited=true and are read-only. Only findings here; for ordinary exploration facts use list_facts, for details node_detail(id).",
		obj(map[string]any{}),
		func(context.Context, json.RawMessage) (actool.Result, error) {
			f, _ := t.ts.ListByKindWithSources(db.KindFinding, 500)
			if err := t.ts.PopulateFindingTrafficIDs(f); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			intentOf, _ := t.ts.FindingIntentsWithSources() // finding id -> the intent id that produced it
			taskID := t.taskID
			if taskID <= 0 {
				taskID, _ = t.ts.TaskID()
			}
			out := make([]map[string]any, 0, len(f))
			for _, n := range f {
				m := compactFinding(n)
				if n.FindingID > 0 {
					m["finding_id"], m["finding_node_id"], m["traffic_count"] = n.FindingID, n.ID, n.TrafficCount
				}
				if n.Inherited {
					m["task_id"] = n.SourceTaskID
				} else {
					m["task_id"] = taskID
				}
				if iid, ok := intentOf[n.ID]; ok {
					m["intent_id"] = iid
				}
				out = append(out, m)
			}
			return jsonResult(out)
		})
}

// factsPageSize is the default page size for list_facts. Facts pile up on long
// tasks; returning all of them at once (the old behaviour) could blow up the
// context, so default to the newest page and let the agent page/filter for more.
const factsPageSize = 20

func (t *ToolSet) listFacts() actool.CoreTool {
	return t.readExpTool("list_facts", "Page through the [exploration facts/conclusions] of this task and directly related tasks, newest first (compact: id+summary+state+origin+source; origin is the writer, source the declared source of the content; overlong summaries are truncated — full text via node_detail(id)). All parameters optional: limit (default 20, max 100), before (cursor; pass the previous page's next_before for an older page; omit/0 = the newest page), q (filter by summary keyword). Returns {facts, total, has_more, next_before}: total is the filtered count; when has_more=true, keep paging with next_before. Related-task entries carry source_task_id/inherited=true and are read-only. For findings see list_findings.",
		obj(map[string]any{
			"limit":  intp("number of entries to return, default 20, max 100"),
			"before": intp("pagination cursor: return only older facts with id below this value; omit or 0 = the newest page"),
			"q":      str("filter facts by summary keyword (case-insensitive); omit = no filter"),
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				Limit  int    `json:"limit"`
				Before int64  `json:"before"`
				Q      string `json:"q"`
			}
			_ = json.Unmarshal(in, &a)
			limit := a.Limit
			if limit <= 0 {
				limit = factsPageSize
			}
			if limit > 100 {
				limit = 100
			}
			f, hasMore, total, err := t.ts.ListByKindPageWithSources(db.KindFact, a.Before, limit, strings.TrimSpace(a.Q))
			if err != nil {
				return actool.Result{}, err
			}
			out := make([]map[string]any, 0, len(f))
			for _, n := range f {
				out = append(out, compactFact(n))
			}
			res := map[string]any{"facts": out, "total": total, "has_more": hasMore}
			if hasMore && len(f) > 0 {
				res["next_before"] = f[len(f)-1].ID // pass it back to get the next (older) page
			}
			return jsonResult(res)
		})
}

// factSummaryMax caps a fact summary in list_facts output and in the overview's
// recent_facts (#124, F3). Facts carry one-line conclusions, but nothing enforces
// brevity; a runaway summary must not bloat a whole page, nor carry a long
// payload into every planner and worker message. Full text stays available via
// node_detail(id).
const factSummaryMax = 160

// compactFact is compactNode with the summary rune-capped for list_facts and
// recent_facts, so they stay bounded regardless of how long any summary grew.
func compactFact(n *db.Node) map[string]any {
	m := compactNode(n)
	if s, ok := m["summary"].(string); ok && len([]rune(s)) > factSummaryMax {
		m["summary"] = string([]rune(s)[:factSummaryMax]) + "…"
		m["summary_truncated"] = true
	}
	return m
}

func (t *ToolSet) nodeDetail() actool.CoreTool {
	return t.readExpTool("node_detail", "Fetch the full content of an [exploration graph node] by id from this task or a directly related task. Inherited nodes carry source_task_id/inherited=true and are read-only. Only for exploration node ids returned by list_facts/list_findings/graph_overview; for assets use list_assets/asset_neighbors.",
		obj(map[string]any{"id": idp("exploration graph node id (not an asset id)")}, "id"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				ID json.RawMessage `json:"id"`
			}
			_ = json.Unmarshal(in, &a)
			id := pid(a.ID)
			if id <= 0 {
				return actool.Errorf("id is required"), nil
			}
			n, err := t.ts.GetNodeWithSources(id)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if n == nil {
				return actool.Errorf(fmt.Sprintf("exploration node %d not found. If you meant an asset, use list_assets / asset_neighbors (assets and exploration nodes are different id spaces; an asset id cannot be passed to node_detail).", id)), nil
			}
			if err := t.ts.PopulateFindingTrafficIDs([]*db.Node{n}); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return jsonResult(n) // full payload incl. detail / evidence, plus explicit finding IDs
		})
}

// --- planner write tools ---

// intentItem is one exploration direction of an add_intent batch/single call.
type intentItem struct {
	Summary   string            `json:"summary"`
	AssetIDs  []json.RawMessage `json:"asset_ids"`
	ParentIDs []json.RawMessage `json:"parent_ids"`
	Priority  int               `json:"priority"`
}

// addOneIntent creates one intent node, links its upstream lineage, and returns the id.
// Constraint: an intent may anchor only on confirmed knowledge — every parent_id must
// be an existing fact/finding node (cannot attach to other intents/goals/hints). Leave
// parent_ids empty for a top-level brand-new direction; it falls back to the origin
// fact. This enforces at the creation path that "every intent links to a fact node and
// is finding-driven rather than planned out of thin air".
func (t *ToolSet) addOneIntent(it intentItem) (int64, error) {
	if strings.TrimSpace(it.Summary) == "" {
		return 0, fmt.Errorf("summary must not be empty")
	}
	// Validate anchors first (before creating the node, so a bad anchor leaves no orphan intent).
	parents := pidList(it.ParentIDs)
	for _, pidv := range parents {
		n, err := t.ts.GetNodeWithSources(pidv)
		if err != nil || n == nil {
			return 0, fmt.Errorf("parent_id %d does not exist in this task or directly related tasks: parent_ids must be ids of existing [fact/finding] nodes; leave parent_ids empty for a top-level brand-new direction", pidv)
		}
		if n.Kind != db.KindFact && n.Kind != db.KindFinding {
			return 0, fmt.Errorf("parent_id %d is a %q node and cannot anchor an intent: intents can only anchor on confirmed [fact/finding] nodes, not on intents/goals/hints; leave parent_ids empty for a top-level brand-new direction", pidv, n.Kind)
		}
	}
	priority := it.Priority
	if priority == 0 {
		priority = 5
	}
	anchors := pidList(it.AssetIDs)
	// Asset interception: if the assets bound to an intent hit the system's asset
	// interception rules, the intent is forbidden from being dispatched.
	if t.as != nil && len(anchors) > 0 {
		hits, err := t.as.CheckAssetsIntercept(t.taskID, anchors)
		if err != nil {
			return 0, fmt.Errorf("asset interception check failed: %w", err)
		}
		if len(hits) > 0 {
			var b strings.Builder
			fmt.Fprintf(&b, "the assets bound to intent \"%s\" failed the test-scope check; stop testing the related assets:", it.Summary)
			for _, h := range hits {
				fmt.Fprintf(&b, "\n - %s", h.Describe())
			}
			return 0, fmt.Errorf("%s", b.String())
		}
	}
	payload := map[string]any{"summary": it.Summary}
	if len(anchors) > 0 {
		payload["asset_ids"] = anchors
	}
	id, err := t.ts.AddIntent(payload, priority, anchors, "planner")
	if err != nil {
		return 0, err
	}
	// upstream lineage: link each (validated) fact/finding parent → this intent, so
	// "multiple facts combine into one new intent" is expressible.
	for _, parent := range parents {
		_ = t.ts.Link(parent, db.RelDerivedFrom, id)
	}
	// a top-level intent (no explicit parent) connects to the origin fact, so every
	// intent still traces back to a fact node — at task start the only fact is the
	// origin, and the first intents derive from it.
	if len(parents) == 0 {
		if origin, _ := t.ts.OriginFactID(); origin > 0 {
			_ = t.ts.Link(origin, db.RelDerivedFrom, id)
		}
	}
	return id, nil
}

func (t *ToolSet) addIntent() actool.CoreTool {
	return t.writeExpTool("add_intent", "Generate [exploration directions] into the frontier and link them into the exploration graph. An intent is an open exploration direction, not a fixed type — describe freely in one summary sentence what to explore/verify/exploit.\n"+
		"★Batch preferred: put multiple new directions filtered in one round into the intents array in a single submission (saves round trips vs. one call per item). Returns an ids array, same length and order as intents (failed items get id=0, details in errors). For a single intent, omit intents and pass the top-level summary.",
		obj(map[string]any{
			"intents":    map[string]any{"type": "array", "description": "[Prefer this] array of exploration directions to add, processed in order. Each element has the same fields as the top-level ones below (summary/asset_ids/parent_ids/priority). The returned ids match this array in length and order.", "items": map[string]any{"type": "object"}},
			"summary":    str("[single] one sentence describing this exploration direction: what to do + why. Just write the direction clearly; asset ids are not required."),
			"asset_ids":  map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "the [target asset ids] this direction tests/attacks (**pass whenever possible**, 0/1/many; these are asset ids from list_assets, not exploration node ids): which assets (sites/endpoints/parameters/hosts etc.) this direction targets. Whenever the direction revolves around concrete assets, be sure to pass them — it is the structured marker of 'which targets this exploration hits', used for coverage dedup and linking the intent into the asset lineage. Leave empty only for pure global recon with truly no concrete target assets."},
			"parent_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "upstream anchor ids (optional, 0/1/many): which [confirmed fact/finding] nodes this direction is synthesized from. **Only existing fact/finding node ids may be passed — not intents/goals/hints** — an intent must anchor on confirmed knowledge, finding-driven rather than planned out of thin air. Pass several when multiple facts jointly produce one new intent; leave empty for a top-level brand-new recon direction (it is automatically attached to the task's origin fact)."},
			"priority":   intp("priority 0-10, default 5"),
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				Intents    []intentItem `json:"intents"`
				intentItem              // single mode: top-level summary/asset_ids/parent_ids/priority
			}
			_ = json.Unmarshal(in, &a)
			batch := len(a.Intents) > 0
			items := a.Intents
			if !batch {
				items = []intentItem{a.intentItem}
			}

			ids := make([]int64, len(items))
			errs := map[string]string{}
			createdAny := false
			for i, it := range items {
				id, err := t.addOneIntent(it)
				if err != nil {
					errs[strconv.Itoa(i)] = err.Error()
					continue
				}
				ids[i] = id
				createdAny = true
			}

			// A human drops an intent directly via the main agent → if the task is done
			// (the goalless branch with no open goals), pull it back to running so a
			// worker can claim this intent. resumeTask is wired only by the main agent's
			// Chat (SetResumeTask); the planner's ToolSet has nil, so this section is a
			// no-op when the planner itself calls add_intent and doesn't disturb its
			// normal intent production. The intent node is already created above (open),
			// so it won't be misjudged as drained on revival.
			if createdAny && t.resumeTask != nil {
				t.resumeTask()
			}

			if !batch { // single: keep the original return
				if e, bad := errs["0"]; bad {
					return actool.Errorf(e), nil
				}
				return actool.Text(fmt.Sprintf("intent created: %d", ids[0])), nil
			}
			out := map[string]any{"ids": ids}
			if len(errs) > 0 {
				out["errors"] = errs
			}
			return jsonResult(out)
		})
}

func (t *ToolSet) listGoals() actool.CoreTool {
	return t.readExpTool("list_goals", "List this task's goal nodes and their states (open/met), for judging whether they are met.",
		obj(map[string]any{}),
		func(context.Context, json.RawMessage) (actool.Result, error) {
			g, _ := t.ts.ListByKind(db.KindGoal, 100)
			return jsonResult(g)
		})
}

// SetTrafficProofChecker wires a live capture-store verifier used by prove_goal
// when checking a finding's bound traffic_ref. Returning an error fails closed.
func (t *ToolSet) SetTrafficProofChecker(fn func(ctx context.Context, trafficID string) (bool, error)) {
	t.trafficProofChecker = fn
}

func (t *ToolSet) proveGoal() actool.CoreTool {
	return t.writeExpTool("prove_goal", "Call when you judge that a finding/fact proves a goal met: links the evidence node to the goal node and marks the goal met. A finding closes a goal ONLY when it has at least one server-verified bound traffic_ref whose host matches the finding's asset (recomputed from current bindings, so a later bind_finding_traffic counts); an unbound finding stays recorded and visible but cannot close a goal. Non-HTTP goals (TCP, DNS, cloud without packets) close via an observed fact whose source is tool_output (or operator_input), not target_response. A finding whose triage status is false_positive, duplicate, or ignored is refused. Any other evidence is refused and the goal stays open.",
		obj(map[string]any{
			"goal_id":     idp("goal node id"),
			"evidence_id": idp("id of the finding/fact node that proves it"),
			"reason":      str("why this evidence satisfies the goal"),
		}, "goal_id", "evidence_id"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				GoalID     json.RawMessage `json:"goal_id"`
				EvidenceID json.RawMessage `json:"evidence_id"`
				Reason     string          `json:"reason"`
			}
			_ = json.Unmarshal(in, &a)
			goal, ev := pid(a.GoalID), pid(a.EvidenceID)
			if goal == 0 || ev == 0 {
				return actool.Errorf("goal_id and evidence_id are required"), nil
			}
			goalNode, err := t.ts.GetNode(goal)
			if err != nil || goalNode == nil || goalNode.Kind != db.KindGoal {
				return actool.Errorf("goal_id must be a goal node of this task (related-task goals are read-only)"), nil
			}
			evidenceNode, err := t.ts.GetNodeWithSources(ev)
			if err != nil || evidenceNode == nil || (evidenceNode.Kind != db.KindFact && evidenceNode.Kind != db.KindFinding) {
				return actool.Errorf("evidence_id must be a fact/finding node of this task or a directly related task"), nil
			}
			// A fact proves a goal only when it was seen directly (#124, F5): an inferred
			// conclusion, or one without a confidence, is refused and the goal stays open.
			// The confidence is declared by the agent that recorded the fact.
			if evidenceNode.Kind == db.KindFact {
				var fp map[string]any
				_ = json.Unmarshal(evidenceNode.Payload, &fp)
				// A fact the server could not tie to recorded work is not authority
				// (#124 row 1): the declared source alone does not make it one. Legacy
				// facts written before provenance existed carry no key and keep their
				// old behaviour; every new fact carries one.
				if prov, ok := fp["provenance"].(string); ok && prov == factProvenanceUnverified {
					note, _ := fp["provenance_note"].(string)
					if note == "" {
						note = "its evidence is not tied to a recorded activity"
					}
					return actool.Errorf(fmt.Sprintf("prove_goal refused: fact %d is unverified (%s). Goal %d stays open: prove it with a finding or with a fact whose evidence quotes this intent's recorded activity.", ev, note, goal)), nil
				}
				confidence, _ := fp["confidence"].(string)
				if strings.ToLower(strings.TrimSpace(confidence)) != "observed" {
					if confidence == "" {
						confidence = "none"
					}
					return actool.Errorf(fmt.Sprintf("prove_goal refused: fact %d has confidence %q, and a fact proves a goal only when its confidence is \"observed\" (seen directly in tool output). Goal %d stays open: prove it with a finding backed by verified bound traffic or with an observed tool_output fact.", ev, confidence, goal)), nil
				}
				// A fact whose declared source is the target's own response is not
				// authoritative (#124, F4): the target could have planted it.
				if source, _ := fp["source"].(string); strings.ToLower(strings.TrimSpace(source)) == factSourceTargetResponse {
					return actool.Errorf(fmt.Sprintf("prove_goal refused: fact %d has source \"target_response\" (its content comes from the target, which could have planted it), and such a fact never proves a goal. Goal %d stays open: prove it with a finding backed by verified bound traffic or with an observed fact from another source.", ev, goal)), nil
				}
			}
			if evidenceNode.Kind == db.KindFinding {
				triage := findingPayloadStatus(evidenceNode)
				if findingTriageBlocksGoal(triage) {
					return actool.Errorf(fmt.Sprintf("prove_goal refused: finding %d has status %q, and a false_positive, duplicate, or ignored finding never proves a goal. Goal %d stays open: prove it with a confirmed finding or with an observed fact.", ev, triage, goal)), nil
				}
			}
			// A finding closes a goal only when server-side verification confirms at least
			// one bound traffic_ref matching the finding's asset host (#124, P4.3).
			// Lookup errors fail closed; unbound findings remain saved and visible.
			if evidenceNode.Kind == db.KindFinding {
				check, err := t.ts.VerifyFindingProofForNode(ctx, evidenceNode.ID, t.trafficProofChecker)
				if err != nil {
					return actool.Errorf(fmt.Sprintf("prove_goal refused (fail-closed): finding %d proof verification unavailable (%v). Goal %d stays open.", ev, err, goal)), nil
				}
				if !check.Proven {
					return actool.Errorf(fmt.Sprintf("prove_goal refused: finding %d cannot close goal %d (%s). The finding remains recorded and visible; bind at least one verified traffic_ref matching the finding's asset via bind_finding_traffic, or for non-HTTP goals prove with an observed tool_output fact. Goal %d stays open.", ev, goal, check.Reason, goal)), nil
				}
			}
			_ = t.ts.Link(ev, db.RelProves, goal)
			_ = t.ts.SetNodeState(goal, "met")
			// Each time a goal is marked met, check whether [all goals] of this task are
			// met; if so, automatically judge the task complete (set GoalMet) — no need to
			// rely on the model explicitly calling goal_met.
			if goals, err := t.ts.ListByKind(db.KindGoal, 1000); err == nil && len(goals) > 0 {
				allMet := true
				for _, g := range goals {
					if g.State != "met" {
						allMet = false
						break
					}
				}
				if allMet {
					t.GoalMet = true
					t.Reason = fmt.Sprintf("all %d goals are met (last triggered by goal %d)", len(goals), goal)
					return actool.Text(fmt.Sprintf("goal %d marked met; all goals of this task are met — the task is automatically judged complete", goal)), nil
				}
			}
			return actool.Text(fmt.Sprintf("goal %d marked met", goal)), nil
		})
}

func (t *ToolSet) goalMet() actool.CoreTool {
	return t.writeExpTool("goal_met", "[End the entire task immediately] — call only when you are sure [all of the task's goals are truly met and it is complete overall] (note: the task as a [whole]; having met just one goal / one flag / one finding [does not count] — in that case mark that goal with prove_goal). ⚠️ It is NOT for \"ending this planning round\": if there is no new intent to dispatch this round, or you're waiting on worker output, [just end the round — do NOT call this tool] (0 intents is a perfectly normal outcome). Prefer prove_goal to prove goals one by one; goal_met is only a means to skip per-goal proofs and complete the task globally.",
		obj(map[string]any{"reason": str("grounds for completion (must be evidence that the goals are truly met, not a round-ending reason like 'no new directions this round')")}, "reason"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct{ Reason string }
			_ = json.Unmarshal(in, &a)
			// goal_met ends the task only when no goal node is open (#124, F5). A task
			// without goal nodes keeps the old behavior.
			goals, err := t.ts.ListByKind(db.KindGoal, 1000)
			if err != nil {
				return actool.Errorf("goal_met refused: the goals of this task could not be read (" + err.Error() + "); the task stays open"), nil
			}
			open := 0
			for _, g := range goals {
				if g.State != "met" {
					open++
				}
			}
			if open > 0 {
				return actool.Errorf(fmt.Sprintf("goal_met refused: %d of %d goals of this task are still open; the task stays open. Prove each one with prove_goal(goal_id, evidence_id, reason): the task completes automatically when its last goal is marked met.", open, len(goals))), nil
			}
			t.GoalMet = true
			t.Reason = a.Reason
			return actool.Text("acknowledged: goal marked met"), nil
		})
}

// --- worker write tools ---

func (t *ToolSet) addFinding() actool.CoreTool {
	return writeTool("report_finding", "Record a confirmed finding, with evidence providing verifiable proof such as command output and logs. In a task context, pass the current intent_id. The returned finding_id is the standalone finding record ID; finding_node_id is the exploration node ID (the first line keeps that node number). A finding without bound traffic stays recorded and visible, but cannot close a goal via prove_goal until verified traffic matching its asset host is bound (for non-HTTP goals, prove with an observed tool_output fact).", obj(map[string]any{
		"vulnclass": str("vulnerability class"), "name": str("vulnerability name"), "severity": str("critical|high|medium|low"), "summary": str("finding summary"),
		"intent_id": idp("the current task's intent id"), "asset_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "affected asset ids"},
		"evidence":         str("evidence/PoC text"),
		"evidence_hint_id": idp("optional: the hint node ID in this task corresponding to this finding; automatically carries its structured traffic_refs; cannot reference an inherited hint or another finding's hint"),
		"traffic_refs": map[string]any{"type": "array", "description": "optional; for HTTP/HTTPS findings, first search and verify entry by entry that the requests/responses actually support the finding's conclusion, then fill in real IDs in reproduction order. For TCP and other non-HTTP findings, or when nothing was captured or no exact record is found, omit or pass [] — it does not block reporting; explain why in evidence and provide other verifiable evidence. Don't guess IDs, infer association by domain/time, or re-probe just to pad the packet count. Roles: baseline = normal control / proof = vulnerability proof / verification = supplementary verification / supporting = auxiliary evidence.",
			"items": obj(map[string]any{"traffic_id": str("a real traffic ID returned by traffic_search"), "role": map[string]any{"type": "string", "enum": []string{"baseline", "proof", "verification", "supporting"}}, "note": str("how this traffic supports the finding's conclusion")}, "traffic_id")},
		"counterevidence":      str("optional: what you tested that did not work (variants, paths, or bypasses that were blocked or came back negative). Fill it when your confidence is not high; omitting it never blocks reporting."),
		"confidence_rationale": str("optional: why the conclusion holds (which observation rules out the benign explanation). Fill it when your confidence is not high; omitting it never blocks reporting."),
		"force_register":       map[string]any{"type": "boolean", "description": "optional: register even though the advisory duplicate check would suppress this finding. Use it only after a suppression when the new evidence is in fact a distinct defect (different endpoint, parameter or root cause); the suppression answer says so and names the finding it matched."},
	}, "vulnclass", "severity", "summary"), func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
		var a struct {
			VulnClass, Name, Severity, Summary, Evidence string
			Counterevidence                              string            `json:"counterevidence"`
			ConfidenceRationale                          string            `json:"confidence_rationale"`
			ForceRegister                                bool              `json:"force_register"`
			IntentID                                     json.RawMessage   `json:"intent_id"`
			AssetIDs                                     []json.RawMessage `json:"asset_ids"`
			TrafficRefs                                  []db.TrafficRef   `json:"traffic_refs"`
			EvidenceHintID                               json.RawMessage   `json:"evidence_hint_id"`
		}
		if err := json.Unmarshal(in, &a); err != nil {
			return actool.Errorf(err.Error()), nil
		}
		if t.ts == nil {
			return actool.Errorf("report_finding requires a task context; from a platform conversation, hand the finding to the corresponding task via add_task_hint with the existing traffic_refs in the hint, and let the task agent register it. Already-registered findings can be bound later via bind_finding_traffic."), nil
		}
		// Auto-binding off: ignore the evidence params instead of rejecting the call.
		// stripTrafficParameters already removes them from the advertised schema, but
		// models routinely emit fields anyway — failing here would discard a confirmed
		// finding over a stray parameter. The success path below reports evidence_status
		// "not_bound" with the "off; link manually on the page" note, which is what the
		// caller needs.
		if !findingTrafficBindingEnabled() {
			a.TrafficRefs, a.EvidenceHintID = nil, nil
		}
		// A model routinely emits "evidence_hint_id": 0 meaning "absent" — the field
		// is optional, so 0 must mean "no hint", not an error. A hint id that does
		// not resolve to a local hint node (passing a fact node number is the common
		// case) must not sink an otherwise complete finding either: when explicit
		// traffic_refs are present they are sufficient on their own, so degrade to
		// them and keep the finding. Only a call with neither usable hint nor usable
		// refs fails.
		refs, err := t.findingRefsFromHint(pid(a.EvidenceHintID), a.TrafficRefs)
		if err != nil {
			if degraded, derr := db.NormalizeTrafficRefs(a.TrafficRefs); derr == nil && len(degraded) > 0 {
				refs = degraded
			} else {
				return actool.Errorf(err.Error()), nil
			}
		}
		input := db.RecordFindingInput{TaskID: t.taskID, ExplorationID: t.ts.ID(), IntentID: pid(a.IntentID), VulnClass: a.VulnClass, Name: a.Name, Severity: a.Severity, Summary: a.Summary, Evidence: a.Evidence, Worker: t.worker, AssetIDs: pidList(a.AssetIDs), Counterevidence: a.Counterevidence, ConfidenceRationale: a.ConfidenceRationale}
		// Advisory dedup (agent/triage.go): a decision model answers "same defect as
		// an already registered finding?" in one small request instead of a
		// main-model turn. A confident duplicate is not registered a second time —
		// the caller is told which finding to extend. Every failure path (no client,
		// no existing findings, transport error, low confidence) falls through to
		// the normal registration below.
		//
		// force_register is the way back out of a wrong suppression: without it the
		// advice "register it again if it is distinct" is unactionable, because the
		// retry hits the same check and is suppressed again.
		if a.ForceRegister {
			log.Printf("[triage] override: force_register set, registering %q without the duplicate check", a.Name)
		} else if ans, ok := t.triageDuplicate(ctx, input); ok && triageDuplicateHit(ans) {
			res := map[string]any{
				"duplicate_of_finding_id":      ans.DuplicateOf,
				"duplicate_of_finding_node_id": ans.DuplicateOfNode,
				"triage_confidence":            ans.Confidence,
				"evidence_status":              "duplicate_not_registered",
				"note": fmt.Sprintf("Triage matched this finding to already registered finding_id %d (exploration node %d), so no new finding was created. "+
					"To extend that finding, call update_finding_report with finding_id=%d (it addresses the NODE id, not the findings-table id). "+
					"If the new evidence is in fact a distinct defect (different endpoint, parameter or root cause), call report_finding again with force_register=true.",
					ans.DuplicateOf, ans.DuplicateOfNode, ans.DuplicateOfNode),
			}
			raw, _ := json.Marshal(res)
			return actool.Text(fmt.Sprintf("finding matched to existing finding_id %d (node %d, triage confidence %.2f) — not registered again\n%s", ans.DuplicateOf, ans.DuplicateOfNode, ans.Confidence, raw)), nil
		}
		var recorded *db.RecordedFinding
		if t.findingRecorder != nil {
			recorded, err = t.findingRecorder.Record(ctx, input, refs)
		} else if len(refs) > 0 {
			return actool.Errorf("traffic evidence store unavailable; the finding was NOT registered"), nil
		} else {
			recorded, err = t.ts.RecordFinding(ctx, input)
		}
		if err != nil {
			return actool.Errorf(err.Error()), nil
		}
		if t.notifyFinding != nil {
			iid := input.IntentID
			if iid <= 0 {
				iid = t.ownerNode
			}
			t.notifyFinding(iid, a.Summary)
		} else if t.notify != nil {
			t.notify()
		}
		t.writes.Findings++
		// Keep the first line's node-ID contract for existing reporter triggers.
		for i := range recorded.Traffic.Bindings {
			recorded.Traffic.Bindings[i].Snapshot.ReqHead = ""
			recorded.Traffic.Bindings[i].Snapshot.RespHead = ""
		}
		result := struct {
			*db.RecordedFinding
			EvidenceStatus string `json:"evidence_status"`
			EvidenceNote   string `json:"evidence_note,omitempty"`
		}{RecordedFinding: recorded, EvidenceStatus: "bound"}
		if len(recorded.Traffic.Bindings) == 0 {
			result.EvidenceStatus = "not_bound"
			result.EvidenceNote = "Finding saved without bound traffic (recorded and visible, but cannot close a goal via prove_goal until verified traffic matching its asset is bound). Bind verified HTTP traffic via bind_finding_traffic or the findings page; for non-HTTP goals, prove the goal with an observed tool_output fact. Do not create the finding again."
			if !findingTrafficBindingEnabled() {
				result.EvidenceNote = "Finding saved without bound traffic. Automatic agent traffic binding is off: this finding remains visible but cannot close a goal unless traffic is bound manually later (or a non-HTTP goal is proven with an observed tool_output fact)."
			}
		}
		raw, _ := json.Marshal(result)
		return actool.Text(fmt.Sprintf("finding recorded: %d\n%s", recorded.NodeID, raw)), nil
	})
}

// recordFact writes a general exploration RESULT/conclusion (not a vuln, not a
// new asset) into the EXPLORATION graph, chained to the intent that produced it.
// This is the home for observations and — importantly — negative results
// ("port closed", "param not injectable", "no login found"). Such conclusions
// must NOT be stuffed into the asset graph via upsert_asset.
// factItem is one fact of a record_fact batch/single call.
type factItem struct {
	Summary        string            `json:"summary"`
	Detail         string            `json:"detail"`
	Evidence       string            `json:"evidence"`   // one line of key evidence (command + key output lines) supporting the conclusion, for later verification
	Confidence     string            `json:"confidence"` // observed (seen directly) | inferred (inferred from phenomena)
	Source         string            `json:"source"`     // where the content came from, one of factSources; empty = inference
	IntentID       json.RawMessage   `json:"intent_id"`
	AssetIDs       []json.RawMessage `json:"asset_ids"`
	TestedAssetIDs []json.RawMessage `json:"tested_asset_ids"`
}

// Fact sources (#124, F4): where a fact's content came from, as declared by the
// agent that recorded it. The writer itself is the node's origin column, set by
// the server, never by this field.
const (
	factSourceTargetResponse  = "target_response"   // content the target itself returned (pages, headers, error bodies)
	factSourceToolOutput      = "tool_output"       // a tool's own result about the target (port states, scanner verdicts)
	factSourceThirdPartyIntel = "third_party_intel" // external sources: OSINT, CVE databases, public reports
	factSourceOperatorInput   = "operator_input"    // given by the human operator
	factSourceInference       = "inference"         // the agent's own reasoning; the default
)

var factSources = []string{factSourceTargetResponse, factSourceToolOutput, factSourceThirdPartyIntel, factSourceOperatorInput, factSourceInference}

// Fact provenance (#124, row 1): the source above is declared by the agent, so
// on its own it cannot distinguish an observation from a claim. The server ties
// each fact to a recorded activity of its intent and stores the result beside
// the payload; only a tie (or an explicit operator statement) is authoritative.
const (
	factProvenanceRecorded   = "recorded_activity" // evidence quoted from this intent's activity
	factProvenanceCaptured   = "captured_traffic"  // the quoted bytes came back from the target through the proxy
	factProvenanceOperator   = "operator_input"    // told to the agent by the human operator
	factProvenanceUnverified = "unverified"        // no recorded activity carries the evidence
)

// factCaptureWindowBefore/After bound the proxy captures considered part of one
// recorded activity. The activity row is written when the tool call returns, so
// the matching response lands just before it; the margins absorb slow calls and
// small clock differences between the two stores.
const (
	factCaptureWindowBefore = 10 * time.Minute
	factCaptureWindowAfter  = 2 * time.Minute
)

// FactTrafficLookup is the proxy capture store seen from the fact layer. Kept as
// an interface so the agent does not depend on the traffic package. nil = no
// capture available, and facts keep the activity-only classification.
type FactTrafficLookup interface {
	ResponseContaining(lines []string, fromTS, toTS int64) (id string, ok bool, err error)
}

// factEvidenceMinRunes keeps trivial fragments (a bare tool name, "200 OK")
// from tying a fact to unrelated activity. A real evidence line quotes the
// output; a paraphrase matches nothing, which fails safe (unverified, not
// authoritative).
const factEvidenceMinRunes = 12

// factEvidenceMaxLines bounds the lookup cost of one record_fact item.
const factEvidenceMaxLines = 20

// factEvidenceLines splits a fact's one-line evidence into the substantive lines
// the server can look for verbatim in the intent's recorded activity.
func factEvidenceLines(evidence string) []string {
	out := make([]string, 0, 4)
	seen := map[string]bool{}
	for _, raw := range strings.Split(evidence, "\n") {
		line := strings.TrimSpace(raw)
		if len([]rune(line)) < factEvidenceMinRunes || seen[line] {
			continue
		}
		seen[line] = true
		out = append(out, line)
		if len(out) == factEvidenceMaxLines {
			break
		}
	}
	return out
}

// factProvenance classifies one fact against the intent's recorded activity.
// Beyond the activity tie it checks whether the quoted bytes were captured
// coming back from the target through the proxy, in which case the target
// authored them and the fact is classified target_response even when the model
// wrote tool_output (#124 row 1, step 3). A database error keeps the fact
// (writes must not fail on the check) but marks it unverified, so the
// conservative outcome is the one that survives.
func (t *ToolSet) factProvenance(source, evidence string, intent int64) (status string, activityID int64, trafficID string, note string) {
	if source == factSourceOperatorInput {
		return factProvenanceOperator, 0, "", ""
	}
	if intent <= 0 || t.ts == nil {
		return factProvenanceUnverified, 0, "", "no intent was recorded, so no activity could corroborate the evidence"
	}
	lines := factEvidenceLines(evidence)
	if len(lines) == 0 {
		return factProvenanceUnverified, 0, "", "evidence is missing or too short to quote a recorded activity; a fact proves a goal only when its evidence is tied to one"
	}
	id, at, ok, err := t.ts.ActivityContainingEvidence(intent, lines)
	if err != nil {
		return factProvenanceUnverified, 0, "", "the recorded activity could not be read, so the evidence is unverified"
	}
	if !ok {
		return factProvenanceUnverified, 0, "", "evidence does not quote any line of this intent's recorded activity; quote the output verbatim instead of paraphrasing it"
	}
	if t.factTraffic != nil && !at.IsZero() {
		from, to := at.Add(-factCaptureWindowBefore).Unix(), at.Add(factCaptureWindowAfter).Unix()
		// A capture miss or an unreadable capture store is not a write failure:
		// the activity tie stands and the fact stays classified as tool output.
		if tid, hit, _ := t.factTraffic.ResponseContaining(lines, from, to); hit && tid != "" {
			return factProvenanceCaptured, id, tid, ""
		}
	}
	return factProvenanceRecorded, id, "", ""
}

// normalizeFactSource returns the stored source for a record_fact input: empty
// means inference, a value outside factSources is an error.
func normalizeFactSource(s string) (string, error) {
	norm := strings.ToLower(strings.TrimSpace(s))
	if norm == "" {
		return factSourceInference, nil
	}
	for _, v := range factSources {
		if norm == v {
			return v, nil
		}
	}
	return "", fmt.Errorf("source %q is not valid: use one of %s (omit it for inference)", s, strings.Join(factSources, ", "))
}

// recordOneFact writes one fact node and links it to the intent (intent→yields→fact).
// defaultIntent is the default intent for batch mode (used when this item gives no
// intent_id).
func (t *ToolSet) recordOneFact(it factItem, defaultIntent int64) (int64, error) {
	if strings.TrimSpace(it.Summary) == "" {
		return 0, fmt.Errorf("summary must not be empty: every fact, including each batch item, requires its own one-sentence summary")
	}
	source, err := normalizeFactSource(it.Source)
	if err != nil {
		return 0, err
	}
	anchors, err := it.factAssetAnchors()
	if err != nil {
		return 0, err
	}
	intent := pid(it.IntentID)
	if intent <= 0 {
		intent = defaultIntent
	}
	if intent > 0 {
		node, err := t.ts.GetNode(intent)
		if err != nil || node == nil || node.Kind != db.KindIntent {
			return 0, fmt.Errorf("intent_id must be an intent of this task (related-task intents are read-only)")
		}
	}
	// Tie the claim to recorded work before storing it (#124 row 1). A fact the
	// server cannot corroborate loses the authority its declared source and
	// confidence imply: it is stored as inference/inferred and marked unverified,
	// so prove_goal refuses it even if the model labelled it observed.
	confidence := strings.TrimSpace(it.Confidence)
	prov, provActivity, provTraffic, provNote := t.factProvenance(source, it.Evidence, intent)
	if prov == factProvenanceUnverified {
		if source == factSourceTargetResponse || source == factSourceToolOutput {
			source = factSourceInference
		}
		if strings.EqualFold(confidence, "observed") {
			confidence = "inferred"
		}
	}
	if prov == factProvenanceCaptured {
		// The matched bytes came back from the target, whichever tool carried
		// them: relabel from the capture rather than trusting the declaration.
		source = factSourceTargetResponse
	}
	payload := map[string]any{"summary": it.Summary, "source": source, "provenance": prov}
	if it.Detail != "" {
		payload["detail"] = it.Detail
	}
	if e := strings.TrimSpace(it.Evidence); e != "" {
		payload["evidence"] = e
	}
	if confidence != "" {
		payload["confidence"] = confidence
	}
	if provActivity > 0 {
		payload["provenance_activity_id"] = provActivity
	}
	if provTraffic != "" {
		payload["provenance_traffic_id"] = provTraffic
	}
	if provNote != "" {
		payload["provenance_note"] = provNote
	}
	// a fact is its OWN node kind (distinct from a vuln finding).
	id, err := t.ts.AddNode(db.KindFact, payload, 5, "confirmed", t.worker, anchors)
	if err != nil {
		return 0, err
	}
	if intent > 0 {
		_ = t.ts.Link(intent, db.RelYields, id) // chain: intent -> fact
	}
	t.writes.Facts++
	return id, nil
}

// runningIntent is the intent this ToolSet works for (the worker's claimed
// intent, set by SetOwnerNode), or 0 when the owner node is not an intent
// (planner: the task root) or unknown.
func (t *ToolSet) runningIntent() int64 {
	if t.ts == nil || t.ownerNode <= 0 {
		return 0
	}
	node, err := t.ts.GetNode(t.ownerNode)
	if err != nil || node == nil || node.Kind != db.KindIntent {
		return 0
	}
	return node.ID
}

func (t *ToolSet) recordFact() actool.CoreTool {
	return t.writeExpToolRaw("record_fact", "Write an exploration [fact/conclusion] into the exploration graph, linked to the intent that produced it (intent_id). Used to record exploration results — both [positive conclusions] like fingerprinting/enumeration, and [negative conclusions] like 'port closed'/'parameter not injectable'/'no login entry found'.\n"+
		"⚠️Multiple observations from one exploration must be [consolidated into ONE fact], not split into many; whenever they can be merged into one fact, use one: summary = a one-sentence summary of this conclusion, detail = the related details (may contain multiple concrete items). Example: a fingerprinting intent → one fact {summary:'identified the tech stack and response characteristics of site X', detail:'nginx 1.25 / Vue3 / 200 / title=.. / body_len=..'}, rather than one fact each for status code, fingerprint, and title. One intent usually produces exactly one fact; splitting too finely bloats the graph endlessly.\n"+
		"★facts is the only parameter: facts:[{...}] with one item per [mutually distinct] conclusion, usually exactly one item. Returns an ids array, same length and order as facts. An item without intent_id is linked to the intent you are running.\n"+
		"⚠️Write only conclusions you [actually saw] in tool output — don't extrapolate. evidence and confidence keep inaccurate conclusions from polluting the graph:\n"+
		"  · evidence = [one line] of key evidence supporting this conclusion (the command + the one or two most proving output lines), **keep it brief** — details belong in detail; don't paste large output blocks here.\n"+
		"  · confidence = observed (seen directly in output) | inferred (inferred from phenomena).\n"+
		"  · source = where the content came from: target_response (content the target itself returned: page bodies, headers, error messages, banners, even when a tool fetched it) | tool_output (a tool's own result about the target: port states, scanner verdicts, status codes, timings) | third_party_intel (OSINT, CVE databases, public reports) | operator_input (given by the human operator) |       inference (your own reasoning; the default when omitted). Any other value is refused.\n"+
		"  · **evidence is checked against this intent's recorded activity**: quote the output verbatim rather than paraphrasing it. A fact whose evidence matches no recorded activity is stored as provenance=unverified, its source is downgraded to inference, an observed confidence becomes inferred, and prove_goal refuses it. If the quoted bytes were also captured coming back from the target through the proxy, the server stores source=target_response (provenance=captured_traffic) regardless of the source you declared, because the target authored them.\n"+
		"  · **Negative conclusions** (not injectable / port closed / no entry found, etc.) state only \"observation + tentative reading\" — state what you actually saw; whether to abandon the direction is for the planner to decide globally; always provide evidence, mark inferred when the means weren't exhausted or the evidence is weak (including probed only once, looks-like), and mark observed only when truly exhausted and directly seen."+
		recordFactContractNote,
		recordFactSchema(),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			a, batch, err := decodeRecordFactInput(in)
			if err != nil {
				return actool.Errorf("invalid record_fact input: " + err.Error() + "; no facts were written"), nil
			}
			items := a.Facts
			if !batch {
				items = []factItem{a.factItem}
			}
			// Default intent of the items: a legacy top-level intent_id, else the
			// intent this worker is running (the published schema has no top level).
			defaultIntent := pid(a.factItem.IntentID)
			if defaultIntent <= 0 {
				defaultIntent = t.runningIntent()
			}

			ids := make([]int64, len(items))
			errs := map[string]string{}
			for i, it := range items {
				id, err := t.recordOneFact(it, defaultIntent)
				if err != nil {
					errs[strconv.Itoa(i)] = err.Error()
					continue
				}
				ids[i] = id
			}

			if !batch { // single: keep the original return
				if e, bad := errs["0"]; bad {
					return actool.Errorf(e), nil
				}
				return actool.Text(fmt.Sprintf("fact recorded: %d", ids[0])), nil
			}
			out := map[string]any{"ids": ids}
			if len(errs) > 0 {
				out["errors"] = errs
				out["retry_instruction"] = "Retry only failed indices with complete facts, including summary. Successful indices were already saved; do not retry them."
			}
			result, err := jsonResult(out)
			result.IsError = len(errs) > 0
			return result, err
		})
}

type hintItem struct {
	Text        string            `json:"text"`
	AssetIDs    []json.RawMessage `json:"asset_ids"`
	TrafficRefs []db.TrafficRef   `json:"traffic_refs"`
}

// addOneHint attaches a hint node (active) to the exploration graph, optionally
// anchored to assets; returns the id. Its origin is t.worker, the agent that wrote
// it: "human" for the main-agent chat, "orchestrator" for cross-task orchestration.
func (t *ToolSet) addOneHint(it hintItem) (int64, error) {
	if len(it.TrafficRefs) > 0 && !findingTrafficBindingEnabled() {
		return 0, fmt.Errorf("automatic agent traffic binding is off; the hint carrying traffic_refs was not saved — enable it in system settings, or hand over text only")
	}
	if strings.TrimSpace(it.Text) == "" {
		return 0, fmt.Errorf("text must not be empty")
	}
	var anchors []int64
	for _, raw := range it.AssetIDs {
		if tid := pid(raw); tid > 0 {
			anchors = append(anchors, tid)
		}
	}
	refs, err := db.NormalizeTrafficRefs(it.TrafficRefs)
	if err != nil {
		return 0, err
	}
	payload := map[string]any{"text": it.Text}
	if len(refs) > 0 {
		payload["traffic_refs"] = refs
	}
	// Waking the planner is not done here per item — addHint fires it once after the
	// whole batch is written (carrying the hint texts), so one add_hint with multiple
	// hints doesn't spam the planner's trigger lines one by one.
	return t.ts.AddNode(db.KindHint, payload, 0, "active", t.worker, anchors)
}

type goalItem struct {
	Text      string `json:"text"`
	VulnClass string `json:"vulnclass"`
}

// addOneGoal attaches a goal node (open) to the exploration graph: linked to the
// task root (origin fact, rel spawns). origin comes from t.worker (default system):
// the goals decomposer's writes record "goals", the main agent's runtime writes
// record "human". Waking the planner is done once by setGoals after the whole batch
// (see below); this only persists.
func (t *ToolSet) addOneGoal(it goalItem) (int64, error) {
	text := strings.TrimSpace(it.Text)
	if text == "" {
		return 0, fmt.Errorf("text must not be empty")
	}
	payload := map[string]any{"text": text}
	if vc := strings.TrimSpace(it.VulnClass); vc != "" {
		payload["vulnclass"] = vc
	}
	origin := t.worker
	if origin == "" {
		origin = "system"
	}
	id, err := t.ts.AddNode(db.KindGoal, payload, 0, "open", origin, nil)
	if err != nil {
		return 0, err
	}
	if of, _ := t.ts.OriginFactID(); of > 0 && id > 0 {
		_ = t.ts.Link(of, db.RelSpawns, id) // goals descend from the task root (origin fact)
	}
	return id, nil
}

// setGoals adds exploration goals (goal nodes) to [this task]. It is both the goal
// decomposer's submission tool and the main agent's tool for adding goals at runtime
// — the same managed tool, with description/schema editable in the web UI and
// bindable per agent.
func (t *ToolSet) setGoals() actool.CoreTool {
	return writeTool("set_goals",
		"Add exploration goals (goals) to [this task]. A goal = a final deliverable/verifiable result, not an attack step or recon action.\n"+
			"★Batch preferred: put multiple goals in the goals array in a single submission; the returned ids match it in length and order (failed items get id=0, details in errors). For a single goal, omit goals and pass the top-level text.\n"+
			"vulnclass is optional: the corresponding vulnerability class (e.g. SQLi/IDOR); leave empty for business-logic goals. Whether a goal is met is judged and marked met by the system; this tool only adds.",
		obj(map[string]any{
			"goals":     map[string]any{"type": "array", "description": "[Prefer this] array of goals to add, processed in order. Each element: text (required, an independently verifiable final goal) + vulnclass (optional). The returned ids match this array in length and order.", "items": map[string]any{"type": "object"}},
			"text":      str("[single] one independently verifiable final goal"),
			"vulnclass": str("[single] the corresponding vulnerability class (if clear), e.g. SQLi/IDOR; may be empty for business-logic goals"),
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.ts == nil {
				return actool.Errorf("set_goals is not enabled: ExplorationStore is not initialized"), nil
			}
			var a struct {
				Goals    []goalItem `json:"goals"`
				goalItem            // single mode: top-level text/vulnclass
			}
			_ = json.Unmarshal(in, &a)
			batch := len(a.Goals) > 0
			items := a.Goals
			if !batch {
				items = []goalItem{a.goalItem}
			}

			ids := make([]int64, len(items))
			errs := map[string]string{}
			var addedTexts []string
			for i, it := range items {
				id, err := t.addOneGoal(it)
				if err != nil {
					errs[strconv.Itoa(i)] = err.Error()
					continue
				}
				ids[i] = id
				addedTexts = append(addedTexts, strings.TrimSpace(it.Text))
			}
			if len(addedTexts) > 0 {
				// Wake the planner (once for the whole batch). Prefer notifyGoal: one
				// set_goals records a single "human added N goals: …" trigger instead of
				// spamming one per item; the decomposer/worker don't have this callback →
				// fall back to plain notify (the decomposer's round-0 doesn't even have
				// notify wired, i.e. a no-op, because the planner hasn't started yet).
				switch {
				case t.notifyGoal != nil:
					t.notifyGoal(addedTexts)
				case t.notify != nil:
					t.notify()
				}
				// The main agent adds a goal at runtime → pull a completed/paused task back
				// to running (the terminal gate swallows plain notifies; an explicit revive
				// is required). Only mainagent has this callback wired; decomposer/worker are nil.
				if t.resumeTask != nil {
					t.resumeTask()
				}
			}

			if !batch { // single: keep the original return
				if e, bad := errs["0"]; bad {
					return actool.Errorf(e), nil
				}
				return actool.Text(fmt.Sprintf("goal added: %d", ids[0])), nil
			}
			out := map[string]any{"ids": ids}
			if len(errs) > 0 {
				out["errors"] = errs
			}
			return jsonResult(out)
		})
}

type constraintItem struct {
	Text string `json:"text"`
	Type string `json:"type"` // allow | deny
}

// addOneConstraint persists one operation constraint into task_constraints. origin
// comes from t.worker (default system): the decomposer writes "goals", the main
// agent writes "human".
func (t *ToolSet) addOneConstraint(it constraintItem) (int64, error) {
	text := strings.TrimSpace(it.Text)
	if text == "" {
		return 0, fmt.Errorf("text must not be empty")
	}
	kind := strings.TrimSpace(strings.ToLower(it.Type))
	if kind == "" {
		kind = "deny" // default to deny: more conservative when the type is unmarked
	}
	if kind != "allow" && kind != "deny" {
		return 0, fmt.Errorf("type must be allow or deny")
	}
	return t.ts.AddConstraint(kind, text, t.worker)
}

// setConstraints adds operation constraints to [this task] (allow = what's permitted
// / deny = what's forbidden). It is both the goal decomposer's round-0
// constraint-extraction submission tool and the main agent's tool for adding
// constraints at runtime — the same managed tool, with description/schema editable
// in the web UI and bindable per agent. Constraints are injected into the
// planner/worker system prompts to bound exploration.
func (t *ToolSet) setConstraints() actool.CoreTool {
	return writeTool("set_constraints",
		"Add operation constraints to [this task] to bound exploration: type=allow (operations permitted) or deny (operations forbidden).\n"+
			"A constraint = a rule about 'which operations may/may not be performed' (e.g. 'test only the current port, don't scan others' / 'no write operations on the production database' / 'passive reconnaissance only') — not a goal, not an attack step.\n"+
			"★Batch preferred: put multiple constraints in the constraints array in a single submission; the returned ids match it in length and order (failed items get id=0, details in errors). For a single constraint, omit constraints and pass the top-level text/type.\n"+
			"Register only constraints [explicitly stated] in the task goal/description — don't invent any; when unsure about the type, use deny (more conservative).",
		obj(map[string]any{
			"constraints": map[string]any{"type": "array", "description": "[Prefer this] array of constraints to add, processed in order. Each element: text (required, one constraint) + type (allow|deny). The returned ids match this array in length and order.", "items": map[string]any{"type": "object"}},
			"text":        str("[single] the content of one operation constraint"),
			"type":        str("[single] allow or deny; defaults to deny when omitted"),
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.ts == nil {
				return actool.Errorf("set_constraints is not enabled: ExplorationStore is not initialized"), nil
			}
			var a struct {
				Constraints    []constraintItem `json:"constraints"`
				constraintItem                  // single mode: top-level text/type
			}
			_ = json.Unmarshal(in, &a)
			batch := len(a.Constraints) > 0
			items := a.Constraints
			if !batch {
				items = []constraintItem{a.constraintItem}
			}
			ids := make([]int64, len(items))
			errs := map[string]string{}
			for i, it := range items {
				id, err := t.addOneConstraint(it)
				if err != nil {
					errs[strconv.Itoa(i)] = err.Error()
					continue
				}
				ids[i] = id
			}
			if !batch { // single: keep the simple return
				if e, bad := errs["0"]; bad {
					return actool.Errorf(e), nil
				}
				return actool.Text(fmt.Sprintf("constraint added: %d", ids[0])), nil
			}
			out := map[string]any{"ids": ids}
			if len(errs) > 0 {
				out["errors"] = errs
			}
			return jsonResult(out)
		})
}

func (t *ToolSet) addHint() actool.CoreTool {
	return t.writeExpTool("add_hint", "Attach a strategic hint to the exploration graph; the planner reads it the next time it generates intents. The hint is stored with the calling agent as its origin (human for the main-agent chat, orchestrator for cross-task orchestration, otherwise the agent's name).\n"+
		"★Batch preferred: put multiple hints in the hints array in a single submission (saves round trips vs. one call per item). Returns an ids array, same length and order as hints (failed items get id=0, details in errors). For a single hint, omit hints and pass the top-level text.",
		obj(map[string]any{
			"hints":        map[string]any{"type": "array", "description": "[Prefer this] array of hints to add, processed in order. Each element has the same fields as the top-level ones below (text/asset_ids/traffic_refs). The returned ids match this array in length and order.", "items": obj(map[string]any{"text": str("hint content"), "asset_ids": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}}, "traffic_refs": HintTrafficSchema()})},
			"text":         str("[single] hint content, e.g. 'focus on post-auth endpoints'"),
			"traffic_refs": HintTrafficSchema(),
			"asset_ids":    map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "asset ids to anchor (optional, 0/1/many)"},
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				Hints    []hintItem `json:"hints"`
				hintItem            // single mode: top-level text/asset_ids
			}
			_ = json.Unmarshal(in, &a)
			batch := len(a.Hints) > 0
			items := a.Hints
			if !batch {
				items = []hintItem{a.hintItem}
			}

			ids := make([]int64, len(items))
			errs := map[string]string{}
			var addedTexts []string
			for i, it := range items {
				id, err := t.addOneHint(it)
				if err != nil {
					errs[strconv.Itoa(i)] = err.Error()
					continue
				}
				ids[i] = id
				addedTexts = append(addedTexts, strings.TrimSpace(it.Text))
			}
			if len(addedTexts) > 0 {
				// Wake the planner (once for the whole batch). Prefer notifyHint: one
				// add_hint records a single "<origin> added N strategic hints: …" trigger,
				// so the planner knows "this round was fired by a new hint", who wrote it,
				// and sees its content; when the callback isn't wired, fall back to plain
				// notify (bare wake; the hint is still folded into the graph for it to read).
				switch {
				case t.notifyHint != nil:
					t.notifyHint(t.worker, addedTexts)
				case t.notify != nil:
					t.notify()
				}
			}

			if !batch { // single: keep the original return
				if e, bad := errs["0"]; bad {
					return actool.Errorf(e), nil
				}
				return actool.Text(fmt.Sprintf("hint added: %d", ids[0])), nil
			}
			out := map[string]any{"ids": ids}
			if len(errs) > 0 {
				out["errors"] = errs
			}
			return jsonResult(out)
		})
}

// killWorkTool lets the planner terminate a single running work (by intent id).
func (t *ToolSet) killWorkTool() actool.CoreTool {
	return t.writeExpTool("kill_work", "Terminate a running intent (work). Used to stop off-track/meaningless exploration; the terminated intent is marked stopped and won't be re-claimed automatically. Check what it's doing with get_worker_output before deciding.",
		obj(map[string]any{"intent_id": idp("the id of the intent to terminate (= the work handle)")}, "intent_id"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.killWork == nil {
				return actool.Errorf("kill_work is currently unavailable"), nil
			}
			var a struct {
				IntentID json.RawMessage `json:"intent_id"`
			}
			_ = json.Unmarshal(in, &a)
			id := pid(a.IntentID)
			if id <= 0 {
				return actool.Errorf("intent_id is required"), nil
			}
			node, err := t.ts.GetNode(id)
			if err != nil || node == nil || node.Kind != db.KindIntent {
				return actool.Errorf("intent_id must be an intent of this task (related-task intents are read-only)"), nil
			}
			if err := t.killWork(id); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return actool.Text(fmt.Sprintf("termination signal sent to the work of intent %d", id)), nil
		})
}

// steerWorkTool lets the planner inject a mid-run course-correction into a running
// work WITHOUT killing it: the message reaches the worker before its next tool call,
// which re-plans its next step (already-gathered context is kept). For in-intent
// nudges ("stop doing X, focus on Y"); if the whole direction is wrong use kill_work
// + a new intent.
func (t *ToolSet) steerWorkTool() actool.CoreTool {
	return t.writeExpTool("steer_work", "Inject a course-correction instruction into a running intent (work) in real time, without interrupting it or losing progress: the worker receives your instruction before its next action and adjusts accordingly. For [in-intent] corrections like 'stop doing X, focus on Y'; if the whole direction is wrong, use kill_work and dispatch a new intent instead. Check what it's doing with get_worker_output first.",
		obj(map[string]any{
			"intent_id": idp("the id of the intent to steer (= the work handle)"),
			"message":   str("the course-correction instruction for the worker — state clearly what to stop and what to turn to"),
		}, "intent_id", "message"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.steerWork == nil {
				return actool.Errorf("steer_work is currently unavailable"), nil
			}
			var a struct {
				IntentID json.RawMessage `json:"intent_id"`
				Message  string          `json:"message"`
			}
			_ = json.Unmarshal(in, &a)
			id := pid(a.IntentID)
			if id <= 0 {
				return actool.Errorf("intent_id is required"), nil
			}
			node, err := t.ts.GetNode(id)
			if err != nil || node == nil || node.Kind != db.KindIntent {
				return actool.Errorf("intent_id must be an intent of this task (related-task intents are read-only)"), nil
			}
			if strings.TrimSpace(a.Message) == "" {
				return actool.Errorf("message is required"), nil
			}
			if err := t.steerWork(id, a.Message); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return actool.Text(fmt.Sprintf("course-correction instruction injected into the work of intent %d (takes effect at its next step)", id)), nil
		})
}

// getWorkerOutput returns a work's final (or as-of-abort) conclusion text by intent id.
func (t *ToolSet) getWorkerOutput() actool.CoreTool {
	return t.readExpTool("get_worker_output", "Fetch the final output conclusion of an intent (work) in this task or a directly related task. Related-task results carry source_task_id/inherited=true and are read-only. A normally finished work returns its summary; a terminated (stopped)/failed work returns its last output as of abort.",
		obj(map[string]any{"intent_id": idp("intent id (= the work handle)")}, "intent_id"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				IntentID json.RawMessage `json:"intent_id"`
			}
			_ = json.Unmarshal(in, &a)
			id := pid(a.IntentID)
			if id <= 0 {
				return actool.Errorf("intent_id is required"), nil
			}
			intentNode, err := t.ts.GetNodeWithSources(id)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if intentNode == nil || intentNode.Kind != db.KindIntent {
				return actool.Errorf("intent_id does not belong to this task or its directly related tasks"), nil
			}
			acts, _, err := t.ts.ActivityListWithSources(id, 0, 1000)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			var chosen, fallback *db.Activity
			for i := range acts {
				switch acts[i].Kind {
				case "result":
					chosen = &acts[i]
					fallback = &acts[i]
				case "text":
					fallback = &acts[i]
				}
			}
			pick := chosen
			if pick == nil {
				pick = fallback
			}
			if pick == nil {
				if intentNode.Inherited {
					return jsonResult(inheritedMap(map[string]any{
						"intent_id": id, "final_text": "(this work has no output yet)",
					}, intentNode.SourceTaskID))
				}
				return actool.Text("(this work has no output yet)"), nil
			}
			detail, _ := t.ts.ActivityDetailWithSources(pick.ID)
			if detail == "" {
				detail = pick.Summary
			}
			result := map[string]any{
				"intent_id": id, "final_text": detail,
				"summary": pick.Summary, "is_error": pick.IsError,
			}
			if intentNode.Inherited {
				inheritedMap(result, intentNode.SourceTaskID)
			}
			return jsonResult(result)
		})
}

// traceSteps renders summary-only trace rows, re-truncating each summary to 100
// chars — the stored summary is capped at 200 for the UI transcript; the trace
// tools want it tighter since a whole work's step list is many rows.
func traceSteps(acts []db.Activity) []map[string]any {
	steps := make([]map[string]any, 0, len(acts))
	for i := range acts {
		step := map[string]any{
			"step_id": acts[i].ID, "kind": acts[i].Kind, "tool": acts[i].Tool,
			"is_error": acts[i].IsError, "summary": firstLine(acts[i].Summary, 100),
		}
		if acts[i].Inherited {
			inheritedMap(step, acts[i].SourceTaskID)
		}
		steps = append(steps, step)
	}
	return steps
}

// getWorkerTrace exposes a work's execution PROCESS (not just its final output):
// list step summaries, keyword-search within one work, or pull full detail of a
// few specific steps. Thinking steps are excluded everywhere.
func (t *ToolSet) getWorkerTrace() actool.CoreTool {
	return t.readExpTool("get_worker_trace",
		"View an intent (work)'s [execution process] (unlike get_worker_output, which gives only the final conclusion). Three usages:\n"+
			"① intent_id only → returns a summary stream of the work's steps (summary≤100 chars, with step_id; just an action outline, no full output);\n"+
			"② intent_id + q → returns only the summaries of steps matching the keyword (searches both summaries and full output; still gives only summary — use ③ for content);\n"+
			"③ intent_id + step_ids → returns the full content (detail) of those steps; at most 5 per call — extras are dropped after the first 5 and reported in notice/omitted_step_ids.\n"+
			"Typical flow: locate suspicious steps' step_ids with ①/②, then fetch their full output with ③. Thinking steps are excluded. Historical traces of directly related tasks are supported; their results carry source_task_id/inherited=true and are read-only.",
		obj(map[string]any{
			"intent_id": idp("intent id (= the work handle)"),
			"q":         str("keyword: return only steps whose summary/full output matches it (optional; mutually exclusive with step_ids)"),
			"step_ids":  map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "step_ids to fetch full content for (from ①/② returns; at most 5 per call — extras beyond the first 5 are listed in omitted_step_ids)"},
			"limit":     intp("return cap for the summary stream/search (optional)"),
		}, "intent_id"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				IntentID json.RawMessage   `json:"intent_id"`
				Q        string            `json:"q"`
				StepIDs  []json.RawMessage `json:"step_ids"`
				Limit    int               `json:"limit"`
			}
			_ = json.Unmarshal(in, &a)
			id := pid(a.IntentID)
			if id <= 0 {
				return actool.Errorf("intent_id is required"), nil
			}
			intentNode, nodeErr := t.ts.GetNodeWithSources(id)
			if nodeErr != nil {
				return actool.Errorf(nodeErr.Error()), nil
			}
			if intentNode == nil || intentNode.Kind != db.KindIntent {
				return actool.Errorf("intent_id does not belong to this task or its directly related tasks"), nil
			}
			// ③ detail drill-down by step ids, thinking excluded by the store.
			if len(a.StepIDs) > 0 {
				// Dedup + drop invalid ids first so garbage/duplicates don't eat into
				// the per-call cap. detail is returned in full (untruncated), so the
				// cap bounds one tool result; over the cap we serve the first N and
				// tell the model exactly which ids were deferred, instead of erroring
				// and forcing it to re-plan the call.
				const maxStepIDs = 5
				var ids []int64
				seen := make(map[int64]bool)
				for _, raw := range a.StepIDs {
					if v := pid(raw); v > 0 && !seen[v] {
						seen[v] = true
						ids = append(ids, v)
					}
				}
				var omitted []int64
				if len(ids) > maxStepIDs {
					omitted = append(omitted, ids[maxStepIDs:]...)
					ids = ids[:maxStepIDs]
				}
				acts, err := t.ts.ActivityByIDsWithSources(ids)
				if err != nil {
					return actool.Errorf(err.Error()), nil
				}
				steps := make([]map[string]any, 0, len(acts))
				for i := range acts {
					if acts[i].NodeID == nil || *acts[i].NodeID != id || acts[i].Inherited != intentNode.Inherited ||
						(acts[i].Inherited && acts[i].SourceTaskID != intentNode.SourceTaskID) {
						continue
					}
					step := map[string]any{
						"step_id": acts[i].ID, "kind": acts[i].Kind, "tool": acts[i].Tool,
						"is_error": acts[i].IsError, "detail": acts[i].Detail,
					}
					if acts[i].Inherited {
						inheritedMap(step, acts[i].SourceTaskID)
					}
					steps = append(steps, step)
				}
				result := map[string]any{"intent_id": id, "steps": steps, "returned_step_ids": ids}
				if len(omitted) > 0 {
					// returned_step_ids/omitted_step_ids let the model decide programmatically
					// whether another call is worth it; the notice states the same in prose.
					result["omitted_step_ids"] = omitted
					result["notice"] = fmt.Sprintf(
						"At most %d steps' full content per call; this call returned the first %d (%v); the %d not fetched are %v."+
							"If these are enough to locate the issue, no need to fetch the rest; if you really need to continue, call again with those step_ids.",
						maxStepIDs, len(ids), ids, len(omitted), omitted)
				}
				if intentNode.Inherited {
					inheritedMap(result, intentNode.SourceTaskID)
				}
				return jsonResult(result)
			}
			// ①/② summary stream, optionally keyword-filtered; 100-char summaries.
			var acts []db.Activity
			var err error
			if strings.TrimSpace(a.Q) != "" {
				acts, err = t.ts.ActivityTraceSearchWithSources(id, a.Q, a.Limit)
			} else {
				acts, err = t.ts.ActivityTraceWithSources(id, a.Limit)
			}
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			result := map[string]any{"intent_id": id, "steps": traceSteps(acts)}
			if intentNode.Inherited {
				inheritedMap(result, intentNode.SourceTaskID)
			}
			return jsonResult(result)
		})
}

// searchAllWorkerTraces keyword-searches EVERY work's process in this task — for
// finding what a worker saw but never wrote back as a fact. Returns only matching
// summaries (≤100 chars), each tagged with its intent_id for follow-up drill-down.
func (t *ToolSet) searchAllWorkerTraces() actool.CoreTool {
	return t.readExpTool("search_all_worker_traces",
		"[Usually not recommended — the system already provides most of the information] Keyword-search (q) across [the execution processes of this task's other works] — to recover something a worker saw but never wrote into a fact (a path/token/error etc.)."+
			"Your own intent's steps are automatically excluded (those are already in your context)."+
			"Returns only the matching steps' summaries (summary≤100 chars), each with its intent_id; then fetch full content via get_worker_trace(intent_id, step_ids=[...]).",
		obj(map[string]any{
			"q":     str("keyword (searched in all work steps' summaries + full output)"),
			"limit": intp("return cap, default 100 (optional)"),
		}, "q"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				Q     string `json:"q"`
				Limit int    `json:"limit"`
			}
			_ = json.Unmarshal(in, &a)
			if strings.TrimSpace(a.Q) == "" {
				return actool.Errorf("q is required"), nil
			}
			// Exclude the caller's own intent's steps (a worker's own trace is already in its context).
			acts, err := t.ts.ActivityTraceSearchAllWithSources(t.ownerNode, a.Q, a.Limit)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			hits := make([]map[string]any, 0, len(acts))
			for i := range acts {
				var intent int64
				if acts[i].NodeID != nil {
					intent = *acts[i].NodeID
				}
				hit := map[string]any{
					"intent_id": intent, "step_id": acts[i].ID, "worker": acts[i].Worker,
					"kind": acts[i].Kind, "tool": acts[i].Tool, "is_error": acts[i].IsError,
					"summary": firstLine(acts[i].Summary, 100),
				}
				if acts[i].Inherited {
					inheritedMap(hit, acts[i].SourceTaskID)
				}
				hits = append(hits, hit)
			}
			return jsonResult(map[string]any{"query": a.Q, "hits": hits})
		})
}

// listWorkerTraces gives a worker (which has no graph_overview and can't see the
// intent graph) a lightweight index of the works in this task — intent_id +
// one-line summary + state — so it can DISCOVER which works to inspect via
// get_worker_trace. Without this a worker only knows intent_ids that come back
// from search_all_worker_traces hits. Excludes still-open intents (not yet run →
// no process to inspect).
func (t *ToolSet) listWorkerTraces() actool.CoreTool {
	return t.readExpTool("list_worker_traces",
		"[Usually not recommended — the system already provides most of the information] List the index of [works (intents) that have run] in this task: intent_id + one-line direction (summary) + state."+
			"You (worker) can't see the exploration graph; use it to discover which works are worth reviewing — then view their steps with get_worker_trace(intent_id) and fetch details with get_worker_trace(intent_id, step_ids=[...])."+
			"Only executed ones are listed (running/done/exhausted/blocked/stopped), not the not-yet-run open ones. Note: your task boundary is still the intent you claimed; looking at other works is only for reusing observations/avoiding duplicate work.",
		obj(map[string]any{
			"q":     str("filter by summary keyword (optional)"),
			"limit": intp("return cap, default 50 (optional)"),
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				Q     string `json:"q"`
				Limit int    `json:"limit"`
			}
			_ = json.Unmarshal(in, &a)
			limit := a.Limit
			if limit <= 0 {
				limit = 50
			}
			all, err := t.ts.ListByKindWithSources(db.KindIntent, 500)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			q := strings.ToLower(strings.TrimSpace(a.Q))
			out := make([]map[string]any, 0, limit)
			for _, n := range all {
				if n.Inherited && n.State == "running" {
					continue
				}
				switch n.State {
				case "running", "done", "exhausted", "blocked", "stopped": // has run → has a process
				default:
					continue
				}
				var p map[string]any
				_ = json.Unmarshal(n.Payload, &p)
				summary, _ := p["summary"].(string)
				if q != "" && !strings.Contains(strings.ToLower(summary), q) {
					continue
				}
				item := map[string]any{"intent_id": n.ID, "summary": summary, "state": n.State}
				if n.Inherited {
					inheritedMap(item, n.SourceTaskID)
				}
				out = append(out, item)
				if len(out) >= limit {
					break
				}
			}
			return jsonResult(map[string]any{"works": out})
		})
}

// PlannerTools is the read + intent-generation + goal-judgement tool set.
func (t *ToolSet) PlannerTools() []actool.CoreTool {
	return []actool.CoreTool{
		t.graphOverview(), t.listFindings(), t.listFacts(), t.nodeDetail(),
		// cold-digest §6.1: restore folded cold nodes (digest body → members → detail).
		t.expandDigest(),
		t.getWorkerOutput(), t.getWorkerTrace(), t.searchAllWorkerTraces(), t.listGoals(), t.addIntent(), t.proveGoal(), t.goalMet(),
		t.killWorkTool(), t.steerWorkTool(),
		// report_finding: if the planner itself has confirmed a finding during
		// situational assessment, it can register it directly (same tool as the worker's).
		t.addFinding(),
		// list_companies: view the company list + scopes + asset counts (to get
		// company_id / understand attribution scopes).
		t.listCompanies(),
		// list_assets: DSL search of the whole asset library while planning
		// (complementing list_untested_assets' "in-scope untested" view with the ability
		// to "query the whole library by domain/fingerprint/port/status code etc.").
		t.listAssets(),
		// add_company_scope: while planning, pull domains/IPs/CIDRs/ICP
		// registrations/keywords into a company's asset scope (matching assets are
		// auto-claimed).
		t.addCompanyScope(),
		// add_task_scope: deliberately pull a whole root domain / whole company / a
		// subdomain / an IP into this task's test scope (the coverage denominator).
		t.addTaskScope(),
		// list_untested_assets: query untested assets in this task's scope on demand
		// (by type + paginated), and decide on supplementary testing yourself.
		t.listUntestedAssets(),
	}
}
