package rewrite

import (
	"bytes"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// Request is the request side of an exchange.
type Request struct {
	Method string
	URL    *url.URL
	Header http.Header
	Body   []byte
}

// Response is the response side of an exchange.
type Response struct {
	Status int
	Header http.Header
	Body   []byte
}

// Input is what one phase reads. The request phase rewrites Request. The
// response phase rewrites Response and reads Request, which must then be the
// request as it was sent to the target.
type Input struct {
	Request  Request
	Response Response
	// Stream marks a response whose body is not in memory (SSE): rules that
	// read or rewrite the response body are skipped, the others apply.
	Stream bool
	// IsBinary reports a body that must not be rewritten. Nil: a body with a
	// NUL byte in its first 512 bytes is binary.
	IsBinary func(contentType string, body []byte) bool
}

// Result is the outcome of one phase. When Changed is false, Request and
// Response are the input's. When it is true, every rewritten part is a new
// object: the engine never writes to the URL, the headers or the bodies it
// was given.
type Result struct {
	Request  Request
	Response Response
	Changed  bool
	Lines    []TraceLine
	// Tainted lists fields written by a sensitive action in this phase so
	// downstream tampering hooks keep those fields HMAC-masked in the trace.
	Tainted map[string]bool
}

const (
	fieldMethod = "method"
	fieldURL    = "url"
	fieldBody   = "body"
	fieldStatus = "status"
)

// bodyDependentHeaders no longer describe a body once a rule rewrote it.
var bodyDependentHeaders = []string{"Content-Length", "Etag", "Content-Md5", "Content-Encoding"}

type state struct {
	req  Request
	resp Response
}

type run struct {
	set     *Set
	phase   Phase
	in      *Input
	st      state
	tainted map[string]bool // fields a sensitive action wrote
	seen    map[int64]bool  // rules whose snapshot is already on a line
	lines   []TraceLine
	changed bool
}

// Apply runs the rules of one phase as a pipeline: each rule sees the output of
// the previous one. A rule is atomic: when one of its actions fails, or it
// panics, none of them applies and the message goes on unchanged by that rule.
func (s *Set) Apply(phase Phase, in Input) Result {
	res := Result{Request: in.Request, Response: in.Response}
	if s.Len(phase) == 0 {
		return res
	}
	x := &run{set: s, phase: phase, in: &in, st: state{in.Request, in.Response}, tainted: map[string]bool{}, seen: map[int64]bool{}}
	if x.st.req.URL == nil {
		x.st.req.URL = &url.URL{}
	}
	// A protocol upgrade (WebSocket handshake) is never rewritten.
	upgrade := len(in.Request.Header.Values("Upgrade")) > 0
	for _, r := range s.rules(phase) {
		x.applyRule(r, upgrade)
	}
	// The trace keeps the body of the last body action of the phase only.
	last := -1
	for i, l := range x.lines {
		if l.Field == fieldBody && l.Outcome == OutcomeApplied {
			last = i
		}
	}
	for i := range x.lines {
		if x.lines[i].Field == fieldBody && i != last {
			x.lines[i].After = nil
		}
	}
	res.Lines = x.lines
	if len(x.tainted) > 0 {
		res.Tainted = x.tainted
	}
	if x.changed {
		res.Changed, res.Request, res.Response = true, x.st.req, x.st.resp
	}
	return res
}

func (x *run) applyRule(r *compiledRule, upgrade bool) {
	defer func() {
		if recover() != nil {
			x.fail(r, "", "", ErrClassPanic)
		}
	}()
	if !r.matchHead(&x.st) {
		return
	}
	if upgrade {
		x.skip(r, ReasonStream)
		return
	}
	// A rule that cannot read or rewrite a body it needs is skipped whole,
	// its header, URL and status actions included.
	if reason := x.ineligible(r); reason != "" {
		x.skip(r, reason)
		return
	}
	if !r.matchBody(&x.st) {
		return
	}
	if r.writesConnectionHeader(*x.header(&x.st)) {
		x.skip(r, ReasonConnectionHeader)
		return
	}
	w := work{x: x, st: x.st}
	for i := range r.actions {
		a := &r.actions[i]
		if class := w.exec(a); class != "" {
			x.fail(r, a.typ, a.field(), class)
			return
		}
	}
	if len(w.lines) == 0 {
		return
	}
	x.st, x.changed = w.st, true
	for _, f := range w.taint {
		x.tainted[f] = true
	}
	for _, l := range w.lines {
		x.emit(r, l)
	}
}

func (x *run) skip(r *compiledRule, reason string) {
	x.emit(r, TraceLine{Outcome: OutcomeSkipped, Reason: reason})
}

func (x *run) fail(r *compiledRule, action, field, class string) {
	x.set.errors.record(r.id, class)
	x.emit(r, TraceLine{Action: action, Field: field, Outcome: OutcomeError, Reason: class})
}

func (x *run) emit(r *compiledRule, l TraceLine) {
	l.Phase, l.RuleID = x.phase, r.id
	if !x.seen[r.id] {
		x.seen[r.id] = true
		l.RuleSnapshot = r.snapshot
	}
	x.lines = append(x.lines, l)
}

// header and body point at the message the phase rewrites.
func (x *run) header(st *state) *http.Header {
	if x.phase == PhaseRequest {
		return &st.req.Header
	}
	return &st.resp.Header
}

func (x *run) body(st *state) *[]byte {
	if x.phase == PhaseRequest {
		return &st.req.Body
	}
	return &st.resp.Body
}

func (x *run) hash(b []byte, secret bool) string {
	if secret {
		return x.set.fingerprint(b)
	}
	return sha256Hex(b)
}

func (x *run) ineligible(r *compiledRule) string {
	if r.respBody {
		if x.in.Stream {
			return ReasonStream
		}
		if x.st.req.Method == http.MethodHead || !bodyAllowedForStatus(x.st.resp.Status) {
			return ReasonNoBodyAllowed
		}
		if reason := x.bodyIneligible(x.st.resp.Header, x.st.resp.Body); reason != "" {
			return reason
		}
	}
	if r.reqBody {
		return x.bodyIneligible(x.st.req.Header, x.st.req.Body)
	}
	return ""
}

func (x *run) bodyIneligible(h http.Header, body []byte) string {
	if len(body) > MaxBodySize {
		return ReasonBodyTooLarge
	}
	if ce := strings.TrimSpace(h.Get("Content-Encoding")); ce != "" && !strings.EqualFold(ce, "identity") {
		return ReasonContentEncoding
	}
	binary := x.in.IsBinary
	if binary == nil {
		binary = nulInHead
	}
	if binary(h.Get("Content-Type"), body) {
		return ReasonBinary
	}
	return ""
}

func nulInHead(_ string, body []byte) bool {
	return bytes.IndexByte(body[:min(len(body), 512)], 0) >= 0
}

// matchHead evaluates the matchers that need no body, cheapest first.
func (r *compiledRule) matchHead(st *state) bool {
	if r.methods != nil && !r.methods[strings.ToUpper(st.req.Method)] {
		return false
	}
	if r.host != "" {
		h := strings.ToLower(st.req.URL.Hostname())
		if r.hostGlob {
			if len(h) == len(r.host) || !strings.HasSuffix(h, r.host) {
				return false
			}
		} else if h != r.host {
			return false
		}
	}
	if r.status != nil && !slices.ContainsFunc(r.status, func(s statusRange) bool { return st.resp.Status >= s.lo && st.resp.Status < s.hi }) {
		return false
	}
	if !matchHeaders(r.headers, st.req.Header) || !matchHeaders(r.respHeaders, st.resp.Header) {
		return false
	}
	return r.urlRe == nil || r.urlRe.MatchString(st.req.URL.RequestURI())
}

func matchHeaders(ms []headerMatcher, h http.Header) bool {
	for _, m := range ms {
		values := h.Values(m.name)
		if len(values) == 0 {
			return false
		}
		if m.re != nil && !slices.ContainsFunc(values, m.re.MatchString) {
			return false
		}
	}
	return true
}

func (r *compiledRule) matchBody(st *state) bool {
	return (r.bodyRe == nil || r.bodyRe.Match(st.req.Body)) && (r.respBodyRe == nil || r.respBodyRe.Match(st.resp.Body))
}

// writesConnectionHeader reports a header action whose target the message
// lists in Connection: that header is hop-by-hop for this exchange.
func (r *compiledRule) writesConnectionHeader(h http.Header) bool {
	for _, v := range h.Values("Connection") {
		for _, token := range strings.Split(v, ",") {
			name := http.CanonicalHeaderKey(strings.TrimSpace(token))
			if name != "" && slices.ContainsFunc(r.actions, func(a compiledAction) bool { return a.name == name }) {
				return true
			}
		}
	}
	return false
}

func (a *compiledAction) field() string {
	switch actionClass(a.typ) {
	case classTarget:
		if a.typ == ActionSetMethod {
			return fieldMethod
		}
		return fieldURL
	case classDeleteHeader, classHeader:
		return "header:" + a.name
	case classBody:
		return fieldBody
	}
	return fieldStatus
}

// work is the copy one rule writes to; it replaces the run's state only when
// every action succeeded.
type work struct {
	x         *run
	st        state
	ownHeader bool // the header of st is already this rule's copy
	lines     []TraceLine
	taint     []string
}

// exec applies one action to the copy and returns an error class, or "".
// An action that changes nothing leaves no line.
func (w *work) exec(a *compiledAction) string {
	switch a.typ {
	case ActionSetMethod:
		if old := w.st.req.Method; old != a.value {
			w.note(a, []byte(old), true, []byte(a.value), true)
			w.st.req.Method = a.value
		}
	case ActionSetPathQuery, ActionReplaceURL:
		before := w.st.req.URL.RequestURI()
		after := a.value
		if a.typ == ActionReplaceURL {
			out, ok := expandReplace(a.re, []byte(before), a.value)
			if !ok {
				return ErrClassExpansion
			}
			after = string(out)
		}
		if after == before {
			return ""
		}
		pq, ok := parsePathQuery(after) // checked again here: the result depends on the request
		if !ok {
			return ErrClassInvalidURL
		}
		nu := *w.st.req.URL
		nu.Path, nu.RawPath, nu.RawQuery, nu.ForceQuery = pq.Path, pq.RawPath, pq.RawQuery, pq.ForceQuery
		w.note(a, []byte(before), true, []byte(nu.RequestURI()), true)
		w.st.req.URL = &nu
	case ActionDeleteHeader, ActionSetHeader, ActionReplaceHeader:
		old := w.x.header(&w.st).Values(a.name)
		var next []string
		switch a.typ {
		case ActionSetHeader:
			next = []string{a.value}
		case ActionReplaceHeader:
			for _, v := range old {
				out, ok := expandReplace(a.re, []byte(v), a.value)
				if !ok {
					return ErrClassExpansion
				}
				next = append(next, string(out))
			}
		}
		if slices.Equal(old, next) {
			return ""
		}
		w.note(a, []byte(strings.Join(old, "\n")), len(old) > 0, []byte(strings.Join(next, "\n")), len(next) > 0)
		if h := w.header(); len(next) == 0 {
			h.Del(a.name)
		} else {
			h[a.name] = next
		}
	case ActionSetBody, ActionReplaceBody:
		body := w.x.body(&w.st)
		next := []byte(a.value)
		if a.typ == ActionReplaceBody {
			out, ok := expandReplace(a.re, *body, a.value)
			if !ok {
				return ErrClassExpansion
			}
			next = out
		}
		if bytes.Equal(*body, next) {
			return ""
		}
		w.note(a, *body, true, next, true)
		*body = next
		h := w.header()
		for _, name := range bodyDependentHeaders {
			h.Del(name)
		}
	case ActionSetStatus:
		if old := w.st.resp.Status; old != a.status {
			w.note(a, []byte(strconv.Itoa(old)), true, []byte(a.value), true)
			w.st.resp.Status = a.status
		}
	}
	return ""
}

// header returns the rule's own copy of the header it rewrites.
func (w *work) header() http.Header {
	p := w.x.header(&w.st)
	if !w.ownHeader {
		if *p == nil {
			*p = http.Header{}
		} else {
			*p = p.Clone()
		}
		w.ownHeader = true
	}
	return *p
}

// note records an applied action. A sensitive action leaves neither its value
// nor a plain hash of it, and neither does any later action on the same field
// in the phase: the taint follows the field, not the value.
func (w *work) note(a *compiledAction, before []byte, hadBefore bool, after []byte, hasAfter bool) {
	field := a.field()
	tainted := w.x.tainted[field] || slices.Contains(w.taint, field)
	secret := tainted || a.sensitive
	l := TraceLine{Action: a.typ, Field: field, Outcome: OutcomeApplied}
	if hadBefore {
		l.BeforeHash = w.x.hash(before, tainted)
	}
	if hasAfter {
		l.AfterHash = w.x.hash(after, secret)
		if !secret {
			l.After = after
		}
	}
	if a.sensitive && !tainted {
		w.taint = append(w.taint, field)
	}
	w.lines = append(w.lines, l)
}

// expandReplace is regexp.ReplaceAll bounded by MaxExpansion. It returns src
// itself when nothing matches, and never writes to src.
func expandReplace(re *regexp.Regexp, src []byte, template string) ([]byte, bool) {
	matches := re.FindAllSubmatchIndex(src, -1)
	if len(matches) == 0 {
		return src, true
	}
	var dst []byte
	last := 0
	for _, m := range matches {
		dst = append(dst, src[last:m[0]]...)
		dst = re.Expand(dst, []byte(template), src, m)
		last = m[1]
		if len(dst) > MaxExpansion {
			return nil, false
		}
	}
	if dst = append(dst, src[last:]...); len(dst) > MaxExpansion {
		return nil, false
	}
	return dst, true
}
