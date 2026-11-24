package agent

import (
	"context"
	"fmt"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/harness"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
	"github.com/Autumn-27/norma/transcript"
)

// MainAgent is the thin human-interface orchestrator (docs §4.2 / §7). The human
// chats with it; it observes (read tools), and steers by injecting hints
// (→planner) or direct high-priority intents (→frontier). It does NOT run the
// autonomous intent-generation loop (that is the planner's job).
type MainAgent struct {
	findingRecorder FindingRecorder
	prov            llm.Provider
	model           string
	tx              *transcript.Store                      // raw LLM conversation persistence (nil = off)
	window          int                                    // context window in tokens (for compaction)
	windowFn        func() int                             // optional dynamic task-chain minimum
	maxTurns        int                                    // max agent turns per run (0 = unlimited)
	proxyAddr       string                                 // recording proxy for WebFetch (empty = direct)
	proxyCACert     string                                 // recording proxy's CA cert path (HTTPS verify)
	factTraffic     FactTrafficLookup                      // proxy captures for fact provenance (nil = activity-only)
	webSearch       WebSearchOpts                          // web_search tool backend selection (off by default)
	workDir         string                                 // shared work dir (surfaced in prompt as artifact-output target)
	steerWork       func(intentID int64, msg string) error // engine callback: steer a running work (nil = off)
	nonStreamingFn  func() bool                            // resolver: use non-streaming (Complete) path? (nil = streaming)
	noaEnabledFn    func() bool                            // resolver: use experimental noa compaction? (nil = off)
	maxTokensFn     func() int                             // resolver: per-reply output cap (nil/0 = send no cap)
}

// SetNoaEnabled wires a resolver deciding whether runs use the experimental noa
// context-compression mechanism. nil/unset = off (built-in compaction). Read per
// run so the settings toggle takes effect without rebuilding the agent.
func (m *MainAgent) SetNoaEnabled(fn func() bool) { m.noaEnabledFn = fn }

// SetNonStreaming wires a resolver deciding whether runs use the non-streaming
// model path (true = non-streaming). nil/unset = streaming (default).
func (m *MainAgent) SetNonStreaming(fn func() bool) { m.nonStreamingFn = fn }

func (m *MainAgent) nonStreaming() bool { return m.nonStreamingFn != nil && m.nonStreamingFn() }

// SetMaxTokens wires a resolver for the per-reply output cap. nil/unset or 0 =
// send no cap and let the endpoint decide. Read per run, like nonStreaming.
func (m *MainAgent) SetMaxTokens(fn func() int) { m.maxTokensFn = fn }

func (m *MainAgent) maxTokens() int {
	if m.maxTokensFn == nil {
		return 0
	}
	return m.maxTokensFn()
}

func NewMainAgent(prov llm.Provider, model, workDir string, tx *transcript.Store, window, maxTurns int) *MainAgent {
	return &MainAgent{prov: prov, model: model, workDir: workDir, tx: tx, window: window, maxTurns: maxTurns}
}

func (m *MainAgent) SetCompactionWindowResolver(fn func() int) { m.windowFn = fn }

func (m *MainAgent) compactionWindow() int {
	if m.windowFn != nil {
		return m.windowFn()
	}
	return m.window
}

// SetProxy points the main agent's WebFetch at the recording proxy plus the CA
// cert it trusts to verify HTTPS through it (empty addr = direct).
func (m *MainAgent) SetProxy(addr, caCert string) { m.proxyAddr, m.proxyCACert = addr, caCert }

// SetFactTraffic wires the proxy capture store used to classify recorded facts
// (#124 row 1). nil keeps the activity-only classification.
func (m *MainAgent) SetFactTraffic(l FactTrafficLookup) { m.factTraffic = l }

// SetWebSearch selects the web_search backend for the main agent (off by default).
func (m *MainAgent) SetWebSearch(o WebSearchOpts) { m.webSearch = o }

// SetSteerWork wires the engine callback that lets the main agent's steer_work
// tool inject a mid-run course-correction into a running work (nil = tool off).
func (m *MainAgent) SetSteerWork(fn func(intentID int64, msg string) error) { m.steerWork = fn }

// mainAgentDefaultTmpl is the built-in EDITABLE body (section [A]) of the main agent
// prompt, seeded into agent_prompts. Goal is a {{.Goal}} template var; the
// intermediate-artifact output rules tail is code-owned (artifactSpec), appended after rendering.
const mainAgentDefaultTmpl = `You are the "main agent" of an authorized penetration-testing system, the interface to the human operator. You do not explore in person, nor do you autonomously generate intents in a loop (that is the planner's job). Your duties:

1. Observe: use graph_overview / list_findings / list_facts / list_assets / get_worker_output to answer the human's questions about current progress.
2. Steer (land the human's intent into the system):
   - The human wants to "change direction / emphasize a vulnerability class / focus an area" → write a hint with add_hint (the planner will read it next round).
   - The human wants to "test a specific target right now" → inject one high-priority intent directly with add_intent (priority 8-10). The system automatically pulls a completed task back to running so a worker claims and executes this intent, returning to completed when done.
     **When all task goals are met** (goals in graph_overview are all met): before dispatching, judge whether this intent implies "a new result to achieve". If it does, restate your guessed goal to the human in one sentence and **ask whether to register it as a formal goal** — if yes → register it with set_goals (the task then enters normal planning and the planner advances autonomously); if no / just a quick probe → only add_intent this one, and the task returns to completed once the worker finishes (it will not continue autonomously). If the intent is clearly a one-off check with no new goal implied, just add_intent directly — no need to ask every time.
   - The human wants to "course-correct a running intent (work) in realtime (stop doing X, focus on Y)" → use steer_work (no interruption, no progress lost; takes effect before the worker's next action); first check what it is doing with get_worker_output. If the direction is entirely wrong, dispatch a new intent with add_intent instead.
   - The human wants to "add a new final goal to achieve" → add the goal with set_goals. The system writes the goal into the task graph and **automatically pulls the completed/paused task back to running** (the planner will re-judge completion accordingly), no manual resume needed.
   - The human wants to "add/change test constraints (allow/forbid certain operations, e.g. 'only test the current port', 'no brute forcing', 'passive recon only')" → register them with set_constraints (type=allow / type=deny). Constraints are injected into the planner/worker prompts at the next planning round to bound exploration; they can also be managed in the overview's "Constraint management".
3. Reply concisely in plain language, stating what you did.

Current task goal: {{.Goal}}

Do not fabricate findings; answer only from real data returned by tools.`

func mainAgentSystem(goal, dataDir, workDir string) string {
	body := renderSystem("mainagent", mainAgentDefaultTmpl, MainVars{Goal: goal, DataDir: dataDir, Now: nowStr()})
	return body + untrustedContentTail(body) + artifactSpec(workDir) + noiseProfileBlock()
}

// Chat handles one human message and returns the assistant reply. emit, if
// non-nil, receives each execution step (thinking / tool_use / tool_result /
// text / result) so the main-agent session shows its work — exactly like the
// worker/planner sessions — not just the final answer. hooks (the task's
// target-only Guard) sees every tool call; may be nil.
func (m *MainAgent) Chat(ctx context.Context, taskID int64, mainSeg int, as *db.AssetStore, ts *db.ExplorationStore, goal, message string, hooks harness.HookRunner, emit func(db.Activity), notify, resume func(), notifyGoal func([]string), notifyHint func(string, []string)) (string, error) {
	tsx := NewToolSet(ts, "human")
	tsx.SetFindingRecorder(m.findingRecorder)
	tsx.SetFactTraffic(m.factTraffic)
	if as != nil {
		tsx.SetAssetStore(as, as.Companies())
	}
	tsx.SetTaskID(taskID)
	tsx.SetCoverageEnabled(coverageOn(as, taskID))
	tsx.SetNotify(notify)         // generic wake-up (write ops without a dedicated callback go through it, debounced)
	tsx.SetResumeTask(resume)     // set_goals adds a goal → pull a completed/paused task back to running
	tsx.SetNotifyGoal(notifyGoal) // set_goals adds a goal → record a "human added a goal: …" trigger for the planner
	tsx.SetNotifyHint(notifyHint) // add_hint adds hints → record a "human added N strategic hints: …" trigger for the planner (origin "human")
	tsx.steerWork = m.steerWork   // enable steer_work tool (nil = unavailable)
	// domain tools + basic default toolset (Read/Write/Edit/MultiEdit/LS/Glob/Grep/Bash)
	// when the asset coverage feature is off, drop add_task_scope/list_untested_assets (not in the prompt).
	base := append(tsx.DropCoverageTools(tsx.MainAgentTools()), defaultTools(m.workDir)...)
	ctx = WithRunInfo(ctx, RunInfo{TaskID: taskID, ExplorationID: explorationID(ts)})
	tools, def, cleanup := AugmentTools(ctx, "mainagent", base)
	defer cleanup()
	// the main run directory <workDir>/tasks/<taskID>/main, created up front.
	mainDir := ensureRunDir(m.workDir, taskID, 0)
	ctx = intercept.WithReviewWorkingDirectory(ctx, mainDir)
	system, boundary := deferredSystem(mainAgentSystem(goal, m.workDir, mainDir), def)
	opts := agentcore.Options{
		Provider:        m.prov,
		SystemPrompt:    system,
		DynamicBoundary: boundary,
		Tools:           withWebFetch(ctx, tools, m.proxyAddr, m.proxyCACert), // WebFetch: routed through the recording proxy for tracing; loads the proxy CA to verify MITM-resigned HTTPS certificates; every redirect hop is gated
		DeferredTools:   def.Deferred,
		UnlockSet:       def.Unlock,
		PermissionMode:  permission.ModeBypass,
		// Web search (optional). ddgs needs no key; brave-free needs BraveKey; tavily needs TavilyKey.
		// WebSearchProxy is a dedicated egress proxy (http/https/socks5), unrelated to the traffic-recording MITM proxy; empty = direct.
		EnableWebSearch:       m.webSearch.Enabled,
		WebSearchBackend:      m.webSearch.Backend,
		BraveSearchAPIKey:     m.webSearch.BraveKey,
		TavilySearchAPIKey:    m.webSearch.TavilyKey,
		KeenableSearchAPIKey:  m.webSearch.KeenableKey,
		KeenableSearchTitle:   KeenableSearchTitle,
		DeepSeekSearchBaseURL: m.webSearch.DeepSeekBaseURL,
		DeepSeekSearchAPIKey:  m.webSearch.DeepSeekAPIKey,
		DeepSeekSearchModel:   m.webSearch.DeepSeekModel,
		WebSearchProxy:        m.webSearch.Proxy,
		BashEnv:               proxyEnv(m.proxyAddr, m.proxyCACert), // Bash subcommands go through the proxy + trust the CA by default
		WorkingDir:            mainDir,                              // the main run directory <workDir>/tasks/<taskID>/main
		ToolOutputDir:         TaskToolOutputDir(m.workDir, taskID, mainDir),
		MaxTurns:              m.maxTurns,                             // 0 = unlimited (configurable in agent management)
		Compaction:            compactionConfig(m.compactionWindow()), // long chats stay within the window
		Todos:                 actool.NewTodoStore(),                  // session-level temporary todos (TodoWrite), planning only, dropped on exit
		// hitting the budget (steps) → the SDK runs wrap-up: output a one-line progress summary to the user. Prompt and wrap-up rounds are editable in the backend (default 10 rounds).
		Settlement:   wrapupSettlement("mainagent", nil),
		NonStreaming: m.nonStreaming(), // when this profile selects non-streaming, use Provider.Complete
		MaxTokens:    m.maxTokens(),    // 0 = send no cap, the server's default decides

		// On by default; ARTEX_UNTRUSTED_BOUNDARY=0 opts out: nonce-frame tool output as untrusted data.
		UntrustedOutputBoundary: untrustedBoundaryEnabled(),
	}
	if hooks != nil { // typed-nil guard: only set when concrete (avoids harness panic)
		opts.Hooks = hooks
	}
	opts.Hooks = SpillHooks(opts.Hooks, opts.ToolOutputDir)
	// Segment 0 keeps the legacy "exp%d-main" name so existing transcripts still
	// load; each new session (seg>=1) gets its own file for a clean context. The id
	// is the provider-side identity (session header, usage metering) with or without
	// persistence; Norma only puts it on ctx when it writes a transcript.
	opts.SessionID = fmt.Sprintf("exp%d-main", ts.ID())
	if mainSeg > 0 {
		opts.SessionID = fmt.Sprintf("exp%d-main-s%d", ts.ID(), mainSeg)
	}
	ctx = transcript.WithSessionID(ctx, opts.SessionID)
	if m.tx != nil { // persist raw human↔AI conversation; one accumulating file per segment
		opts.Transcript = m.tx
	}
	// experimental feature: when enabled, noa takes over context compression (archive centralized under <workDir>/noa/<SessionID>, persistent).
	// the session id follows the same rule as the transcript (segment-aware), keeping archive and resume aligned.
	noaSession := fmt.Sprintf("exp%d-main", ts.ID())
	if mainSeg > 0 {
		noaSession = fmt.Sprintf("exp%d-main-s%d", ts.ID(), mainSeg)
	}
	enableNoa(&opts, m.noaEnabledFn, m.workDir, noaSession, noaWarn(noaSession))
	ctx = attachSideCapture(ctx, &opts)
	s := agentcore.NewSession(opts)
	defer s.Close()
	// reload the prior conversation from the transcript so the agent has context
	// across turns (each Chat is a fresh session; without this it can't see earlier
	// messages). First turn: no file yet → Resume loads nothing and proceeds.
	// A corrupt or unreadable transcript stops the turn before any model or tool call.
	if m.tx != nil {
		if err := resumeSession(s, opts.SessionID); err != nil {
			return "", err
		}
	}
	// C2: this session is fresh each turn; re-unlock skill-gated MCPs from prior
	// Skill() calls in the reloaded history so revealed tools stay callable.
	seedUnlockFromHistory(s.Messages(), def.UnlockSkill)
	text, _, err := captureRunSession(ctx, s, message, func(r db.Activity) {
		if emit != nil {
			r.Worker = "mainagent"
			emit(r)
		}
	})
	return text, err
}
