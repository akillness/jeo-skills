// Package intercept implements the user-configurable tool-call interception layer.
// Rules are loaded from the database, cached in memory, and evaluated in priority
// order (highest first) on every PreToolUse event. Three actions are supported:
//
//   - allow: immediately permits the call, skipping lower-priority rules.
//   - deny:  blocks the call and returns a message to the model.
//   - ask:   blocks the call, creates an intercept_pending record, writes an
//     activity to the active conversation, then waits for the user to approve or
//     deny via the /api/intercept/pending/{id}/decide endpoint.
//
// The timeout behaviour is configurable at runtime via SetTimeoutConfig.
package intercept

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Autumn-27/artex/config"
	"github.com/Autumn-27/artex/db"
)

// ctxKey is the unexported context key type to avoid collisions.
type ctxKey int

// ConvIDKey stores the active conversation ID in a context.Context so the
// interceptor can associate "ask" pending records with the right conversation.
const ConvIDKey ctxKey = 0

// WithConvID returns a child context carrying convID.
func WithConvID(ctx context.Context, convID int64) context.Context {
	return context.WithValue(ctx, ConvIDKey, convID)
}

// ConvIDFromContext extracts the conversation ID (0 if absent).
func ConvIDFromContext(ctx context.Context) int64 {
	v, _ := ctx.Value(ConvIDKey).(int64)
	return v
}

// taskCtxKey is a separate unexported key type for task context values.
type taskCtxKey int

const (
	taskInfoCtxKey taskCtxKey = 1
	taskEmitCtxKey taskCtxKey = 2
)

type taskCtxInfo struct{ taskID, agentName string }

// WithTaskContext injects task metadata and an emit function into ctx so that
// HandleAsk can tag pending records and write intercept_request activities to
// the task's exploration stream (making them appear inline in session transcripts).
func WithTaskContext(ctx context.Context, taskID, agentName string, emit func(db.Activity)) context.Context {
	ctx = context.WithValue(ctx, taskInfoCtxKey, taskCtxInfo{taskID, agentName})
	if emit != nil {
		ctx = context.WithValue(ctx, taskEmitCtxKey, emit)
	}
	return ctx
}

func taskInfoFromCtx(ctx context.Context) (taskID, agentName string) {
	if v, ok := ctx.Value(taskInfoCtxKey).(taskCtxInfo); ok {
		return v.taskID, v.agentName
	}
	return "", ""
}

func taskEmitFromCtx(ctx context.Context) func(db.Activity) {
	f, _ := ctx.Value(taskEmitCtxKey).(func(db.Activity))
	return f
}

// targetScopeCtxKey is a separate unexported key type for the target-gate scope.
type targetScopeCtxKey struct{}

// DefaultTargetWaitBound is how long a gated tool call may wait for a human
// decision on an unpinned target before it fails with the request left open.
const DefaultTargetWaitBound = 300 * time.Second

// TargetScope is what an approval for an asset target is bound to: one task
// (TaskID) or one conversation (ConversationID), never both. Enabled reports the
// scope's opt-in flag and is read on every gated call; nil means the gate is off.
// WaitBound caps the wait for a human decision; 0 means never wait.
// Interceptor is the one that owns the gate of this session, so that code
// holding only a context (an HTTP redirect callback) can reach it.
type TargetScope struct {
	TaskID         string
	ConversationID int64
	Enabled        func() bool
	WaitBound      time.Duration
	Interceptor    *Interceptor

	AssessmentIdentity config.AssessmentIdentity // operator-configured identity of this task only
}

// WithTargetScope returns a child context carrying the target-gate scope of the
// session that runs on it.
func WithTargetScope(ctx context.Context, s TargetScope) context.Context {
	return context.WithValue(ctx, targetScopeCtxKey{}, s)
}

// TargetScopeFromContext extracts the target-gate scope (ok is false if absent).
func TargetScopeFromContext(ctx context.Context) (s TargetScope, ok bool) {
	s, ok = ctx.Value(targetScopeCtxKey{}).(TargetScope)
	return s, ok
}

// compiledRule is an InterceptRule with the regex pre-compiled (nil for string rules)
// and the argv tokens pre-parsed (nil for non-argv rules). bad marks a deny or
// ask rule whose pattern does not compile: it matches every call, as a deny.
type compiledRule struct {
	db.InterceptRule
	re   *regexp.Regexp
	argv []string
	bad  bool
}

// compileRule prepares a rule for matching. ok is false for a rule whose
// pattern does not compile; see loadLocked for what happens to it.
func compileRule(r db.InterceptRule) (compiledRule, bool) {
	cr := compiledRule{InterceptRule: r}
	switch r.MatchType {
	case "regex":
		re, err := regexp.Compile(r.Pattern)
		if err != nil {
			return cr, false
		}
		cr.re = re
	case "argv":
		tokens, err := ParseArgvPattern(r.Pattern)
		if err != nil {
			return cr, false
		}
		cr.argv = tokens
	}
	return cr, true
}

// pendingManager tracks in-flight approval requests via per-waiter channels. A
// classic ask has one waiter; a target request can have several (every call
// that names the same host waits on the same row).
type pendingManager struct {
	mu sync.Mutex
	ch map[int64][]chan bool
}

func newPendingManager() *pendingManager { return &pendingManager{ch: map[int64][]chan bool{}} }

// add registers one more waiter for id and returns its channel.
func (p *pendingManager) add(id int64) chan bool {
	ch := make(chan bool, 1)
	p.mu.Lock()
	p.ch[id] = append(p.ch[id], ch)
	p.mu.Unlock()
	return ch
}

// resolve wakes every waiter of id with the decision.
func (p *pendingManager) resolve(id int64, allowed bool) {
	p.mu.Lock()
	waiters := p.ch[id]
	delete(p.ch, id)
	p.mu.Unlock()
	for _, ch := range waiters {
		ch <- allowed
	}
}

// remove takes one waiter's channel out; the other waiters of id stay.
func (p *pendingManager) remove(id int64, ch chan bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	waiters := p.ch[id]
	for n, w := range waiters {
		if w == ch {
			waiters = append(waiters[:n:n], waiters[n+1:]...)
			break
		}
	}
	if len(waiters) == 0 {
		delete(p.ch, id)
		return
	}
	p.ch[id] = waiters
}

// Reviewer runs the LLM fallback judge for one tool call and returns its verdict
// as a Decision (Action ∈ allow|ask|deny; empty Action means the reply could not
// be parsed). It is injected by the server layer so the intercept package stays
// free of any llm dependency. profileID == 0 means "use the active/default profile".
type Reviewer func(ctx context.Context, profileID int64, prompt string, input ReviewInput) (Decision, error)

// Completer runs one model completion for the closed-question judge and returns
// the raw reply text and the profile it used. The reply is parsed and decided
// here, in code; the server layer only carries the text.
type Completer func(ctx context.Context, profileID int64, system, user string) (text string, usedProfileID int64, err error)

// Interceptor loads intercept rules from the database and evaluates them on
// tool calls. It is safe for concurrent use.
type Interceptor struct {
	db           *db.DB
	mu           sync.RWMutex
	cached       []compiledRule  // sorted by priority DESC; nil means not loaded yet
	enabledTools map[string]bool // nil means not loaded yet
	loadFailed   bool            // the last load failed; its error has been logged
	pending      *pendingManager
	reviewer     Reviewer  // nil = freeform LLM fallback judge not wired
	completer    Completer // nil = closed-question judge not wired
	// upstreamProxy reports whether target traffic leaves through an upstream
	// egress proxy (nil = no). Injected by the server layer.
	upstreamProxy func() bool
	// toolProxy reports whether one tool's own configuration routes its traffic
	// through a proxy (nil = no). Injected by the server layer.
	toolProxy func(string) bool
	// derivedExempt lists the endpoints of the platform's own services (nil =
	// none). Injected by the server layer. See SetDerivedExemptions.
	derivedExempt func() []string
	// targets is what the target gate reads and writes; resolve resolves the
	// names it checks. firstUse holds the exemptions and pin versions whose first
	// use this process has logged.
	targets  targetStore
	resolve  *resolveCache
	firstUse sync.Map
	// dial is the base dialer of PinnedDialer: every connection it lets through
	// is opened here. See SetBaseDialer.
	dial func(ctx context.Context, network, addr string) (net.Conn, error)
}

// SetUpstreamProxyCheck installs the function that reports whether an upstream
// egress proxy is configured. Behind one the proxy chooses the address it
// connects to, so a target approval given while it is set is name-only.
func (i *Interceptor) SetUpstreamProxyCheck(f func() bool) {
	i.mu.Lock()
	i.upstreamProxy = f
	i.mu.Unlock()
}

// SetToolProxyCheck installs the function that reports whether a tool sends its
// own traffic through a proxy. The proxy then chooses the address it connects
// to, so a target approval for that call is name-only. Passing nil disables it.
func (i *Interceptor) SetToolProxyCheck(f func(string) bool) {
	i.mu.Lock()
	i.toolProxy = f
	i.mu.Unlock()
}

// SetReviewer installs the LLM fallback judge callback. Passing nil disables it.
func (i *Interceptor) SetReviewer(r Reviewer) {
	i.mu.Lock()
	i.reviewer = r
	i.mu.Unlock()
}

// SetCompleter installs the closed-question judge callback. Passing nil disables it.
func (i *Interceptor) SetCompleter(c Completer) {
	i.mu.Lock()
	i.completer = c
	i.mu.Unlock()
}

// defaultEnabledTools is the hard-coded set of tools that enter the intercept
// rule system when no intercept_enabled_tools setting has been saved.
var defaultEnabledTools = []string{
	"Bash", "WebFetch", "web_search",
	"shell_open", "shell_send",
	"Write", "Edit", "MultiEdit",
	// ExecuteExtraTool dispatches MCP and deferred tools, and Monitor starts a
	// background command; both execute third-party or shell commands, so they
	// belong in the default gate with the rest.
	"ExecuteExtraTool", "Monitor",
}

// New creates an Interceptor backed by d. The rule cache is lazy-loaded on
// first use.
func New(d *db.DB) *Interceptor {
	return &Interceptor{db: d, pending: newPendingManager(),
		targets: dbTargetStore{d}, resolve: newResolveCache(systemResolver{}), dial: baseDial}
}

// Invalidate clears the in-memory rule cache and the enabled-tools cache.
// The next call to Match or IsToolEnabled will reload from the database.
// Call this after any CRUD operation on rules or tool config.
func (i *Interceptor) Invalidate() {
	i.mu.Lock()
	i.cached = nil
	i.enabledTools = nil
	i.mu.Unlock()
}

// loadLocked reads the rules and the enabled-tools setting. It installs both or,
// when either read fails, neither: the callers then fail closed (IsToolEnabled
// answers true, the matchers deny). The error is logged once per outage.
func (i *Interceptor) loadLocked() error {
	rules, err := i.db.ListInterceptRules()
	var val string
	var ok bool
	if err == nil {
		val, ok, err = i.db.GetSetting("intercept_enabled_tools")
	}
	if err != nil {
		if !i.loadFailed {
			i.loadFailed = true
			log.Printf("[intercept] the rule store cannot be read; every tool call is denied until it can: %v", err)
		}
		return err
	}
	i.loadFailed = false
	var out []compiledRule
	for _, r := range rules {
		if !r.Enabled {
			continue
		}
		cr, ok := compileRule(r)
		if !ok {
			if r.Action != "deny" && r.Action != "ask" {
				continue // an allow rule with a bad pattern allows nothing
			}
			// A deny or ask rule that cannot be evaluated must not fail open.
			cr.bad, cr.Action = true, "deny"
			cr.Message = "intercept rule [" + r.Name + "] has a pattern that does not compile; calls are blocked until the rule is fixed or disabled"
		}
		out = append(out, cr)
	}
	i.cached = out

	// Enabled-tools set from settings, falling back to hard-coded defaults.
	i.enabledTools = enabledToolsFromSetting(val, ok)
	return nil
}

// storeUnreadableDecision is what the matchers answer when the rules cannot be
// loaded: a deny, so that a call is never let through unchecked.
func storeUnreadableDecision() Decision {
	return Decision{Action: "deny", Message: "the intercept rules could not be loaded, so the call cannot be checked; it is blocked until the rule store is readable again"}
}

// enabledToolsFromSetting maps the stored intercept_enabled_tools value to the
// gate's set. A malformed value must not silently disable the gate, so it falls
// back to the same defaults as an unset setting.
func enabledToolsFromSetting(val string, ok bool) map[string]bool {
	m := make(map[string]bool, len(defaultEnabledTools))
	for _, n := range defaultEnabledTools {
		m[n] = true
	}
	if !ok {
		return m
	}
	var names []string
	if json.Unmarshal([]byte(val), &names) != nil {
		return m
	}
	m = make(map[string]bool, len(names))
	for _, n := range names {
		m[n] = true
	}
	return m
}

func (i *Interceptor) rules() ([]compiledRule, error) {
	i.mu.RLock()
	if i.cached != nil {
		out := i.cached
		i.mu.RUnlock()
		return out, nil
	}
	i.mu.RUnlock()

	i.mu.Lock()
	defer i.mu.Unlock()
	if i.cached != nil {
		return i.cached, nil
	}
	if err := i.loadLocked(); err != nil {
		return nil, err
	}
	return i.cached, nil
}

// IsToolEnabled returns true if the named tool is in the intercept-enabled set
// (i.e. it should enter the rule-matching path). Uses the same double-check lock
// pattern as rules(). When the set cannot be loaded it answers true for every
// tool, so the call reaches the rule path, where Match denies it.
func (i *Interceptor) IsToolEnabled(name string) bool {
	i.mu.RLock()
	if i.enabledTools != nil {
		v := i.enabledTools[name]
		i.mu.RUnlock()
		return v
	}
	i.mu.RUnlock()

	i.mu.Lock()
	defer i.mu.Unlock()
	if i.enabledTools == nil {
		if err := i.loadLocked(); err != nil {
			return true
		}
	}
	return i.enabledTools[name]
}

// GetEnabledTools returns the ordered list of tool names that are currently
// configured to enter the intercept rule system. When the setting has never been
// saved the hard-coded default list is returned.
func (i *Interceptor) GetEnabledTools() ([]string, error) {
	val, ok, err := i.db.GetSetting("intercept_enabled_tools")
	if err != nil {
		return nil, err
	}
	if !ok {
		out := make([]string, len(defaultEnabledTools))
		copy(out, defaultEnabledTools)
		return out, nil
	}
	var names []string
	if err := json.Unmarshal([]byte(val), &names); err != nil {
		return nil, fmt.Errorf("intercept_enabled_tools is not valid JSON: %w", err)
	}
	return names, nil
}

// SetEnabledTools persists the list of tool names that should enter the intercept
// rule system, then invalidates the cache so the next call picks up the new list.
func (i *Interceptor) SetEnabledTools(tools []string) error {
	b, err := json.Marshal(tools)
	if err != nil {
		return err
	}
	if err := i.db.SetSetting("intercept_enabled_tools", string(b)); err != nil {
		return err
	}
	i.Invalidate()
	return nil
}

// Decision is the outcome of a successful rule match.
type Decision struct {
	ModelInput       json.RawMessage
	ModelInputDigest string
	ModelFallback    bool
	RuleName         string
	ConfigDigest     string
	ProfileID        int64
	Action           string // "allow" | "deny" | "ask"
	Message          string
	RuleID           int64
	TimeoutEnabled   bool
	TimeoutSeconds   int
	TimeoutAction    string           // "deny" | "allow"
	JudgeAnswers     []db.JudgeAnswer // closed-mode judge answers, stored in the audit
}

// --- LLM fallback judge ---

// Judge settings keys (stored in the settings KV table). See docs §3.
const (
	settingJudgeEnabled          = "llm_judge_enabled"
	settingJudgeProfileID        = "llm_judge_profile_id"
	settingJudgePrompt           = "llm_judge_prompt"
	settingJudgeTimeoutSecs      = "llm_judge_timeout_seconds"
	settingJudgeFailAction       = "llm_judge_fail_action"
	settingJudgeAskTimeoutSecs   = "llm_judge_ask_timeout_seconds"
	settingJudgeAskTimeoutAction = "llm_judge_ask_timeout_action"
	settingJudgeMode             = "llm_judge_mode"
)

// Judge modes: closed asks the code-owned questions and decides in code;
// freeform is the original allow/ask/deny prompt.
const (
	JudgeModeClosed   = "closed"
	JudgeModeFreeform = "freeform"
)

// Judge default values. A judge that fails never allows by default: an invalid
// reply or a failed call goes to a human.
const (
	defaultJudgeTimeoutSecs      = 15
	defaultJudgeFailAction       = "ask"
	defaultJudgeAskTimeoutSecs   = 300
	defaultJudgeAskTimeoutAction = "deny"
)

// JudgeConfig is the resolved LLM-fallback-judge configuration. Prompt is always
// non-empty (falls back to DefaultJudgePrompt).
type JudgeConfig struct {
	Enabled           bool   `json:"enabled"`
	Mode              string `json:"mode"`       // closed|freeform
	ProfileID         int64  `json:"profile_id"` // 0 = follow active/default
	Prompt            string `json:"prompt"`
	TimeoutSeconds    int    `json:"timeout_seconds"`
	FailAction        string `json:"fail_action"` // allow|ask|deny
	AskTimeoutSeconds int    `json:"ask_timeout_seconds"`
	AskTimeoutAction  string `json:"ask_timeout_action"` // allow|deny
}

// judgeConfig reads the judge configuration from settings, applying defaults for
// missing/invalid keys. Read fresh on each fallback judgement — the LLM call that
// follows dwarfs a few KV reads, and freshness avoids a cache-invalidation path.
func (i *Interceptor) judgeConfig() JudgeConfig {
	c := JudgeConfig{
		Enabled:           i.db.GetBool(settingJudgeEnabled, false),
		Mode:              i.getSettingChoice(settingJudgeMode, JudgeModeClosed, JudgeModeClosed, JudgeModeFreeform),
		ProfileID:         int64(i.getSettingInt(settingJudgeProfileID, 0)),
		TimeoutSeconds:    i.getSettingInt(settingJudgeTimeoutSecs, defaultJudgeTimeoutSecs),
		FailAction:        i.getSettingChoice(settingJudgeFailAction, defaultJudgeFailAction, "allow", "ask", "deny"),
		AskTimeoutSeconds: i.getSettingInt(settingJudgeAskTimeoutSecs, defaultJudgeAskTimeoutSecs),
		AskTimeoutAction:  i.getSettingChoice(settingJudgeAskTimeoutAction, defaultJudgeAskTimeoutAction, "allow", "deny"),
	}
	// Prompt: stored value if non-empty, else the built-in template.
	if v, ok, _ := i.db.GetSetting(settingJudgePrompt); ok && strings.TrimSpace(v) != "" {
		c.Prompt = v
	} else {
		c.Prompt = DefaultJudgePrompt
	}
	if c.TimeoutSeconds <= 0 {
		c.TimeoutSeconds = defaultJudgeTimeoutSecs
	}
	if c.AskTimeoutSeconds <= 0 {
		c.AskTimeoutSeconds = defaultJudgeAskTimeoutSecs
	}
	return c
}

func (i *Interceptor) getSettingInt(key string, def int) int {
	v, ok, err := i.db.GetSetting(key)
	if err != nil || !ok {
		return def
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil {
		return def
	}
	return n
}

func (i *Interceptor) getSettingChoice(key, def string, allowed ...string) string {
	v, ok, err := i.db.GetSetting(key)
	if err != nil || !ok {
		return def
	}
	v = strings.TrimSpace(v)
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	return def
}

// GetJudgeConfig returns the resolved judge configuration for the API/UI. Prompt
// is the effective prompt (built-in template when unset), so the UI can prefill.
func (i *Interceptor) GetJudgeConfig() JudgeConfig { return i.judgeConfig() }

// SetJudgeConfig persists the judge configuration. An empty Prompt clears the
// override (the built-in template is used again).
func (i *Interceptor) SetJudgeConfig(c JudgeConfig) error {
	if err := i.db.SetBool(settingJudgeEnabled, c.Enabled); err != nil {
		return err
	}
	// An empty or unknown mode reads back as the default, closed.
	if err := i.db.SetSetting(settingJudgeMode, c.Mode); err != nil {
		return err
	}
	if err := i.db.SetSetting(settingJudgeProfileID, strconv.FormatInt(c.ProfileID, 10)); err != nil {
		return err
	}
	// Store the prompt only when it differs from the built-in template, so version
	// updates to DefaultJudgePrompt flow through for users who never customized it.
	promptToStore := ""
	if strings.TrimSpace(c.Prompt) != "" && strings.TrimSpace(c.Prompt) != strings.TrimSpace(DefaultJudgePrompt) {
		promptToStore = c.Prompt
	}
	if err := i.db.SetSetting(settingJudgePrompt, promptToStore); err != nil {
		return err
	}
	if err := i.db.SetSetting(settingJudgeTimeoutSecs, strconv.Itoa(c.TimeoutSeconds)); err != nil {
		return err
	}
	if err := i.db.SetSetting(settingJudgeFailAction, c.FailAction); err != nil {
		return err
	}
	if err := i.db.SetSetting(settingJudgeAskTimeoutSecs, strconv.Itoa(c.AskTimeoutSeconds)); err != nil {
		return err
	}
	if err := i.db.SetSetting(settingJudgeAskTimeoutAction, c.AskTimeoutAction); err != nil {
		return err
	}
	return nil
}

// Judge runs the LLM fallback judge for a tool call that matched no rule. It
// returns (Decision, true) when the judge produced a terminal verdict, or
// (Decision{}, false) when the fallback is disabled or not wired (caller then
// keeps the current behavior: allow). In closed mode (the default) the decision
// is code-owned and every failure is ask (see judgeClosed). In freeform mode a
// model error or an unparseable reply falls back to the configured FailAction.
// Ask verdicts carry the human-approval timeout so the existing HandleAsk
// consumes them unchanged.
func (i *Interceptor) Judge(ctx context.Context, tool string, arguments json.RawMessage) (Decision, bool) {
	cfg := i.judgeConfig()
	i.mu.RLock()
	rv, cp := i.reviewer, i.completer
	i.mu.RUnlock()
	return judgeWith(ctx, cfg, rv, cp, tool, arguments)
}

// judgeWith is Judge on a resolved configuration, without the database.
func judgeWith(ctx context.Context, cfg JudgeConfig, rv Reviewer, cp Completer, tool string, arguments json.RawMessage) (Decision, bool) {
	closed := cfg.Mode != JudgeModeFreeform
	// Closed mode without a completer is not "off": judgeClosed answers ask.
	if !cfg.Enabled || (!closed && rv == nil) {
		return Decision{}, false
	}

	cctx := ctx
	if cfg.TimeoutSeconds > 0 {
		var cancel context.CancelFunc
		cctx, cancel = context.WithTimeout(ctx, time.Duration(cfg.TimeoutSeconds)*time.Second)
		defer cancel()
	}

	// Closed mode checks the argument cap before building its own input.
	var input ReviewInput
	var contextErr error
	if !closed {
		input, contextErr = BuildReviewInput(cctx, tool, arguments)
	}
	policy := cfg.Prompt // closed mode: the stored prompt is the operator policy (data)
	cfg.Prompt = EffectiveJudgePrompt(cfg.Prompt)
	var out Decision
	var err error
	var modelInput []byte
	switch {
	case closed:
		// Never sets err and always returns allow, ask or deny: every failure is ask.
		out, modelInput = judgeClosed(cctx, cp, cfg.ProfileID, policy, tool, arguments)
	case contextErr != nil:
		// Invalid current arguments cannot be reviewed faithfully, regardless of
		// the configured model-failure strategy. A human must resolve the input.
		out = Decision{Action: "ask", ModelFallback: true, Message: "review context incomplete, manual confirmation required: " + contextErr.Error()}
	default:
		modelInput, _ = json.Marshal(input)
		out, err = rv(cctx, cfg.ProfileID, cfg.Prompt, input)
	}
	if err != nil {
		out = Decision{ProfileID: out.ProfileID, ModelFallback: true, Action: cfg.FailAction, Message: "model review failed, applying failure policy: " + err.Error()}
	}
	switch out.Action {
	case "allow", "ask", "deny":
		// valid verdict
	default:
		out = Decision{ProfileID: out.ProfileID, ModelFallback: true, Action: cfg.FailAction, Message: "model output unparsable, applying failure policy"}
	}
	// A model verdict never carries a rule; keep RuleID 0 (→ NULL) for history.
	out.RuleID = 0
	if len(modelInput) > 0 {
		out.ModelInput = modelInput
		out.ModelInputDigest = digestInput(modelInput)
	}
	if out.ProfileID != 0 {
		cfg.ProfileID = out.ProfileID
	}
	out.ProfileID = cfg.ProfileID
	configJSON, _ := json.Marshal(cfg)
	out.ConfigDigest = digestInput(configJSON)
	out.Message = JudgeReason(out.Action, out.Message)
	if out.Action == "ask" {
		out.TimeoutEnabled = true
		out.TimeoutSeconds = cfg.AskTimeoutSeconds
		out.TimeoutAction = cfg.AskTimeoutAction
	}
	return out, true
}

// JudgeReason is the reason stored for a judge verdict: the model's message, or
// a label for the action when it gave none, carrying db.ModelReasonPrefix so
// the db readers record decision_source='model'.
func JudgeReason(action, message string) string {
	if message == "" {
		return db.ModelReasonPrefix + " " + judgeActionLabel(action)
	}
	if !strings.HasPrefix(message, db.ModelReasonPrefix) {
		return db.ModelReasonPrefix + " " + message
	}
	return message
}

func judgeActionLabel(action string) string {
	switch action {
	case "allow":
		return "allow"
	case "deny":
		return "block"
	case "ask":
		return "escalated to manual approval"
	default:
		return action
	}
}

// Match evaluates the rule list (priority DESC) against a tool call.
// Returns (Decision, true) for the first matching enabled rule, or
// (Decision{}, false) if no rule matches. When the rules cannot be loaded it
// returns a deny.
func (i *Interceptor) Match(toolName string, input []byte) (Decision, bool) {
	rules, err := i.rules()
	if err != nil {
		return storeUnreadableDecision(), true
	}
	for _, r := range rules {
		if ruleMatches(r, toolName, input) {
			msg := r.Message
			if msg == "" {
				msg = defaultMessage(r.Action, r.Name)
			}
			configJSON, _ := json.Marshal(r.InterceptRule)
			return Decision{
				RuleName: r.Name, ConfigDigest: digestInput(configJSON),
				Action:         r.Action,
				Message:        msg,
				RuleID:         r.ID,
				TimeoutEnabled: r.TimeoutEnabled,
				TimeoutSeconds: r.TimeoutSeconds,
				TimeoutAction:  r.TimeoutAction,
			}, true
		}
	}
	return Decision{}, false
}

// builtinRulePrefix marks the rules seeded by the platform (db.seedDefaultInterceptRules
// and its v2/v3 migrations).
const builtinRulePrefix = "[built-in]"

// MatchBuiltin is Match restricted to the built-in deny rules: the enabled rules
// whose name starts with "[built-in]" and whose action is deny, on the tools that
// enter the rule system. It returns the first match in priority order. User rules,
// allow and ask rules, and the judge are not consulted. The planner and the main
// agent use it (#124, F11). An interceptor without a database and without loaded
// rules matches nothing. When the rules cannot be loaded it returns a deny.
func (i *Interceptor) MatchBuiltin(toolName string, input []byte) (Decision, bool) {
	i.mu.RLock()
	loaded := i.cached != nil
	i.mu.RUnlock()
	if !loaded && i.db == nil {
		return Decision{}, false
	}
	if !i.IsToolEnabled(toolName) {
		return Decision{}, false
	}
	rules, err := i.rules()
	if err != nil {
		return storeUnreadableDecision(), true
	}
	for _, r := range rules {
		if r.Action != "deny" || !strings.HasPrefix(r.Name, builtinRulePrefix) || !ruleMatches(r, toolName, input) {
			continue
		}
		msg := r.Message
		if msg == "" {
			msg = defaultMessage(r.Action, r.Name)
		}
		configJSON, _ := json.Marshal(r.InterceptRule)
		return Decision{
			RuleName: r.Name, ConfigDigest: digestInput(configJSON),
			Action:  r.Action,
			Message: msg,
			RuleID:  r.ID,
		}, true
	}
	return Decision{}, false
}

// SetRulesForTest installs rules (in priority order) as the loaded rule set, with
// the default intercept-enabled tools, on an interceptor that may have no
// database. It is a test seam for the guard package, which cannot reach the
// unexported cache; production code loads the rules from the database.
func (i *Interceptor) SetRulesForTest(rules []db.InterceptRule) {
	out := []compiledRule{}
	for _, r := range rules {
		if !r.Enabled {
			continue
		}
		cr, ok := compileRule(r)
		if !ok {
			panic("SetRulesForTest: bad pattern " + r.Pattern)
		}
		out = append(out, cr)
	}
	tools := make(map[string]bool, len(defaultEnabledTools))
	for _, n := range defaultEnabledTools {
		tools[n] = true
	}
	i.mu.Lock()
	i.cached, i.enabledTools = out, tools
	i.mu.Unlock()
}

func ruleMatches(r compiledRule, toolName string, input []byte) bool {
	if r.bad {
		return true
	}
	if r.MatchType == "argv" {
		// Bash only, on the parsed command; match_target is always tool_input.
		// Allow rules stay strictly limited to a single simple command with
		// exact derived prefix and denylist enforcement. Deny and ask rules
		// walk every call in a compound Bash command, stripping known wrappers
		// and recursing into eval / shell -c payloads.
		if r.Action == "allow" {
			if CheckArgvAllow(r.argv) != nil {
				return false
			}
			return r.MatchTarget == "tool_input" && argvRuleMatches(r.argv, toolName, input)
		}
		if r.Action == "deny" || r.Action == "ask" {
			return r.MatchTarget == "tool_input" && argvCompoundMatches(r.argv, toolName, input)
		}
		return false
	}
	var subject string
	switch r.MatchTarget {
	case "tool_name":
		subject = toolName
	case "tool_input":
		subject = string(input)
	default:
		return false
	}
	if r.MatchType == "regex" {
		return r.re != nil && r.re.MatchString(subject)
	}
	return strings.Contains(subject, r.Pattern)
}

func defaultMessage(action, name string) string {
	switch action {
	case "deny":
		return "intercept rule [" + name + "] forbids executing this tool"
	case "ask":
		return "intercept rule [" + name + "] requires user approval, please wait"
	default:
		return ""
	}
}

// Log records an allow/deny rule or model decision into intercept_pending as an ALREADY-decided
// row (status = "allowed" | "denied"), for observability. Unlike HandleAsk it does NOT
// block and needs no user action — it makes explicit review decisions visible on the history
// page (GET /api/intercept/history) and the task's intercept list. Best-effort: a DB
// error is swallowed so logging never changes the tool call's outcome. The pending list
// (status='pending') is unaffected, so it still shows only asks awaiting a decision.
func (i *Interceptor) Log(ctx context.Context, convID int64, dec Decision, toolName string, input []byte, status string) {
	if i.db == nil {
		return // no store to record into (SetRulesForTest)
	}
	taskID, agentName := taskInfoFromCtx(ctx)
	audit := auditFor(ctx, dec, input, status)
	id, err := i.db.CreateDecidedIntercept(dec.RuleID, convID, taskID, agentName, toolName, input, status, dec.Message, audit)
	if err == nil {
		i.bindResult(ctx, id, audit)
	}
}

// HandleAsk creates a pending approval record and blocks until the user decides
// (via /api/intercept/pending/{id}/decide) or the per-rule timeout elapses.
// Returns true if the user approved.
//
// convID == 0 means no active conversation (background pentest task). The
// pending record is still created (conversation_id = NULL) so the approvals
// page shows it and the sidebar badge lights up. The worker thread blocks just
// like in a chat session — the user must visit the approvals page to unblock it.
func (i *Interceptor) HandleAsk(ctx context.Context, convID int64, dec Decision, toolName string, input []byte) bool {
	ruleID := dec.RuleID
	taskID, agentName := taskInfoFromCtx(ctx)
	taskEmit := taskEmitFromCtx(ctx)

	audit := auditFor(ctx, dec, input, "pending")
	pendingID, err := i.db.CreateInterceptPending(ruleID, convID, taskID, agentName, toolName, input, dec.Message, audit)
	if err != nil {
		return false
	}

	i.bindResult(ctx, pendingID, audit)
	ch := i.pending.add(pendingID)
	defer i.pending.remove(pendingID, ch)
	// Polling clients can decide after INSERT commits but before the channel is
	// registered. Re-read after registration so that decision cannot be lost;
	// later decisions will be delivered through ch.
	if saved, err := i.db.GetInterceptDetail(pendingID); err == nil && saved != nil && saved.Status != "pending" {
		return saved.Status == "allowed" || (saved.Audit != nil && saved.Audit.EffectiveAction == "allow")
	}

	detail, _ := json.Marshal(map[string]any{
		"pending_id": pendingID,
		"tool":       toolName,
		"input":      json.RawMessage(input),
	})
	activity := db.Activity{
		Kind:    "intercept_request",
		Summary: fmt.Sprintf("tool %s requests approval (#%d)", toolName, pendingID),
		Detail:  string(detail),
	}

	if convID != 0 {
		// Chat session: write inline card to the conversation stream.
		_, _ = i.db.AppendConvActivity(convID, activity)
	} else if taskEmit != nil {
		// Task worker: emit to the exploration activity stream so it appears
		// inline in the session transcript (the emit fn stamps NodeID + Worker).
		taskEmit(activity)
	}

	if !dec.TimeoutEnabled {
		// No timeout: wait indefinitely until user decides or worker stops.
		select {
		case allowed := <-ch:
			return allowed
		case <-ctx.Done():
			_, _ = i.db.ResolveIntercept(pendingID, "denied", "deny", "work cancelled", "system")
			_ = i.db.CompleteIntercept(pendingID, audit.RunID, audit.ToolUseID, "not_executed", "work cancelled before execution", false)
			return false
		}
	}

	secs := dec.TimeoutSeconds
	if secs <= 0 {
		secs = 60
	}
	timer := time.NewTimer(time.Duration(secs) * time.Second)
	defer timer.Stop()
	select {
	case allowed := <-ch:
		return allowed
	case <-timer.C:
		allowed := dec.TimeoutAction == "allow"
		action := "deny"
		if allowed {
			action = "allow"
		}
		resolved, err := i.db.ResolveIntercept(pendingID, "timeout", action, "approval timed out, applying timeout policy", "system")
		if err != nil {
			return false
		}
		if !resolved {
			detail, err := i.db.GetInterceptDetail(pendingID)
			return err == nil && detail != nil && (detail.Status == "allowed" || (detail.Audit != nil && detail.Audit.EffectiveAction == "allow"))
		}
		return allowed
	case <-ctx.Done():
		_, _ = i.db.ResolveIntercept(pendingID, "denied", "deny", "work cancelled", "system")
		_ = i.db.CompleteIntercept(pendingID, audit.RunID, audit.ToolUseID, "not_executed", "work cancelled before execution", false)
		return false
	}
}

var ErrAlreadyDecided = errors.New("approval already decided or does not exist; please refresh the list")

// Decide resolves a pending request. Called by the HTTP decide endpoint.
// approver (subject of the session token) and remoteAddr identify the human
// behind the decision; they are recorded in the row's audit. On a target
// request "allowed" also pins the addresses the request displayed, and both
// values go to the pin: a human decision is the only thing that creates a pin.
func (i *Interceptor) Decide(pendingID int64, allowed bool, approver, remoteAddr string) error {
	status := "denied"
	if allowed {
		status = "allowed"
	}
	action, reason := "deny", "user rejected execution"
	if allowed {
		action, reason = "allow", "user approved execution"
	}
	targetKey, err := i.db.TargetRequestKey(pendingID)
	if err != nil {
		return err
	}
	var resolved bool
	if targetKey != "" {
		_, resolved, err = i.db.ResolveTargetRequest(pendingID, allowed, approver, remoteAddr)
	} else {
		resolved, err = i.db.ResolveInterceptBy(pendingID, status, action, reason, "human", approver, remoteAddr)
	}
	if err != nil {
		return err
	}
	if !resolved {
		return ErrAlreadyDecided
	}
	i.pending.resolve(pendingID, allowed)
	return nil
}
