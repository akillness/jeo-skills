// Package rewrite is the engine of the capture proxy's rewrite rules: the rule
// model, its validation, an immutable compiled snapshot, and the transformation
// of one request or one response. It depends on neither the proxy, the traffic
// index nor the database.
//
// Rules fail open and are not a security control: a rule that errors leaves the
// message as it was.
package rewrite

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Limits. The save-time ones make Validate fail; the run-time ones skip the
// rule or fail it open.
const (
	MaxBodySize    = 1 << 20 // run time: a larger body skips every rule that reads or rewrites it
	MaxPatternSize = 1 << 10 // save time: a regex
	MaxValueSize   = 1 << 20 // save time: a set value or a replacement template
	MaxExpansion   = 1 << 20 // run time: the result of a replace action

	snapshotValueMax = 4 << 10 // rule_snapshot: a longer action value is summarized
)

// Phase is where a rule runs.
type Phase string

const (
	PhaseRequest  Phase = "request"
	PhaseResponse Phase = "response"
)

// Action types.
const (
	ActionSetMethod     = "set_method"     // request
	ActionSetPathQuery  = "set_path_query" // request
	ActionReplaceURL    = "replace_url"    // request; path and query only
	ActionDeleteHeader  = "delete_header"
	ActionSetHeader     = "set_header"
	ActionReplaceHeader = "replace_header"
	ActionSetBody       = "set_body"
	ActionReplaceBody   = "replace_body"
	ActionSetStatus     = "set_status" // response
)

// HeaderMatcher matches a header by name. An empty ValueRegex tests presence;
// otherwise one value of the header must match.
type HeaderMatcher struct {
	Name       string `json:"name"`
	ValueRegex string `json:"value_regex,omitempty"`
}

// Matchers are combined with AND; an absent matcher is true. In the response
// phase the request matchers see the request as it was sent to the target.
type Matchers struct {
	Methods       []string        `json:"methods,omitempty"`         // case-insensitive
	Host          string          `json:"host,omitempty"`            // host name without port: exact, or "*.suffix"
	URLRegex      string          `json:"url_regex,omitempty"`       // on URL.RequestURI()
	Headers       []HeaderMatcher `json:"headers,omitempty"`         // request headers
	BodyRegex     string          `json:"body_regex,omitempty"`      // request body
	Status        []string        `json:"status,omitempty"`          // response: "404" or "4xx", any of
	RespHeaders   []HeaderMatcher `json:"resp_headers,omitempty"`    // response
	RespBodyRegex string          `json:"resp_body_regex,omitempty"` // response
}

// Action is one step of a rule. Value is the new value (set_*) or the
// replacement template (replace_*, regexp.Expand syntax: $1, ${name}).
// Sensitive keeps Value out of the API, the trace and the rule snapshot.
type Action struct {
	Type      string `json:"type"`
	Name      string `json:"name,omitempty"`  // header actions
	Regex     string `json:"regex,omitempty"` // replace_* actions
	Value     string `json:"value,omitempty"`
	Sensitive bool   `json:"sensitive,omitempty"`
}

// Rule is one rewrite rule. Within a rule the actions run in a fixed order:
// method and URL, delete_header, set_header and replace_header, body, status.
type Rule struct {
	ID       int64    `json:"id"`
	Name     string   `json:"name"`
	Enabled  bool     `json:"enabled"`
	Phase    Phase    `json:"phase"`
	Priority int      `json:"priority"`
	Matchers Matchers `json:"matchers"`
	Actions  []Action `json:"actions"`
	Note     string   `json:"note"`
}

// Validate reports the first reason a rule cannot be saved. The message never
// contains an action value.
func Validate(r Rule) error {
	_, err := compileRule(r)
	return err
}

type headerMatcher struct {
	name string // canonical
	re   *regexp.Regexp
}

type statusRange struct{ lo, hi int } // lo <= status < hi

type compiledAction struct {
	typ       string
	name      string // canonical header name
	re        *regexp.Regexp
	value     string
	status    int
	sensitive bool
}

type compiledRule struct {
	id       int64
	phase    Phase
	snapshot string // rule_snapshot JSON

	methods     map[string]bool // upper case
	host        string          // lower case; with hostGlob, the suffix including its leading dot
	hostGlob    bool
	urlRe       *regexp.Regexp
	headers     []headerMatcher
	bodyRe      *regexp.Regexp
	status      []statusRange
	respHeaders []headerMatcher
	respBodyRe  *regexp.Regexp

	actions []compiledAction // in execution order
	// reqBody and respBody report that the rule reads or rewrites that body.
	reqBody, respBody bool
}

func compileRule(r Rule) (*compiledRule, error) {
	if strings.TrimSpace(r.Name) == "" {
		return nil, errors.New("name cannot be empty")
	}
	if r.Phase != PhaseRequest && r.Phase != PhaseResponse {
		return nil, errors.New("phase must be request or response")
	}
	c := &compiledRule{id: r.ID, phase: r.Phase}
	if err := c.compileMatchers(r.Matchers); err != nil {
		return nil, err
	}
	if len(r.Actions) == 0 {
		return nil, errors.New("a rule needs at least one action")
	}
	bodyAction := false
	for i, a := range r.Actions {
		ca, err := compileAction(r.Phase, a)
		if err != nil {
			return nil, fmt.Errorf("action %d (%s): %w", i+1, a.Type, err)
		}
		bodyAction = bodyAction || actionClass(ca.typ) == classBody
		c.actions = append(c.actions, ca)
	}
	sort.SliceStable(c.actions, func(i, j int) bool { return actionClass(c.actions[i].typ) < actionClass(c.actions[j].typ) })
	if r.Phase == PhaseRequest {
		c.reqBody = c.bodyRe != nil || bodyAction
	} else {
		c.reqBody = c.bodyRe != nil
		c.respBody = c.respBodyRe != nil || bodyAction
	}
	c.snapshot = ruleSnapshot(r)
	return c, nil
}

// Execution classes, in order.
const (
	classTarget = iota // method and URL
	classDeleteHeader
	classHeader
	classBody
	classStatus
)

func actionClass(typ string) int {
	switch typ {
	case ActionSetMethod, ActionSetPathQuery, ActionReplaceURL:
		return classTarget
	case ActionDeleteHeader:
		return classDeleteHeader
	case ActionSetHeader, ActionReplaceHeader:
		return classHeader
	case ActionSetBody, ActionReplaceBody:
		return classBody
	}
	return classStatus
}

func (c *compiledRule) compileMatchers(m Matchers) (err error) {
	if c.phase == PhaseRequest && (len(m.Status) > 0 || len(m.RespHeaders) > 0 || m.RespBodyRegex != "") {
		return errors.New("status, resp_headers and resp_body_regex are response-phase matchers")
	}
	if len(m.Methods) > 0 {
		c.methods = map[string]bool{}
		for _, method := range m.Methods {
			if !validToken(method) {
				return errors.New("methods: invalid method")
			}
			c.methods[strings.ToUpper(method)] = true
		}
	}
	if m.Host != "" {
		if c.host, c.hostGlob, err = compileHost(m.Host); err != nil {
			return err
		}
	}
	if c.urlRe, err = compilePattern("url_regex", m.URLRegex); err != nil {
		return err
	}
	if c.headers, err = compileHeaderMatchers("headers", m.Headers); err != nil {
		return err
	}
	if c.bodyRe, err = compilePattern("body_regex", m.BodyRegex); err != nil {
		return err
	}
	for _, s := range m.Status {
		sr, ok := parseStatus(s)
		if !ok {
			return fmt.Errorf("status: %q is neither a code (404) nor a class (4xx)", s)
		}
		c.status = append(c.status, sr)
	}
	if c.respHeaders, err = compileHeaderMatchers("resp_headers", m.RespHeaders); err != nil {
		return err
	}
	c.respBodyRe, err = compilePattern("resp_body_regex", m.RespBodyRegex)
	return err
}

// compileHost accepts an exact host name or a suffix glob "*.example.com",
// which does not match example.com itself. No other wildcard, no port.
func compileHost(h string) (host string, glob bool, err error) {
	h = strings.ToLower(strings.TrimSpace(h))
	if strings.HasPrefix(h, "*.") {
		h, glob = h[1:], true // keep the leading dot
	}
	bare := strings.TrimPrefix(h, ".")
	if bare == "" || strings.ContainsAny(h, "*/ \t") {
		return "", false, errors.New("host: use an exact host name or a suffix glob such as *.example.com")
	}
	if _, _, perr := net.SplitHostPort(h); perr == nil {
		return "", false, errors.New("host: a host name without port is expected")
	}
	return h, glob, nil
}

func compilePattern(field, expr string) (*regexp.Regexp, error) {
	if expr == "" {
		return nil, nil
	}
	if len(expr) > MaxPatternSize {
		return nil, fmt.Errorf("%s: pattern longer than %d bytes", field, MaxPatternSize)
	}
	re, err := regexp.Compile(expr)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", field, err)
	}
	return re, nil
}

func compileHeaderMatchers(field string, in []HeaderMatcher) ([]headerMatcher, error) {
	var out []headerMatcher
	for _, h := range in {
		if !validToken(h.Name) {
			return nil, fmt.Errorf("%s: invalid header name", field)
		}
		re, err := compilePattern(field, h.ValueRegex)
		if err != nil {
			return nil, err
		}
		out = append(out, headerMatcher{http.CanonicalHeaderKey(h.Name), re})
	}
	return out, nil
}

// parseStatus reads a code ("404") or a class ("4xx"), the syntax of the
// traffic list's status filter.
func parseStatus(s string) (statusRange, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) != 3 || s[0] < '1' || s[0] > '5' {
		return statusRange{}, false
	}
	if s[1:] == "xx" {
		lo := int(s[0]-'0') * 100
		return statusRange{lo, lo + 100}, true
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return statusRange{}, false
	}
	return statusRange{n, n + 1}, true
}

func compileAction(phase Phase, a Action) (compiledAction, error) {
	ca := compiledAction{typ: a.Type, value: a.Value, sensitive: a.Sensitive}
	if len(a.Value) > MaxValueSize {
		return ca, fmt.Errorf("value longer than %d bytes", MaxValueSize)
	}
	var err error
	switch a.Type {
	case ActionSetMethod, ActionSetPathQuery, ActionReplaceURL:
		if phase != PhaseRequest {
			return ca, errors.New("request-phase action")
		}
	case ActionSetStatus:
		if phase != PhaseResponse {
			return ca, errors.New("response-phase action")
		}
	}
	switch a.Type {
	case ActionSetMethod:
		if !validToken(a.Value) || strings.EqualFold(a.Value, http.MethodConnect) {
			return ca, errors.New("value must be an HTTP method other than CONNECT")
		}
	case ActionSetPathQuery:
		if _, ok := parsePathQuery(a.Value); !ok {
			return ca, errors.New("value must start with / and be a valid request URI")
		}
	case ActionReplaceURL, ActionReplaceBody:
		ca.re, err = requiredPattern(a.Regex)
	case ActionDeleteHeader:
		ca.name, err = headerTarget(a.Name)
	case ActionSetHeader:
		if ca.name, err = headerTarget(a.Name); err == nil {
			err = headerValue(a.Value)
		}
	case ActionReplaceHeader:
		if ca.name, err = headerTarget(a.Name); err == nil {
			if ca.re, err = requiredPattern(a.Regex); err == nil {
				err = headerValue(a.Value)
			}
		}
	case ActionSetBody:
	case ActionSetStatus:
		// 1xx, 204 and 304 carry no body (net/http bodyAllowedForStatus).
		n, serr := strconv.Atoi(a.Value)
		if serr != nil || n < 200 || n > 599 || !bodyAllowedForStatus(n) {
			return ca, errors.New("value must be a status from 200 to 599, except 204 and 304")
		}
		ca.status = n
	default:
		return ca, errors.New("unknown action type")
	}
	return ca, err
}

func requiredPattern(expr string) (*regexp.Regexp, error) {
	if expr == "" {
		return nil, errors.New("regex cannot be empty")
	}
	return compilePattern("regex", expr)
}

// headerTarget refuses the headers a rule must not write: the framing and
// destination ones net/http owns, and the hop-by-hop ones.
func headerTarget(name string) (string, error) {
	if !validToken(name) {
		return "", errors.New("invalid header name")
	}
	c := http.CanonicalHeaderKey(name)
	switch c {
	case "Host", "Content-Length", "Transfer-Encoding", "Connection", "Keep-Alive", "Te", "Trailer", "Expect", "Upgrade":
		return "", fmt.Errorf("header %s cannot be rewritten", c)
	}
	if strings.HasPrefix(c, "Proxy-") {
		return "", fmt.Errorf("header %s cannot be rewritten", c)
	}
	return c, nil
}

func headerValue(v string) error {
	if strings.ContainsAny(v, "\r\n\x00") {
		return errors.New("value contains a line break or a NUL byte")
	}
	return nil
}

// validToken reports whether s is an RFC 9110 token (a header name, a method).
func validToken(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case strings.IndexByte("!#$%&'*+-.^_`|~", c) >= 0:
		default:
			return false
		}
	}
	return true
}

// parsePathQuery parses a path and query. Only those two parts of a URL are
// ever rewritten, so a rule cannot change the scheme, the host or the port.
func parsePathQuery(s string) (*url.URL, bool) {
	if !strings.HasPrefix(s, "/") {
		return nil, false
	}
	u, err := url.ParseRequestURI(s)
	return u, err == nil
}

// bodyAllowedForStatus is net/http's unexported rule: 1xx, 204 and 304
// responses carry no body.
func bodyAllowedForStatus(status int) bool {
	return !(status >= 100 && status <= 199) && status != 204 && status != 304
}
