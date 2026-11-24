package traffic

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Autumn-27/artex/traffic/hookvm"
	"github.com/Autumn-27/artex/traffic/rewrite"
)

// Opt-in kill switch for constrained Go tampering hooks (P4.2).
// Off by default: when unset/false, zero hooks are loaded and the proxy
// follows the unchanged baseline path.
const (
	TamperHooksEnabledEnv   = "ARTEX_TAMPER_HOOKS_ENABLED"
	DefaultHookTimeout      = 25 * time.Millisecond
	DefaultPhaseHookTimeout = 100 * time.Millisecond
)

// TamperHooksEnabledFromEnv reports whether ARTEX_TAMPER_HOOKS_ENABLED is truthy.
func TamperHooksEnabledFromEnv() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(TamperHooksEnabledEnv))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// HookDef is the input model compiled into a HookSet.
type HookDef struct {
	ID           int64
	Name         string
	Enabled      bool
	Phase        rewrite.Phase
	Priority     int
	Matchers     rewrite.Matchers
	Source       string
	SourceSHA256 string
	Version      int
	Note         string
}

type compiledHook struct {
	id       int64
	name     string
	phase    rewrite.Phase
	priority int
	version  int
	snapshot string
	matchers *rewrite.CompiledMatchers
	prog     *hookvm.Program
}

type hookErrorTable struct {
	mu   sync.Mutex
	errs map[int64]rewrite.LastError
}

func (t *hookErrorTable) record(id int64, class string) {
	if t == nil || id == 0 {
		return
	}
	t.mu.Lock()
	if t.errs == nil {
		t.errs = map[int64]rewrite.LastError{}
	}
	cur := t.errs[id]
	cur.Class = class
	cur.At = time.Now().UTC()
	cur.Count++
	t.errs[id] = cur
	t.mu.Unlock()
}

func (t *hookErrorTable) get(id int64) *rewrite.LastError {
	if t == nil {
		return nil
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if cur, ok := t.errs[id]; ok {
		cp := cur
		return &cp
	}
	return nil
}

// HookSet is an immutable compiled snapshot of enabled tampering hooks.
type HookSet struct {
	req      []*compiledHook
	resp     []*compiledHook
	traceKey []byte
	errors   *hookErrorTable
	// hookTimeout and phaseTimeout are overridable in tests.
	hookTimeout  time.Duration
	phaseTimeout time.Duration
	maxSteps     int
	maxMemory    int64
}

// ValidateHookDef validates metadata, matchers, and Go-subset AST for one hook.
func ValidateHookDef(def HookDef) error {
	_, err := compileHookDef(def)
	return err
}

func compileHookDef(def HookDef) (*compiledHook, error) {
	if strings.TrimSpace(def.Name) == "" {
		return nil, errors.New("name cannot be empty")
	}
	if def.Phase != rewrite.PhaseRequest && def.Phase != rewrite.PhaseResponse {
		return nil, errors.New("phase must be request or response")
	}
	cm, err := rewrite.CompileMatchers(def.Phase, def.Matchers)
	if err != nil {
		return nil, fmt.Errorf("matchers: %w", err)
	}
	prog, err := hookvm.Compile(string(def.Phase), def.Source)
	if err != nil {
		return nil, err
	}
	sha := def.SourceSHA256
	if sha == "" {
		sha = rewrite.SHA256Hex([]byte(def.Source))
	}
	ver := def.Version
	if ver <= 0 {
		ver = 1
	}
	snap, _ := json.Marshal(map[string]any{
		"kind":    rewrite.SourceKindHook,
		"id":      def.ID,
		"name":    def.Name,
		"version": ver,
		"sha256":  sha,
	})
	return &compiledHook{
		id: def.ID, name: def.Name, phase: def.Phase, priority: def.Priority,
		version: ver, snapshot: string(snap), matchers: cm, prog: prog,
	}, nil
}

// CompileHooks compiles enabled hooks in (priority ASC, id ASC) order. Invalid
// enabled hooks are omitted and reported in loadErrors.
func CompileHooks(defs []HookDef, traceKey []byte) (*HookSet, map[int64]string) {
	sorted := append([]HookDef(nil), defs...)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Priority != sorted[j].Priority {
			return sorted[i].Priority < sorted[j].Priority
		}
		return sorted[i].ID < sorted[j].ID
	})
	hs := &HookSet{
		traceKey:     append([]byte(nil), traceKey...),
		errors:       &hookErrorTable{},
		hookTimeout:  DefaultHookTimeout,
		phaseTimeout: DefaultPhaseHookTimeout,
		maxSteps:     hookvm.DefaultMaxSteps,
		maxMemory:    hookvm.DefaultMaxMemory,
	}
	loadErrors := map[int64]string{}
	for _, d := range sorted {
		if !d.Enabled {
			continue
		}
		ch, err := compileHookDef(d)
		if err != nil {
			loadErrors[d.ID] = err.Error()
			continue
		}
		if ch.phase == rewrite.PhaseRequest {
			hs.req = append(hs.req, ch)
		} else {
			hs.resp = append(hs.resp, ch)
		}
	}
	return hs, loadErrors
}

// Len returns the number of compiled hooks for phase. Safe on nil receiver.
func (s *HookSet) Len(phase rewrite.Phase) int {
	if s == nil {
		return 0
	}
	if phase == rewrite.PhaseRequest {
		return len(s.req)
	}
	return len(s.resp)
}

// LastError returns the most recent runtime error recorded for hook id.
func (s *HookSet) LastError(id int64) *rewrite.LastError {
	if s == nil {
		return nil
	}
	return s.errors.get(id)
}

// DryRunHook compiles and executes a single hook (regardless of Enabled) on a
// copy of in without affecting live traffic.
func DryRunHook(def HookDef, in rewrite.Input, traceKey []byte) (rewrite.Result, error) {
	ch, err := compileHookDef(def)
	if err != nil {
		return rewrite.Result{}, err
	}
	hs := &HookSet{
		traceKey:     append([]byte(nil), traceKey...),
		errors:       &hookErrorTable{},
		hookTimeout:  DefaultHookTimeout,
		phaseTimeout: DefaultPhaseHookTimeout,
		maxSteps:     hookvm.DefaultMaxSteps,
		maxMemory:    hookvm.DefaultMaxMemory,
	}
	if ch.phase == rewrite.PhaseRequest {
		hs.req = []*compiledHook{ch}
	} else {
		hs.resp = []*compiledHook{ch}
	}
	return hs.Apply(ch.phase, in, nil), nil
}

// Apply runs all compiled hooks for phase in order, failing open per hook and
// preserving tainted-field HMAC masking from earlier rewrite rules.
func (s *HookSet) Apply(phase rewrite.Phase, in rewrite.Input, tainted map[string]bool) rewrite.Result {
	res := rewrite.Result{Request: in.Request, Response: in.Response}
	if s.Len(phase) == 0 {
		return res
	}
	hooks := s.req
	if phase == rewrite.PhaseResponse {
		hooks = s.resp
	}
	curReq, curResp := in.Request, in.Response
	if curReq.URL == nil {
		curReq.URL = &url.URL{}
	}
	upgrade := len(in.Request.Header.Values("Upgrade")) > 0

	phaseBudget := s.phaseTimeout
	if phaseBudget <= 0 {
		phaseBudget = DefaultPhaseHookTimeout
	}
	phaseDeadline := time.Now().Add(phaseBudget)

	var lines []rewrite.TraceLine
	changed := false
	for _, h := range hooks {
		if !h.matchers.MatchHead(curReq, curResp) {
			continue
		}
		if upgrade {
			lines = append(lines, hookTraceSkip(h, phase, rewrite.ReasonStream))
			continue
		}
		if reason := hookBodyIneligible(phase, in, curReq, curResp); reason != "" {
			lines = append(lines, hookTraceSkip(h, phase, reason))
			continue
		}
		if !h.matchers.MatchBody(curReq, curResp) {
			continue
		}

		remaining := time.Until(phaseDeadline)
		if remaining <= 0 {
			s.errors.record(h.id, "timeout")
			lines = append(lines, hookTraceError(h, phase, "timeout"))
			continue
		}
		timeout := s.hookTimeout
		if timeout <= 0 {
			timeout = DefaultHookTimeout
		}
		if remaining < timeout {
			timeout = remaining
		}

		nextReq, nextResp, hLines, errClass := s.runOne(h, phase, curReq, curResp, tainted, timeout)
		if errClass != "" {
			s.errors.record(h.id, errClass)
			lines = append(lines, hookTraceError(h, phase, errClass))
			continue
		}
		if len(hLines) > 0 {
			curReq, curResp, changed = nextReq, nextResp, true
			lines = append(lines, hLines...)
		}
	}

	res.Lines = lines
	if changed {
		res.Changed, res.Request, res.Response = true, curReq, curResp
	}
	return res
}

func hookBodyIneligible(phase rewrite.Phase, in rewrite.Input, req rewrite.Request, resp rewrite.Response) string {
	isBin := in.IsBinary
	if isBin == nil {
		isBin = func(_ string, b []byte) bool { return bytes.IndexByte(b[:min(len(b), 512)], 0) >= 0 }
	}
	check := func(h http.Header, body []byte) string {
		if len(body) > rewrite.MaxBodySize {
			return rewrite.ReasonBodyTooLarge
		}
		if ce := strings.TrimSpace(h.Get("Content-Encoding")); ce != "" && !strings.EqualFold(ce, "identity") {
			return rewrite.ReasonContentEncoding
		}
		if isBin(h.Get("Content-Type"), body) {
			return rewrite.ReasonBinary
		}
		return ""
	}
	if phase == rewrite.PhaseRequest {
		return check(req.Header, req.Body)
	}
	if in.Stream {
		return rewrite.ReasonStream
	}
	if req.Method == http.MethodHead || !rewrite.BodyAllowedForStatus(resp.Status) {
		return rewrite.ReasonNoBodyAllowed
	}
	return check(resp.Header, resp.Body)
}

func (s *HookSet) runOne(h *compiledHook, phase rewrite.Phase, req rewrite.Request, resp rewrite.Response, tainted map[string]bool, timeout time.Duration) (rewrite.Request, rewrite.Response, []rewrite.TraceLine, string) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	vmReq := &hookvm.Request{
		Scheme:   req.URL.Scheme,
		Host:     req.URL.Hostname(),
		Port:     req.URL.Port(),
		Method:   req.Method,
		Path:     req.URL.Path,
		RawQuery: req.URL.RawQuery,
		Headers:  cloneHeaderMap(req.Header),
		Body:     append([]byte(nil), req.Body...),
	}
	if vmReq.Path == "" {
		vmReq.Path = "/"
	}
	opts := hookvm.RunOptions{MaxSteps: s.maxSteps, MaxMemory: s.maxMemory}

	if phase == rewrite.PhaseRequest {
		if err := h.prog.RunRequest(ctx, vmReq, opts); err != nil {
			return req, resp, nil, classifyHookErr(err)
		}
		return s.commitRequest(h, req, resp, vmReq, tainted)
	}

	vmResp := &hookvm.Response{
		Status:  resp.Status,
		Headers: cloneHeaderMap(resp.Header),
		Body:    append([]byte(nil), resp.Body...),
	}
	if err := h.prog.RunResponse(ctx, vmReq, vmResp, opts); err != nil {
		return req, resp, nil, classifyHookErr(err)
	}
	return s.commitResponse(h, req, resp, vmResp, tainted)
}

func (s *HookSet) commitRequest(h *compiledHook, origReq rewrite.Request, origResp rewrite.Response, vmReq *hookvm.Request, tainted map[string]bool) (rewrite.Request, rewrite.Response, []rewrite.TraceLine, string) {
	nextReq := origReq
	nextReq.Header = origReq.Header.Clone()
	if nextReq.Header == nil {
		nextReq.Header = http.Header{}
	}
	var lines []rewrite.TraceLine
	emit := func(field string, before, after []byte) {
		lines = append(lines, s.makeAppliedLine(h, rewrite.PhaseRequest, len(lines) == 0, field, before, after, tainted[field]))
	}

	// 1. Method
	if vmReq.Method != origReq.Method {
		if !rewrite.ValidToken(vmReq.Method) || strings.EqualFold(vmReq.Method, http.MethodConnect) {
			return origReq, origResp, nil, "forbidden_method"
		}
		nextReq.Method = vmReq.Method
		emit("method", []byte(origReq.Method), []byte(vmReq.Method))
	}

	// 2. Path & RawQuery (never Scheme/Host/Port)
	origURI := origReq.URL.RequestURI()
	wantURI := vmReq.Path
	if vmReq.RawQuery != "" {
		wantURI += "?" + vmReq.RawQuery
	}
	if wantURI != origURI {
		u, ok := rewrite.ParsePathQuery(wantURI)
		if !ok {
			return origReq, origResp, nil, rewrite.ErrClassInvalidURL
		}
		cp := *origReq.URL
		cp.Path, cp.RawPath, cp.RawQuery = u.Path, u.RawPath, u.RawQuery
		nextReq.URL = &cp
		emit("url", []byte(origURI), []byte(cp.RequestURI()))
	}

	// 3. Headers (diffed & validated atomically)
	hdrLines, errClass := s.diffAndValidateHeaders(h, rewrite.PhaseRequest, origReq.Header, vmReq.Headers, nextReq.Header, tainted, len(lines) == 0)
	if errClass != "" {
		return origReq, origResp, nil, errClass
	}
	lines = append(lines, hdrLines...)

	// 4. Body
	if !bytes.Equal(vmReq.Body, origReq.Body) {
		if len(vmReq.Body) > rewrite.MaxBodySize {
			return origReq, origResp, nil, "body_too_large"
		}
		nextReq.Body = append([]byte(nil), vmReq.Body...)
		for _, hdr := range rewrite.BodyDependentHeaders() {
			nextReq.Header.Del(hdr)
		}
		emit("body", origReq.Body, nextReq.Body)
	}

	return nextReq, origResp, lines, ""
}

func (s *HookSet) commitResponse(h *compiledHook, origReq rewrite.Request, origResp rewrite.Response, vmResp *hookvm.Response, tainted map[string]bool) (rewrite.Request, rewrite.Response, []rewrite.TraceLine, string) {
	nextResp := origResp
	nextResp.Header = origResp.Header.Clone()
	if nextResp.Header == nil {
		nextResp.Header = http.Header{}
	}
	var lines []rewrite.TraceLine
	emit := func(field string, before, after []byte) {
		lines = append(lines, s.makeAppliedLine(h, rewrite.PhaseResponse, len(lines) == 0, field, before, after, tainted[field]))
	}

	// 1. Headers
	hdrLines, errClass := s.diffAndValidateHeaders(h, rewrite.PhaseResponse, origResp.Header, vmResp.Headers, nextResp.Header, tainted, len(lines) == 0)
	if errClass != "" {
		return origReq, origResp, nil, errClass
	}
	lines = append(lines, hdrLines...)

	// 2. Body
	if !bytes.Equal(vmResp.Body, origResp.Body) {
		if len(vmResp.Body) > rewrite.MaxBodySize {
			return origReq, origResp, nil, "body_too_large"
		}
		nextResp.Body = append([]byte(nil), vmResp.Body...)
		for _, hdr := range rewrite.BodyDependentHeaders() {
			nextResp.Header.Del(hdr)
		}
		emit("body", origResp.Body, nextResp.Body)
	}

	// 3. Status
	if vmResp.Status != origResp.Status {
		if vmResp.Status < 200 || vmResp.Status > 599 || !rewrite.BodyAllowedForStatus(vmResp.Status) {
			return origReq, origResp, nil, "invalid_status"
		}
		nextResp.Status = vmResp.Status
		emit("status", []byte(strconv.Itoa(origResp.Status)), []byte(strconv.Itoa(vmResp.Status)))
	}

	return origReq, nextResp, lines, ""
}

func (s *HookSet) diffAndValidateHeaders(h *compiledHook, phase rewrite.Phase, orig http.Header, mutated map[string][]string, dst http.Header, tainted map[string]bool, firstLine bool) ([]rewrite.TraceLine, string) {
	// Canonicalize mutated headers so case variants merge cleanly.
	canonMut := http.Header{}
	for k, vs := range mutated {
		ck := http.CanonicalHeaderKey(k)
		canonMut[ck] = append(canonMut[ck], vs...)
	}
	allKeys := map[string]bool{}
	for k := range orig {
		allKeys[http.CanonicalHeaderKey(k)] = true
	}
	for k := range canonMut {
		allKeys[k] = true
	}
	sortedKeys := make([]string, 0, len(allKeys))
	for k := range allKeys {
		sortedKeys = append(sortedKeys, k)
	}
	sort.Strings(sortedKeys)

	var lines []rewrite.TraceLine
	for _, k := range sortedKeys {
		oldVals := orig.Values(k)
		newVals := canonMut.Values(k)
		if slices.Equal(oldVals, newVals) {
			continue
		}
		// Forbidden header / replay nonce / Connection-listed header check.
		ck, err := rewrite.ValidateHeaderTarget(k)
		if err != nil || strings.EqualFold(ck, replayNonceHeader) || rewrite.HasConnectionHeader(orig, ck) {
			return nil, "forbidden_header"
		}
		for _, v := range newVals {
			if err := rewrite.ValidateHeaderValue(v); err != nil {
				return nil, "invalid_header"
			}
		}
		if len(newVals) == 0 {
			dst.Del(ck)
		} else {
			dst[ck] = append([]string(nil), newVals...)
		}
		field := "header:" + ck
		before := []byte(strings.Join(oldVals, "\n"))
		after := []byte(strings.Join(newVals, "\n"))
		lines = append(lines, s.makeAppliedLine(h, phase, firstLine && len(lines) == 0, field, before, after, tainted[field]))
	}
	return lines, ""
}

func (s *HookSet) makeAppliedLine(h *compiledHook, phase rewrite.Phase, includeSnap bool, field string, before, after []byte, masked bool) rewrite.TraceLine {
	l := rewrite.TraceLine{
		Phase:       phase,
		SourceKind:  rewrite.SourceKindHook,
		HookID:      h.id,
		HookVersion: h.version,
		Action:      "hook",
		Field:       field,
		Outcome:     rewrite.OutcomeApplied,
	}
	if includeSnap {
		l.RuleSnapshot = h.snapshot
	}
	if masked {
		l.BeforeHash = rewrite.Fingerprint(s.traceKey, before)
		l.AfterHash = rewrite.Fingerprint(s.traceKey, after)
		l.After = nil
	} else {
		l.BeforeHash = rewrite.SHA256Hex(before)
		l.AfterHash = rewrite.SHA256Hex(after)
		l.After = append([]byte(nil), after...)
	}
	return l
}

func hookTraceSkip(h *compiledHook, phase rewrite.Phase, reason string) rewrite.TraceLine {
	return rewrite.TraceLine{
		Phase:        phase,
		SourceKind:   rewrite.SourceKindHook,
		HookID:       h.id,
		HookVersion:  h.version,
		RuleSnapshot: h.snapshot,
		Action:       "hook",
		Outcome:      rewrite.OutcomeSkipped,
		Reason:       reason,
	}
}

func hookTraceError(h *compiledHook, phase rewrite.Phase, class string) rewrite.TraceLine {
	return rewrite.TraceLine{
		Phase:        phase,
		SourceKind:   rewrite.SourceKindHook,
		HookID:       h.id,
		HookVersion:  h.version,
		RuleSnapshot: h.snapshot,
		Action:       "hook",
		Outcome:      rewrite.OutcomeError,
		Reason:       class,
	}
}

func classifyHookErr(err error) string {
	var pe *hookvm.PanicError
	switch {
	case errors.As(err, &pe):
		return rewrite.ErrClassPanic
	case errors.Is(err, hookvm.ErrTimeout):
		return "timeout"
	case errors.Is(err, hookvm.ErrStepLimit):
		return "step_limit"
	case errors.Is(err, hookvm.ErrMemoryLimit):
		return "memory_limit"
	case errors.Is(err, hookvm.ErrForbiddenMutation):
		return "forbidden_mutation"
	case errors.Is(err, hookvm.ErrCallDepth):
		return "call_depth"
	default:
		return "hook_error"
	}
}

func cloneHeaderMap(h http.Header) map[string][]string {
	out := make(map[string][]string, len(h))
	for k, vs := range h {
		out[http.CanonicalHeaderKey(k)] = append([]string(nil), vs...)
	}
	return out
}
