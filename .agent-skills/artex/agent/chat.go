package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/guard"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
	"github.com/Autumn-27/norma/transcript"
)

// ChatAgent is the generic, task-independent conversational runner behind the chat
// page. It generalizes MainAgent.Chat: any agent (built-in OR a custom one, by
// key) can be chatted with, multi-turn history resumed from the transcript. It is
// a PURE ASSISTANT — base tools are the SDK DefaultTools (Bash/Read/Write/Edit/
// LS/Glob/Grep) plus whatever skills/MCP the key is made visible; NO pentest
// graph/task context is injected (that stays exclusive to MainAgent).
type ChatAgent struct {
	prov           llm.Provider
	model          string
	workDir        string
	tx             *transcript.Store
	window         int
	proxyAddr      string
	proxyCACert    string
	webSearch      WebSearchOpts
	guard          *guard.Guard // optional; nil disables intercept hooks for chat
	nonStreamingFn func() bool  // resolver: use non-streaming (Complete) path? (nil = streaming)
	noaEnabledFn   func() bool  // resolver: use experimental noa compaction? (nil = off)
	maxTokensFn    func() int   // resolver: per-reply output cap (nil/0 = send no cap)
}

func NewChatAgent(prov llm.Provider, model, workDir string, tx *transcript.Store, window int) *ChatAgent {
	return &ChatAgent{prov: prov, model: model, workDir: workDir, tx: tx, window: window}
}

// SetNonStreaming wires a resolver deciding whether chat runs use the
// non-streaming model path (true = non-streaming). nil/unset = streaming.
func (c *ChatAgent) SetNonStreaming(fn func() bool) { c.nonStreamingFn = fn }

func (c *ChatAgent) nonStreaming() bool { return c.nonStreamingFn != nil && c.nonStreamingFn() }

// SetNoaEnabled wires a resolver deciding whether chat runs use the experimental
// noa context-compression mechanism. nil/unset = off (built-in compaction). Read
// per run so the settings toggle takes effect without rebuilding the agent.
func (c *ChatAgent) SetNoaEnabled(fn func() bool) { c.noaEnabledFn = fn }

// SetMaxTokens wires a resolver for the per-reply output cap. nil/unset or 0 =
// send no cap and let the endpoint decide. Read per run, like nonStreaming.
func (c *ChatAgent) SetMaxTokens(fn func() int) { c.maxTokensFn = fn }

func (c *ChatAgent) maxTokens() int {
	if c.maxTokensFn == nil {
		return 0
	}
	return c.maxTokensFn()
}

// SetProxy points the chat agent's WebFetch/Bash at the recording proxy plus the
// CA cert it trusts (empty addr = direct). Kept for parity with the other agents.
func (c *ChatAgent) SetProxy(addr, caCert string) { c.proxyAddr, c.proxyCACert = addr, caCert }

// SetWebSearch selects the web_search backend for the chat agent (off by default).
func (c *ChatAgent) SetWebSearch(o WebSearchOpts) { c.webSearch = o }

// SetGuard attaches a guard (with user-configured intercept rules) to this chat
// agent. Must be called before Chat; safe to call multiple times.
func (c *ChatAgent) SetGuard(g *guard.Guard) { c.guard = g }

// chatWorkDirSpec returns a working-directory notice appended to every chat
// agent's system prompt. Mirrors artifactSpec but without pentest-specific
// wording ("payload", "capture response bodies") that would be odd in a general assistant.
func chatWorkDirSpec(workDir string) string {
	return "\n\n**File output rules**: whenever you need to write a file, write it to the working directory " + workDir + " (this is the default CWD — relative paths land here, and you may also use this absolute path) — do not write to /tmp or other absolute paths."
}

// chatSystem renders the DB-managed prompt body for agentKey. Custom agents have
// no per-key in-code default, so DefaultAssistantPrompt is the render fallback.
// Every chat agent, built-in or custom, can read target-derived content through
// WebFetch or Bash, so all of them get the code-owned untrusted-content tail
// after the editable body.
func chatSystem(agentKey, dataDir, workDir string) string {
	body := renderSystem(agentKey, DefaultAssistantPrompt, chatVars{DataDir: dataDir, Now: nowStr()})
	body += untrustedContentTail(body)
	return body + chatWorkDirSpec(workDir) + noiseProfileBlock()
}

// chatVars carries the runtime variables a custom agent's prompt may reference.
// DataDir (server data root) + Now (server wall-clock, refreshed each turn) are the
// universal ones; any other {{.X}} fails to render and falls back to
// DefaultAssistantPrompt.
type chatVars struct{ DataDir, Now string }

const maxChatSessionID = 64

// validChatSessionID is the session-directory name contract. Production uses
// "conv-" plus a decimal id; tests use hyphenated suffixes. Path separators
// and ".." are rejected so Join cannot leave <workDir>/sessions.
func validChatSessionID(id string) bool {
	if id == "" || len(id) > maxChatSessionID {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '_', c == '-':
		default:
			return false
		}
	}
	return true
}

func sessionDirInside(workDir, sessionWorkDir string) bool {
	base := filepath.Clean(filepath.Join(workDir, "sessions"))
	clean := filepath.Clean(sessionWorkDir)
	sep := string(os.PathSeparator)
	return clean == base || strings.HasPrefix(clean, base+sep)
}

// Chat runs ONE turn of a conversation with the agent identified by agentKey,
// resuming prior history keyed by sessionID. maxTurns is the per-turn agent step
// budget (0 = unlimited). maxDuration is the wall-clock run budget per turn
// (0 = unlimited); the timer resets each time Chat is called, so a new user
// message always starts a fresh countdown. webSearch gates network search for
// THIS agent (the global backend/key still come from the chat agent's config,
// but each agent decides on/off). emit receives each execution step (thinking /
// tool_use / tool_result / text / result), tagged with the agent key as the
// worker lane.
func (c *ChatAgent) Chat(ctx context.Context, agentKey, sessionID, message string, maxTurns int, maxDuration time.Duration, webSearch bool, emit func(db.Activity)) (string, error) {
	// gate the global web-search opts by this agent's own flag.
	ws := c.webSearch
	if !webSearch {
		ws.Enabled = false
	}

	if !validChatSessionID(sessionID) {
		return "", fmt.Errorf("invalid session id %q", sessionID)
	}
	// Per-session working directory: <workDir>/sessions/<sessionID>/
	// Isolates file writes across conversations, mirroring how workers use i<intentID>/.
	sessionWorkDir := filepath.Join(c.workDir, "sessions", sessionID)
	if !sessionDirInside(c.workDir, sessionWorkDir) {
		return "", fmt.Errorf("invalid session id %q", sessionID)
	}
	// A run directory like the task ones, created the same way (makeRunDir).
	makeRunDir(c.workDir, sessionWorkDir)
	ctx = intercept.WithReviewWorkingDirectory(ctx, sessionWorkDir)

	// Pure assistant: DefaultTools as the base; AugmentTools layers in the key's
	// visible skills/MCP and lets the DB tools table filter/override. DefaultTools
	// have no tools-table rows, so they always pass through.
	base := defaultTools(c.workDir) // file tools confined to sessionWorkDir (filetools.go)
	ctx = WithRunInfo(ctx, RunInfo{SessionID: sessionID})
	tools, def, cleanup := AugmentTools(ctx, agentKey, base)
	defer cleanup()

	system, boundary := deferredSystem(chatSystem(agentKey, c.workDir, sessionWorkDir), def)
	opts := agentcore.Options{
		Provider:        c.prov,
		SystemPrompt:    system,
		DynamicBoundary: boundary,
		Tools:           withWebFetch(ctx, tools, c.proxyAddr, c.proxyCACert), // WebFetch: routed through the recording proxy for tracing; loads the proxy CA to verify MITM-resigned HTTPS certificates; every redirect hop is gated
		DeferredTools:   def.Deferred,
		UnlockSet:       def.Unlock,
		PermissionMode:  permission.ModeBypass,
		// Web search (optional). ddgs needs no key; brave-free needs BraveKey; tavily needs TavilyKey.
		// WebSearchProxy is a dedicated egress proxy (http/https/socks5), unrelated to the traffic-recording MITM proxy; empty = direct.
		EnableWebSearch:       ws.Enabled,
		WebSearchBackend:      ws.Backend,
		BraveSearchAPIKey:     ws.BraveKey,
		TavilySearchAPIKey:    ws.TavilyKey,
		KeenableSearchAPIKey:  ws.KeenableKey,
		KeenableSearchTitle:   KeenableSearchTitle,
		DeepSeekSearchBaseURL: ws.DeepSeekBaseURL,
		DeepSeekSearchAPIKey:  ws.DeepSeekAPIKey,
		DeepSeekSearchModel:   ws.DeepSeekModel,
		WebSearchProxy:        ws.Proxy,
		BashEnv:               proxyEnv(c.proxyAddr, c.proxyCACert), // Bash subcommands go through the proxy + trust the CA by default
		WorkingDir:            sessionWorkDir,
		MaxTurns:              maxTurns,
		MaxDuration:           maxDuration,
		Compaction:            compactionConfig(c.window),
		Todos:                 actool.NewTodoStore(),
		// large tool output spills to cmd-output/ under the session dir, or to the
		// session's spill directory (spill.go).
		// the truncation cap uses the SDK default (30000 chars of tool.Capture).
		ToolOutputDir: SessionToolOutputDir(c.workDir, sessionID, sessionWorkDir),
		// hitting the budget (steps) → the SDK runs wrap-up: output a one-line summary. The prompt and
		// wrap-up rounds are editable in the backend per agent key
		// (each custom agent gets its own copy; empty/0 uses the generic default: 10 rounds).
		Settlement:   wrapupSettlement(agentKey, nil),
		NonStreaming: c.nonStreaming(), // when this profile selects non-streaming, use Provider.Complete
		MaxTokens:    c.maxTokens(),    // 0 = send no cap, the server's default decides

		// On by default; ARTEX_UNTRUSTED_BOUNDARY=0 opts out: nonce-frame tool output as untrusted data.
		UntrustedOutputBoundary: untrustedBoundaryEnabled(),
	}
	if c.guard != nil {
		opts.Hooks = c.guard.Hooks()
	}
	opts.Hooks = SpillHooks(opts.Hooks, opts.ToolOutputDir)
	// The session id is the provider-side identity (session header, usage metering)
	// with or without persistence; Norma only puts it on ctx when it writes a transcript.
	opts.SessionID = sessionID
	ctx = transcript.WithSessionID(ctx, opts.SessionID)
	if c.tx != nil { // persist raw human↔AI conversation; one accumulating file per thread
		opts.Transcript = c.tx
	}
	// experimental feature: when enabled, noa takes over context compression (archive centralized under <workDir>/noa/<SessionID>, persistent).
	enableNoa(&opts, c.noaEnabledFn, c.workDir, "chat-"+sessionID, noaWarn("chat-"+sessionID))
	ctx = attachSideCapture(ctx, &opts)
	s := agentcore.NewSession(opts)
	defer s.Close()
	// reload prior conversation so the agent has context across turns (each Chat is
	// a fresh session). First turn: no file yet → Resume loads nothing and proceeds.
	// A corrupt or unreadable transcript stops the turn before any model or tool call.
	if c.tx != nil {
		if err := resumeSession(s, opts.SessionID); err != nil {
			return "", err
		}
	}
	// re-unlock skill-gated MCPs from prior Skill() calls in the reloaded history so
	// revealed tools stay callable across the fresh session.
	seedUnlockFromHistory(s.Messages(), def.UnlockSkill)
	text, _, err := captureRunSession(ctx, s, message, func(r db.Activity) {
		if emit != nil {
			r.Worker = agentKey
			emit(r)
		}
	})
	return text, err
}
