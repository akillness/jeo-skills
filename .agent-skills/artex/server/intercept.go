package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/guard"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/norma/llm"
)

// judgeWorkerLane is the usage-ledger "worker" label for intercept fallback-judge
// calls, so judge spend can be queried apart from the worker/planner/main lanes.
const judgeWorkerLane = "judge"

// chatGuard returns a guard wired with the manager's interceptor, used for chat
// conversations. Called once per applyLLM so a new LLM config always gets a fresh guard.
func (s *Server) chatGuard() *guard.Guard {
	return guard.NewWithInterceptor(s.m.interceptor)
}

// wireInterceptReviewer installs the LLM fallback judge into the interceptor. The
// judge runs only on tool calls that matched no rule (see intercept.Judge). It
// resolves the configured judge profile (0 → active/default), builds a provider,
// runs a one-shot JSON classification with an explanation for every verdict.
func (s *Server) wireInterceptReviewer() {
	s.m.interceptor.SetReviewer(func(ctx context.Context, profileID int64, prompt string, input intercept.ReviewInput) (intercept.Decision, error) {
		prov, profileID, err := s.judgeProvider(profileID)
		if err != nil {
			return intercept.Decision{ProfileID: profileID}, err
		}
		// Tag this call's usage as the "judge" lane so the config page can report
		// how much the fallback approval has spent, separate from model profiles.
		ctx = llmrec.WithWorker(ctx, judgeWorkerLane)
		text, err := reviewCompletion(ctx, prov, prompt, input)
		if err != nil {
			return intercept.Decision{ProfileID: profileID}, err
		}
		v := intercept.ParseVerdict(text)
		if v.Action == "" {
			return intercept.Decision{ProfileID: profileID}, fmt.Errorf("invalid model verdict format: it must contain the decision, actual action, consequence if successful, and matched rule")
		}
		return intercept.Decision{Action: v.Action, Message: v.Reason, ProfileID: profileID}, nil
	})
	// Closed mode: one call answers every question; intercept parses and decides.
	s.m.interceptor.SetCompleter(func(ctx context.Context, profileID int64, system, user string) (string, int64, error) {
		prov, profileID, err := s.judgeProvider(profileID)
		if err != nil {
			return "", profileID, err
		}
		ctx = llmrec.WithWorker(ctx, judgeWorkerLane)
		text, err := streamCollectText(ctx, prov, system, user, closedJudgeMaxTokens)
		return text, profileID, err
	})
}

// closedJudgeMaxTokens bounds the closed-question reply: eight short answers
// with one evidence line of at most 200 characters each.
const closedJudgeMaxTokens = 1536

// judgeProvider resolves the judge profile (0 → active/default) to a provider.
func (s *Server) judgeProvider(profileID int64) (llm.Provider, int64, error) {
	if profileID == 0 {
		if p, err := s.m.pg.ActiveProfile(); err == nil && p != nil {
			profileID = p.ID
		}
	}
	if profileID == 0 {
		return nil, 0, fmt.Errorf("no usable judge model is configured")
	}
	prov, _, ok := s.providerForProfile(profileID)
	if !ok {
		return nil, profileID, fmt.Errorf("judge model profile %d is unavailable", profileID)
	}
	return prov, profileID, nil
}

func reviewCompletion(ctx context.Context, prov llm.Provider, prompt string, input intercept.ReviewInput) (string, error) {
	user, err := json.Marshal(input)
	if err != nil {
		return "", err
	}
	return streamCollectText(ctx, prov, prompt, string(user), 1024)
}

// streamCollectText runs a single non-streaming-style completion (thinking off,
// low temperature, bounded output) and returns the concatenated text. The
// budget includes the explanation and complete closing JSON delimiters.
func streamCollectText(ctx context.Context, prov llm.Provider, system, user string, maxTokens int) (string, error) {
	temp := 0.0
	req := llm.CompletionRequest{
		System:      []string{system},
		Messages:    []llm.Message{llm.UserText(user)},
		MaxTokens:   maxTokens,
		Temperature: &temp,
		Thinking:    "disabled",
	}
	var sb strings.Builder
	for ev, err := range prov.Stream(ctx, req) {
		if err != nil {
			return "", err
		}
		if ev.Type == llm.SETextDelta {
			sb.WriteString(ev.Text)
		}
	}
	return sb.String(), nil
}

// --- intercept rule CRUD ---

func (s *Server) interceptListRules(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	rules, err := pg.ListInterceptRules()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if rules == nil {
		rules = []db.InterceptRule{}
	}
	writeJSON(w, 200, map[string]any{"rules": rules})
}

func (s *Server) interceptCreateRule(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req interceptRuleReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := validateInterceptRuleReq(req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	rule, err := pg.CreateInterceptRule(req.Name, req.MatchTarget, req.MatchType, req.Pattern, req.Action, req.Message, req.Priority, req.Enabled, req.TimeoutEnabled, req.TimeoutSeconds, req.TimeoutAction)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.m.interceptor.Invalidate()
	writeJSON(w, 200, rule)
}

func (s *Server) interceptUpdateRule(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, 400, "bad rule id")
		return
	}
	var req interceptRuleReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := validateInterceptRuleReq(req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	rule, err := pg.UpdateInterceptRule(id, req.Name, req.MatchTarget, req.MatchType, req.Pattern, req.Action, req.Message, req.Priority, req.Enabled, req.TimeoutEnabled, req.TimeoutSeconds, req.TimeoutAction)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.m.interceptor.Invalidate()
	writeJSON(w, 200, rule)
}

func (s *Server) interceptDeleteRule(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, 400, "bad rule id")
		return
	}
	if err := pg.DeleteInterceptRule(id); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.m.interceptor.Invalidate()
	writeJSON(w, 200, map[string]any{"deleted": id})
}

func (s *Server) interceptToggleRule(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, 400, "bad rule id")
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.ToggleInterceptRule(id, req.Enabled); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.m.interceptor.Invalidate()
	writeJSON(w, 200, map[string]any{"ok": true, "enabled": req.Enabled})
}

// --- pending (ask) ---

// interceptPendingDTO is a pending row plus its risk score. The embedded row
// keeps every existing JSON field; the score is computed on read, never stored.
type interceptPendingDTO struct {
	db.InterceptPending
	Risk intercept.RiskReport `json:"risk"`
}

func pendingDTO(p db.InterceptPending) interceptPendingDTO {
	return interceptPendingDTO{InterceptPending: p, Risk: intercept.ScoreRisk(p.ToolName, p.ToolInput)}
}

func (s *Server) interceptListPending(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	pending, err := pg.ListPendingIntercepts()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	out := make([]interceptPendingDTO, 0, len(pending))
	for _, p := range pending {
		out = append(out, pendingDTO(p))
	}
	writeJSON(w, 200, map[string]any{"pending": out})
}

func (s *Server) interceptGetOne(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, 400, "bad pending id")
		return
	}
	p, err := pg.GetInterceptPending(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if p == nil {
		writeErr(w, 404, "not found")
		return
	}
	writeJSON(w, 200, pendingDTO(*p))
}

func (s *Server) interceptListTaskItems(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	taskID := r.PathValue("taskID")
	if taskID == "" {
		writeErr(w, 400, "bad task id")
		return
	}
	q := r.URL.Query()
	filter, err := interceptFilterParams(q)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if q.Get("page") == "" && q.Get("size") == "" && filter == (db.InterceptApprovalFilter{}) {
		items, err := pg.ListTaskIntercepts(taskID)
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		if items == nil {
			items = []db.InterceptApprovalRow{}
		}
		writeJSON(w, 200, map[string]any{"items": items, "total": len(items)})
		return
	}
	page, size := interceptPageParams(q)
	items, total, err := pg.ListTaskInterceptsPage(taskID, page, size, filter)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if items == nil {
		items = []db.InterceptApprovalRow{}
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "page": page, "page_size": size})
}

func (s *Server) interceptHistory(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	q := r.URL.Query()
	filter, err := interceptFilterParams(q)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if q.Get("page") == "" && q.Get("size") == "" && filter == (db.InterceptApprovalFilter{}) {
		items, err := pg.ListAllIntercepts(200)
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		if items == nil {
			items = []db.InterceptApprovalRow{}
		}
		writeJSON(w, 200, map[string]any{"items": items, "total": len(items)})
		return
	}
	page, size := interceptPageParams(q)
	items, total, err := pg.ListAllInterceptsPage(page, size, filter)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if items == nil {
		items = []db.InterceptApprovalRow{}
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total, "page": page, "page_size": size})
}

func interceptFilterParams(q url.Values) (db.InterceptApprovalFilter, error) {
	filter := db.InterceptApprovalFilter{Status: q.Get("status"), DecisionSource: q.Get("decision_source"), DecidedBy: q.Get("decided_by")}
	switch filter.Status {
	case "", "pending", "allowed", "denied", "timeout":
	default:
		return filter, fmt.Errorf("status must be pending, allowed, denied or timeout")
	}
	switch filter.DecisionSource {
	case "", "model", "rule", "target", "unknown":
	default:
		return filter, fmt.Errorf("decision_source must be model, rule, target or unknown")
	}
	switch filter.DecidedBy {
	case "", "human", "rule", "model", "system":
	default:
		return filter, fmt.Errorf("decided_by must be human, rule, model or system")
	}
	return filter, nil
}

func interceptPageParams(q url.Values) (int, int) {
	page := atoiDefault(q.Get("page"), 1)
	size := atoiDefault(q.Get("size"), 20)
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	return page, size
}

func (s *Server) interceptDecide(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, 400, "bad pending id")
		return
	}
	var req struct {
		Decision string `json:"decision"` // "allowed" | "denied"
	}
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.Decision != "allowed" && req.Decision != "denied" {
		writeErr(w, 400, "decision must be allowed or denied")
		return
	}
	// On a target request "allowed" pins the addresses the request displayed.
	// Every human decision records who took it and from where.
	if err := s.m.interceptor.Decide(id, req.Decision == "allowed", s.approver(r), clientIP(r, s.trustedProxies)); err != nil {
		if errors.Is(err, intercept.ErrAlreadyDecided) {
			writeErr(w, 409, err.Error())
			return
		}
		if errors.Is(err, db.ErrTargetPinEmpty) {
			// Refused, not failed: the request stays open and nothing was pinned.
			writeErr(w, 422, err.Error())
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// maxBatchDecide bounds one batch decision request.
const maxBatchDecide = 100

type batchDecideResult struct {
	ID    int64  `json:"id"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// interceptBatchDecide applies one human decision to several pending requests.
// Each id goes through the same Interceptor.Decide as the single decide route,
// with the same approver and address: target pins, the decided_by=human audit
// and the waiter wake-up are identical. One id failing (already decided, empty
// target pin) is reported for that id and does not stop the others.
func (s *Server) interceptBatchDecide(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs      []int64 `json:"ids"`
		Decision string  `json:"decision"` // "allowed" | "denied"
	}
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.Decision != "allowed" && req.Decision != "denied" {
		writeErr(w, 400, "decision must be allowed or denied")
		return
	}
	if len(req.IDs) == 0 || len(req.IDs) > maxBatchDecide {
		writeErr(w, 400, fmt.Sprintf("ids must list between 1 and %d pending ids", maxBatchDecide))
		return
	}
	seen := make(map[int64]bool, len(req.IDs))
	ids := make([]int64, 0, len(req.IDs))
	for _, id := range req.IDs {
		if id <= 0 {
			writeErr(w, 400, fmt.Sprintf("bad pending id %d", id))
			return
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	approver, addr := s.approver(r), clientIP(r, s.trustedProxies)
	results := make([]batchDecideResult, 0, len(ids))
	decided := 0
	for _, id := range ids {
		res := batchDecideResult{ID: id, OK: true}
		if err := s.m.interceptor.Decide(id, req.Decision == "allowed", approver, addr); err != nil {
			res.OK, res.Error = false, err.Error()
		} else {
			decided++
		}
		results = append(results, res)
	}
	writeJSON(w, 200, map[string]any{"decided": decided, "failed": len(ids) - decided, "results": results})
}

// alwaysAllowPriority places "always allow" rules below every default and
// manual rule, so any deny or ask rule that matches the same call wins.
const alwaysAllowPriority = -1000

// interceptAlwaysAllow creates an argv allow rule from a pending Bash request.
// The request body is never read: the command comes from the stored row, so a
// caller cannot choose what gets allowed. The request itself stays pending.
func (s *Server) interceptAlwaysAllow(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, 400, "bad pending id")
		return
	}
	p, err := pg.GetInterceptPending(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if p == nil {
		writeErr(w, 404, "not found")
		return
	}
	if p.Status != "pending" {
		writeErr(w, 409, "the request is no longer pending")
		return
	}
	prefix, err := intercept.AlwaysAllowPrefix(p.ToolName, p.ToolInput)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	pattern, _ := json.Marshal(prefix)
	rules, err := pg.ListInterceptRules()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	for _, rule := range rules {
		if rule.MatchType != "argv" || rule.Action != "allow" || !rule.Enabled || rule.MatchTarget != "tool_input" {
			continue
		}
		if tokens, err := intercept.ParseArgvPattern(rule.Pattern); err == nil && slices.Equal(tokens, prefix) {
			writeJSON(w, 200, map[string]any{"rule": rule, "created": false})
			return
		}
	}
	// Timeout fields take the rule form's defaults.
	rule, err := pg.CreateInterceptRule("always-allow: "+strings.Join(prefix, " "), "tool_input", "argv", string(pattern),
		"allow", "", alwaysAllowPriority, true, true, 60, "deny")
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.m.interceptor.Invalidate()
	writeJSON(w, 200, map[string]any{"rule": rule, "created": true})
}

// --- target pins (hosts a human approved for one task or one conversation) ---

// taskPinScope resolves {id} to the pin scope of an existing task.
func (s *Server) taskPinScope(w http.ResponseWriter, r *http.Request) (db.TargetScopeRef, bool) {
	id, ok := pathInt(r, "id")
	if !ok || id <= 0 {
		writeErr(w, 400, "bad task id")
		return db.TargetScopeRef{}, false
	}
	if _, ok := s.m.Task(strconv.FormatInt(id, 10)); !ok {
		writeErr(w, 404, "task not found")
		return db.TargetScopeRef{}, false
	}
	return db.TargetScopeRef{TaskID: id}, true
}

func (s *Server) taskListTargetPins(w http.ResponseWriter, r *http.Request) {
	if scope, ok := s.taskPinScope(w, r); ok {
		s.listTargetPins(w, scope)
	}
}

func (s *Server) taskRevokeTargetPin(w http.ResponseWriter, r *http.Request) {
	if scope, ok := s.taskPinScope(w, r); ok {
		s.revokeTargetPin(w, r, scope)
	}
}

func (s *Server) convListTargetPins(w http.ResponseWriter, r *http.Request) {
	if _, c, ok := s.convByID(w, r); ok {
		s.listTargetPins(w, db.TargetScopeRef{ConversationID: c.ID})
	}
}

func (s *Server) convRevokeTargetPin(w http.ResponseWriter, r *http.Request) {
	if _, c, ok := s.convByID(w, r); ok {
		s.revokeTargetPin(w, r, db.TargetScopeRef{ConversationID: c.ID})
	}
}

// listTargetPins returns every pin of the scope, in any state, newest first.
func (s *Server) listTargetPins(w http.ResponseWriter, scope db.TargetScopeRef) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	pins, err := pg.ListTargetPins(scope)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"pins": pins})
}

// revokeTargetPin revokes pin {pid} of the scope. The next call to that host
// asks again. Revoking a pin that is no longer active changes nothing.
func (s *Server) revokeTargetPin(w http.ResponseWriter, r *http.Request, scope db.TargetScopeRef) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	pid, ok := pathInt(r, "pid")
	if !ok {
		writeErr(w, 400, "bad pin id")
		return
	}
	pin, err := pg.RevokeTargetPin(scope, pid)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if pin == nil {
		writeErr(w, 404, "pin not found")
		return
	}
	writeJSON(w, 200, pin)
}

// --- target-gate exemptions (hosts that need no target approval, global) ---

// targetGateGetExemptions returns the stored exemption list with its digest,
// and the exemptions derived from the configuration (LLM gateways, search
// backend, platform proxies), which are computed and cannot be edited.
func (s *Server) targetGateGetExemptions(w http.ResponseWriter, r *http.Request) {
	list, digest, err := s.m.interceptor.Exemptions()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if list == nil {
		list = []db.TargetExemption{}
	}
	writeJSON(w, 200, map[string]any{"exemptions": list, "digest": digest, "derived": s.m.interceptor.DerivedExemptions()})
}

// targetGateSetExemptions replaces the stored exemption list. Entries are an
// exact host and port. The change is appended to the exemption log with the
// approver of the session.
func (s *Server) targetGateSetExemptions(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Exemptions []db.TargetExemption `json:"exemptions"`
	}
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	list, digest, err := s.m.interceptor.SetExemptions(req.Exemptions, s.approver(r))
	if err != nil {
		if errors.Is(err, intercept.ErrInvalidExemption) {
			writeErr(w, 400, err.Error())
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"exemptions": list, "digest": digest})
}

// targetGateExemptionHistory returns the most recent changes of the exemption
// list, newest first.
func (s *Server) targetGateExemptionHistory(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	changes, err := pg.ListTargetExemptionLog(100)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"changes": changes})
}

// --- tool-config (global tool interception scope) ---

// interceptGetToolConfig returns the list of tool names that are currently
// configured to enter the intercept rule system.
func (s *Server) interceptGetToolConfig(w http.ResponseWriter, r *http.Request) {
	tools, err := s.m.interceptor.GetEnabledTools()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"enabled_tools": tools})
}

// interceptSetToolConfig replaces the list of tool names that should enter
// the intercept rule system.
func (s *Server) interceptSetToolConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EnabledTools []string `json:"enabled_tools"`
	}
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.EnabledTools == nil {
		req.EnabledTools = []string{}
	}
	if err := s.m.interceptor.SetEnabledTools(req.EnabledTools); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// --- LLM fallback judge config (global model fallback) ---

// interceptGetJudgeConfig returns the resolved judge configuration. Prompt is the
// effective prompt (built-in template when unset), so the UI can prefill it.
func (s *Server) interceptGetJudgeConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.m.interceptor.GetJudgeConfig())
}

// interceptSetJudgeConfig persists the judge configuration.
func (s *Server) interceptSetJudgeConfig(w http.ResponseWriter, r *http.Request) {
	var req intercept.JudgeConfig
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	switch req.FailAction {
	case "allow", "ask", "deny":
	default:
		writeErr(w, 400, "fail_action must be allow, ask or deny")
		return
	}
	switch req.Mode {
	case "", intercept.JudgeModeClosed, intercept.JudgeModeFreeform:
	default:
		writeErr(w, 400, "mode must be closed or freeform")
		return
	}
	switch req.AskTimeoutAction {
	case "allow", "deny":
	default:
		writeErr(w, 400, "ask_timeout_action must be allow or deny")
		return
	}
	if err := s.m.interceptor.SetJudgeConfig(req); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// interceptJudgeUsage returns the fallback judge's cumulative token spend plus a
// recent daily series, for the config page. ?days bounds the daily series (default 30).
func (s *Server) interceptJudgeUsage(w http.ResponseWriter, r *http.Request) {
	pg := s.m.PG()
	if pg == nil {
		writeJSON(w, 200, db.JudgeUsage{Daily: []db.JudgeDayUsage{}})
		return
	}
	days := atoiDefault(r.URL.Query().Get("days"), 30)
	usage, err := pg.JudgeUsageStats(days)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, usage)
}

// --- helpers ---

type interceptRuleReq struct {
	Name           string `json:"name"`
	Enabled        bool   `json:"enabled"`
	Priority       int    `json:"priority"`
	MatchTarget    string `json:"match_target"`
	MatchType      string `json:"match_type"`
	Pattern        string `json:"pattern"`
	Action         string `json:"action"`
	Message        string `json:"message"`
	TimeoutEnabled bool   `json:"timeout_enabled"`
	TimeoutSeconds int    `json:"timeout_seconds"`
	TimeoutAction  string `json:"timeout_action"`
}

func validateInterceptRuleReq(req interceptRuleReq) error {
	if req.Name == "" {
		return fmt.Errorf("name cannot be empty")
	}
	switch req.MatchTarget {
	case "tool_name", "tool_input":
	default:
		return fmt.Errorf("match_target must be tool_name or tool_input")
	}
	switch req.MatchType {
	case "string", "regex":
	case "argv":
		if req.MatchTarget != "tool_input" {
			return fmt.Errorf("an argv rule matches tool_input (the Bash command)")
		}
		tokens, err := intercept.ParseArgvPattern(req.Pattern)
		if err != nil {
			return fmt.Errorf("invalid argv pattern: %w", err)
		}
		if req.Action == "allow" {
			if err := intercept.CheckArgvAllow(tokens); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("match_type must be string, regex or argv")
	}
	if req.Pattern == "" {
		return fmt.Errorf("pattern cannot be empty")
	}
	switch req.Action {
	case "allow", "deny", "ask":
	default:
		return fmt.Errorf("action must be allow, deny or ask")
	}
	if req.MatchType == "regex" {
		if _, err := regexp.Compile(req.Pattern); err != nil {
			return fmt.Errorf("pattern is not a valid regular expression: %w", err)
		}
	}
	return nil
}

func (s *Server) interceptDetail(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok || id <= 0 {
		writeErr(w, 400, "bad approval id")
		return
	}
	detail, err := pg.GetInterceptDetail(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if detail == nil {
		writeErr(w, 404, "not found")
		return
	}
	// The "always allow" button label: the prefix the endpoint would allow,
	// derived here so the UI never parses the command.
	out := struct {
		*db.InterceptDetail
		AlwaysAllowPrefix string `json:"always_allow_prefix,omitempty"`
	}{InterceptDetail: detail}
	if detail.Status == "pending" {
		if prefix, err := intercept.AlwaysAllowPrefix(detail.ToolName, detail.ToolInput); err == nil {
			out.AlwaysAllowPrefix = strings.Join(prefix, " ")
		}
	}
	writeJSON(w, 200, out)
}

// The navigation endpoint returns only the original call and its paired result.
func (s *Server) interceptExecution(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok || id <= 0 {
		writeErr(w, 400, "bad approval id")
		return
	}
	target, err := pg.GetInterceptExecution(id)
	if errors.Is(err, db.ErrInterceptTaskDeleted) || errors.Is(err, db.ErrInterceptSessionDeleted) {
		writeErr(w, http.StatusGone, err.Error())
		return
	}
	if errors.Is(err, db.ErrInterceptExecutionUnavailable) {
		writeErr(w, 409, err.Error())
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if target == nil {
		// Conversation deletion cascades approval rows. A stale source link still
		// carries its conversation ID, allowing a precise message without retaining
		// deleted conversations or changing their deletion semantics.
		if convID, parseErr := strconv.ParseInt(r.URL.Query().Get("conversation"), 10, 64); parseErr == nil && convID > 0 {
			conv, getErr := pg.GetConversation(convID)
			if getErr != nil {
				writeErr(w, 500, getErr.Error())
				return
			}
			if conv == nil {
				writeErr(w, http.StatusGone, "The conversation has been deleted")
				return
			}
		}
		writeErr(w, 404, "The approval record has been deleted or does not exist")
		return
	}
	writeJSON(w, 200, map[string]any{"conversation_id": target.ConversationID, "task_id": target.TaskID, "session": target.Session, "seq": target.Seq, "items": activityDTOs(target.Items)})
}
