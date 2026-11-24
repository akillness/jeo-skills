package server

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"text/template"
	"text/template/parse"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
	"github.com/Autumn-27/artex/notify"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/skill"
)

// validSkillName checks the agentskills.io name constraints, widened so a skill can
// also be named in Chinese (or any other script): ASCII must stay lowercase
// alphanumeric + hyphens, while non-ASCII letters/digits are accepted as-is.
// 1-64 runes, must start with a letter, no leading/trailing/consecutive hyphens.
// The name doubles as a directory name under skillDir, so nothing that could carry a
// path (separators, dots, spaces, control characters) is allowed through.
func validSkillName(name string) bool {
	if name == "" || !utf8.ValidString(name) {
		return false
	}
	rs := []rune(name)
	if len(rs) > 64 {
		return false
	}
	isLetter := func(r rune) bool {
		return (r >= 'a' && r <= 'z') || (r > unicode.MaxASCII && unicode.IsLetter(r))
	}
	if !isLetter(rs[0]) || rs[len(rs)-1] == '-' {
		return false
	}
	for _, r := range rs {
		switch {
		case isLetter(r), r >= '0' && r <= '9', r == '-':
		case r > unicode.MaxASCII && unicode.IsDigit(r):
		default:
			return false
		}
	}
	return !strings.Contains(name, "--")
}

// reAgentKey mirrors the agents.key DB check: lowercase letter start, then
// lowercase letters / digits / underscores.
var reAgentKey = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// pgReady returns the PG handle, or writes 503 and returns nil if unavailable.
func (s *Server) pg(w http.ResponseWriter) *db.DB {
	if s.m.pg == nil {
		writeErr(w, 503, "management console data source (PostgreSQL) is not connected")
		return nil
	}
	return s.m.pg
}

func pathInt(r *http.Request, name string) (int64, bool) {
	n, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	return n, err == nil
}

// decodeMaxBytes is the default JSON body cap. Multipart uploads are not capped
// here; those handlers set their own limit. A smaller MaxBytesReader installed
// by a handler still wins, because it sits inside this one.
const decodeMaxBytes = 32 << 20

// limitedBody records a MaxBytesError so a later 400 can be answered as 413.
type limitedBody struct {
	io.ReadCloser
	tooLarge bool
}

func (b *limitedBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		b.tooLarge = true
	}
	return n, err
}

type bodyLimitWriter struct {
	http.ResponseWriter
	tooLarge func() bool
}

func (b *bodyLimitWriter) WriteHeader(code int) {
	if code == http.StatusBadRequest && b.tooLarge != nil && b.tooLarge() {
		code = http.StatusRequestEntityTooLarge
	}
	b.ResponseWriter.WriteHeader(code)
}

func (b *bodyLimitWriter) Flush() {
	if f, ok := b.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (b *bodyLimitWriter) Unwrap() http.ResponseWriter { return b.ResponseWriter }

// limitRequestBody caps a non-multipart body at decodeMaxBytes and passes the
// real ResponseWriter into MaxBytesReader. A handler that then answers 400 for
// that read is rewritten to 413.
func limitRequestBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body == nil || r.Body == http.NoBody || isMultipart(r) {
			next.ServeHTTP(w, r)
			return
		}
		body := &limitedBody{ReadCloser: http.MaxBytesReader(w, r.Body, decodeMaxBytes)}
		r.Body = body
		next.ServeHTTP(&bodyLimitWriter{ResponseWriter: w, tooLarge: func() bool { return body.tooLarge }}, r)
	})
}

func isMultipart(r *http.Request) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil {
		return false
	}
	return strings.HasPrefix(media, "multipart/")
}

func decode(w http.ResponseWriter, r *http.Request, v any) error {
	if r.Body != nil {
		if _, already := r.Body.(*limitedBody); !already {
			r.Body = &limitedBody{ReadCloser: http.MaxBytesReader(w, r.Body, decodeMaxBytes)}
		}
	}
	err := json.NewDecoder(r.Body).Decode(v)
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		if lb, ok := r.Body.(*limitedBody); ok {
			lb.tooLarge = true
		}
		// Return the original error: a caller that maps 413 itself keeps working,
		// and the middleware still rewrites a 400 for callers that do not.
		return tooLarge
	}
	return err
}

// ---------- tasks (delete) ----------

const taskDeleteDrainTimeout = 10 * time.Second

func canonicalTaskID(raw string) (string, bool) {
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n <= 0 {
		return "", false
	}
	return strconv.FormatInt(n, 10), true
}

// beginTaskDelete serializes the delete barrier with pause, resume, admission,
// and FIFO reconciliation. Every lifecycle path rechecks deleting after taking
// concMu, so none can commit a contradictory state once this returns.
func (s *Server) beginTaskDelete(taskID string) bool {
	s.concMu.Lock()
	defer s.concMu.Unlock()
	if s.engine.IsDeleting(taskID) {
		return false
	}
	return s.engine.BeginDelete(taskID)
}

// abortTaskDelete restores the execution barrier from the committed task row,
// not from the in-memory state observed before deletion began. Keeping the task
// paused on an unreadable row is conservative: a later explicit resume can
// safely recover it without allowing work to escape an uncertain delete.
func (s *Server) abortTaskDelete(taskID string) {
	s.concMu.Lock()
	defer s.concMu.Unlock()
	keepPaused := true
	if id, err := strconv.ParseInt(taskID, 10, 64); err == nil && s.m != nil && s.m.pg != nil {
		if persisted, getErr := s.m.pg.GetTask(id); getErr == nil && persisted != nil {
			keepPaused = persisted.Paused || persisted.Queued
		} else if task, ok := s.m.Task(taskID); ok {
			state := task.lifecycleSnapshot()
			keepPaused = state.Paused || state.Queued
			if getErr != nil {
				log.Printf("[task-delete] task %s failed to read persisted state, restoring the barrier from in-memory state: %v", taskID, getErr)
			}
		} else if getErr == nil {
			// The request targeted a task that does not exist. Do not retain a
			// synthetic pause entry after releasing its temporary delete barrier.
			keepPaused = false
		}
	}
	s.engine.AbortDelete(taskID, keepPaused)
}

func (s *Server) pgDeleteTask(w http.ResponseWriter, r *http.Request) {
	id, ok := canonicalTaskID(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid task id")
		return
	}
	var opts DeleteTaskOptions
	if err := decode(w, r, &opts); err != nil && err != io.EOF {
		writeErr(w, 400, "invalid JSON: "+err.Error())
		return
	}
	if !s.beginTaskDelete(id) {
		writeErr(w, http.StatusConflict, "task is being deleted")
		return
	}
	deleted := false
	defer func() {
		if !deleted {
			s.abortTaskDelete(id)
		}
	}()

	// Main-agent runs use a separate context from planner/workers. Cancel it, then
	// wait until both execution domains have returned before removing transcripts.
	s.cancelTaskChat(id, agent.AbortTaskDeleted)
	drainCtx, cancelDrain := context.WithTimeout(r.Context(), taskDeleteDrainTimeout)
	defer cancelDrain()
	if err := s.waitTaskQuiescent(drainCtx, id); err != nil {
		writeErr(w, http.StatusConflict, "task still has running agents; deletion cancelled")
		return
	}

	if err := s.drainTaskSideQuestions(drainCtx, id); err != nil {
		writeErr(w, http.StatusConflict, err.Error())
		return
	}
	result, err := s.m.DeleteTask(id, opts)
	if err != nil {
		var committed *taskDeleteCommittedError
		if errors.As(err, &committed) {
			// PostgreSQL is already gone. Complete runtime teardown and return the
			// auditable counts together with the post-commit cleanup warning.
			s.engine.StopTask(id)
			s.taskAgentMu.Lock()
			delete(s.taskAgents, id)
			s.taskAgentMu.Unlock()
			deleted = true
			writeCommittedTaskDelete(w, result, err)
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	// Manager has removed the task from the registry, so no new API operation can
	// resolve it. Now stop and join every task-owned Engine goroutine and clear its
	// lifecycle maps before releasing the delete barrier.
	s.engine.StopTask(id)
	s.taskAgentMu.Lock()
	delete(s.taskAgents, id)
	s.taskAgentMu.Unlock()
	deleted = true
	writeJSON(w, 200, result)
}

func writeCommittedTaskDelete(w http.ResponseWriter, result DeleteTaskResult, err error) {
	result.CleanupWarning = err.Error()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) waitTaskQuiescent(ctx context.Context, taskID string) error {
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		s.chatMu.Lock()
		chatBusy := s.chatBusy[taskID]
		s.chatMu.Unlock()
		if s.engine.inflightCount(taskID) == 0 && !chatBusy {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

// ---------- agents ----------

func (s *Server) pgListAgents(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	ags, err := pg.ListAgents()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	dtos := agentDTOs(ags)
	// overlay per-agent binding counts (mcp/skill by id, tools by key) — best-effort.
	if mcp, skill, tools, err := pg.AgentBindingCounts(); err == nil {
		for i := range dtos {
			dtos[i].McpCount = mcp[ags[i].ID]
			dtos[i].SkillCount = skill[ags[i].ID]
			dtos[i].ToolCount = tools[ags[i].Key]
		}
	}
	writeJSON(w, 200, map[string]any{"agents": dtos})
}

// pgCreateAgent creates a CUSTOM conversational agent (builtin=false, role
// 'assistant') and seeds it a starter prompt so its editor isn't blank.
func (s *Server) pgCreateAgent(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req struct{ Key, Name, Description string }
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	req.Key, req.Name = strings.TrimSpace(req.Key), strings.TrimSpace(req.Name)
	if !reAgentKey.MatchString(req.Key) {
		writeErr(w, 400, "key must start with a lowercase letter and contain only lowercase letters/digits/underscores")
		return
	}
	if req.Name == "" {
		writeErr(w, 400, "name must not be empty")
		return
	}
	if exist, _ := pg.GetAgentByKey(req.Key); exist != nil {
		writeErr(w, 409, "this key already exists")
		return
	}
	a, err := pg.CreateAgent(req.Key, req.Name, req.Description)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	// starter prompt so the editor shows something editable from the start.
	if err := pg.SeedPromptIfEmpty(a.ID, agent.DefaultAssistantPrompt); err != nil {
		log.Printf("[agents] failed to seed starter prompt for %s: %v", a.Key, err)
	}
	writeJSON(w, 200, agentDTO(a))
}

// pgUpdateAgent updates a custom agent's name/description (built-in agents rejected).
func (s *Server) pgUpdateAgent(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	if a.Builtin {
		writeErr(w, 400, "built-in agent name/description cannot be modified")
		return
	}
	var req struct{ Name, Description string }
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeErr(w, 400, "name must not be empty")
		return
	}
	if err := pg.UpdateAgentMeta(a.Key, req.Name, req.Description); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// pgDeleteAgent removes a custom agent (built-in rejected). Prompts/vars/visibility
// cascade via FK; tool-binding cleanup is best-effort.
func (s *Server) pgDeleteAgent(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	if a.Builtin {
		writeErr(w, 400, "built-in agents cannot be deleted")
		return
	}
	if err := pg.DeleteAgent(a.Key); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if err := pg.RemoveAgentFromToolBindings(a.Key); err != nil {
		log.Printf("[agents] failed to clean up tool bindings for %s: %v", a.Key, err)
	}
	if err := pg.DeleteTriggersForAgent(a.Key); err != nil {
		log.Printf("[agents] failed to clean up triggers for %s: %v", a.Key, err)
	}
	writeJSON(w, 200, map[string]any{"deleted": a.Key})
}

func (s *Server) agentByKey(w http.ResponseWriter, r *http.Request) (*db.DB, *db.Agent, bool) {
	pg := s.pg(w)
	if pg == nil {
		return nil, nil, false
	}
	a, err := pg.GetAgentByKey(r.PathValue("key"))
	if err != nil {
		writeErr(w, 500, err.Error())
		return nil, nil, false
	}
	if a == nil {
		writeErr(w, 404, "agent not found")
		return nil, nil, false
	}
	return pg, a, true
}

// pgSaveAgentConfig updates an agent's runtime config (currently max_turns) and
// re-applies the live LLM so the change takes effect immediately.
func (s *Server) pgSaveAgentConfig(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	// All fields optional (pointers) so a partial patch (e.g. the triggers tab sending
	// only trigger_* fields) leaves the untouched settings alone instead of resetting
	// max_turns/run_seconds to 0.
	var req struct {
		MaxTurns         *int  `json:"max_turns"`
		RunSeconds       *int  `json:"run_seconds"`
		WebSearch        *bool `json:"web_search"`
		InteractiveShell *bool `json:"interactive_shell"`
		// llm_profile_id is tri-state: field omitted = leave unchanged; explicit null = unbind (follow task/global); number = bind that profile.
		LLMProfileID json.RawMessage `json:"llm_profile_id"`
		// P3 post-trigger handling policy (the three are optional as a group; providing any one writes the whole set; none provided = leave unchanged).
		TriggerRunMode     *string `json:"trigger_run_mode"`
		TriggerMergeMode   *string `json:"trigger_merge_mode"`
		TriggerMaxParallel *int    `json:"trigger_max_parallel"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	profileChanged := false
	if req.LLMProfileID != nil { // key present (number or null)
		var id *int64
		if err := json.Unmarshal(req.LLMProfileID, &id); err != nil {
			writeErr(w, 400, "invalid llm_profile_id format")
			return
		}
		if id != nil { // bind: validate the target profile
			if _, ok := s.loadProfileConfig(*id); !ok {
				writeErr(w, 400, "the specified LLM profile does not exist or is invalid")
				return
			}
		}
		if err := pg.SetAgentLLMProfile(a.Key, id); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		profileChanged = true
	}
	if req.MaxTurns != nil {
		mt := *req.MaxTurns
		if mt < 0 {
			mt = 0
		}
		if err := pg.SetAgentMaxTurns(a.Key, mt); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
	}
	if req.RunSeconds != nil {
		rs := *req.RunSeconds
		if rs < 0 {
			rs = 0
		}
		if err := pg.SetAgentRunSeconds(a.Key, rs); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
	}
	if req.WebSearch != nil {
		if err := pg.SetAgentWebSearch(a.Key, *req.WebSearch); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
	}
	if req.InteractiveShell != nil {
		if err := pg.SetAgentInteractiveShell(a.Key, *req.InteractiveShell); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
	}
	// P3 trigger policy: the three are written as a group (SetAgentTriggerBehavior
	// writes all three columns at once), with missing fields backfilled from current stored values so passing only one does not reset the other two to defaults.
	if req.TriggerRunMode != nil || req.TriggerMergeMode != nil || req.TriggerMaxParallel != nil {
		runMode, mergeMode, maxPar := a.TriggerRunMode, a.TriggerMergeMode, a.TriggerMaxParallel
		if req.TriggerRunMode != nil {
			runMode = *req.TriggerRunMode
		}
		if req.TriggerMergeMode != nil {
			mergeMode = *req.TriggerMergeMode
		}
		if req.TriggerMaxParallel != nil {
			maxPar = *req.TriggerMaxParallel
		}
		if err := pg.SetAgentTriggerBehavior(a.Key, runMode, mergeMode, maxPar); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
	}
	// an agent's LLM binding change also invalidates pinned-task / per-profile caches
	// so their next round re-resolves each agent's bound model.
	if profileChanged {
		s.invalidateProfileAgents()
	}
	// Task bundles capture operational Agent settings (turn/time budgets, tools,
	// web search). Rebuild them even when no global profile is configured.
	s.invalidateTaskAgents()
	// rebuild the live agents so the new max_turns/run_seconds/binding apply without a restart.
	s.cfgMu.Lock()
	cfg, on := s.llmCfg, s.llmOn
	s.cfgMu.Unlock()
	if on {
		_ = s.applyLLM(cfg)
	}
	resp := map[string]any{"ok": true}
	if req.MaxTurns != nil {
		resp["max_turns"] = *req.MaxTurns
	}
	if req.RunSeconds != nil {
		resp["run_seconds"] = *req.RunSeconds
	}
	writeJSON(w, 200, resp)
}

func (s *Server) pgGetAgent(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	cur, _ := pg.CurrentPrompt(a.ID)
	vars, _ := pg.PromptVars(a.ID)
	vars = withGlobalVars(vars)
	vers, _ := pg.ListPromptVersions(a.ID)
	if vers == nil {
		vers = []db.PromptVersion{}
	}
	mcp, _ := pg.AgentVisible(a.ID, "mcp")
	sk, _ := pg.AgentSkillNames(a.ID)
	if sk == nil {
		sk = []string{}
	}
	// Optional list of LLM profiles (id/name/model/whether default) for the frontend's "default model" dropdown; the current binding is in agent.llm_profile_id.
	profs, _ := pg.ListProfiles()
	llmProfiles := make([]map[string]any, 0, len(profs))
	for _, p := range profs {
		llmProfiles = append(llmProfiles, map[string]any{
			"id": p.ID, "name": p.Name, "model": p.Model, "is_default": p.IsDefault,
		})
	}
	writeJSON(w, 200, map[string]any{
		"agent": agentDTO(a), "prompt": cur, "variables": vars, "versions": vers,
		"visibility":   map[string]any{"mcp": mcp, "skill": sk},
		"llm_profiles": llmProfiles, // bindable LLM profile candidates

		"wrapup_prompt":            a.WrapupPrompt,                  // saved wrap-up prompt (empty = use the built-in default)
		"wrapup_default":           agent.WrapupDefault(a.Key),      // built-in default (for placeholder / restore-default)
		"wrapup_max_turns":         a.WrapupMaxTurns,                // saved wrap-up turns (0 = use the built-in default)
		"wrapup_max_turns_default": agent.WrapupTurnsDefault(a.Key), // built-in default turns (for the "0 = default N" hint)
		// Task-level timeout wrap-up prompt (only worker/planner have a built-in default; task_timeout_supported tells the frontend whether to show this section)
		"task_timeout_wrapup_supported":         agent.TaskTimeoutWrapupDefault(a.Key) != "",
		"task_timeout_wrapup_prompt":            a.TaskTimeoutWrapupPrompt,
		"task_timeout_wrapup_default":           agent.TaskTimeoutWrapupDefault(a.Key),
		"task_timeout_wrapup_max_turns":         a.TaskTimeoutWrapupMaxTurns,
		"task_timeout_wrapup_max_turns_default": agent.WrapupTurnsDefault(a.Key),
	})
}

func (s *Server) pgSavePrompt(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	var body struct{ Template, Note string }
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	vars, _ := pg.PromptVars(a.ID)
	if bad := validateTemplate(body.Template, withGlobalVars(vars)); bad != "" {
		writeErr(w, 400, bad)
		return
	}
	ver, err := pg.SavePrompt(a.ID, body.Template, body.Note, "ui")
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"version": ver})
}

// pgResetPrompt restores an agent's prompt body to the in-code built-in default
// (section [A]). Only built-in agents have a code default; custom agents have none.
func (s *Server) pgResetPrompt(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	tmpl, has := agent.BuiltinPromptSeeds()[a.Key]
	if !has {
		writeErr(w, 400, "this agent has no built-in default prompt to restore")
		return
	}
	ver, err := pg.ResetPromptToDefault(a.ID, tmpl)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"version": ver})
}

// pgSaveWrapup stores an agent's wrap-up (settlement) prompt — the text injected on
// timeout / step-exhaustion. Empty body clears the override → built-in default.
func (s *Server) pgSaveWrapup(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	// MaxTurns is optional (pointer): omit to leave the stored turn budget untouched.
	var body struct {
		Prompt   string `json:"prompt"`
		MaxTurns *int   `json:"max_turns"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.SetAgentWrapupPrompt(a.Key, body.Prompt); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if body.MaxTurns != nil {
		n := *body.MaxTurns
		if n < 0 {
			n = 0
		}
		if err := pg.SetAgentWrapupMaxTurns(a.Key, n); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// pgResetWrapup clears an agent's wrap-up prompt override so the code built-in
// default is used again.
func (s *Server) pgResetWrapup(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	if err := pg.SetAgentWrapupPrompt(a.Key, ""); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if err := pg.SetAgentWrapupMaxTurns(a.Key, 0); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"ok":                       true,
		"wrapup_default":           agent.WrapupDefault(a.Key),
		"wrapup_max_turns_default": agent.WrapupTurnsDefault(a.Key),
	})
}

// pgSaveTaskTimeoutWrapup stores an agent's TASK-TIMEOUT wrap-up prompt + turn budget
// (worker/planner only). Empty prompt / 0 turns clear the override → built-in default.
func (s *Server) pgSaveTaskTimeoutWrapup(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	var body struct {
		Prompt   string `json:"prompt"`
		MaxTurns *int   `json:"max_turns"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	turns := a.TaskTimeoutWrapupMaxTurns // keep the existing value when not provided
	if body.MaxTurns != nil {
		turns = *body.MaxTurns
		if turns < 0 {
			turns = 0
		}
	}
	if err := pg.SetAgentTaskTimeoutWrapup(a.Key, body.Prompt, turns); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// pgResetTaskTimeoutWrapup clears the task-timeout wrap-up override → built-in default.
func (s *Server) pgResetTaskTimeoutWrapup(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	if err := pg.SetAgentTaskTimeoutWrapup(a.Key, "", 0); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"ok":                                    true,
		"task_timeout_wrapup_default":           agent.TaskTimeoutWrapupDefault(a.Key),
		"task_timeout_wrapup_max_turns_default": agent.WrapupTurnsDefault(a.Key),
	})
}

func (s *Server) pgListPromptVersions(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	vers, err := pg.ListPromptVersions(a.ID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"versions": vers})
}

func (s *Server) pgPromptVars(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	vars, err := pg.PromptVars(a.ID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"variables": withGlobalVars(vars)})
}

func (s *Server) pgPreviewPrompt(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	var body struct {
		Template string            `json:"template"`
		Sample   map[string]string `json:"sample"`
	}
	_ = decode(w, r, &body)
	vars, _ := pg.PromptVars(a.ID)
	if body.Template == "" {
		body.Template, _ = pg.CurrentPrompt(a.ID)
	}
	rendered, err := renderPrompt(body.Template, withGlobalVars(vars), body.Sample)
	if err != nil {
		writeJSON(w, 200, map[string]any{"rendered": "", "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"rendered": rendered})
}

func (s *Server) pgGetAgentVisibility(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	mcp, _ := pg.AgentVisible(a.ID, "mcp")
	sk, _ := pg.AgentSkillNames(a.ID)
	if sk == nil {
		sk = []string{}
	}
	writeJSON(w, 200, map[string]any{"mcp": mcp, "skill": sk})
}

func (s *Server) pgSetAgentVisibility(w http.ResponseWriter, r *http.Request) {
	pg, a, ok := s.agentByKey(w, r)
	if !ok {
		return
	}
	var body struct {
		MCP   []int64  `json:"mcp"`
		Skill []string `json:"skill"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.SetAgentVisibilityKind(a.ID, "mcp", body.MCP); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if err := pg.SetAgentSkillVisibility(a.ID, body.Skill); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- tools (built-in tool catalog) ----------

func (s *Server) pgListTools(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	ts, err := pg.ListTools()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if ts == nil {
		ts = []*db.Tool{}
	}
	for _, tool := range ts {
		if !tool.System {
			tool.Exec = maskToolExec(tool.Exec)
		}
	}
	// Usage is best-effort decoration. Runtime tool resolution keeps using the plain
	// catalog query, so agent assembly never pays for this aggregate.
	counts, countErr := pg.ToolUsageCounts()
	if countErr != nil {
		log.Printf("[tools] failed to read call stats: %v", countErr)
	} else {
		for _, tool := range ts {
			tool.Calls = counts[tool.Key]
		}
	}
	writeJSON(w, 200, map[string]any{"tools": ts})
}

// pgUpdateTool saves the page-editable fields of a built-in tool: description,
// parameter schema (structure is expected unchanged — only per-param description/
// default move), agent binding, and enabled. key is taken from the path and never
// changes (it is welded to the Go handler).
func (s *Server) pgUpdateTool(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	key := r.PathValue("key")
	cur, err := pg.GetTool(key)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if cur == nil {
		writeErr(w, 404, "tool does not exist: "+key)
		return
	}
	var body struct {
		Description string          `json:"description"`
		Schema      json.RawMessage `json:"schema"`
		Agents      []string        `json:"agents"`
		Enabled     bool            `json:"enabled"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	agents, _ := json.Marshal(body.Agents)
	if err := pg.UpdateTool(key, body.Description, body.Schema, agents, body.Enabled); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// pgResetTool overwrites a tool row with its code-defined defaults (description,
// schema, agent binding) and re-enables it — the explicit "restore defaults" action, since
// startup seeding is first-insert-only and never overwrites edits.
func (s *Server) pgResetTool(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	key := r.PathValue("key")
	for _, sd := range agent.BuiltinToolSeeds() {
		if sd.Key != key {
			continue
		}
		schema, _ := json.Marshal(sd.Schema)
		agents, _ := json.Marshal(sd.Agents)
		if err := pg.UpsertToolForce(sd.Key, sd.Desc, schema, agents); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	// orchestration/platform tools (auto agent) — default-bind to "auto".
	autoAgents, _ := json.Marshal([]string{"auto"})
	for _, t := range append(s.orchestrationTools(), s.platformTools()...) {
		if t.Name() != key {
			continue
		}
		schema, _ := json.Marshal(t.InputSchema())
		if err := pg.UpsertToolForce(t.Name(), t.Description(), schema, autoAgents); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	writeErr(w, 404, "not a built-in tool, or does not exist: "+key)
}

// ---------- mcp ----------

func (s *Server) pgListMCP(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	ms, err := pg.ListMCP()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if ms == nil {
		ms = []*db.MCPServer{}
	}
	for _, m := range ms {
		m.Env = maskMCPEnv(m.Env)
	}
	writeJSON(w, 200, map[string]any{"servers": ms})
}

// maskedSecret is what a response shows for a stored secret such as a proxy
// URL: the whole value is replaced by the placeholder, "" stays "".
func maskedSecret(v string) string {
	if v == "" {
		return ""
	}
	return notify.MaskedPrefix
}

// isMaskedSecret reports a placeholder sent back on write: keep the stored value.
func isMaskedSecret(v string) bool { return notify.IsMasked(strings.TrimSpace(v)) }

// keepIfMasked turns a placeholder in an optional field into nil (keep).
func keepIfMasked(v *string) *string {
	if v != nil && isMaskedSecret(*v) {
		return nil
	}
	return v
}

// maskMCPEnv replaces every non-empty env value (API keys, auth headers) with
// notify.MaskedPrefix so the API never returns it in clear.
func maskMCPEnv(raw json.RawMessage) json.RawMessage {
	var env map[string]any
	if json.Unmarshal(raw, &env) != nil || env == nil {
		return json.RawMessage(`{}`)
	}
	for k, v := range env {
		if v != "" {
			env[k] = notify.MaskedPrefix
		}
	}
	out, _ := json.Marshal(env)
	return out
}

// unmaskMCPEnv puts the stored value back for every env key sent as the mask,
// so a client echoing the list response never overwrites the stored secret.
// As in notify.PrepareConfigUpdate, a stored secret is only kept for the
// destination it was configured for: when transport, command, args or url
// change, every env value must be re-entered (or cleared) explicitly.
func unmaskMCPEnv(pg *db.DB, m *db.MCPServer) error {
	var env, storedEnv map[string]any
	if json.Unmarshal(m.Env, &env) != nil {
		return nil // not an object: SaveMCP stores or rejects it as before
	}
	all, err := pg.ListMCP()
	if err != nil {
		return err
	}
	var stored *db.MCPServer
	for _, cur := range all {
		if m.ID != 0 && cur.ID == m.ID {
			stored = cur
			_ = json.Unmarshal(cur.Env, &storedEnv)
		}
	}
	moved := stored != nil && (stored.Transport != m.Transport || stored.Command != m.Command ||
		stored.URL != m.URL || canonicalMCPArgs(stored.Args) != canonicalMCPArgs(m.Args))
	for k, v := range env {
		if s, ok := v.(string); ok && notify.IsMasked(s) {
			old, ok := storedEnv[k]
			if !ok {
				return fmt.Errorf("env %q: masked value but nothing stored to keep", k)
			}
			if moved {
				return fmt.Errorf("the MCP destination (transport, command, args or url) changed: re-enter the env values (%q is masked) or clear them; stored secrets are not sent to a new destination", k)
			}
			env[k] = old
		}
	}
	m.Env, err = json.Marshal(env)
	return err
}

// canonicalMCPArgs normalizes args JSON for comparison; empty means [] as in SaveMCP.
func canonicalMCPArgs(raw json.RawMessage) string {
	var v any
	if len(raw) == 0 || string(raw) == "null" {
		return "[]"
	}
	if json.Unmarshal(raw, &v) != nil {
		return string(raw)
	}
	out, _ := json.Marshal(v)
	return string(out)
}

func (s *Server) pgSaveMCP(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var m db.MCPServer
	if err := decode(w, r, &m); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	isNew := m.ID == 0
	if err := unmaskMCPEnv(pg, &m); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	id, err := pg.SaveMCP(&m)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	// On initial add, auto-discover + cache the tool list so the UI shows it right
	// away (bounded so a slow/broken server can't hang the request). Skipped on
	// plain updates (e.g. enable toggles) to avoid re-spawning the server each time.
	if isNew && m.Enabled {
		m.ID = id
		ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
		if derr := s.discoverAndCacheMCP(ctx, &m); derr != nil {
			log.Printf("[mcp] tool discovery after adding %s failed: %v", m.Name, derr)
		}
		cancel()
	}
	writeJSON(w, 200, map[string]any{"id": id})
}

func (s *Server) pgDeleteMCP(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, _ := pathInt(r, "id")
	if err := pg.DeleteMCP(id); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": id})
}

// pgRefreshMCP re-discovers one MCP's tools on demand and re-caches them, so a
// config change or an earlier discovery failure can be fixed without a restart.
func (s *Server) pgRefreshMCP(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, _ := pathInt(r, "id")
	all, err := pg.ListMCP()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	var target *db.MCPServer
	for _, m := range all {
		if m.ID == id {
			target = m
			break
		}
	}
	if target == nil {
		writeErr(w, 404, "MCP does not exist")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	if err := s.discoverAndCacheMCP(ctx, target); err != nil {
		writeErr(w, 502, "tool discovery failed: "+err.Error())
		return
	}
	tools, _ := pg.MCPToolsDetailed(id)
	writeJSON(w, 200, map[string]any{"tools": tools})
}

// pgMCPTools returns one MCP's cached tools (name + description) for the detail UI.
func (s *Server) pgMCPTools(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, _ := pathInt(r, "id")
	tools, err := pg.MCPToolsDetailed(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if tools == nil {
		tools = []db.MCPTool{}
	}
	writeJSON(w, 200, map[string]any{"tools": tools})
}

// ---------- skills (filesystem) ----------

type skillFileNode struct {
	Name          string   `json:"name"`
	Description   string   `json:"description,omitempty"`
	License       string   `json:"license,omitempty"`
	Compatibility string   `json:"compatibility,omitempty"`
	MCPs          []string `json:"mcps,omitempty"`
	Files         []string `json:"files"`
	// Usage ledger (db/skill_usage.go). Calls is 0 and LastUsed nil for a skill that
	// was never invoked — the ledger only has rows for skills agents actually loaded.
	Calls    int        `json:"calls"`
	Tasks    int        `json:"tasks"`
	Agents   []string   `json:"usage_agents"`
	LastUsed *time.Time `json:"last_used,omitempty"`
}

func (s *Server) fsListSkills(w http.ResponseWriter, r *http.Request) {
	_ = os.MkdirAll(s.skillDir, 0o755)
	allReg, _ := loadSkillsConfined(s.skillDir)
	metaByDir := map[string]skill.Skill{}
	if allReg != nil {
		for _, sk := range allReg.List() {
			if sk.Dir != "" {
				metaByDir[filepath.Base(sk.Dir)] = sk
			}
		}
	}
	entries, err := os.ReadDir(s.skillDir)
	if err != nil {
		writeErr(w, 500, safeFSErr(err))
		return
	}
	// Usage is best-effort decoration: a ledger read failure leaves the counts at
	// zero rather than failing the skill list itself.
	statBySkill := map[string]db.SkillStat{}
	if s.m.pg != nil {
		stats, err := s.m.pg.SkillStats()
		if err != nil {
			log.Printf("[skills] failed to read call stats: %v", err)
		}
		for _, st := range stats {
			statBySkill[st.Skill] = st
		}
	}
	nodes := []skillFileNode{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dirName := e.Name()
		node := skillFileNode{Name: dirName, Agents: []string{}}
		if st, ok := statBySkill[dirName]; ok {
			node.Calls, node.Tasks, node.Agents, node.LastUsed = st.Calls, st.Tasks, st.Agents, st.LastUsed
		}
		if meta, ok := metaByDir[dirName]; ok {
			node.Description = meta.Description
			node.License = meta.License
			node.Compatibility = meta.Compatibility
			node.MCPs = meta.MCPs
		}
		node.Files, _ = walkSkillFiles(filepath.Join(s.skillDir, dirName))
		if node.Files == nil {
			node.Files = []string{}
		}
		nodes = append(nodes, node)
	}
	writeJSON(w, 200, map[string]any{"skills": nodes})
}

// fsSkillUsage returns one skill's recent invocations, newest first (detail panel).
func (s *Server) fsSkillUsage(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	name := r.PathValue("name")
	if !validSkillName(name) {
		writeErr(w, 400, "illegal skill name")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	calls, err := pg.RecentSkillCalls(name, limit)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"calls": calls})
}

// fsMissingSkills lists skill names agents asked for that do not exist — the gap
// list, i.e. which procedures are worth writing next.
func (s *Server) fsMissingSkills(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	missing, err := pg.MissingSkillStats(limit)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"missing": missing})
}

// cleanStrs trims each string and drops empties.
func cleanStrs(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func (s *Server) fsCreateSkill(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name          string   `json:"name"`
		Description   string   `json:"description"`   // required per agentskills.io spec
		License       string   `json:"license"`       // optional
		Compatibility string   `json:"compatibility"` // optional
		MCPs          []string `json:"mcps"`          // optional; MCP servers this skill unlocks
		Instructions  string   `json:"instructions"`  // optional; scaffolded if empty
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if !validSkillName(body.Name) {
		writeErr(w, 400, "skill name must be 1-64 lowercase alphanumeric/hyphen characters, not starting/ending/doubling hyphens")
		return
	}
	if strings.TrimSpace(body.Description) == "" {
		writeErr(w, 400, "description is required")
		return
	}
	dirCP, err := resolveSkillDir(s.skillDir, body.Name)
	if err != nil {
		writeErr(w, 400, "invalid path")
		return
	}
	if dirCP.exists {
		writeErr(w, 409, "skill already exists")
		return
	}
	skillPath := filepath.Join(s.skillDir, body.Name)
	if err := os.MkdirAll(skillPath, 0o755); err != nil {
		writeErr(w, 500, safeFSErr(err))
		return
	}
	// Build a spec-compliant SKILL.md (agentskills.io format):
	//   YAML frontmatter: name (required), description (required),
	//                     license, compatibility (optional)
	//   Markdown body:    step-by-step instructions
	var sb strings.Builder
	sb.WriteString("---\n")
	fmt.Fprintf(&sb, "name: %s\n", yamlScalar(body.Name))
	fmt.Fprintf(&sb, "description: %s\n", yamlScalar(body.Description))
	if body.License != "" {
		fmt.Fprintf(&sb, "license: %s\n", yamlScalar(body.License))
	}
	if body.Compatibility != "" {
		fmt.Fprintf(&sb, "compatibility: %s\n", yamlScalar(body.Compatibility))
	}
	// mcps: MCP servers this skill unlocks on load (skill-gated deferred tools).
	if mcps := cleanStrs(body.MCPs); len(mcps) > 0 {
		quoted := make([]string, len(mcps))
		for i, m := range mcps {
			quoted[i] = yamlScalar(m)
		}
		fmt.Fprintf(&sb, "mcps: %s\n", strings.Join(quoted, ", "))
	}
	sb.WriteString("---\n")
	if strings.TrimSpace(body.Instructions) != "" {
		sb.WriteString(body.Instructions)
	} else {
		// scaffold a minimal Markdown body so the file is immediately useful
		fmt.Fprintf(&sb, "## %s\n\n", body.Name)
		sb.WriteString("<!-- Describe step-by-step instructions in Markdown. -->\n\n")
		sb.WriteString("1. \n2. \n3. \n")
	}
	if err := os.WriteFile(filepath.Join(skillPath, "SKILL.md"), []byte(sb.String()), 0o644); err != nil {
		_ = os.RemoveAll(skillPath)
		writeErr(w, 500, safeFSErr(err))
		return
	}
	// Verify with the real parser: a description containing ": " (or any value that
	// is not plain-safe YAML) used to break the whole frontmatter silently, leaving
	// a skill whose fields were all empty and whose name came from the directory.
	if err := verifySkillFile(skillPath, body.Name, cleanStrs(body.MCPs)); err != nil {
		_ = os.RemoveAll(skillPath)
		writeErr(w, 400, "generated SKILL.md does not round-trip through the skill parser: "+err.Error())
		return
	}
	writeJSON(w, 201, map[string]any{"name": body.Name})
}

// fsUpdateSkillMeta rewrites the SKILL.md frontmatter fields that are safe to
// change without touching the instruction body: mcps, license, compatibility,
// description. Only fields present in the request body are updated; omitted
// fields are left as-is (the whole frontmatter is reconstructed from the
// parsed values, so the write is a clean replace, not a line-patch).
func (s *Server) fsUpdateSkillMeta(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !validSkillName(name) {
		writeErr(w, 400, "invalid skill name")
		return
	}
	var body struct {
		MCPs          *[]string `json:"mcps"`
		Description   *string   `json:"description"`
		License       *string   `json:"license"`
		Compatibility *string   `json:"compatibility"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	skillExists, cp, err := resolveSkillFile(s.skillDir, name, "SKILL.md")
	if err != nil {
		writeErr(w, 400, "invalid path")
		return
	}
	if !skillExists || !cp.exists {
		writeErr(w, 404, "skill not found")
		return
	}
	raw, err := os.ReadFile(cp.realPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeErr(w, 404, "skill not found")
			return
		}
		writeErr(w, 500, safeFSErr(err))
		return
	}
	updated, err := rewriteSkillFrontmatter(raw, body.MCPs, body.Description, body.License, body.Compatibility)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := os.WriteFile(cp.realPath, updated, 0o644); err != nil {
		writeErr(w, 500, safeFSErr(err))
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// yamlScalar renders one frontmatter scalar so the emitted YAML is valid by
// construction: plain-safe tokens stay bare, everything else is single-quoted
// with internal quotes doubled (YAML single-quote escaping).
func yamlScalar(s string) string {
	if s != "" && !strings.ContainsAny(s, ":#{}[]&*!|>'\"%@`,\n") && !strings.HasPrefix(s, " ") && !strings.HasSuffix(s, " ") {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// verifySkillFile re-loads a written SKILL.md with the real skill parser and
// asserts the name and the mcps list survived the round trip.
func verifySkillFile(skillPath, wantName string, wantMCPs []string) error {
	reg, err := loadSkillsConfined(skillPath)
	if err != nil {
		return fmt.Errorf("load: %s", safeFSErr(err))
	}
	for _, s := range reg.List() {
		if s.Dir == "" {
			continue
		}
		if s.Name != wantName {
			return fmt.Errorf("parsed name %q != written %q (frontmatter did not parse; the name fell back to the directory)", s.Name, wantName)
		}
		if len(wantMCPs) > 0 && len(s.MCPs) != len(wantMCPs) {
			return fmt.Errorf("parsed mcps %v != written %v", s.MCPs, wantMCPs)
		}
		return nil
	}
	return fmt.Errorf("no skill loaded from %s", filepath.Base(skillPath))
}

// warnBrokenSkills logs skills whose parsed name does not match their directory
// name: the signature of frontmatter that failed to parse and silently fell back
// (fields empty, mcps gate lost). Best-effort, startup only.
func warnBrokenSkills(dir string) {
	reg, err := loadSkillsConfined(dir)
	if err != nil {
		return
	}
	for _, s := range reg.List() {
		if s.Dir == "" || s.Name == filepath.Base(s.Dir) {
			continue
		}
		log.Printf("[skill] %s: frontmatter did not parse (loaded under the directory name; description and mcps are empty) - fix the YAML in %s", s.Name, filepath.Join(s.Dir, "SKILL.md"))
	}
}

// rewriteSkillFrontmatter parses the SKILL.md YAML frontmatter and replaces the
// fields given as non-nil pointers. The instruction body (after the closing ---) is
// preserved verbatim. Returns an error if the file has no recognisable frontmatter.
func rewriteSkillFrontmatter(content []byte, mcps *[]string, description, license, compatibility *string) ([]byte, error) {
	lines := strings.Split(string(content), "\n")
	if len(lines) < 2 || strings.TrimSpace(lines[0]) != "---" {
		return nil, fmt.Errorf("SKILL.md has no YAML frontmatter")
	}
	fmEnd := -1
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			fmEnd = i
			break
		}
	}
	if fmEnd < 0 {
		return nil, fmt.Errorf("SKILL.md frontmatter is not closed")
	}
	// Collect existing key → value from frontmatter (preserve unknown keys)
	type kv struct{ k, v string }
	var pairs []kv
	for _, l := range lines[1:fmEnd] {
		if idx := strings.IndexByte(l, ':'); idx >= 0 {
			pairs = append(pairs, kv{strings.TrimSpace(l[:idx]), strings.TrimSpace(l[idx+1:])})
		} else if strings.TrimSpace(l) != "" {
			pairs = append(pairs, kv{"", l}) // preserve non-key lines verbatim
		}
	}
	// Apply updates (nil pointer = no change)
	applyStr := func(key string, val *string) {
		if val == nil {
			return
		}
		for i, p := range pairs {
			if p.k == key {
				pairs[i].v = yamlScalar(strings.TrimSpace(*val))
				return
			}
		}
		pairs = append(pairs, kv{key, yamlScalar(strings.TrimSpace(*val))})
	}
	applyStr("description", description)
	applyStr("license", license)
	applyStr("compatibility", compatibility)
	if mcps != nil {
		cleaned := cleanStrs(*mcps)
		// Remove existing mcps line
		filtered := pairs[:0]
		for _, p := range pairs {
			if p.k != "mcps" {
				filtered = append(filtered, p)
			}
		}
		pairs = filtered
		if len(cleaned) > 0 {
			quoted := make([]string, len(cleaned))
			for i, m := range cleaned {
				quoted[i] = yamlScalar(m)
			}
			pairs = append(pairs, kv{"mcps", strings.Join(quoted, ", ")})
		}
	}
	// Reconstruct
	var sb strings.Builder
	sb.WriteString("---\n")
	for _, p := range pairs {
		if p.k == "" {
			sb.WriteString(p.v)
		} else {
			fmt.Fprintf(&sb, "%s: %s", p.k, p.v)
		}
		sb.WriteByte('\n')
	}
	sb.WriteString("---\n")
	// Body (lines after closing ---)
	if fmEnd+1 < len(lines) {
		sb.WriteString(strings.Join(lines[fmEnd+1:], "\n"))
	}
	return []byte(sb.String()), nil
}

// zip-upload safety caps (defeat zip bombs / runaway archives).
const (
	maxSkillZipBytes   = 20 << 20  // 20MB compressed request body
	maxSkillTotalBytes = 100 << 20 // 100MB total uncompressed
	maxSkillFileBytes  = 20 << 20  // 20MB per extracted file
	maxSkillEntries    = 4000      // max files in the archive
)

// skillNameFromFrontmatter extracts the `name:` value from a SKILL.md's YAML
// frontmatter (the block between the first two `---` lines). "" if absent.
func skillNameFromFrontmatter(md []byte) string {
	lines := strings.Split(string(md), "\n")
	inFM := false
	for _, ln := range lines {
		t := strings.TrimSpace(ln)
		if t == "---" {
			if !inFM {
				inFM = true
				continue
			}
			break // end of frontmatter
		}
		if inFM && strings.HasPrefix(t, "name:") {
			v := strings.TrimSpace(strings.TrimPrefix(t, "name:"))
			return strings.Trim(v, `"'`) // a quoted Chinese name is accepted too
		}
	}
	return ""
}

// fsUploadSkill installs a skill from an uploaded .zip. The archive must contain a
// SKILL.md (at the root or under a single top-level dir); the skill name is taken
// from that file's `name:` frontmatter (falling back to the top dir / zip name).
// Zip-slip is defeated by validating every entry path with skillRelPath, and a set
// of size/count caps guard against zip bombs. POST ?overwrite=true replaces an
// existing skill of the same name.
func (s *Server) fsUploadSkill(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxSkillZipBytes)
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, 400, "missing upload file (form field file) or size limit exceeded")
		return
	}
	defer file.Close()
	buf, err := io.ReadAll(file)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	zr, err := newSkillZipReader(buf)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	// entries carry UTF-8-decoded names (GBK archives can be read too) and exclude archiver junk.
	entriesAll := skillZipEntries(zr)
	if err := checkSkillZipMethods(entriesAll); err != nil {
		writeErr(w, 400, err.Error())
		return
	}

	// locate the shallowest SKILL.md → its directory is the skill root inside the zip.
	var skillMD *skillZipEntry
	for i := range entriesAll {
		e := &entriesAll[i]
		if path.Base(e.name) != "SKILL.md" {
			continue
		}
		if skillMD == nil || strings.Count(e.name, "/") < strings.Count(skillMD.name, "/") {
			skillMD = e
		}
	}
	if skillMD == nil {
		writeErr(w, 400, "SKILL.md not found in the archive")
		return
	}
	root := path.Dir(skillMD.name) // "." when SKILL.md is at the zip root
	prefix := ""
	if root != "." {
		prefix = root + "/"
	}

	// derive + validate the skill name from the SKILL.md frontmatter.
	md, err := readZipEntry(skillMD.f)
	if err != nil {
		writeErr(w, 400, "failed to read SKILL.md: "+err.Error())
		return
	}
	name := skillNameFromFrontmatter(md)
	if name == "" && prefix != "" {
		name = path.Base(strings.TrimSuffix(prefix, "/"))
	}
	if name == "" {
		base := path.Base(filepath.ToSlash(hdr.Filename))
		name = strings.TrimSuffix(base, path.Ext(base))
	}
	if !validSkillName(name) {
		writeErr(w, 400, "invalid skill name (taken from the name field of SKILL.md): "+name+
			"(max 64 chars, starts with a letter, only lowercase letters/digits/hyphens or non-ASCII letters such as Chinese, no spaces, dots, or path separators)")
		return
	}

	dirCP, err := resolveSkillDir(s.skillDir, name)
	if err != nil {
		writeErr(w, 400, "invalid path")
		return
	}
	skillPath := filepath.Join(s.skillDir, name)
	overwrite := r.URL.Query().Get("overwrite") == "true"
	if dirCP.exists && !overwrite {
		writeErr(w, 409, "skill already exists: "+name+" (retry after confirming if you want to overwrite)")
		return
	}

	// extract into a temp dir first, then atomically swap in — a bad entry aborts
	// the whole upload without leaving a half-written skill.
	_ = os.MkdirAll(s.skillDir, 0o755)
	tmp, err := os.MkdirTemp(s.skillDir, ".upload-*")
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer os.RemoveAll(tmp) // no-op after a successful rename

	var total int64
	entries := 0
	for _, e := range entriesAll {
		f := e.f
		// only files under the skill root; skip anything outside it.
		if prefix != "" && !strings.HasPrefix(e.name, prefix) {
			continue
		}
		rel := strings.TrimPrefix(e.name, prefix)
		if rel == "" {
			continue
		}
		clean, msg := skillRelPath(rel)
		if msg != "" {
			writeErr(w, 400, "archive contains an illegal path "+e.name+": "+msg)
			return
		}
		if entries++; entries > maxSkillEntries {
			writeErr(w, 400, "too many files in the archive")
			return
		}
		if f.UncompressedSize64 > maxSkillFileBytes {
			writeErr(w, 400, "file too large: "+rel)
			return
		}
		dst := filepath.Join(tmp, clean)
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		rc, err := f.Open()
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out, err := os.Create(dst)
		if err != nil {
			rc.Close()
			writeErr(w, 500, err.Error())
			return
		}
		n, err := io.Copy(out, io.LimitReader(rc, maxSkillFileBytes+1))
		out.Close()
		rc.Close()
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		total += n
		if total > maxSkillTotalBytes {
			writeErr(w, 400, "archive too large after extraction")
			return
		}
	}
	if _, err := os.Stat(filepath.Join(tmp, "SKILL.md")); err != nil {
		writeErr(w, 400, "SKILL.md missing after extraction")
		return
	}

	if overwrite {
		_ = os.RemoveAll(skillPath)
	}
	if err := os.Rename(tmp, skillPath); err != nil {
		writeErr(w, 500, "installation failed: "+err.Error())
		return
	}
	writeJSON(w, 201, map[string]any{"name": name, "files": entries})
}

// readZipEntry reads a single entry's bytes (capped). Takes the *zip.File rather than
// a name because zr.Open rejects names that aren't valid UTF-8 (GBK-named archives).
func readZipEntry(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(io.LimitReader(rc, maxSkillFileBytes))
}

func (s *Server) fsDeleteSkill(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	name := r.PathValue("name")
	if !validSkillName(name) {
		writeErr(w, 400, "invalid skill name")
		return
	}
	dirCP, err := resolveSkillDir(s.skillDir, name)
	if err != nil {
		writeErr(w, 400, "invalid path")
		return
	}
	if err := pg.DeleteSkillVisibility(name); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if dirCP.exists {
		if err := os.RemoveAll(dirCP.entryPath); err != nil {
			writeErr(w, 500, safeFSErr(err))
			return
		}
	}
	writeJSON(w, 200, map[string]any{"deleted": name})
}

// skillPathBlocked lists the ASCII characters a skill-relative path may not contain.
// '\' is a Windows separator; '%' keeps double-URL-encoding tricks from surviving
// (Go's net/http URL-decodes PathValue once — %2F→/ %2e→. — so an attacker sending
// %252e%252e arrives here as the literal "%2e%2e" and is rejected on the '%'); '#'
// and '?' would truncate the path when it travels back through a URL; the rest are
// reserved on Windows filesystems.
const skillPathBlocked = `\%#?*:"<>|`

// skillPathRune reports whether r may appear in a client-supplied skill path.
// It is a blacklist over Unicode rather than an ASCII whitelist so that Chinese (and any
// other script) file names work, while everything that makes path validation hard is
// still refused: control/format characters, look-alike whitespace, separators.
func skillPathRune(r rune) bool {
	switch {
	case r < 0x20, r == 0x7f, r == utf8.RuneError:
		return false // NUL & control characters, invalid UTF-8
	case strings.ContainsRune(skillPathBlocked, r):
		return false
	case unicode.Is(unicode.Cf, r), unicode.Is(unicode.Co, r), unicode.Is(unicode.Cs, r):
		return false // zero-width joiners, bidi overrides (RLO filename spoofing), private use
	case r != ' ' && unicode.IsSpace(r):
		return false // NBSP / full-width spaces and the like: they look like a space but are not
	}
	return true
}

// maxSkillPathLen caps a relative path so a pathological name can't reach the syscall.
const maxSkillPathLen = 512

// skillRelPath validates a relative file path supplied by the client.
// Returns the cleaned path and an empty error string on success.
// Validation order matters: character check first (before Clean) so encoding tricks
// can't survive normalization.
func skillRelPath(file string) (string, string) {
	// 1. Character check — before normalization. Defeats null bytes, backslash,
	//    '%', control characters and unicode look-alikes; CJK names pass through.
	if file == "" || len(file) > maxSkillPathLen {
		return "", "invalid path: empty or too long"
	}
	if !utf8.ValidString(file) {
		return "", "invalid path: not valid UTF-8"
	}
	for _, r := range file {
		if !skillPathRune(r) {
			return "", "invalid path: illegal character " + strconv.QuoteRune(r)
		}
	}
	// 2. Reject ".." explicitly. With the whitelist above, encoding bypass is already
	//    impossible, but we keep this check so the intent is obvious to reviewers.
	if strings.Contains(file, "..") {
		return "", "invalid path: '..' not allowed"
	}
	// 3. Reject leading slash and empty segments (double slash).
	//    Leading slash would survive filepath.Clean as an absolute path.
	if strings.HasPrefix(file, "/") || strings.Contains(file, "//") {
		return "", "invalid path: must be relative with no empty segments"
	}
	// 4. Normalize and final safety re-check after Clean.
	//    filepath.Clean removes redundant separators and resolves single dots.
	clean := filepath.Clean(file)
	if clean == "." || filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") {
		return "", "invalid path"
	}
	return clean, ""
}

// walkSkillFiles returns all files under root (relative to root), sorted,
// including files in subdirectories (scripts/, references/, assets/, etc.).
// walkSkillFiles returns all entries under root relative to root.
// Directories are included with a trailing "/" so the frontend can distinguish
// them from files and render empty folders in the tree.
func walkSkillFiles(root string) ([]string, error) {
	var entries []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil || rel == "." {
			return nil
		}
		if d.IsDir() {
			entries = append(entries, rel+"/")
		} else {
			entries = append(entries, rel)
		}
		return nil
	})
	return entries, err
}

func (s *Server) fsListFiles(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !validSkillName(name) {
		writeErr(w, 400, "invalid skill name")
		return
	}
	dirCP, err := resolveSkillDir(s.skillDir, name)
	if err != nil {
		writeErr(w, 400, "invalid path")
		return
	}
	if !dirCP.exists {
		writeErr(w, 404, "skill not found")
		return
	}
	fi, err := os.Stat(dirCP.realPath)
	if err != nil || !fi.IsDir() {
		writeErr(w, 404, "skill not found")
		return
	}
	files, err := walkSkillFiles(dirCP.realPath)
	if err != nil {
		writeErr(w, 500, safeFSErr(err))
		return
	}
	if files == nil {
		files = []string{}
	}
	writeJSON(w, 200, map[string]any{"files": files})
}

func (s *Server) fsReadFile(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !validSkillName(name) {
		writeErr(w, 400, "invalid skill name")
		return
	}
	file, errMsg := skillRelPath(r.PathValue("file"))
	if errMsg != "" {
		writeErr(w, 400, errMsg)
		return
	}
	skillExists, cp, err := resolveSkillFile(s.skillDir, name, file)
	if err != nil {
		writeErr(w, 400, "invalid path")
		return
	}
	if !skillExists || !cp.exists {
		writeErr(w, 404, "file not found")
		return
	}
	data, err := os.ReadFile(cp.realPath)
	if os.IsNotExist(err) {
		writeErr(w, 404, "file not found")
		return
	}
	if err != nil {
		writeErr(w, 500, safeFSErr(err))
		return
	}
	writeJSON(w, 200, map[string]any{"content": string(data), "file": file})
}

func (s *Server) fsWriteFile(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !validSkillName(name) {
		writeErr(w, 400, "invalid skill name")
		return
	}
	file, errMsg := skillRelPath(r.PathValue("file"))
	if errMsg != "" {
		writeErr(w, 400, errMsg)
		return
	}
	var body struct {
		Content string `json:"content"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	skillExists, cp, err := resolveSkillFile(s.skillDir, name, file)
	if err != nil {
		writeErr(w, 400, "invalid path")
		return
	}
	if !skillExists {
		writeErr(w, 404, "skill not found")
		return
	}
	if cp.realPath == cp.realRoot {
		writeErr(w, 400, "invalid path")
		return
	}
	// create parent subdirectory if needed (e.g. scripts/, references/, assets/)
	if err := os.MkdirAll(filepath.Dir(cp.realPath), 0o755); err != nil {
		writeErr(w, 500, safeFSErr(err))
		return
	}
	if err := os.WriteFile(cp.realPath, []byte(body.Content), 0o644); err != nil {
		writeErr(w, 500, safeFSErr(err))
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) fsCreateDir(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !validSkillName(name) {
		writeErr(w, 400, "invalid skill name")
		return
	}
	var body struct {
		Path string `json:"path"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	dir, errMsg := skillRelPath(body.Path)
	if errMsg != "" {
		writeErr(w, 400, errMsg)
		return
	}
	skillExists, cp, err := resolveSkillFile(s.skillDir, name, dir)
	if err != nil {
		writeErr(w, 400, "invalid path")
		return
	}
	if !skillExists {
		writeErr(w, 404, "skill not found")
		return
	}
	if cp.realPath == cp.realRoot {
		writeErr(w, 400, "invalid path")
		return
	}
	if err := os.MkdirAll(cp.realPath, 0o755); err != nil {
		writeErr(w, 500, safeFSErr(err))
		return
	}
	writeJSON(w, 201, map[string]any{"dir": dir})
}

func (s *Server) fsDeletePath(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !validSkillName(name) {
		writeErr(w, 400, "invalid skill name")
		return
	}
	file, errMsg := skillRelPath(r.PathValue("file"))
	if errMsg != "" {
		writeErr(w, 400, errMsg)
		return
	}
	skillExists, cp, err := resolveSkillFile(s.skillDir, name, file)
	if err != nil {
		writeErr(w, 400, "invalid path")
		return
	}
	if !skillExists || !cp.exists {
		writeErr(w, 404, "not found")
		return
	}
	if cp.realPath == cp.realRoot {
		writeErr(w, 400, "invalid path")
		return
	}
	if err := os.RemoveAll(cp.entryPath); err != nil {
		writeErr(w, 500, safeFSErr(err))
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": file})
}

// ---------- skill visibility ----------

func (s *Server) pgSkillVisibility(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	agents, err := pg.SkillAgents(r.PathValue("name"))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"agents": idStrings(agents)})
}

func (s *Server) pgToggleSkillVisibility(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var body struct {
		AgentID   int64  `json:"agent_id,string"`
		SkillName string `json:"skill_name"`
		Visible   bool   `json:"visible"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.ToggleSkillVisibility(body.AgentID, body.SkillName, body.Visible); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- visibility (MCP resource side + toggle) ----------

func (s *Server) pgResourceVisibility(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, _ := pathInt(r, "id")
	agents, err := pg.ResourceAgents(r.PathValue("kind"), id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"agents": idStrings(agents)})
}

func (s *Server) pgToggleVisibility(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var body struct {
		AgentID    int64  `json:"agent_id,string"`
		Kind       string `json:"kind"`
		ResourceID int64  `json:"resource_id"`
		Visible    bool   `json:"visible"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.ToggleVisibility(body.AgentID, body.Kind, body.ResourceID, body.Visible); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- llm profiles ----------

func (s *Server) pgListProfiles(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	ps, err := pg.ListProfiles()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"profiles": llmProfileDTOs(ps)})
}

func (s *Server) pgSaveProfile(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	// APIKey has json:"-" on db.LLMProfile so it is never leaked to the UI on
	// read; accept it here via a sibling field for create/update. Streaming is a
	// *bool shadowing the embedded json:"streaming": an absent field must default
	// to streaming (true), which a plain bool zero value (false = non-streaming)
	// would get wrong — legacy/partial clients that never send it stay streaming.
	var body struct {
		db.LLMProfile
		APIKey             string `json:"api_key"`
		CustomHeaders      string `json:"custom_headers"`
		ClearCustomHeaders bool   `json:"clear_custom_headers"`
		Streaming          *bool  `json:"streaming"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	p := body.LLMProfile
	p.APIKey = body.APIKey
	p.CustomHeaders = body.CustomHeaders
	p.ClearCustomHeaders = body.ClearCustomHeaders
	if p.Format == "bedrock-gateway" {
		if _, err := agent.ParseBedrockGatewayHeaders(p.CustomHeaders); err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		if p.ID != 0 {
			stored, err := pg.ProfileByID(p.ID)
			if err != nil {
				writeErr(w, 500, err.Error())
				return
			}
			if stored != nil && !sameLLMEndpoint(p.Format, p.BaseURL, stored.Format, stored.BaseURL) {
				if strings.TrimSpace(p.APIKey) == "" {
					writeErr(w, 400, "enter the bearer token when changing the Bedrock gateway endpoint")
					return
				}
				if p.CustomHeaders == "" {
					p.ClearCustomHeaders = true
				}
			}
		}
	} else if p.CustomHeaders != "" {
		writeErr(w, 400, "custom headers require the Bedrock gateway format")
		return
	} else {
		p.ClearCustomHeaders = true
	}
	p.Streaming = body.Streaming == nil || *body.Streaming
	// The list returns the proxy masked: the placeholder sent back keeps the
	// stored proxy and is never stored itself.
	if isMaskedSecret(p.Proxy) {
		stored, err := pg.ProfileByID(p.ID)
		if p.ID == 0 || err != nil || stored == nil {
			writeErr(w, 400, "proxy is a masked placeholder but no stored proxy to keep; enter the proxy or clear it")
			return
		}
		p.Proxy = stored.Proxy
	}
	// Output cap: negative values are meaningless, clamp to zero (= do not send the
	// field). The field-name switch only matters for Chat Completions — anthropic and
	// openai-responses hard-code their field names; storing it would only mislead later readers, so it is cleared for any non-openai format. Unknown values are cleared too, to avoid throwing DB CHECK errors at the user.
	if p.MaxTokens < 0 {
		p.MaxTokens = 0
	}
	if p.Format != "openai" || p.MaxTokensField != llm.MaxTokensFieldCompletion {
		p.MaxTokensField = ""
	}
	// Custom User-Agent: trim and reject control characters / over-long values so a
	// bad value can never inject a header or bloat every request. "" = no override.
	ua, err := agent.ValidateUserAgent(p.UserAgent)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	p.UserAgent = ua
	if p.Format == "bedrock-gateway" {
		validate := agent.ConfigFrom(p.Format, p.Model, p.BaseURL, p.APIKey, p.Proxy)
		validate.CustomHeaders = p.CustomHeaders
		if p.ID != 0 {
			stored, _ := pg.ProfileByID(p.ID)
			if stored != nil && sameLLMEndpoint(p.Format, p.BaseURL, stored.Format, stored.BaseURL) {
				if validate.APIKey == "" {
					validate.APIKey = stored.APIKey
				}
				if validate.CustomHeaders == "" && !p.ClearCustomHeaders {
					validate.CustomHeaders = stored.CustomHeaders
				}
			}
		}
		if _, err := validate.NewProvider(); err != nil {
			writeErr(w, 400, err.Error())
			return
		}
	}
	id, err := pg.SaveProfile(&p)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	// Editing a profile rebuilds any task pinned to it on its next round. Reapply
	// the active profile too: the global fallback and explicit task chains must
	// repopulate the same provider-cache entry and therefore share one limiter.
	s.invalidateProfileAgents()
	// Hot-apply. Not just when the ACTIVE profile changed: with failover on, any
	// profile's key/model/priority/pool_exclude edit reshapes the chain, so the
	// engine's provider has to be rebuilt either way.
	s.reapplyActiveProfile()
	writeJSON(w, 200, map[string]any{"id": id})
}

// pgGetLLMRetryPolicy returns the global retry policy (per-layer counts +
// intervals). Never configured → all zeros, which the frontend shows as "default".
func (s *Server) pgGetLLMRetryPolicy(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	writeJSON(w, 200, pg.LLMRetryPolicy())
}

// pgSaveLLMRetryPolicy saves the global retry policy. The three per-endpoint layers
// (connect / empty response / same-provider safety window) are provider build or
// call parameters, so changing them requires rebuilding the cached providers; circuit-breaker parameters are pushed straight to the process-level Registry.
func (s *Server) pgSaveLLMRetryPolicy(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var pol db.LLMRetryPolicy
	if err := decode(w, r, &pol); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.SetLLMRetryPolicy(pol); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.applyRetryPolicy()
	s.invalidateProfileAgents()
	s.reapplyActiveProfile()
	writeJSON(w, 200, pg.LLMRetryPolicy())
}

func (s *Server) pgDeleteProfile(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, _ := pathInt(r, "id")
	if err := pg.DeleteProfileContext(r.Context(), id); err != nil {
		switch {
		case errors.Is(err, db.ErrActiveLLMProfileDelete):
			writeErr(w, 409, "the currently active LLM profile cannot be deleted; activate another profile first")
		case errors.Is(err, db.ErrLLMProfileReferencesChanged):
			writeErr(w, 409, "the LLM profile is being modified by a task or session; retry")
		case errors.Is(err, context.DeadlineExceeded):
			writeErr(w, 409, "timed out waiting for LLM profile references to be released; retry")
		case errors.Is(err, db.ErrLLMProfileNotFound):
			writeErr(w, 404, err.Error())
		default:
			writeErr(w, 500, err.Error())
		}
		return
	}
	s.invalidateProfileAgents() // drop cached agents for the removed profile
	s.llmHealth.Reset(id)       // its breaker state is meaningless now (row is FK-cascaded away)
	s.restoreTasksAfterProfileDelete(pg)
	// Cache invalidation also removed the active profile's shared provider entry.
	// Reapply after task-state sync so the wake-up observes the post-delete chain.
	s.reapplyActiveProfile()
	writeJSON(w, 200, map[string]any{"deleted": id})
}

func (s *Server) restoreTasksAfterProfileDelete(pg *db.DB) {
	for _, task := range s.m.List() {
		if taskID, err := strconv.ParseInt(task.ID, 10, 64); err == nil {
			if pt, err := pg.GetTask(taskID); err == nil && pt != nil {
				s.syncTaskLLMState(pt)
				// Deleting the active entry may advance the task to a ready successor,
				// or clear the explicit chain and restore its Agent/global fallback.
				// Resume only intents that were blocked by the exhausted chain; a
				// paused task remains paused and terminal tasks remain immutable.
				if !isTerminalStatus(task.lifecycleSnapshot().Status) && s.taskRuntimeAvailable(task, "planner", "worker") {
					if _, reopenErr := task.Store.ReopenIntentsByBlockedReason(db.IntentBlockedLLMQuota); reopenErr != nil {
						log.Printf("[llm-profile] task %s reopen quota-blocked intents after profile delete: %v", task.ID, reopenErr)
					}
				}
				task.Notify()
			}
		}
	}
}

func (s *Server) pgActivateProfile(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var body struct {
		ID int64 `json:"id"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.SetActiveProfile(body.ID); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.invalidateProfileAgents() // active change may affect pinned-task fallbacks
	s.reapplyActiveProfile()    // switch the running engine to the newly activated profile
	writeJSON(w, 200, map[string]any{"ok": true})
}

// pgLLMPoolStatus reports the failover ("round-robin") switches, the resolved chain order
// and every profile's circuit-breaker state — what the LLM page renders as the
// the "round-robin order" strip and the per-card health badges.
func (s *Server) pgLLMPoolStatus(w http.ResponseWriter, r *http.Request) {
	if s.pg(w) == nil {
		return
	}
	writeJSON(w, 200, s.llmPoolStatus())
}

// pgLLMPoolReset clears a tripped profile's circuit breaker so the next call
// tries it again immediately ("recover now"). id=0 clears every profile.
func (s *Server) pgLLMPoolReset(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var body struct {
		ID int64 `json:"id"` // 0 / omitted = all
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if body.ID > 0 {
		s.llmHealth.Reset(body.ID)
	} else {
		for id := range s.llmHealth.Snapshot() {
			s.llmHealth.Reset(id)
		}
	}
	writeJSON(w, 200, s.llmPoolStatus())
}

const maxModelRedirects = 5

// LLMPrivateEndpointsEnv is an opt-in comma-separated allow-list of exact
// host:port entries (for example "127.0.0.1:11434,host.docker.internal:11434")
// that POST /api/llm/models may contact on loopback or private addresses.
// Unset or empty enforces the strict public-only policy.
const LLMPrivateEndpointsEnv = "ARTEX_LLM_PRIVATE_ENDPOINTS"

type modelURLRefusalError struct {
	msg string
}

func (e *modelURLRefusalError) Error() string { return e.msg }

func normalizeModelHost(host string) (kind, normalized string, ok bool) {
	host = strings.TrimSpace(host)
	if host == "" {
		return "", "", false
	}
	if addr, err := netip.ParseAddr(host); err == nil {
		return intercept.TargetIP, addr.Unmap().WithZone("").String(), true
	}
	t, ok := intercept.NormalizeTarget(host)
	if !ok || t.Kind == intercept.TargetCIDR || t.Host == "" {
		return "", "", false
	}
	return t.Kind, t.Host, true
}

func urlEffectivePort(u *url.URL) (int, bool) {
	if p := u.Port(); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n < 1 || n > 65535 {
			return 0, false
		}
		return n, true
	}
	switch strings.ToLower(u.Scheme) {
	case "http":
		return 80, true
	case "https":
		return 443, true
	default:
		return 0, false
	}
}

func parsePrivateModelEndpoints(raw string) map[string]bool {
	out := map[string]bool{}
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		host, portStr, err := net.SplitHostPort(entry)
		if err != nil {
			continue
		}
		port, err := strconv.Atoi(portStr)
		if err != nil || port < 1 || port > 65535 {
			continue
		}
		_, normHost, ok := normalizeModelHost(host)
		if !ok {
			continue
		}
		out[net.JoinHostPort(normHost, strconv.Itoa(port))] = true
	}
	return out
}

func sameRedirectHost(a, b *url.URL) bool {
	ha := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(a.Hostname())), ".")
	hb := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(b.Hostname())), ".")
	return ha != "" && ha == hb
}

// Ranges that are not public Internet addresses and that
// intercept.IsNonPublicAddr does not cover. The shared ones are in use on
// private networks (overlay networks, fake-IP resolvers), so an allow-listed
// endpoint may sit there; the reserved ones are never a model endpoint.
var (
	modelSharedPrefixes = []netip.Prefix{
		netip.MustParsePrefix("100.64.0.0/10"), // carrier-grade NAT (RFC 6598)
		netip.MustParsePrefix("198.18.0.0/15"), // benchmarking (RFC 2544)
	}
	modelReservedPrefixes = []netip.Prefix{
		netip.MustParsePrefix("192.0.0.0/24"), // IETF protocol assignments (RFC 6890)
		netip.MustParsePrefix("240.0.0.0/4"),  // reserved, and the limited broadcast address
	}
	// IPv6 prefixes whose addresses reach the IPv4 host they embed. A DNS64
	// resolver answers with NAT64 addresses for every IPv4-only name, so the
	// prefixes are not blocked as a whole: the embedded address is judged.
	modelNAT64Prefix = netip.MustParsePrefix("64:ff9b::/96") // the low 32 bits name an IPv4 host
	model6to4Prefix  = netip.MustParsePrefix("2002::/16")    // bits 16 to 47 name an IPv4 host
)

// modelEmbeddedIPv4 returns the IPv4 address a NAT64 or 6to4 address embeds.
func modelEmbeddedIPv4(addr netip.Addr) (netip.Addr, bool) {
	b := addr.As16()
	switch {
	case modelNAT64Prefix.Contains(addr):
		return netip.AddrFrom4([4]byte(b[12:16])), true
	case model6to4Prefix.Contains(addr):
		return netip.AddrFrom4([4]byte(b[2:6])), true
	}
	return netip.Addr{}, false
}

func prefixesContain(prefixes []netip.Prefix, addr netip.Addr) bool {
	for _, p := range prefixes {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

func (s *Server) isBlockedModelAddr(addr netip.Addr, allowPrivate bool) bool {
	if !addr.IsValid() {
		return true
	}
	addr = addr.Unmap().WithZone("")
	if v4, ok := modelEmbeddedIPv4(addr); ok {
		addr = v4
	}
	if s != nil && s.allowLoopbackModels && addr.IsLoopback() {
		return false
	}
	shared := prefixesContain(modelSharedPrefixes, addr)
	if !intercept.IsNonPublicAddr(addr) && !shared && !prefixesContain(modelReservedPrefixes, addr) {
		return false
	}
	if allowPrivate {
		// Allow-listed self-hosted endpoints may resolve to loopback, RFC1918 /
		// unique-local private addresses, or the shared ranges above, but never
		// link-local, unspecified, multicast, reserved, or instance-metadata
		// addresses (such as 169.254.169.254, 100.100.100.200 or fd00:ec2::254).
		if addr.IsLoopback() {
			return false
		}
		if (addr.IsPrivate() || shared) && intercept.ValidateExemptionHost(addr.String()) == nil {
			return false
		}
	}
	return true
}

func (s *Server) lookupModelIPs(ctx context.Context, host string) ([]netip.Addr, error) {
	if s != nil && s.modelLookupIP != nil {
		return s.modelLookupIP(ctx, host)
	}
	return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
}

type modelURLGuard struct {
	s                *Server
	privateEndpoints map[string]bool
	mu               sync.Mutex
	allowedDialAddrs map[string]bool
}

func newModelURLGuard(s *Server) *modelURLGuard {
	return &modelURLGuard{
		s:                s,
		privateEndpoints: parsePrivateModelEndpoints(os.Getenv(LLMPrivateEndpointsEnv)),
	}
}

func (g *modelURLGuard) allowDialAddr(addr netip.Addr, port int) {
	if !addr.IsValid() || port < 1 || port > 65535 {
		return
	}
	key := net.JoinHostPort(addr.Unmap().WithZone("").String(), strconv.Itoa(port))
	g.mu.Lock()
	if g.allowedDialAddrs == nil {
		g.allowedDialAddrs = map[string]bool{}
	}
	g.allowedDialAddrs[key] = true
	g.mu.Unlock()
}

func (g *modelURLGuard) isAllowedDialAddr(addr netip.Addr, port string) bool {
	key := net.JoinHostPort(addr.Unmap().WithZone("").String(), port)
	g.mu.Lock()
	ok := g.allowedDialAddrs[key]
	g.mu.Unlock()
	return ok
}

func (g *modelURLGuard) blockDial(_, address string, _ syscall.RawConn) error {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return &modelURLRefusalError{msg: "target address is not allowed"}
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return &modelURLRefusalError{msg: "target address is not allowed"}
	}
	allowPrivate := g.isAllowedDialAddr(addr, port)
	if g.s.isBlockedModelAddr(addr, allowPrivate) {
		return &modelURLRefusalError{msg: "target address is not allowed"}
	}
	return nil
}

// validateURL validates a base_url candidate, proxy URL, or redirect target for
// POST /api/llm/models. Only http and https URLs are permitted; hosts must
// resolve strictly to public addresses unless their exact host:port is listed
// in ARTEX_LLM_PRIVATE_ENDPOINTS. Errors never include resolved IP addresses.
func (g *modelURLGuard) validateURL(ctx context.Context, rawURL, role string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return nil, &modelURLRefusalError{msg: fmt.Sprintf("invalid %s URL", role)}
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, &modelURLRefusalError{msg: fmt.Sprintf("%s URL must use http or https", role)}
	}
	if u.Opaque != "" {
		return nil, &modelURLRefusalError{msg: fmt.Sprintf("invalid %s URL", role)}
	}
	port, ok := urlEffectivePort(u)
	if !ok {
		return nil, &modelURLRefusalError{msg: fmt.Sprintf("invalid %s URL", role)}
	}
	kind, normHost, ok := normalizeModelHost(u.Hostname())
	if !ok {
		return nil, &modelURLRefusalError{msg: fmt.Sprintf("invalid %s URL host", role)}
	}
	hostPort := net.JoinHostPort(normHost, strconv.Itoa(port))
	allowPrivate := g.privateEndpoints[hostPort]

	if kind == intercept.TargetIP {
		addr, err := netip.ParseAddr(normHost)
		if err != nil || g.s.isBlockedModelAddr(addr, allowPrivate) {
			return nil, &modelURLRefusalError{msg: fmt.Sprintf("%s URL host is not allowed", role)}
		}
		if allowPrivate {
			g.allowDialAddr(addr, port)
		}
		return u, nil
	}
	if !allowPrivate && !(g.s != nil && g.s.allowLoopbackModels) && (normHost == "localhost" || strings.HasSuffix(normHost, ".localhost")) {
		return nil, &modelURLRefusalError{msg: fmt.Sprintf("%s URL host is not allowed", role)}
	}
	addrs, err := g.s.lookupModelIPs(ctx, normHost)
	if err != nil || len(addrs) == 0 {
		return nil, &modelURLRefusalError{msg: fmt.Sprintf("failed to resolve %s host", role)}
	}
	for _, addr := range addrs {
		if g.s.isBlockedModelAddr(addr, allowPrivate) {
			return nil, &modelURLRefusalError{msg: fmt.Sprintf("%s URL host is not allowed", role)}
		}
	}
	if allowPrivate {
		for _, addr := range addrs {
			g.allowDialAddr(addr, port)
		}
	}
	return u, nil
}

// pgListModels fetches available models from the provider's API endpoint.
// Supports OpenAI-format (GET /models), Anthropic-format (GET /v1/models) and
// Ollama (keyless OpenAI-compatible GET /v1/models on the local server); for
// Anthropic-compatible third parties (e.g. DeepSeek) whose model list lives only on
// the OpenAI path, it falls back to the OpenAI endpoint at the stripped root.
func (s *Server) pgListModels(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider  string `json:"provider"` // "openai" | "anthropic" | "ollama"
		BaseURL   string `json:"base_url"`
		APIKey    string `json:"api_key"`
		Proxy     string `json:"proxy"`
		ProfileID *int64 `json:"profile_id"` // fallback: use stored key from this profile
	}
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if strings.TrimSpace(req.Provider) == "bedrock-gateway" {
		writeJSON(w, 200, map[string]any{"ok": false, "error": "enter the Bedrock model ID manually; this gateway has no model-list endpoint"})
		return
	}
	// Resolve API key: form input > profile stored key. The stored key is only
	// sent to the endpoint it was saved for, since base_url comes from the form.
	apiKey := strings.TrimSpace(req.APIKey)
	withheld := false
	if apiKey == "" && req.ProfileID != nil {
		if p, err := s.m.pg.ProfileByID(*req.ProfileID); err == nil && p != nil {
			if sameLLMEndpoint(req.Provider, req.BaseURL, p.Format, p.BaseURL) {
				apiKey = p.APIKey
			} else {
				withheld = p.APIKey != ""
			}
		}
	}
	if isMaskedSecret(req.Proxy) { // the form echoes the masked proxy: use the stored one
		req.Proxy = ""
		if req.ProfileID != nil {
			if p, err := s.m.pg.ProfileByID(*req.ProfileID); err == nil && p != nil {
				req.Proxy = p.Proxy
			}
		}
	}
	provider := strings.TrimSpace(req.Provider)
	// Ollama serves its model list keyless on the local server: no key gate.
	if apiKey == "" && provider != "ollama" {
		msg := "no API Key provided"
		if withheld {
			msg = "no API Key provided: the saved key is only sent to the endpoint it was saved for; enter the key to list models from a different base URL or provider"
		}
		writeJSON(w, 200, map[string]any{"ok": false, "error": msg})
		return
	}

	rawBaseURL := strings.TrimSpace(req.BaseURL)
	baseURL := strings.TrimRight(rawBaseURL, "/")
	defaultOllama := provider == "ollama" && rawBaseURL == ""

	// Candidate endpoints to try in order. Some Anthropic-compatible providers
	// (e.g. DeepSeek) implement /v1/messages under an /anthropic path but expose
	// the model list only on their OpenAI-format path — so for anthropic we fall
	// back to the OpenAI endpoint at the stripped root.
	type candidate struct {
		url string
		hdr http.Header
	}
	bearerHdr := func() http.Header {
		h := http.Header{}
		h.Set("Authorization", "Bearer "+apiKey)
		return h
	}
	anthropicHdr := func() http.Header {
		h := http.Header{}
		h.Set("x-api-key", apiKey)
		h.Set("anthropic-version", "2023-06-01")
		return h
	}

	var candidates []candidate
	switch provider {
	case "openai", "openai-responses":
		// Responses API shares the OpenAI model list at /v1/models; tolerate a full
		// endpoint URL of either format.
		if baseURL == "" {
			baseURL = "https://api.openai.com/v1"
		}
		b := strings.TrimRight(strings.TrimSuffix(strings.TrimSuffix(baseURL, "/chat/completions"), "/responses"), "/")
		candidates = append(candidates, candidate{b + "/models", bearerHdr()})
	case "ollama":
		// OpenAI-compatible list at {base}/v1/models. Tolerate base URLs with or
		// without the /v1 suffix (and a full endpoint URL). No auth needed; when a
		// key was provided anyway, send it as Bearer (Ollama ignores it).
		if baseURL == "" {
			baseURL = agent.DefaultOllamaBaseURL
		}
		b := strings.TrimSuffix(baseURL, "/chat/completions")
		if !strings.HasSuffix(b, "/v1") {
			b += "/v1"
		}
		hdr := http.Header{}
		if apiKey != "" {
			hdr.Set("Authorization", "Bearer "+apiKey)
		}
		candidates = append(candidates, candidate{b + "/models", hdr})
	default: // anthropic
		if baseURL == "" {
			baseURL = "https://api.anthropic.com"
		}
		b := strings.TrimRight(strings.TrimSuffix(baseURL, "/v1/messages"), "/")
		candidates = append(candidates, candidate{b + "/v1/models", anthropicHdr()})
		// Fallback for Anthropic-compatible third parties whose model list lives on
		// the OpenAI path: strip a trailing /anthropic and try the OpenAI endpoint.
		if root := strings.TrimRight(strings.TrimSuffix(b, "/anthropic"), "/"); root != b {
			candidates = append(candidates,
				candidate{root + "/models", bearerHdr()},
				candidate{root + "/v1/models", bearerHdr()},
			)
		}
	}

	// Validate proxy and every candidate URL before sending any request.
	// Pre-request validation is required in addition to the dial-time guard
	// because a caller-supplied HTTP proxy fetches the target URL itself.
	guard := newModelURLGuard(s)
	var proxyURL *url.URL
	if p := strings.TrimSpace(req.Proxy); p != "" {
		var err error
		proxyURL, err = guard.validateURL(r.Context(), p, "proxy")
		if err != nil {
			writeJSON(w, 200, map[string]any{"ok": false, "error": err.Error()})
			return
		}
	}
	if defaultOllama {
		// The built-in Ollama default is code-owned, not caller input: allow
		// dialing its exact host:port without relaxing caller-supplied URLs.
		if du, err := url.Parse(agent.DefaultOllamaBaseURL); err == nil {
			if addr, err := netip.ParseAddr(du.Hostname()); err == nil {
				if port, ok := urlEffectivePort(du); ok {
					guard.allowDialAddr(addr, port)
				}
			}
		}
	} else {
		for _, c := range candidates {
			if _, err := guard.validateURL(r.Context(), c.url, "endpoint"); err != nil {
				writeJSON(w, 200, map[string]any{"ok": false, "error": err.Error()})
				return
			}
		}
	}

	// Build HTTP client with strict dial guard, redirect validation, and optional proxy.
	var transport *http.Transport
	if base, ok := http.DefaultTransport.(*http.Transport); ok {
		transport = base.Clone()
	} else {
		transport = &http.Transport{}
	}
	transport.Proxy = nil
	if proxyURL != nil {
		transport.Proxy = http.ProxyURL(proxyURL)
	}
	if s.modelRootCAs != nil {
		if transport.TLSClientConfig == nil {
			transport.TLSClientConfig = &tls.Config{}
		} else {
			transport.TLSClientConfig = transport.TLSClientConfig.Clone()
		}
		transport.TLSClientConfig.RootCAs = s.modelRootCAs
	}
	dialCtx := (&net.Dialer{Timeout: 10 * time.Second, Control: guard.blockDial}).DialContext
	if s.modelDialContext != nil {
		dialCtx = s.modelDialContext
	}
	transport.DialContext = dialCtx
	defer transport.CloseIdleConnections()

	client := &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxModelRedirects {
				return &modelURLRefusalError{msg: "too many redirects"}
			}
			if len(via) > 0 {
				prev := via[len(via)-1].URL
				prevScheme := strings.ToLower(prev.Scheme)
				nextScheme := strings.ToLower(req.URL.Scheme)
				if nextScheme != prevScheme {
					if !(prevScheme == "http" && nextScheme == "https" && sameRedirectHost(prev, req.URL)) {
						return &modelURLRefusalError{msg: "redirect scheme change is not allowed"}
					}
				}
			}
			if _, err := guard.validateURL(req.Context(), req.URL.String(), "redirect"); err != nil {
				return err
			}
			return nil
		},
	}

	// Try each candidate; return the first that yields a non-empty model list.
	var lastErr string
	emptyOK := false
	for i, c := range candidates {
		if i > 0 && !defaultOllama {
			if _, err := guard.validateURL(r.Context(), c.url, "endpoint"); err != nil {
				writeJSON(w, 200, map[string]any{"ok": false, "error": err.Error()})
				return
			}
		}
		httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, c.url, nil)
		if err != nil {
			lastErr = "failed to build request: " + err.Error()
			continue
		}
		httpReq.Header = c.hdr
		resp, err := client.Do(httpReq)
		if err != nil {
			var refusal *modelURLRefusalError
			if errors.As(err, &refusal) {
				writeJSON(w, 200, map[string]any{"ok": false, "error": refusal.Error()})
				return
			}
			lastErr = "request failed: " + err.Error()
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			// The status only: echoing the body would let the caller read what
			// any host this endpoint can reach answers.
			lastErr = fmt.Sprintf("API returned %d %s (the response body is not shown)", resp.StatusCode, http.StatusText(resp.StatusCode))
			continue
		}
		// Both OpenAI and Anthropic return {"data": [{"id": "..."},...]}.
		var parsed struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if err := json.Unmarshal(body, &parsed); err != nil {
			lastErr = "failed to parse response: " + err.Error()
			continue
		}
		models := make([]string, 0, len(parsed.Data))
		for _, m := range parsed.Data {
			if m.ID != "" {
				models = append(models, m.ID)
			}
		}
		if len(models) > 0 {
			writeJSON(w, 200, map[string]any{"ok": true, "models": models})
			return
		}
		emptyOK = true // 200 but no model ids — keep trying other candidates
	}
	if emptyOK {
		writeJSON(w, 200, map[string]any{"ok": true, "models": []string{}})
		return
	}
	if lastErr == "" {
		lastErr = "no model list received"
	}
	writeJSON(w, 200, map[string]any{"ok": false, "error": lastErr})
}

// --- prompt template helpers (Go text/template + catalog whitelist) ---

// globalPromptVars are runtime variables available to EVERY agent (built-in and
// custom) regardless of its per-agent catalog. Each agent's render path fills them
// (see agent.nowStr, rendered fresh each turn), so a prompt may always reference
// {{.Now}} — e.g. subtract it from a fixed start stamp to reason about elapsed time.
var globalPromptVars = []db.PromptVar{
	{Name: "Now", Description: "current server time (refreshed live on every run; subtract a fixed start time from it to measure elapsed time)", Example: "2026-08-11 14:30:00 CST", Source: "runtime"},
	{Name: "DataDir", Description: "server data root directory (the root of all task/session artifacts; each agent actually writes to a subdirectory beneath it, e.g. <DataDir>/<taskID>)", Example: "/app/data", Source: "runtime"},
}

// withGlobalVars appends the universal runtime vars onto an agent's own catalog,
// so validation / the UI variable list / preview all recognize {{.Now}} etc.
// A stored catalog entry that collides with a global name is dropped: the global
// runtime var is authoritative (it's what the render path actually resolves), and
// this keeps the returned list name-unique so the UI never sees duplicate keys.
func withGlobalVars(vars []db.PromptVar) []db.PromptVar {
	globalNames := make(map[string]bool, len(globalPromptVars))
	for _, g := range globalPromptVars {
		globalNames[g.Name] = true
	}
	out := make([]db.PromptVar, 0, len(vars)+len(globalPromptVars))
	for _, v := range vars {
		if globalNames[v.Name] {
			continue // shadowed by the authoritative global runtime var
		}
		out = append(out, v)
	}
	return append(out, globalPromptVars...)
}

// validateTemplate parses the template and rejects any {{.Var}} not in the catalog.
// Returns "" if valid, otherwise an error message.
func validateTemplate(tmpl string, catalog []db.PromptVar) string {
	t, err := template.New("p").Option("missingkey=error").Parse(tmpl)
	if err != nil {
		return "template syntax error: " + err.Error()
	}
	allowed := map[string]bool{}
	for _, v := range catalog {
		allowed[v.Name] = true
	}
	for _, name := range templateFields(t) {
		if !allowed[name] {
			return "variable {{." + name + "}} is not in this agent's allowlist"
		}
	}
	return ""
}

// renderPrompt renders with example values (catalog example overridden by sample).
func renderPrompt(tmpl string, catalog []db.PromptVar, sample map[string]string) (string, error) {
	t, err := template.New("p").Option("missingkey=error").Parse(tmpl)
	if err != nil {
		return "", err
	}
	data := map[string]any{}
	for _, v := range catalog {
		data[v.Name] = v.Example
	}
	for k, val := range sample {
		data[k] = val
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// templateFields returns the distinct top-level {{.X}} field names referenced by
// the template (used to validate against the catalog whitelist).
func templateFields(t *template.Template) []string {
	seen := map[string]bool{}
	var out []string
	collect := func(p *parse.PipeNode) {
		if p == nil {
			return
		}
		for _, cmd := range p.Cmds {
			for _, arg := range cmd.Args {
				if f, ok := arg.(*parse.FieldNode); ok && len(f.Ident) > 0 && !seen[f.Ident[0]] {
					seen[f.Ident[0]] = true
					out = append(out, f.Ident[0])
				}
			}
		}
	}
	var walk func(n parse.Node)
	walk = func(n parse.Node) {
		switch x := n.(type) {
		case *parse.ListNode:
			if x == nil {
				return
			}
			for _, c := range x.Nodes {
				walk(c)
			}
		case *parse.ActionNode:
			collect(x.Pipe)
		case *parse.IfNode:
			collect(x.Pipe)
			walk(x.List)
			walk(x.ElseList)
		case *parse.RangeNode:
			collect(x.Pipe)
			walk(x.List)
			walk(x.ElseList)
		case *parse.WithNode:
			collect(x.Pipe)
			walk(x.List)
			walk(x.ElseList)
		}
	}
	if t.Tree != nil {
		walk(t.Tree.Root)
	}
	return out
}
