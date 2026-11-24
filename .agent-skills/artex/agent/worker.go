package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/harness"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
	"github.com/Autumn-27/norma/transcript"
)

// Worker is an LLM work agent (docs §4.4): it claims ONE intent, completes it
// with real tools (Bash: kali tooling through the recording proxy), writes the
// FACTS it found back into the graph, and stops. It does NOT generate new
// directions (that is the planner's job) and does NOT keep exploring toward the
// goal on its own. Multiple workers run concurrently as goroutines.
// WebSearchOpts is the web-search backend selection the server pushes into each
// agent (planner/worker/main). Enabled=false leaves the web_search tool off.
// Backend is "ddgs" (no key), "brave-free" (BraveKey required), "tavily"
// (TavilyKey required), or "deepseek" (DeepSeek* required, filled from the
// active LLM profile). It maps directly onto agentcore.Options.
// Proxy is a dedicated egress proxy for the search request (http/https/socks5),
// independent of the traffic-recording MITM proxy — set it when the search endpoint
// is only reachable via a VPN/SOCKS proxy. Empty = direct.
//
// Note the deepseek backend differs in nature from the other three: DeepSeek has no
// directly callable search API — search exists only inside its Anthropic-compatible
// messages API (the web_search_20250305 server tool), so each search consumes one
// model call, and the search request is issued by DeepSeek's servers — it does NOT
// go through the local Proxy, nor into the traffic recording.
// KeenableSearchTitle is the X-Keenable-Title value ARTEX sends. Fixed in v1:
// the title identifies the calling application to the provider.
const KeenableSearchTitle = "ARTEX"

type WebSearchOpts struct {
	Enabled     bool
	Backend     string
	BraveKey    string
	TavilyKey   string
	KeenableKey string
	Proxy       string
	// DeepSeek* comes from the currently active LLM config (only the official
	// DeepSeek endpoint in anthropic format) — not configured separately; it follows
	// the LLM config switch.
	DeepSeekBaseURL string
	DeepSeekAPIKey  string
	DeepSeekModel   string
}

type Worker struct {
	findingRecorder FindingRecorder
	// triage is the advisory decision-model client for closed-list judgements,
	// handed to the per-run ToolSet (see agent/triage.go). nil = off.
	triage      TriageClient
	prov        llm.Provider
	model       string
	workDir     string
	proxyAddr   string
	proxyCACert string            // recording proxy's CA cert path (for WebFetch HTTPS verify)
	factTraffic FactTrafficLookup // proxy captures for fact provenance (nil = activity-only)
	webSearch   WebSearchOpts     // web_search tool backend selection (off by default)
	tx          *transcript.Store // raw LLM conversation persistence (nil = off)
	window      int               // context window in tokens (for compaction)
	windowFn    func() int        // optional dynamic task-chain minimum
	maxTurns    int               // max agent turns per run (0 = unlimited)
	// runTimeout is the wall-clock budget for the main exploration of one intent
	// (0 = unlimited). When it fires, the run is cut and a settlement round is
	// forced so already-identified facts get written back instead of being lost.
	runTimeout time.Duration
	// extraTools are host-provided tools (e.g. traffic query, oast) appended to
	// the worker's graph write-back tools.
	extraTools []actool.CoreTool
	// injectConstraints resolves whether this task's operation constraints get
	// injected into the worker system prompt. Read per run so the settings toggle
	// takes effect without rebuilding the agent. nil = inject (default).
	injectConstraints func() bool
	// nonStreamingFn resolves whether this run uses the non-streaming (Complete)
	// path. Read per run so a profile/task toggle takes effect without rebuilding
	// the agent. nil = streaming (default).
	nonStreamingFn func() bool
	// noaEnabledFn resolves whether this run uses the experimental noa context-
	// compression mechanism. Read per run, like nonStreaming. nil = off (built-in
	// compaction).
	noaEnabledFn func() bool
	// maxTokensFn resolves the per-reply output cap in tokens, on the same
	// per-run basis. nil or 0 = send no cap and let the endpoint decide.
	maxTokensFn func() int
	// lessonsBlock is the raw RSI evidence block. Empty = off. Execute() frames
	// it with a per-run data envelope (field=lessons) and appends it after the
	// rendered system prompt. The server renders the text from outcome records.
	lessonsBlock string
}

// WorkerSessionID returns the stable transcript key used by a worker intent.
// Worker slots are reusable, so the intent id (rather than work#N) is the
// session identity. Keep this helper public so the Worker message API and UI
// can refer to exactly the conversation that will be resumed.
func WorkerSessionID(explorationID, intentID int64) string {
	return fmt.Sprintf("exp%d-worker-i%d", explorationID, intentID)
}

const workerChatMarkerPrefix = "<!-- ARTEX_WORKER_CHAT:"

func workerChatMarker(requestID string) string {
	return workerChatMarkerPrefix + requestID + " -->"
}

func hasWorkerChatMessage(messages []llm.Message, requestID string) bool {
	marker := workerChatMarker(requestID)
	for _, message := range messages {
		if message.Role == llm.RoleUser && strings.Contains(message.Text(), marker) {
			return true
		}
	}
	return false
}

// SetNonStreaming wires a resolver deciding whether runs use the non-streaming
// model path (true = non-streaming). nil/unset = streaming (default). Read per
// run so a profile or task-chain toggle takes effect without rebuilding.
func (w *Worker) SetNonStreaming(fn func() bool) { w.nonStreamingFn = fn }

func (w *Worker) nonStreaming() bool { return w.nonStreamingFn != nil && w.nonStreamingFn() }

// SetNoaEnabled wires a resolver deciding whether runs use the experimental noa
// context-compression mechanism. nil/unset = off (built-in compaction). Read per
// run so the settings toggle takes effect without rebuilding the agent.
func (w *Worker) SetNoaEnabled(fn func() bool) { w.noaEnabledFn = fn }

// SetMaxTokens wires a resolver for the per-reply output cap. nil/unset or 0 =
// send no cap and let the endpoint decide. Read per run, like nonStreaming.
func (w *Worker) SetMaxTokens(fn func() int) { w.maxTokensFn = fn }

func (w *Worker) maxTokens() int {
	if w.maxTokensFn == nil {
		return 0
	}
	return w.maxTokensFn()
}

// SetConstraintInject wires a resolver deciding whether this task's operation
// constraints get injected into the worker system prompt. nil = inject (default).
func (w *Worker) SetConstraintInject(fn func() bool) { w.injectConstraints = fn }

// SetLessonsBlock sets the raw RSI evidence block. Empty disables it. Execute()
// frames it as data. The server renders it from outcome records; it is never
// editable through the prompt UI.
func (w *Worker) SetLessonsBlock(block string) { w.lessonsBlock = block }

// wantConstraints reports whether constraint injection is enabled (default yes).
func (w *Worker) wantConstraints() bool { return w.injectConstraints == nil || w.injectConstraints() }

// SetRunTimeout configures the per-intent wall-clock budget for the main
// exploration (0 = unlimited). When it fires, the SDK settlement phase still runs
// so facts are never lost to a timeout. Safe to call before Execute.
func (w *Worker) SetRunTimeout(run time.Duration) {
	w.runTimeout = run
}

// settleWrapUpPrompt is injected by the SDK settlement phase when a worker hits its
// turn/time budget: stop probing, write back what was found, then end with a
// plain-text one-liner (which becomes this run's displayed result).
const settleWrapUpPrompt = "You are about to be terminated because your budget is exhausted. Do not run any more commands/probes. Please, in order: (1) write back everything you have identified above but not yet written back, item by item — new assets with insert_assets, exploration conclusions/facts with record_fact, confirmed findings with report_finding; (2) **finally, in a single standalone sentence of plain text** summarize what you did and which key conclusions you reached (this sentence is shown as this run's result — be sure to output it)."

func NewWorker(prov llm.Provider, model, workDir string, tx *transcript.Store, window, maxTurns int, extra ...actool.CoreTool) *Worker {
	return &Worker{prov: prov, model: model, workDir: workDir, tx: tx, window: window, maxTurns: maxTurns, extraTools: extra}
}

// defaultToolsExcept returns defaultTools(base) minus the named tools (by
// CoreTool.Name()). Used to trim SDK default tools an agent shouldn't have.
func defaultToolsExcept(base string, exclude ...string) []actool.CoreTool {
	drop := make(map[string]bool, len(exclude))
	for _, n := range exclude {
		drop[n] = true
	}
	all := defaultTools(base)
	out := make([]actool.CoreTool, 0, len(all))
	for _, t := range all {
		if !drop[t.Name()] {
			out = append(out, t)
		}
	}
	return out
}

func (w *Worker) SetCompactionWindowResolver(fn func() int) { w.windowFn = fn }

func (w *Worker) compactionWindow() int {
	if w.windowFn != nil {
		return w.windowFn()
	}
	return w.window
}

// SetProxy configures the recording proxy address that workers route target
// traffic through, plus the CA cert path WebFetch trusts to verify HTTPS through
// that MITM proxy. Empty addr disables the hint.
func (w *Worker) SetProxy(addr, caCert string) { w.proxyAddr, w.proxyCACert = addr, caCert }

// SetFactTraffic wires the proxy capture store used to classify recorded facts
// (#124 row 1). nil keeps the activity-only classification.
func (w *Worker) SetFactTraffic(l FactTrafficLookup) { w.factTraffic = l }

// SetWebSearch selects the web_search backend for this worker (off by default).
func (w *Worker) SetWebSearch(o WebSearchOpts) { w.webSearch = o }

// proxyEnv builds the Bash-subprocess env that routes child-command HTTP through
// the egress proxy (the recording MITM when capture is on, or the global proxy
// directly when it is off) and, only when a MITM CA is present, makes the common
// toolchain trust it — so tools need no manual -x/--proxy/-k. Each ecosystem reads
// a different CA var (verified empirically): SSL_CERT_FILE→curl/urllib/Go/openssl,
// REQUESTS_CA_BUNDLE→python requests (it ignores SSL_CERT_FILE), CURL_CA_BUNDLE→curl,
// GIT_SSL_CAINFO→git, NODE_EXTRA_CA_CERTS→node; NODE_USE_ENV_PROXY makes Node 24+
// honor the proxy vars. ALL_PROXY is set too so a socks5 egress proxy (which curl
// only reads from ALL_PROXY, not HTTP(S)_PROXY) works in the capture-off path.
// Empty proxyAddr → nil (direct, unchanged env).
//
// With a MITM CA (capture on) the proxy URL carries the pace marker userinfo
// (egress.MarkProxyURL): the recording proxy then paces this connection's
// requests by the noise profile. Only Bash gets the marker; WebFetch, the http
// custom tools and enrich keep the plain URL, since egress paces them already.
// The global proxy (capture off) is left as configured.
func proxyEnv(proxyAddr, caCert string) []string {
	if proxyAddr == "" {
		return nil
	}
	if caCert != "" {
		proxyAddr = egress.MarkProxyURL(proxyAddr)
	}
	env := []string{
		"HTTP_PROXY=" + proxyAddr, "HTTPS_PROXY=" + proxyAddr,
		"http_proxy=" + proxyAddr, "https_proxy=" + proxyAddr,
		"ALL_PROXY=" + proxyAddr, "all_proxy=" + proxyAddr, // socks5 egress: curl reads only this
		"NODE_USE_ENV_PROXY=1", // Node 24+: honor HTTP(S)_PROXY in built-in fetch/http
	}
	if caCert != "" {
		env = append(env,
			"SSL_CERT_FILE="+caCert,
			"CURL_CA_BUNDLE="+caCert,
			"REQUESTS_CA_BUNDLE="+caCert,
			"GIT_SSL_CAINFO="+caCert,
			"NODE_EXTRA_CA_CERTS="+caCert,
		)
	}
	return env
}

// workerDefaultTmpl is the built-in EDITABLE body (section [A]) of the worker
// system prompt, seeded into agent_prompts. The trafficTool block and the
// intermediate artifact output rules are NOT here — they are code-owned and
// appended by workerSystem after rendering (sections [B]/[C]), so editing the DB
// body can never drop them.
const workerDefaultTmpl = `You are an "executor" (work agent) of a network-security platform's authorized penetration testing system. You are assigned [ONE intent] (a one-sentence exploration direction), and your sole duty is: **complete this one intent, write the findings back into the knowledge graph, then stop and return.**

**Boundaries (red lines)**:
1. **Do only the one intent you were assigned**. **If, while exploring this intent, you glimpse a clue worth digging into beyond this intent** (a path leaked by an error, a point that could chain with other assets, the suspected entry of another exploit chain), **note it in a fact's summary and hand it to the planner**.
2. An initial setback (payload filtered / 404 / injection with no echo) does not mean the intent is exhausted — walk through all bypass means for this intent before outputting a conclusion;
3. Operate only within the authorized scope. If [operation constraints] are attached at the top of the system prompt, they are the highest-priority red lines: self-check before every command/probe; if it violates them, don't do it (even if it falls inside your assigned intent).

**Write back as you discover** (only what's written into the graph counts; what's in your head/text doesn't; write every result immediately — don't save it for the end and lose it when the step budget runs out). Three kinds of write-back, don't cross the graphs:
- **New asset/resource → insert_assets (asset graph)**: subdomains / services / endpoints / fingerprints / credentials and any asset [itself]. **Only assets are registered here; exploration conclusions/judgments don't go here — use record_fact.**
- **Exploration conclusion/fact → record_fact (exploration graph, pass intent_id)**: use it for all of those. **Consolidate multiple observations into [ONE] fact** (summary = one summarizing sentence + detail = the expansion of the summary, based on the real execution process) — not one fact per attribute; one intent usually produces only one fact, and splitting finely bloats the graph endlessly — **write one fact by default, merging everything mergeable into detail**; only use the facts array to split when there are genuinely [mutually independent, unmergeable] conclusions — that's a rare exception, not the norm. **Write only the delta**: record only what is [newly obtained] this time; don't re-record existing facts in different words (if it merely corroborates an existing one with nothing new, don't record it). **Write only what you actually saw**: give evidence (one line: the command + the most proving one or two output lines — brief; details in detail), and mark confidence (observed = seen directly / inferred = inferred from phenomena). **Declare the source** of every fact: target_response (content the target itself returned: page bodies, headers, error messages, banners, even when a tool fetched it), tool_output (a tool's own result about the target: port states, scanner verdicts, status codes and timings you measured), third_party_intel (OSINT, CVE databases, public reports), operator_input (given by the human operator), or inference (your own reasoning; the default).
- **Confirmed vulnerability → report_finding (exploration graph, with PoC, pass intent_id)**: **use it only when you actually triggered it this time and obtained reproducible evidence (request/response or command output)**. It is strictly forbidden to treat "version/fingerprint matching a CVE", "the parameter looks injectable", or "inference from external vulnerability databases/changelogs/code diffs" as confirmed, and don't substitute querying a CVE database or comparing patch versions for actually triggering it. Can't trigger it but suspicion remains → record an inferred fact with record_fact (the suspicion point + why it couldn't be triggered) for the planner; don't force it into a finding. Before registering, check list_findings / list_task_findings for an existing finding with the same root cause, endpoint, and parameter: the same defect again means extending that finding's evidence, not registering a duplicate (duplicates burn reviewer trust); a genuinely distinct entry point, parameter, or privilege level remains its own finding per the adversarial gate. When your confidence is not high, also fill report_finding's optional fields: counterevidence = what you tested that did not work; confidence_rationale = why the conclusion holds. Both are optional and never block reporting.


**Budget discipline (the deadline contract)**: your run has a step budget and a wall-clock budget. Before starting any command or probe, check it can finish well within what remains; never start work whose timeout can outlive the remaining budget — prefer the smaller variant that lands. When the budget is nearly spent or the wrap-up signal arrives, stop opening new work and land everything already collected (facts first, then findings): a result that exists only in your head is lost.

After completing this intent, summarize in one sentence what you did and which facts you wrote back.

Adversarial gate before report_finding:
- A candidate stays a hypothesis until you have actively tried to disprove it. Before reporting, argue the opposite case along five axes: **reachability** (can a real attacker actually get there?), **preconditions** (does exploitation need an unrealistic starting position?), **downstream controls** (does something between the trigger and the goal block the impact?), **scope** (is the affected asset inside the authorized scope?), and **simpler explanation** (is there a benign reason for the observation?).
- Eliminations need evidence at the same bar as confirmations: cite the specific request, response, or control that kills the candidate. "Probably validated downstream", "looks by design", or "internal only" eliminate nothing.
- Do not merge distinct candidates: different entry points, different parameters, or different attacker privilege levels are separate findings even when they share one narrative chain.
- Zero confirmed findings is a valid outcome. Never soften these gates to manufacture output; a precise negative ("class X tested across surfaces Y with method Z; clean"), recorded as a fact, is real work.

Finding quality gates (proof standard, measured impact, testing bounds):
- **The PoC must demonstrate the attacker's goal achieved end to end** (unauthorized data actually returned, the injected command actually executing with output, another user's resource actually read or modified), not merely that a vulnerable pattern exists or a vulnerable code path runs. When the mechanism fires but a downstream control blocks the goal, record a hardening note, not a finding.
- **Every reported finding carries a measured impact**: the attacker outcome as a number with its denominator ("3 of 20 payload variants returned other-tenant rows; 17 rejected", "commands executed: 2, output returned: yes") plus what the defense blocked. "The attacker can dump the table" is a claim; "3 of 20 payloads returned rows" is a measurement. If no number is obtainable, record what was attempted and why it is not measurable.
- **State the proof basis** on every finding: executed-live, executed-lab, or static-analysis-unexecuted. An executed proof outranks a static conclusion; anything never actually triggered is "potential/suspect", never confirmed.
- **Testing bounds** (bounded and non-destructive does NOT mean read-only): state-changing requests are in bounds when they are the finding's mechanism. Prove the mechanism on your own objects/accounts first, then confirm cross-entity reach on at most three non-owned objects with the smallest request that demonstrates the boundary; prefer reversible values, restore originals where possible, and record every touched object ID in the evidence.
- **Priority discipline**: low-impact oracles (user/account enumeration, account-existence checks, response-timing differences) and low-yield misconfigurations (permissive CORS) are not standalone findings; record them only when they directly chain into account takeover, authentication bypass, or mass data exposure.

Operator handoff on environmental blocks:
- When a command or tool fails for an environmental reason (a sandboxed or filtered network path, a missing binary or key, TLS or proxy interception, a permission this runtime lacks), stop after the first failure: do not retry with different flags, do not switch tools hunting for a bypass, and do not fall through to an equivalent command.
- Call ask_operator with the exact single command the operator should run in their own terminal: one line, copy-pastable, followed by what to paste back. One command per request; never batch. Wait for the reply instead of burning turns.`

// workerTrafficBlock is section [B]: the traffic-tool note, code-injected only when
// traffic capture (recording) is on — i.e. the traffic_* tools actually exist.
// Gated on recording, NOT on the egress proxy: a global proxy with capture off
// routes traffic but records nothing, so the tools would not be there. Not stored,
// not editable.
func workerTrafficBlock(recording bool) string {
	if !recording {
		return ""
	}
	return "\n\n**Traffic tools**:\n- traffic_search / traffic_get / traffic_blob / traffic_messages: review responses, find already-visited resources — **check the traffic first, don't curl the same URL twice**. traffic_search **requires a host** and by default returns only 3 ultra-light index entries (id/method/url/status/resp_len, no response content) — explicitly raise limit when you need more; body_contains does full-text search in request/response bodies (at least 3 characters; supports substrings and CJK text, e.g. for passwords/keys/errors/internal addresses); to see one entry's raw content use traffic_get(id) — oversized bodies show as @blob sha256:<hash>, fetched in segments with traffic_blob(hash). WebSocket (status 101) and SSE (text/event-stream) records are captured too: traffic_get shows the handshake, and traffic_messages(id) lists their messages in order with direction and type."
}

// artifactSpec is section [C]: the code-owned, non-editable tail appended to every
// pentest agent's prompt — intermediate artifacts must land in the shared work
// dir, never /tmp. Guaranteed present regardless of how the DB body is edited.
func artifactSpec(dir string) string {
	return "\n\n**Intermediate artifact output rules**: all intermediate artifacts — scripts, payloads, captured response bodies, temporary data — **must be written to this task's work directory " + dir + "** (a relative path writes here; the absolute path works too) — **do NOT write to /tmp, do NOT use other absolute paths**."
}

// workerArtifactSpec is the worker's section [C]: its per-intent run dir is
// pre-created by the engine (ensureRunDir), so it just writes relative paths there
// — no manual mkdir, no cross-worker name collisions.
func workerArtifactSpec(runDir string) string {
	return "\n\n**Intermediate artifact output rules**: all intermediate artifacts — scripts, payloads, captured response bodies, temporary data — **must be written to this intent's dedicated work directory " + runDir + "** (already created automatically; just write with relative paths there — no manual mkdir needed) — **do NOT write to /tmp, do NOT use other absolute paths**."
}

// mainRunDirName is the run directory of a task's main agent and planner.
const mainRunDirName = "main"

// runDirMaker creates a run directory below the data directory with the ownership
// the server wants. The server sets it when agent processes run as the executor
// (server/execpriv_unix.go); nil keeps a plain MkdirAll.
var runDirMaker func(base, leaf string) error

// SetRunDirMaker sets how run directories are created. Call it before any agent runs.
func SetRunDirMaker(f func(base, leaf string) error) { runDirMaker = f }

// makeRunDir creates the run directory leaf below base. Best-effort — on failure,
// writes fail the same way an unwritable CWD would.
func makeRunDir(base, leaf string) {
	if runDirMaker == nil {
		// 0775: the umask of the server decides the final bits.
		_ = os.MkdirAll(leaf, 0o775)
		return
	}
	if err := runDirMaker(base, leaf); err != nil {
		log.Printf("[agent] run directory %s: %v", leaf, err)
	}
}

// ensureRunDir builds and creates an agent's working directory under base:
// <base>/tasks/<taskID>/main for planner/main (intentID<=0);
// <base>/tasks/<taskID>/i<intentID> for a worker. No run directory is an ancestor of
// another: the task directory holds the leaves and is no agent's working directory.
// The "tasks/" segment groups per-task dirs symmetrically with the chat agent's
// "sessions/<sessionID>".
func ensureRunDir(base string, taskID, intentID int64) string {
	leaf := mainRunDirName
	if intentID > 0 {
		leaf = "i" + strconv.FormatInt(intentID, 10)
	}
	dir := filepath.Join(base, "tasks", strconv.FormatInt(taskID, 10), leaf)
	makeRunDir(base, dir)
	return dir
}

// EnsureRunDir is ensureRunDir for the server, which places the main agent's
// uploads in its run directory.
func EnsureRunDir(base string, taskID, intentID int64) string {
	return ensureRunDir(base, taskID, intentID)
}

// EnsureSessionDir creates the chat run directory <base>/sessions/<sessionID> the
// way ensureRunDir creates a task one, and returns it.
func EnsureSessionDir(base, sessionID string) string {
	dir := filepath.Join(base, "sessions", sessionID)
	makeRunDir(base, dir)
	return dir
}

// IsRunDirName reports whether name is a run directory inside a task directory:
// main or i<intentID>.
func IsRunDirName(name string) bool {
	if name == mainRunDirName {
		return true
	}
	digits, ok := strings.CutPrefix(name, "i")
	if !ok || digits == "" {
		return false
	}
	for _, c := range digits {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// CachePrefixEnv is the opt-in environment flag enabling the worker system
// prompt cache-prefix split (P3.5 phase C). Off by default: when unset/false,
// worker system segments and DynamicBoundary are byte-identical to the legacy
// layout. Planner, mainagent, chat, and goals are unaffected.
const CachePrefixEnv = "ARTEX_CACHE_PREFIX"

func cachePrefixEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(CachePrefixEnv))) {
	case "1", "true", "on", "yes":
		return true
	}
	return false
}

// workerSystemParts splits workerSystem at the first per-intent volatile
// segment (workerArtifactSpec(runDir)) without reordering any text:
//   - staticPart  = body + untrustedContentTail + workerTrafficBlock
//   - dynamicHead = workerArtifactSpec(runDir) + noiseProfileBlock
//
// Custom DB prompts that reference {{.Now}} remain volatile inside staticPart.
func workerSystemParts(proxyAddr, caCert, dataDir, runDir string) (staticPart, dynamicHead string) {
	body := renderSystem("worker", workerDefaultTmpl, WorkerVars{ProxyAddr: proxyAddr, DataDir: dataDir, Now: nowStr()})
	// caCert is present only when the recording MITM is on, which is exactly when
	// the traffic_* tools are registered — so it gates the traffic-tool note.
	// Optional finding guidance is added for every role after tool resolution.
	staticPart = body + untrustedContentTail(body) + workerTrafficBlock(caCert != "")
	dynamicHead = workerArtifactSpec(runDir) + noiseProfileBlock()
	return staticPart, dynamicHead
}

func workerSystem(proxyAddr, caCert, dataDir, runDir string) string {
	staticPart, dynamicHead := workerSystemParts(proxyAddr, caCert, dataDir, runDir)
	return staticPart + dynamicHead
}

// assembleWorkerSystem builds the worker's SystemPrompt segments and
// DynamicBoundary. When split is false (default), it delegates directly to
// deferredSystem(staticPart+dynamicTail, def). When split is true
// (ARTEX_CACHE_PREFIX=1), it emits two segments [staticPart, dynamic] with
// DynamicBoundary=1 so sibling workers in the same task share the cached static
// prefix, absorbing the leading "\n\n" separator from workerArtifactSpec so
// strings.Join(system, "\n\n") is byte-identical to the unsplit prompt.
func assembleWorkerSystem(staticPart, dynamicTail string, def DeferredInfo, split bool) (system []string, boundary int) {
	if !split {
		return deferredSystem(staticPart+dynamicTail, def)
	}
	dyn := strings.TrimPrefix(dynamicTail+def.FindingGuidance+def.SkillIndex, "\n\n")
	if block := actool.RenderDeferredToolsBlock(def.GlobalNames); block != "" {
		dyn += "\n\n" + block
	}
	return []string{staticPart, dyn}, 1
}

// renderIntentTask formats the claimed intent for the worker's launch USER message:
// the intent is the worker's whole job. It used to live in the system prompt; it now
// rides in the first user turn (together with the situational overview) so the system
// prompt stays static/role-only — same move as the planner's situational block.
// intentAssetIDs pulls the intent's target asset ids out of its payload
// (planner's add_intent stores them as a numeric asset_ids array). nil on absence
// or malformed payload.
func intentAssetIDs(intent *db.Node) []int64 {
	if intent == nil {
		return nil
	}
	var p struct {
		AssetIDs []int64 `json:"asset_ids"`
	}
	if err := json.Unmarshal(intent.Payload, &p); err != nil {
		return nil
	}
	return p.AssetIDs
}

func renderIntentTask(intent *db.Node) string {
	return fmt.Sprintf("\n\n[The intent you claimed (your only job this time: do just this one, produce only facts, stop when done)]:\n%s\nIntent id: %d (pass it when writing back record_fact / report_finding)", string(intent.Payload), intent.ID)
}

// renderWorkerGraphOverview folds the global situational snapshot into the worker's
// launch USER message for AWARENESS ONLY. The framing is deliberately strong: the overview
// must NOT widen the worker's job — it still does only its assigned intent. Its sole
// purpose is letting the worker read context (existing facts/assets/hints)
// so it avoids redundant work and doesn't re-derive what others already found.
// The derived fields go inside env's frame (#124, F3); env is built once per
// launch message.
func renderWorkerGraphOverview(data map[string]any, env dataEnvelope) string {
	// coverage is a signal for the planner to judge "which class is under-tested /
	// whether to widen the scope" — it conflicts with the worker's boundary of "do
	// only the assigned intent, don't chase uncovered points" → drop it from the
	// worker view. data is a fresh map dedicated to this worker, so deleting the key
	// doesn't affect the planner.
	delete(data, "coverage")
	sections := renderOverviewSections(data, env)
	if sections == "" {
		return "" // fall back silently: the worker just won't have the global context
	}
	return env.intro() + "\n\n[Global exploration overview (read-only, helps you place your assigned intent in the bigger picture)]:\n" +
		"Below is the task's current exploration overview. Two purposes: first, know what others have already found — don't repeat; second, let you relate this intent to the global picture while exploring it.\n" +
		"**Digressing is good**: while exploring this intent, think deep and associate freely. The only boundary is — don't actually go execute other intents (that's other workers' business, scheduled by the planner). But whenever you associate a valuable clue (cross-asset linkage, the suspected entry of another exploit chain, a global-level suspicious point), **be sure to write it into a fact for the planner** — this is an important output of yours, not optional. Better to report one more for the planner to judge than to swallow it yourself." +
		sections
}

// writeIntentAutoScope records the intent's target assets as auto scope when
// coverage is on. coverageEnabled is fail-open: a failed flag read is true, so
// an outage still writes, including when the stored flag is off.
func writeIntentAutoScope(as *db.AssetStore, taskID int64, assets []*db.Asset, coverageEnabled bool) {
	if as == nil || !coverageEnabled {
		return
	}
	for _, a := range assets {
		if a == nil {
			continue
		}
		_ = as.AddAutoScope(taskID, a.Type, a.Domain, a.URL, a.IP)
	}
}

// Execute runs one intent. hooks (the per-task Guard) gates every tool call; may
// be nil. emit, if non-nil, receives one ActivityRecord per execution step.
// notifyFinding, if non-nil, is called (intentID, summary) when this worker writes
// a finding (report_finding) so the task's planner wakes mid-flight — with context
// on which intent found what — instead of waiting for the worker to finish.
// Returns the terminal reason (so the engine can distinguish completed vs
// max_turns) and a per-kind breakdown of what was written back (so an intent that
// explored but persisted nothing isn't mistaken for done, and the engine can log
// facts/assets/findings separately instead of lumping them under "facts").
func (w *Worker) Execute(ctx context.Context, name string, taskID int64, as *db.AssetStore, ts *db.ExplorationStore, intent *db.Node, hooks harness.HookRunner, emit func(db.Activity), enr EnrichTrigger, notifyFinding func(int64, string)) (harness.TerminalReason, WriteCounts, error) {
	return w.execute(ctx, name, taskID, as, ts, intent, hooks, emit, enr, notifyFinding, "", "")
}

// ExecuteWithMessage runs the next turn in the same intent conversation with a
// human-authored message. The HTTP handler does not edit the transcript;
// agentcore records the message as a normal user turn when this Worker starts.
// This keeps Worker continuation identical to the regular agent chat flow.
func (w *Worker) ExecuteWithMessage(ctx context.Context, name string, taskID int64, as *db.AssetStore, ts *db.ExplorationStore, intent *db.Node, hooks harness.HookRunner, emit func(db.Activity), enr EnrichTrigger, notifyFinding func(int64, string), requestID, message string) (harness.TerminalReason, WriteCounts, error) {
	return w.execute(ctx, name, taskID, as, ts, intent, hooks, emit, enr, notifyFinding, strings.TrimSpace(requestID), strings.TrimSpace(message))
}

func (w *Worker) execute(ctx context.Context, name string, taskID int64, as *db.AssetStore, ts *db.ExplorationStore, intent *db.Node, hooks harness.HookRunner, emit func(db.Activity), enr EnrichTrigger, notifyFinding func(int64, string), requestID, message string) (harness.TerminalReason, WriteCounts, error) {
	tsx := NewToolSet(ts, name)
	tsx.SetFindingRecorder(w.findingRecorder)
	tsx.SetTriageClient(w.triage)
	tsx.SetFactTraffic(w.factTraffic)
	tsx.SetTaskID(taskID)
	coverageEnabled := coverageOn(as, taskID)
	tsx.SetCoverageEnabled(coverageEnabled)
	if as != nil {
		tsx.SetAssetStore(as, as.Companies())
	}
	tsx.SetWorkBase(w.workDir)          // ingest_bbot reads its file under the same base as the file tools below
	tsx.SetOwnerNode(intent.ID)         // assets this worker discovers anchor to its intent → visible to the task
	tsx.SetEnrich(enr)                  // async DNS/HTTP auto-completion for assets this worker writes
	tsx.SetNotifyFinding(notifyFinding) // when report_finding lands, wake the planner on the spot with "which intent + finding"
	// base = built-in worker tools ∪ host tools (traffic) ∪ default tools (incl. Bash);
	// then augment with the agent's visible skills/MCP. During the SDK settlement
	// phase, Bash is hidden via Settlement.DisabledTools (no local gating needed).
	base := append(tsx.DropCoverageTools(tsx.WorkerTools()), w.extraTools...)
	// The worker deliberately gets no MultiEdit/Glob/Grep: precise file edits use Edit,
	// searching goes through Bash(grep/find) — narrowing the tool surface and reducing
	// low-value calls. The rest of the SDK default tools (Read/Write/Edit/LS/Bash/Sleep)
	// are kept as usual.
	base = append(base, defaultToolsExcept(w.workDir, "MultiEdit", "Glob", "Grep")...)
	ctx = WithRunInfo(ctx, RunInfo{TaskID: taskID, ExplorationID: explorationID(ts), IntentID: intent.ID})
	tools, def, cleanup := AugmentTools(WithToolQuery(ctx, nodeSummary(intent)), "worker", base)
	defer cleanup()

	// The intent is the worker's [sole duty, an invariant across the whole run] → it
	// goes into the system prompt together with the launch instruction and the raw
	// data of the intent's anchored target assets: the system prompt is rebuilt for
	// every run and can never be compacted away, so the intent stays present in long
	// runs, and a resumed run doesn't depend on whether the transcript kept that first
	// message. The cost is the system prompt mixing in per-intent volatile data and
	// losing cross-intent cache reuse; that is a deliberate trade (losing the intent is
	// far worse than spending tokens). The divergence from the planner ("situation
	// block in the user turn") is intentional: the planner itself is the intent
	// producer with no single mandate; the worker has one. Only the [global situation
	// overview] stays in the launch user message — it is degradable and tolerates
	// staleness, so compacting it away is harmless.
	// This intent's dedicated work dir <workDir>/tasks/<taskID>/i<intentID> is created
	// by the engine first.
	runDir := ensureRunDir(w.workDir, taskID, intent.ID)
	// The run-wide intent is not the current tool action. Do not forward it or
	// inherit a parent run's background into the action reviewer.
	ctx = intercept.WithReviewContext(ctx, runDir, intercept.ReviewBackground{})
	workerEnv := newDataEnvelope()
	overview := renderWorkerGraphOverview(tsx.graphOverviewData(), workerEnv)
	staticPart, dynamicTail := workerSystemParts(w.proxyAddr, w.proxyCACert, w.workDir, runDir)
	dynamicTail += frameLessonsBlock(w.lessonsBlock)
	if w.wantConstraints() {
		dynamicTail += constraintBlock(ts) // inject the operation constraints (if any) into the system prompt; the worker strictly obeys them during execution
	}
	// intent block → launch instruction in the system tail; intent-anchored assets
	// carry target-influenced fields (PageTitle, Description, etc.) and go into
	// the launch user message inside workerEnv's data envelope (#124).
	dynamicTail += renderIntentTask(intent)
	if as != nil {
		if ids := intentAssetIDs(intent); len(ids) > 0 {
			if assets, err := as.GetByIDs(ids); err == nil && len(assets) > 0 {
				if block := renderWorkerIntentAssets(assets, workerEnv); block != "" {
					if strings.TrimSpace(overview) == "" {
						overview = workerEnv.intro() + block
					} else {
						overview += block
					}
				}
				// The assets this intent explicitly targets → automatically join the task's
				// test scope (same conservative granularity as insertAssets). upsertTaskScope's
				// ON CONFLICT DO NOTHING + the uq_task_scope unique index guarantee no
				// duplicate additions; reruns/retries are idempotent no-ops as well.
				// asset_ids can trace back to target content, so these auto rows count
				// toward coverage only under a declared domain or IP root (db.declaredScopeFilter);
				// coverage scope, not enforced.
				// When the asset-coverage feature is off, the test scope (denominator) is no
				// longer accumulated. A failed flag read is treated as on, so an outage
				// still writes, including for a task whose stored flag is off.
				writeIntentAutoScope(as, taskID, assets, coverageEnabled)
			}
		}
	}
	dynamicTail += "\n\nStart executing the intent above: do only it, produce only facts, assets, findings, stop when done."
	system, boundary := assembleWorkerSystem(staticPart, dynamicTail, def, cachePrefixEnabled())
	// The task-level deadline (injected via ctx) clamps this run's wall-clock budget +
	// decides the wrap-up prompt (see taskclock.go).
	tc := taskClockFrom(ctx)
	maxDur, clamped := clampMaxDuration(tc.DeadlineUnix, w.runTimeout)
	settle := wrapupSettlement("worker", []string{"Bash"})
	if tc.DeadlineUnix > 0 {
		settle = wrapupSettlementForTask("worker", []string{"Bash"}, clamped)
	}
	opts := agentcore.Options{
		Provider:        w.prov,
		SystemPrompt:    system,
		DynamicBoundary: boundary,
		Tools:           withWebFetch(ctx, tools, w.proxyAddr, w.proxyCACert),
		DeferredTools:   def.Deferred,
		UnlockSet:       def.Unlock,
		PermissionMode:  permission.ModeBypass,
		// WebFetch (added to Tools above) goes through the recording proxy, so its
		// HTTP is recorded just like curl; loading the proxy CA lets MITM-re-signed
		// HTTPS certs [verify normally] (rather than disabling verification). Direct
		// when proxy is empty. Every redirect hop goes through the target gate.
		// Web search (optional). ddgs needs no key; brave-free needs BraveKey; tavily needs TavilyKey.
		// WebSearchProxy is a dedicated egress proxy (http/https/socks5), unrelated to the traffic-recording MITM proxy; empty = direct.
		EnableWebSearch:       w.webSearch.Enabled,
		WebSearchBackend:      w.webSearch.Backend,
		BraveSearchAPIKey:     w.webSearch.BraveKey,
		TavilySearchAPIKey:    w.webSearch.TavilyKey,
		KeenableSearchAPIKey:  w.webSearch.KeenableKey,
		KeenableSearchTitle:   KeenableSearchTitle,
		DeepSeekSearchBaseURL: w.webSearch.DeepSeekBaseURL,
		DeepSeekSearchAPIKey:  w.webSearch.DeepSeekAPIKey,
		DeepSeekSearchModel:   w.webSearch.DeepSeekModel,
		WebSearchProxy:        w.webSearch.Proxy,
		// Bash subcommands' HTTP goes through the recording proxy + trusts its CA by
		// default (tools need no -x/-k).
		BashEnv:    proxyEnv(w.proxyAddr, w.proxyCACert),
		WorkingDir: runDir,
		MaxTurns:   w.turnCap(ctx), // 0 = unlimited (configurable in agent management); clamped by the intent budget
		// Wall-clock budget, judged at turn boundaries without interrupting mid-flight;
		// 0 = unlimited. When a task-level deadline exists, clamp to min(own budget, time
		// until the deadline) so this run naturally enters wrap-up when the task hits its
		// deadline (see taskclock.go).
		MaxDuration: maxDur,
		// Hitting the budget (turns OR duration) → the SDK runs a wrap-up round (with
		// Bash hidden) to write back what's identified, avoiding unfinished tails.
		// When clamped (by the task deadline), use PromptByReason: timeout = task
		// deadline → task-timeout prompt; turns = the turn budget ran out inside the
		// clamped window → fall back to the per-run prompt. Non-clamped stays pure per-run.
		Settlement: settle,
		// large tool output spills to a file with a head + pointer (SDK tool.Capture);
		// full output preserved on disk, in cmd-output/ or in the task's spill
		// directory (spill.go). The truncation cap uses the SDK default (30000 chars).
		ToolOutputDir: TaskToolOutputDir(w.workDir, taskID, runDir),
		Compaction:    compactionConfig(w.compactionWindow()), // long tool-heavy runs stay within the window
		Todos:         actool.NewTodoStore(),                  // session-level scratch todos (TodoWrite), pure planning, discarded on exit
		NonStreaming:  w.nonStreaming(),                       // when this profile selects non-streaming, use Provider.Complete
		MaxTokens:     w.maxTokens(),                          // 0 = send no cap; the server default decides

		// On by default; ARTEX_UNTRUSTED_BOUNDARY=0 opts out: nonce-frame tool output as untrusted data.
		UntrustedOutputBoundary: untrustedBoundaryEnabled(),
	}
	if hooks != nil { // typed-nil guard: only set when concrete (avoids harness panic)
		opts.Hooks = hooks
	}
	opts.Hooks = SpillHooks(opts.Hooks, opts.ToolOutputDir)
	// The session id is the provider-side identity (session header, usage metering)
	// with or without persistence; Norma only puts it on ctx when it writes a transcript.
	opts.SessionID = WorkerSessionID(ts.ID(), intent.ID)
	ctx = transcript.WithSessionID(ctx, opts.SessionID)
	if w.tx != nil { // persist raw LLM conversation; one file per worked intent
		opts.Transcript = w.tx
	}
	intentID := intent.ID
	emitWrap := func(r db.Activity) {
		if emit != nil {
			r.NodeID, r.Worker = &intentID, name
			emit(r)
		}
	}
	// The intent / launch instruction / intent-anchored assets were already delivered
	// with the system prompt (see the sysBody assembly above). This launch user message
	// carries only the [global situation overview] — degradable big-picture info, safe
	// to compact away. In the rare case the overview marshals to empty, fall back to a
	// launch sentence so the first turn isn't an empty user message.
	input := overview
	if strings.TrimSpace(input) == "" {
		input = "Start executing the intent claimed in system: do only it, produce only facts, assets, findings, stop when done."
	}

	// Experimental: when on, noa takes over context compression (archives persist under <workDir>/noa/<SessionID>).
	noaSession := WorkerSessionID(ts.ID(), intent.ID)
	enableNoa(&opts, w.noaEnabledFn, w.workDir, noaSession, noaWarn(noaSession))
	ctx = attachSideCapture(ctx, &opts)
	s := agentcore.NewSession(opts)
	defer s.Close() // release the session's background-task manager (temp dir + processes)

	// Resume prior conversation if this intent was paused/blocked/exhausted and is
	// being re-run. The transcript ID is deterministic per intent, so if a prior
	// session exists the worker continues from where it left off instead of
	// restarting from scratch.
	alreadyRecorded := false
	if w.tx != nil {
		// A corrupt or unreadable transcript stops the run before any model or tool
		// call. No terminal reason: the engine marks the intent blocked without the
		// model_error reruns, which would only fail the same way again.
		if err := resumeSession(s, opts.SessionID); err != nil {
			return "", tsx.Writes(), err
		}
		alreadyRecorded = requestID != "" && hasWorkerChatMessage(s.Messages(), requestID)
		if len(s.Messages()) > 0 && message == "" {
			seedUnlockFromHistory(s.Messages(), def.UnlockSkill)
			input = "Continue."
		} else if len(s.Messages()) > 0 {
			seedUnlockFromHistory(s.Messages(), def.UnlockSkill)
		}
	}
	if message != "" {
		if alreadyRecorded {
			input = "Continue executing the new intent entered in the previous human conversation. Do not repeat actions already completed."
		} else if len(s.Messages()) > 0 {
			input = workerChatMarker(requestID) + "\n[New intent entered via human conversation]\n" + message +
				"\n\nExecute this human input immediately; after completing it, decide from the context whether the original task needs to continue."
		} else {
			input += "\n\n" + workerChatMarker(requestID) + "\n[New intent entered via human conversation]\n" + message +
				"\n\nExecute this human input first."
		}
	}

	// Budgets + settlement are owned by the SDK (MaxTurns/MaxDuration + Settlement):
	// on hit it runs a wrap-up turn and finishes with ReasonMaxTurns/ReasonTimeout.
	// MaxDuration now interrupts an in-flight tool at the wall-clock deadline and
	// enters the wrap-up phase on the live ctx, so a run whose tool overran the budget
	// still settles (no external hard-timeout backstop needed). ctx itself carries only
	// pause / planner kill / shutdown, which the engine distinguishes and re-queues/stops.
	_, reason, err := captureRunSession(ctx, s, input, emitWrap)
	return reason, tsx.Writes(), err
}
