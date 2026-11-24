package rewrite

import (
	"bytes"
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

var testKey = []byte("0123456789abcdef0123456789abcdef")

func response(status int, header http.Header, body string) Response {
	if header == nil {
		header = http.Header{}
	}
	return Response{Status: status, Header: header, Body: []byte(body)}
}

// outcomes renders the lines as "rule:action:field:outcome:reason".
func outcomes(lines []TraceLine) []string {
	out := make([]string, 0, len(lines))
	for _, l := range lines {
		out = append(out, strings.Join([]string{string(rune('0' + l.RuleID)), l.Action, l.Field, l.Outcome, l.Reason}, ":"))
	}
	return out
}

func wantLines(t *testing.T, got []TraceLine, want ...string) {
	t.Helper()
	if g := outcomes(got); !reflect.DeepEqual(g, append([]string{}, want...)) {
		t.Fatalf("lines:\n got  %q\n want %q", g, want)
	}
}

func TestMatchers(t *testing.T) {
	mark := setHeader("X-Hit", "1")
	req := request("POST", "https://api.example.com:8443/v1/users?id=7", http.Header{"X-Env": {"prod", "eu"}, "Accept": {"*/*"}}, `{"name":"bob"}`)
	resp := response(404, http.Header{"Server": {"nginx/1.25"}}, "not found")
	cases := []struct {
		name  string
		phase Phase
		m     Matchers
		want  bool
	}{
		{"no matcher", PhaseRequest, Matchers{}, true},
		{"method, any case", PhaseRequest, Matchers{Methods: []string{"get", "post"}}, true},
		{"method mismatch", PhaseRequest, Matchers{Methods: []string{"GET"}}, false},
		{"host exact, any case, port ignored", PhaseRequest, Matchers{Host: "API.example.com"}, true},
		{"host mismatch", PhaseRequest, Matchers{Host: "example.com"}, false},
		{"host suffix glob", PhaseRequest, Matchers{Host: "*.example.com"}, true},
		{"host suffix glob needs a dot boundary", PhaseRequest, Matchers{Host: "*.ample.com"}, false},
		{"url regex on path and query", PhaseRequest, Matchers{URLRegex: `^/v1/users\?id=\d+$`}, true},
		{"url regex does not see the host", PhaseRequest, Matchers{URLRegex: `example`}, false},
		{"header presence, any case", PhaseRequest, Matchers{Headers: []HeaderMatcher{{Name: "x-env"}}}, true},
		{"header absent", PhaseRequest, Matchers{Headers: []HeaderMatcher{{Name: "X-None"}}}, false},
		{"header regex on any value", PhaseRequest, Matchers{Headers: []HeaderMatcher{{Name: "X-Env", ValueRegex: "^eu$"}}}, true},
		{"header regex mismatch", PhaseRequest, Matchers{Headers: []HeaderMatcher{{Name: "X-Env", ValueRegex: "^us$"}}}, false},
		{"every header matcher must hold", PhaseRequest, Matchers{Headers: []HeaderMatcher{{Name: "X-Env"}, {Name: "X-None"}}}, false},
		{"body regex", PhaseRequest, Matchers{BodyRegex: `"name":"bob"`}, true},
		{"body regex mismatch", PhaseRequest, Matchers{BodyRegex: `alice`}, false},
		{"matchers are ANDed", PhaseRequest, Matchers{Methods: []string{"POST"}, Host: "other.example"}, false},
		{"status code", PhaseResponse, Matchers{Status: []string{"200", "404"}}, true},
		{"status class", PhaseResponse, Matchers{Status: []string{"4xx"}}, true},
		{"status mismatch", PhaseResponse, Matchers{Status: []string{"5xx", "200"}}, false},
		{"response header", PhaseResponse, Matchers{RespHeaders: []HeaderMatcher{{Name: "server", ValueRegex: "^nginx"}}}, true},
		{"response header mismatch", PhaseResponse, Matchers{RespHeaders: []HeaderMatcher{{Name: "Server", ValueRegex: "apache"}}}, false},
		{"response body regex", PhaseResponse, Matchers{RespBodyRegex: "found$"}, true},
		{"response body regex mismatch", PhaseResponse, Matchers{RespBodyRegex: "^ok"}, false},
		{"request matchers in the response phase", PhaseResponse, Matchers{Methods: []string{"POST"}, Host: "*.example.com", BodyRegex: "bob"}, true},
		{"request header in the response phase", PhaseResponse, Matchers{Headers: []HeaderMatcher{{Name: "X-None"}}}, false},
	}
	for _, c := range cases {
		s := compile(t, Options{}, rule(1, c.phase, 0, c.m, mark))
		res := s.Apply(c.phase, Input{Request: req, Response: resp})
		if res.Changed != c.want {
			t.Errorf("%s: applied=%v, want %v", c.name, res.Changed, c.want)
		}
	}
	apex := request("GET", "http://example.com/", nil, "")
	if compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{Host: "*.example.com"}, mark)).Apply(PhaseRequest, Input{Request: apex}).Changed {
		t.Error("*.example.com must not match example.com")
	}
}

func TestRequestActions(t *testing.T) {
	req := request("GET", "http://h.example/old/path?q=1", http.Header{"X-Drop": {"a", "b"}, "Cookie": {"sid=abc", "theme=dark"}, "X-Keep": {"k"}}, "hello world")
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{},
		Action{Type: ActionSetMethod, Value: "POST"},
		Action{Type: ActionSetPathQuery, Value: "/new/path?q=2"},
		Action{Type: ActionReplaceURL, Regex: `q=(\d)`, Value: "q=${1}0"},
		Action{Type: ActionDeleteHeader, Name: "x-drop"},
		setHeader("x-new", "v"),
		Action{Type: ActionReplaceHeader, Name: "Cookie", Regex: `^sid=.*$`, Value: "sid=xyz"},
		Action{Type: ActionSetBody, Value: "hello there"},
		Action{Type: ActionReplaceBody, Regex: `(\w+) there`, Value: "$1, $1"}))
	res := s.Apply(PhaseRequest, Input{Request: req})
	got := res.Request
	if !res.Changed || got.Method != "POST" || got.URL.String() != "http://h.example/new/path?q=20" || string(got.Body) != "hello, hello" {
		t.Fatalf("method=%s url=%s body=%q", got.Method, got.URL, got.Body)
	}
	wantHeader := http.Header{"Cookie": {"sid=xyz", "theme=dark"}, "X-Keep": {"k"}, "X-New": {"v"}}
	if !reflect.DeepEqual(got.Header, wantHeader) {
		t.Fatalf("header = %v, want %v", got.Header, wantHeader)
	}
	wantLines(t, res.Lines,
		"1:set_method:method:applied:", "1:set_path_query:url:applied:", "1:replace_url:url:applied:",
		"1:delete_header:header:X-Drop:applied:", "1:set_header:header:X-New:applied:", "1:replace_header:header:Cookie:applied:",
		"1:set_body:body:applied:", "1:replace_body:body:applied:")
	if l := res.Lines[2]; string(l.After) != "/new/path?q=20" || l.BeforeHash != sha256Hex([]byte("/new/path?q=2")) || l.AfterHash != sha256Hex(l.After) {
		t.Fatalf("replace_url line = %+v", l)
	}
	if l := res.Lines[3]; l.After != nil || l.AfterHash != "" || l.BeforeHash != sha256Hex([]byte("a\nb")) {
		t.Fatalf("delete_header line = %+v", l)
	}
}

func TestResponseActions(t *testing.T) {
	req := request("GET", "http://h.example/", nil, "")
	resp := response(403, http.Header{"Server": {"nginx"}, "Set-Cookie": {"a=1; Secure", "b=2; Secure"}}, "denied")
	s := compile(t, Options{}, rule(1, PhaseResponse, 0, Matchers{},
		Action{Type: ActionSetStatus, Value: "200"},
		Action{Type: ActionReplaceBody, Regex: "denied", Value: "granted"},
		Action{Type: ActionReplaceHeader, Name: "Set-Cookie", Regex: "; Secure", Value: ""},
		setHeader("Server", "artex"),
		Action{Type: ActionDeleteHeader, Name: "X-Absent"}))
	res := s.Apply(PhaseResponse, Input{Request: req, Response: resp})
	got := res.Response
	if got.Status != 200 || string(got.Body) != "granted" || !reflect.DeepEqual(got.Header, http.Header{"Server": {"artex"}, "Set-Cookie": {"a=1", "b=2"}}) {
		t.Fatalf("status=%d body=%q header=%v", got.Status, got.Body, got.Header)
	}
	// Fixed order within a rule, whatever the order it lists its actions in;
	// the delete of an absent header changed nothing and left no line.
	wantLines(t, res.Lines, "1:replace_header:header:Set-Cookie:applied:", "1:set_header:header:Server:applied:",
		"1:replace_body:body:applied:", "1:set_status:status:applied:")
	if res.Request.URL != req.URL {
		t.Fatal("the response phase must hand the request back untouched")
	}
}

// Within a rule: method and URL, delete_header, set_header and replace_header
// in their listed order, body, status.
func TestActionOrderWithinRule(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{},
		Action{Type: ActionSetBody, Value: "b"},
		Action{Type: ActionReplaceHeader, Name: "X-A", Regex: "$", Value: "2"},
		setHeader("X-A", "1"),
		Action{Type: ActionDeleteHeader, Name: "X-A"},
		Action{Type: ActionReplaceURL, Regex: "^/a$", Value: "/b"},
		Action{Type: ActionSetMethod, Value: "PUT"}))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/a", http.Header{"X-A": {"0"}}, "a")})
	// delete, then replace on the now absent header (no change, no line), then set.
	wantLines(t, res.Lines, "1:replace_url:url:applied:", "1:set_method:method:applied:", "1:delete_header:header:X-A:applied:",
		"1:set_header:header:X-A:applied:", "1:set_body:body:applied:")
	if got := res.Request.Header["X-A"]; !reflect.DeepEqual(got, []string{"1"}) {
		t.Fatalf("X-A = %v", got)
	}
}

func TestActionOrderKeepsListedOrderInClass(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{},
		setHeader("X-A", "1"),
		Action{Type: ActionReplaceHeader, Name: "X-A", Regex: "$", Value: "2"}))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/", nil, "")})
	if got := res.Request.Header.Get("X-A"); got != "12" {
		t.Fatalf("X-A = %q, want set then replace", got)
	}
}

// Priority ascending then id ascending: the highest priority applies last and
// wins, and each rule sees the output of the previous one.
func TestPriorityOrderAndPipeline(t *testing.T) {
	rules := []Rule{
		rule(5, PhaseRequest, 10, Matchers{}, setHeader("X-Who", "p10")),
		rule(9, PhaseRequest, 0, Matchers{}, setHeader("X-Who", "p0-id9")),
		rule(2, PhaseRequest, 0, Matchers{}, setHeader("X-Who", "p0-id2")),
		// Matches only what rule 5 wrote.
		rule(7, PhaseRequest, 20, Matchers{Headers: []HeaderMatcher{{Name: "X-Who", ValueRegex: "^p10$"}}}, setHeader("X-Seen", "yes")),
		rule(8, PhaseRequest, -5, Matchers{Headers: []HeaderMatcher{{Name: "X-Who"}}}, setHeader("X-Early", "yes")),
	}
	res := compile(t, Options{}, rules...).Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/", nil, "")})
	wantLines(t, res.Lines, "2:set_header:header:X-Who:applied:", "9:set_header:header:X-Who:applied:",
		"5:set_header:header:X-Who:applied:", "7:set_header:header:X-Seen:applied:")
	h := res.Request.Header
	if h.Get("X-Who") != "p10" || h.Get("X-Seen") != "yes" || h.Get("X-Early") != "" {
		t.Fatalf("header = %v", h)
	}
}

// A failing action cancels its whole rule; the others still apply.
func TestRuleAtomicFailOpen(t *testing.T) {
	log := &ErrorLog{}
	grow := strings.Repeat("x", 1024)
	s := compile(t, Options{Errors: log},
		rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-First", "1")),
		rule(2, PhaseRequest, 1, Matchers{},
			Action{Type: ActionSetMethod, Value: "POST"},
			setHeader("X-Second", "2"),
			Action{Type: ActionReplaceBody, Regex: "a", Value: grow}),
		rule(3, PhaseRequest, 2, Matchers{}, setHeader("X-Third", "3")))
	req := request("GET", "http://h.example/", nil, strings.Repeat("a", 2048)) // 2048 * 1024 bytes > MaxExpansion
	res := s.Apply(PhaseRequest, Input{Request: req})
	wantLines(t, res.Lines, "1:set_header:header:X-First:applied:", "2:replace_body:body:error:expansion_limit", "3:set_header:header:X-Third:applied:")
	got := res.Request
	if got.Method != "GET" || got.Header.Get("X-Second") != "" || !bytes.Equal(got.Body, req.Body) {
		t.Fatalf("rule 2 left a trace on the request: method=%s header=%v", got.Method, got.Header)
	}
	if got.Header.Get("X-First") != "1" || got.Header.Get("X-Third") != "3" {
		t.Fatalf("the other rules must apply: %v", got.Header)
	}
	if e, ok := log.Get(2); !ok || e.Class != ErrClassExpansion || e.Count != 1 {
		t.Fatalf("last error of rule 2 = %+v %v", e, ok)
	}
	if _, ok := log.Get(1); ok {
		t.Fatal("rule 1 has no error")
	}
	s.Apply(PhaseRequest, Input{Request: req})
	if e, _ := log.Get(2); e.Count != 2 {
		t.Fatalf("count = %d, want 2", e.Count)
	}
}

// A rewritten URL is checked again at run time and can never leave the host.
func TestURLRewriteStaysOnHost(t *testing.T) {
	req := request("GET", "https://user:pw@h.example:8443/a?x=1", nil, "")
	for value, wantURL := range map[string]string{
		"http://evil.example/x": "",                                               // not a path: the rule fails
		"evil.example":          "",                                               // not a path
		"/a\nb":                 "",                                               // control character
		"//evil.example/x":      "https://user:pw@h.example:8443//evil.example/x", // a path, still on the host
		"/b?y=2":                "https://user:pw@h.example:8443/b?y=2",
	} {
		s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceURL, Regex: `^.*$`, Value: value}))
		res := s.Apply(PhaseRequest, Input{Request: req})
		if wantURL == "" {
			wantLines(t, res.Lines, "1:replace_url:url:error:invalid_url")
			if res.Changed || res.Request.URL != req.URL {
				t.Errorf("%q: the request must go on unchanged", value)
			}
			continue
		}
		u := res.Request.URL
		if u.String() != wantURL || u.Scheme != "https" || u.Host != "h.example:8443" {
			t.Errorf("%q: url = %s, want %s", value, u, wantURL)
		}
	}
}

// A panic inside a rule cancels that rule only.
func TestPanicInRuleFailsOpen(t *testing.T) {
	log := &ErrorLog{}
	s := compile(t, Options{Errors: log},
		rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "1"), Action{Type: ActionSetBody, Value: "new"}),
		rule(2, PhaseRequest, 1, Matchers{}, setHeader("X-B", "2")))
	req := request("POST", "http://h.example/", nil, "old")
	res := s.Apply(PhaseRequest, Input{Request: req, IsBinary: func(string, []byte) bool { panic("boom") }})
	wantLines(t, res.Lines, "1:::error:panic", "2:set_header:header:X-B:applied:")
	if string(res.Request.Body) != "old" || res.Request.Header.Get("X-A") != "" || res.Request.Header.Get("X-B") != "2" {
		t.Fatalf("request after the panic: body=%q header=%v", res.Request.Body, res.Request.Header)
	}
	if e, ok := log.Get(1); !ok || e.Class != ErrClassPanic {
		t.Fatalf("last error = %+v %v", e, ok)
	}
}

// The engine never writes to the objects it is given.
func TestInputsNotMutated(t *testing.T) {
	newInput := func() Input {
		return Input{
			Request:  request("GET", "http://h.example/a?x=1", http.Header{"X-A": {"1", "2"}, "Content-Length": {"3"}}, "abc"),
			Response: response(200, http.Header{"X-B": {"1"}, "Etag": {`"e"`}, "Content-Length": {"3"}}, "xyz"),
		}
	}
	s := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{},
			Action{Type: ActionSetMethod, Value: "POST"},
			Action{Type: ActionSetPathQuery, Value: "/b"},
			Action{Type: ActionReplaceHeader, Name: "X-A", Regex: "1", Value: "9"},
			Action{Type: ActionDeleteHeader, Name: "X-A"},
			setHeader("X-N", "n"),
			Action{Type: ActionReplaceBody, Regex: "b", Value: "B"}),
		rule(2, PhaseRequest, 1, Matchers{}, Action{Type: ActionReplaceBody, Regex: "B", Value: "bb"}),
		rule(3, PhaseResponse, 0, Matchers{},
			Action{Type: ActionSetStatus, Value: "500"},
			setHeader("X-B", "2"),
			Action{Type: ActionReplaceBody, Regex: "y", Value: "Y"}),
		// Fails after it wrote to its copy.
		rule(4, PhaseResponse, 1, Matchers{}, setHeader("X-C", "c"), Action{Type: ActionReplaceBody, Regex: "x", Value: strings.Repeat("x", MaxValueSize)}))
	for _, phase := range []Phase{PhaseRequest, PhaseResponse} {
		in, pristine := newInput(), newInput()
		res := s.Apply(phase, in)
		if !res.Changed {
			t.Fatalf("%s: nothing applied", phase)
		}
		if !reflect.DeepEqual(in, pristine) {
			t.Fatalf("%s: the input was modified:\n got  %+v\n want %+v", phase, in, pristine)
		}
		if phase == PhaseRequest {
			if res.Request.URL == in.Request.URL || string(res.Request.Body) != "abbc" || res.Request.Header.Get("Content-Length") != "" {
				t.Fatalf("request result: url=%s body=%q header=%v", res.Request.URL, res.Request.Body, res.Request.Header)
			}
			res.Request.Header.Set("X-After", "1")
			res.Request.Body[0] = 'Z'
		} else {
			if res.Response.Status != 500 || string(res.Response.Body) != "xYz" || res.Response.Header.Get("X-C") != "" {
				t.Fatalf("response result: %d %q %v", res.Response.Status, res.Response.Body, res.Response.Header)
			}
			res.Response.Header.Set("X-After", "1")
			res.Response.Body[0] = 'Z'
		}
		if !reflect.DeepEqual(in, pristine) {
			t.Fatalf("%s: the result shares memory with the input", phase)
		}
	}
}

// After a body action the headers that described the old body are gone.
func TestBodyRewriteDropsBodyHeaders(t *testing.T) {
	h := http.Header{"Content-Length": {"3"}, "Etag": {`"v1"`}, "Content-Md5": {"x"}, "Content-Encoding": {"identity"}, "Content-Type": {"text/plain"}}
	s := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetBody, Value: "longer body"}),
		rule(2, PhaseResponse, 0, Matchers{}, Action{Type: ActionReplaceBody, Regex: "a", Value: "bb"}))
	want := http.Header{"Content-Type": {"text/plain"}}
	if got := s.Apply(PhaseRequest, Input{Request: request("POST", "http://h.example/", h.Clone(), "abc")}).Request.Header; !reflect.DeepEqual(got, want) {
		t.Fatalf("request header = %v", got)
	}
	in := Input{Request: request("GET", "http://h.example/", nil, ""), Response: response(200, h.Clone(), "abc")}
	if got := s.Apply(PhaseResponse, in).Response.Header; !reflect.DeepEqual(got, want) {
		t.Fatalf("response header = %v", got)
	}
	// A body action that changes nothing keeps them.
	in.Response.Body = []byte("xyz")
	if res := s.Apply(PhaseResponse, in); res.Changed || len(res.Lines) != 0 {
		t.Fatalf("no match must leave no line: %v", outcomes(res.Lines))
	}
}

// An action that changes nothing leaves no line, so the exchange is not
// flagged as rewritten.
func TestNoChangeNoLine(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{},
		Action{Type: ActionSetMethod, Value: "GET"},
		Action{Type: ActionSetPathQuery, Value: "/a?x=1"},
		Action{Type: ActionReplaceURL, Regex: "zzz", Value: "y"},
		Action{Type: ActionDeleteHeader, Name: "X-Absent"},
		setHeader("X-A", "1"),
		Action{Type: ActionReplaceHeader, Name: "X-A", Regex: "zzz", Value: "y"},
		Action{Type: ActionSetBody, Value: "abc"},
		Action{Type: ActionReplaceBody, Regex: "zzz", Value: "y"}))
	req := request("GET", "http://h.example/a?x=1", http.Header{"X-A": {"1"}}, "abc")
	res := s.Apply(PhaseRequest, Input{Request: req})
	if res.Changed || len(res.Lines) != 0 || res.Request.URL != req.URL {
		t.Fatalf("changed=%v lines=%v", res.Changed, outcomes(res.Lines))
	}
}

// Limits: an oversized body skips the rules that need it; an oversized
// expansion fails the rule open.
func TestRunTimeLimits(t *testing.T) {
	s := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "1"), Action{Type: ActionReplaceBody, Regex: "a", Value: "b"}),
		rule(2, PhaseRequest, 1, Matchers{BodyRegex: "[ab]"}, setHeader("X-B", "1")),
		rule(3, PhaseRequest, 2, Matchers{}, setHeader("X-C", "1")))
	atLimit := request("POST", "http://h.example/", nil, strings.Repeat("a", MaxBodySize))
	if res := s.Apply(PhaseRequest, Input{Request: atLimit}); len(res.Lines) != 4 || len(res.Request.Body) != MaxBodySize {
		t.Fatalf("a body of exactly MaxBodySize is rewritten: %v", outcomes(res.Lines))
	}
	over := request("POST", "http://h.example/", nil, strings.Repeat("a", MaxBodySize+1))
	res := s.Apply(PhaseRequest, Input{Request: over})
	wantLines(t, res.Lines, "1:::skipped:not rewritten: body too large", "2:::skipped:not rewritten: body too large", "3:set_header:header:X-C:applied:")
	if res.Request.Header.Get("X-A") != "" || res.Request.Header.Get("X-B") != "" {
		t.Fatalf("a skipped body rule applied a header: %v", res.Request.Header)
	}

	grow := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceURL, Regex: "a", Value: strings.Repeat("b", MaxValueSize)}),
		rule(2, PhaseRequest, 1, Matchers{}, Action{Type: ActionReplaceHeader, Name: "X-A", Regex: "a", Value: strings.Repeat("b", MaxValueSize)}),
		rule(3, PhaseRequest, 2, Matchers{}, Action{Type: ActionReplaceBody, Regex: "a", Value: strings.Repeat("b", MaxValueSize)}),
		rule(4, PhaseRequest, 3, Matchers{}, Action{Type: ActionReplaceBody, Regex: "^a", Value: strings.Repeat("b", MaxExpansion-1)}))
	res = grow.Apply(PhaseRequest, Input{Request: request("POST", "http://h.example/aa", http.Header{"X-A": {"aa"}}, "aa")})
	wantLines(t, res.Lines, "1:replace_url:url:error:expansion_limit", "2:replace_header:header:X-A:error:expansion_limit",
		"3:replace_body:body:error:expansion_limit", "4:replace_body:body:applied:")
	if len(res.Request.Body) != MaxExpansion {
		t.Fatalf("an expansion of exactly MaxExpansion is allowed, got %d bytes", len(res.Request.Body))
	}
}

// A header the message lists in Connection is hop-by-hop: the rule is skipped.
func TestHeaderNamedInConnection(t *testing.T) {
	s := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-Other", "1"), Action{Type: ActionDeleteHeader, Name: "X-Hop"}),
		rule(2, PhaseRequest, 1, Matchers{}, setHeader("X-Other", "2")),
		rule(3, PhaseResponse, 0, Matchers{}, setHeader("X-Hop", "1")),
		rule(4, PhaseResponse, 0, Matchers{}, setHeader("X-Resp-Hop", "1")))
	req := request("GET", "http://h.example/", http.Header{"Connection": {"keep-alive, x-hop"}, "X-Hop": {"v"}}, "")
	res := s.Apply(PhaseRequest, Input{Request: req})
	wantLines(t, res.Lines, "1:::skipped:header named in Connection", "2:set_header:header:X-Other:applied:")
	if res.Request.Header.Get("X-Hop") != "v" || res.Request.Header.Get("X-Other") != "2" {
		t.Fatalf("header = %v", res.Request.Header)
	}
	// The response phase reads the Connection header of the response.
	res = s.Apply(PhaseResponse, Input{Request: req, Response: response(200, http.Header{"Connection": {"X-Resp-Hop"}}, "")})
	wantLines(t, res.Lines, "3:set_header:header:X-Hop:applied:", "4:::skipped:header named in Connection")
}

// In the response phase the request matchers run on the request that was sent
// to the target, that is, after the request phase.
func TestResponsePhaseSeesRewrittenRequest(t *testing.T) {
	s := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetPathQuery, Value: "/internal"}, setHeader("X-Role", "admin")),
		rule(2, PhaseResponse, 0, Matchers{URLRegex: "^/internal$", Headers: []HeaderMatcher{{Name: "X-Role", ValueRegex: "admin"}}}, setHeader("X-Matched", "1")))
	client := request("GET", "http://h.example/public", nil, "")
	sent := s.Apply(PhaseRequest, Input{Request: client}).Request
	resp := response(200, nil, "ok")
	if res := s.Apply(PhaseResponse, Input{Request: sent, Response: resp}); res.Response.Header.Get("X-Matched") != "1" {
		t.Fatal("the response rule must match the rewritten request")
	}
	if res := s.Apply(PhaseResponse, Input{Request: client, Response: resp}); res.Changed {
		t.Fatal("the response rule must not match the client's request")
	}
}

// A rule that needs a body it cannot touch is skipped whole: its header, URL
// and status actions do not apply either. Rules without a body component do.
func TestBodyRuleNotEligibleSkippedWhole(t *testing.T) {
	bodyRule := rule(1, PhaseResponse, 0, Matchers{},
		setHeader("X-Body-Rule", "1"), Action{Type: ActionSetStatus, Value: "200"}, Action{Type: ActionReplaceBody, Regex: "a", Value: "b"})
	matcherRule := rule(2, PhaseResponse, 1, Matchers{RespBodyRegex: "."}, setHeader("X-Matcher-Rule", "1"))
	headerRule := rule(3, PhaseResponse, 2, Matchers{}, setHeader("X-Header-Rule", "1"))
	s := compile(t, Options{}, bodyRule, matcherRule, headerRule)
	get := request("GET", "http://h.example/", nil, "")
	cases := []struct {
		name   string
		req    Request
		resp   Response
		binary func(string, []byte) bool
		reason string
	}{
		{"NUL byte", get, response(500, nil, "a\x00a"), nil, ReasonBinary},
		{"binary content type", get, response(500, http.Header{"Content-Type": {"application/zip"}}, "aaa"),
			func(ct string, _ []byte) bool { return ct == "application/zip" }, ReasonBinary},
		{"too large", get, response(500, nil, strings.Repeat("a", MaxBodySize+1)), nil, ReasonBodyTooLarge},
		{"content-encoding", get, response(500, http.Header{"Content-Encoding": {"gzip"}}, "aaa"), nil, ReasonContentEncoding},
		{"HEAD", request("HEAD", "http://h.example/", nil, ""), response(500, nil, ""), nil, ReasonNoBodyAllowed},
		{"204", get, response(204, nil, ""), nil, ReasonNoBodyAllowed},
		{"304", get, response(304, nil, ""), nil, ReasonNoBodyAllowed},
		{"101", get, response(101, nil, ""), nil, ReasonNoBodyAllowed},
	}
	for _, c := range cases {
		res := s.Apply(PhaseResponse, Input{Request: c.req, Response: c.resp, IsBinary: c.binary})
		wantLines(t, res.Lines, "1:::skipped:"+c.reason, "2:::skipped:"+c.reason, "3:set_header:header:X-Header-Rule:applied:")
		h := res.Response.Header
		if h.Get("X-Body-Rule") != "" || h.Get("X-Matcher-Rule") != "" || res.Response.Status != c.resp.Status || h.Get("X-Header-Rule") != "1" {
			t.Errorf("%s: status=%d header=%v", c.name, res.Response.Status, h)
		}
	}
	// Content-Encoding: identity is not an encoding.
	res := s.Apply(PhaseResponse, Input{Request: get, Response: response(500, http.Header{"Content-Encoding": {"identity"}}, "aaa")})
	if string(res.Response.Body) != "bbb" || res.Response.Status != 200 {
		t.Fatalf("identity body not rewritten: %d %q", res.Response.Status, res.Response.Body)
	}

	// Request side: the request body of a request-phase rule, and the request
	// body a response-phase rule reads through body_regex.
	reqSet := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "1"), Action{Type: ActionSetBody, Value: "new"}),
		rule(2, PhaseResponse, 0, Matchers{BodyRegex: "a"}, setHeader("X-B", "1")))
	gz := request("POST", "http://h.example/", http.Header{"Content-Encoding": {"br"}}, "aaa")
	wantLines(t, reqSet.Apply(PhaseRequest, Input{Request: gz}).Lines, "1:::skipped:not rewritten: content-encoding")
	wantLines(t, reqSet.Apply(PhaseResponse, Input{Request: gz, Response: response(200, nil, "")}).Lines, "2:::skipped:not rewritten: content-encoding")
	// A skipped line needs a candidate rule: no line when the other matchers fail.
	miss := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{Methods: []string{"PUT"}}, Action{Type: ActionSetBody, Value: "new"}))
	if res := miss.Apply(PhaseRequest, Input{Request: gz}); len(res.Lines) != 0 {
		t.Fatalf("a rule that does not match left a line: %v", outcomes(res.Lines))
	}
}

// Stream mode (SSE): the response body is out of reach, headers and status are not.
func TestStreamMode(t *testing.T) {
	s := compile(t, Options{},
		rule(1, PhaseResponse, 0, Matchers{}, setHeader("X-A", "1"), Action{Type: ActionSetStatus, Value: "202"}),
		rule(2, PhaseResponse, 1, Matchers{}, setHeader("X-B", "1"), Action{Type: ActionReplaceBody, Regex: "a", Value: "b"}),
		rule(3, PhaseResponse, 2, Matchers{RespBodyRegex: "a"}, setHeader("X-C", "1")),
		// Reads the request body only: it is in memory, so the rule applies.
		rule(4, PhaseResponse, 3, Matchers{BodyRegex: "ping"}, setHeader("X-D", "1")),
		rule(5, PhaseResponse, 4, Matchers{Status: []string{"500"}}, Action{Type: ActionSetBody, Value: "x"}))
	in := Input{Request: request("POST", "http://h.example/events", nil, "ping"),
		Response: response(200, http.Header{"Content-Type": {"text/event-stream"}}, ""), Stream: true}
	res := s.Apply(PhaseResponse, in)
	wantLines(t, res.Lines, "1:set_header:header:X-A:applied:", "1:set_status:status:applied:",
		"2:::skipped:not rewritten: stream", "3:::skipped:not rewritten: stream", "4:set_header:header:X-D:applied:")
	h := res.Response.Header
	if res.Response.Status != 202 || h.Get("X-A") != "1" || h.Get("X-B") != "" || h.Get("X-C") != "" || h.Get("X-D") != "1" {
		t.Fatalf("status=%d header=%v", res.Response.Status, h)
	}
}

// A request that asks for a protocol upgrade (WebSocket) is never rewritten.
func TestUpgradeRequestSkipsEveryRule(t *testing.T) {
	s := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "1")),
		rule(2, PhaseRequest, 1, Matchers{BodyRegex: "a"}, Action{Type: ActionSetBody, Value: "x"}),
		rule(3, PhaseRequest, 2, Matchers{Methods: []string{"POST"}}, setHeader("X-C", "1")))
	req := request("GET", "http://h.example/ws", http.Header{"Connection": {"keep-alive, Upgrade"}, "Upgrade": {"websocket"}}, "")
	res := s.Apply(PhaseRequest, Input{Request: req})
	wantLines(t, res.Lines, "1:::skipped:not rewritten: stream", "2:::skipped:not rewritten: stream")
	if res.Changed {
		t.Fatal("an upgrade request was rewritten")
	}
}

func TestSensitiveValueNeverTraced(t *testing.T) {
	const secret = "tok-SECRET-0001"
	leak := func(t *testing.T, res Result) {
		t.Helper()
		plain := sha256Hex([]byte(secret))
		for _, l := range res.Lines {
			blob, _ := json.Marshal(l)
			if strings.Contains(string(blob)+string(l.After), secret) || l.AfterHash == plain || l.BeforeHash == plain {
				t.Fatalf("the sensitive value, or a plain hash of it, is in line %+v", l)
			}
		}
	}
	s := compile(t, Options{TraceKey: testKey},
		rule(1, PhaseRequest, 0, Matchers{},
			Action{Type: ActionSetHeader, Name: "Authorization", Value: secret, Sensitive: true},
			Action{Type: ActionReplaceURL, Regex: "token=[^&]*", Value: "token=" + secret, Sensitive: true},
			Action{Type: ActionSetBody, Value: secret, Sensitive: true},
			setHeader("X-Plain", "visible")),
		// Not sensitive, but writes fields rule 1 tainted: no value, no plain hash.
		rule(2, PhaseRequest, 1, Matchers{},
			Action{Type: ActionReplaceHeader, Name: "Authorization", Regex: "^", Value: "Bearer "},
			Action{Type: ActionReplaceBody, Regex: "$", Value: "!"},
			Action{Type: ActionReplaceHeader, Name: "X-Plain", Regex: "$", Value: "!"}))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/a?token=old", http.Header{"Authorization": {"old"}}, "old body")})
	leak(t, res)
	wantLines(t, res.Lines, "1:replace_url:url:applied:", "1:set_header:header:Authorization:applied:", "1:set_header:header:X-Plain:applied:",
		"1:set_body:body:applied:", "2:replace_header:header:Authorization:applied:", "2:replace_header:header:X-Plain:applied:", "2:replace_body:body:applied:")
	if got := res.Request.Header.Get("Authorization"); got != "Bearer "+secret {
		t.Fatalf("the request itself carries the value: Authorization=%q", got)
	}
	byField := map[string][]TraceLine{}
	for _, l := range res.Lines {
		byField[l.Field] = append(byField[l.Field], l)
	}
	// The sensitive action: the original value is hashed in clear (it is in
	// the exchange), the new one is fingerprinted with the key.
	auth := byField["header:Authorization"]
	if auth[0].BeforeHash != sha256Hex([]byte("old")) || auth[0].AfterHash != s.fingerprint([]byte(secret)) || auth[0].After != nil {
		t.Fatalf("sensitive line = %+v", auth[0])
	}
	// Taint by field: the later, non-sensitive action on the same field.
	if auth[1].After != nil || auth[1].BeforeHash != s.fingerprint([]byte(secret)) || auth[1].AfterHash != s.fingerprint([]byte("Bearer "+secret)) {
		t.Fatalf("tainted line = %+v", auth[1])
	}
	if body := byField["body"]; body[0].After != nil || body[1].After != nil {
		t.Fatalf("a tainted body is in the trace: %+v", body)
	}
	// A field no sensitive action wrote is traced in full.
	if plain := byField["header:X-Plain"]; string(plain[0].After) != "visible" || string(plain[1].After) != "visible!" || plain[1].AfterHash != sha256Hex([]byte("visible!")) {
		t.Fatalf("untainted lines = %+v", plain)
	}
	// The rule snapshot carries the matchers and the action, not the value.
	if snap := res.Lines[0].RuleSnapshot; strings.Contains(snap, secret) || !strings.Contains(snap, `"sensitive":true`) || !strings.Contains(snap, `"name":"Authorization"`) {
		t.Fatalf("rule snapshot = %s", snap)
	}

	// A failing sensitive action reports its class only.
	log := &ErrorLog{}
	bad := compile(t, Options{TraceKey: testKey, Errors: log}, rule(1, PhaseRequest, 0, Matchers{},
		Action{Type: ActionReplaceURL, Regex: "^.*$", Value: secret, Sensitive: true}))
	res = bad.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/a", nil, "")})
	leak(t, res)
	wantLines(t, res.Lines, "1:replace_url:url:error:invalid_url")
	if e, _ := log.Get(1); e.Class != ErrClassInvalidURL {
		t.Fatalf("last error = %+v", e)
	}
}

// The taint follows the field, not the value: it does not reach another field
// that carries the same value, nor the other phase. This test pins that limit.
func TestSensitiveTaintLimit(t *testing.T) {
	const secret = "tok-SECRET-0002"
	s := compile(t, Options{TraceKey: testKey},
		rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetHeader, Name: "X-Token", Value: secret, Sensitive: true}),
		rule(2, PhaseRequest, 1, Matchers{}, setHeader("X-Copy", secret)),
		rule(3, PhaseResponse, 0, Matchers{}, setHeader("X-Token", secret)))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/", nil, "")})
	if res.Lines[0].After != nil || string(res.Lines[1].After) != secret {
		t.Fatalf("request lines = %+v", res.Lines)
	}
	res = s.Apply(PhaseResponse, Input{Request: res.Request, Response: response(200, nil, "")})
	if string(res.Lines[0].After) != secret {
		t.Fatalf("the taint crossed to the response phase: %+v", res.Lines[0])
	}
}

func TestRuleSnapshot(t *testing.T) {
	long := strings.Repeat("v", snapshotValueMax+1)
	short := strings.Repeat("w", snapshotValueMax)
	s := compile(t, Options{},
		rule(1, PhaseRequest, 3, Matchers{Host: "h.example", Headers: []HeaderMatcher{{Name: "X-A", ValueRegex: "^matcher-in-clear$"}}},
			setHeader("X-Long", long), setHeader("X-Short", short), Action{Type: ActionSetMethod, Value: "POST"}),
		rule(2, PhaseRequest, 4, Matchers{}, setHeader("X-B", "1")))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/", http.Header{"X-A": {"matcher-in-clear"}}, "")})
	if len(res.Lines) != 4 {
		t.Fatalf("lines = %v", outcomes(res.Lines))
	}
	// Once per rule, on its first line.
	for i, want := range []bool{true, false, false, true} {
		if (res.Lines[i].RuleSnapshot != "") != want {
			t.Fatalf("line %d: snapshot present=%v, want %v", i, !want, want)
		}
	}
	var snap struct {
		ID       int64
		Name     string
		Phase    string
		Priority int
		Matchers Matchers
		Actions  []struct {
			Type, Name  string
			Value       *string
			ValueLen    int    `json:"value_len"`
			ValueSHA256 string `json:"value_sha256"`
		}
	}
	if err := json.Unmarshal([]byte(res.Lines[0].RuleSnapshot), &snap); err != nil {
		t.Fatal(err)
	}
	if snap.ID != 1 || snap.Name != "r1" || snap.Phase != "request" || snap.Priority != 3 || snap.Matchers.Headers[0].ValueRegex != "^matcher-in-clear$" {
		t.Fatalf("snapshot = %+v", snap)
	}
	// A value over 4 KiB is summarized by its length and hash; 4 KiB exactly is kept.
	if a := snap.Actions[0]; a.Value != nil || a.ValueLen != len(long) || a.ValueSHA256 != sha256Hex([]byte(long)) {
		t.Fatalf("long action = %+v", a)
	}
	if a := snap.Actions[1]; a.Value == nil || *a.Value != short || a.ValueLen != 0 {
		t.Fatal("a value of exactly 4 KiB must be kept")
	}
	if strings.Contains(res.Lines[0].RuleSnapshot, long) {
		t.Fatal("the long value is in the snapshot")
	}
	// A skipped or failed rule carries its snapshot too.
	skip := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetBody, Value: "x"}))
	res = skip.Apply(PhaseRequest, Input{Request: request("POST", "http://h.example/", nil, "\x00")})
	if len(res.Lines) != 1 || res.Lines[0].RuleSnapshot == "" {
		t.Fatalf("skipped line = %+v", res.Lines)
	}
}

// The trace keeps the body of the last body action of the phase, and only it.
func TestBodyTraceOnLastBodyActionOnly(t *testing.T) {
	s := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetBody, Value: "one"}, Action{Type: ActionReplaceBody, Regex: "one", Value: "two"}, setHeader("X-A", "1")),
		rule(2, PhaseRequest, 1, Matchers{}, Action{Type: ActionReplaceBody, Regex: "two", Value: "three"}),
		rule(3, PhaseRequest, 2, Matchers{}, setHeader("X-B", "1")))
	res := s.Apply(PhaseRequest, Input{Request: request("POST", "http://h.example/", nil, "zero")})
	wantLines(t, res.Lines, "1:set_header:header:X-A:applied:", "1:set_body:body:applied:", "1:replace_body:body:applied:",
		"2:replace_body:body:applied:", "3:set_header:header:X-B:applied:")
	for i, want := range []string{"1", "", "", "three", "1"} {
		if got := string(res.Lines[i].After); got != want {
			t.Errorf("line %d: after = %q, want %q", i, got, want)
		}
	}
	// The intermediate steps keep their hashes.
	if l := res.Lines[2]; l.BeforeHash != sha256Hex([]byte("one")) || l.AfterHash != sha256Hex([]byte("two")) {
		t.Fatalf("intermediate body line = %+v", l)
	}
	// When the last body action is sensitive, no body is kept at all.
	sens := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetBody, Value: "one"}),
		rule(2, PhaseRequest, 1, Matchers{}, Action{Type: ActionSetBody, Value: "two", Sensitive: true}))
	for _, l := range sens.Apply(PhaseRequest, Input{Request: request("POST", "http://h.example/", nil, "zero")}).Lines {
		if l.After != nil {
			t.Fatalf("a body is kept although the last body action is sensitive: %+v", l)
		}
	}
}

// The fingerprint of a sensitive value is keyed, 128 bits long, and absent
// without a key: there is no plain SHA-256 fallback.
func TestSensitiveFingerprint(t *testing.T) {
	const secret = "tok-SECRET-0003"
	rules := []Rule{rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetHeader, Name: "X-Token", Value: secret, Sensitive: true})}
	apply := func(key []byte) TraceLine {
		res := Compile(rules, Options{TraceKey: key}).Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/", http.Header{"X-Token": {"old"}}, "")})
		if len(res.Lines) != 1 {
			t.Fatalf("lines = %v", outcomes(res.Lines))
		}
		return res.Lines[0]
	}
	keyed := apply(testKey)
	plain := sha256Hex([]byte(secret))
	if len(keyed.AfterHash) != 32 || keyed.AfterHash == plain[:32] || strings.Contains(plain, keyed.AfterHash) {
		t.Fatalf("fingerprint %q: want 128 bits, unrelated to the plain SHA-256", keyed.AfterHash)
	}
	if again := apply(testKey); again.AfterHash != keyed.AfterHash {
		t.Fatal("the fingerprint must be stable under one key")
	}
	if other := apply([]byte("another-key-another-key-another-k")); other.AfterHash == keyed.AfterHash || other.AfterHash == "" {
		t.Fatal("the fingerprint must depend on the key")
	}
	if none := apply(nil); none.AfterHash != "" || none.BeforeHash != sha256Hex([]byte("old")) || none.After != nil {
		t.Fatalf("without a key the fingerprint must be absent: %+v", none)
	}
}
