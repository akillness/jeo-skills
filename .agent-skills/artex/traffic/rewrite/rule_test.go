package rewrite

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// rule builds an enabled rule named after its id.
func rule(id int64, phase Phase, priority int, m Matchers, actions ...Action) Rule {
	return Rule{ID: id, Name: fmt.Sprintf("r%d", id), Enabled: true, Phase: phase, Priority: priority, Matchers: m, Actions: actions}
}

// compile fails the test when a rule is left out of the snapshot.
func compile(t *testing.T, opts Options, rules ...Rule) *Set {
	t.Helper()
	s := Compile(rules, opts)
	if len(s.LoadErrors()) > 0 {
		t.Fatalf("load errors: %v", s.LoadErrors())
	}
	return s
}

func request(method, rawURL string, header http.Header, body string) Request {
	u, err := url.Parse(rawURL)
	if err != nil {
		panic(err)
	}
	if header == nil {
		header = http.Header{}
	}
	return Request{Method: method, URL: u, Header: header, Body: []byte(body)}
}

func setHeader(name, value string) Action {
	return Action{Type: ActionSetHeader, Name: name, Value: value}
}

func TestValidateAcceptsEveryAction(t *testing.T) {
	req := rule(1, PhaseRequest, 0, Matchers{Methods: []string{"get"}, Host: "*.example.com", URLRegex: `^/api/`,
		Headers: []HeaderMatcher{{Name: "x-a"}, {Name: "X-B", ValueRegex: "^v"}}, BodyRegex: "a"},
		Action{Type: ActionSetMethod, Value: "POST"},
		Action{Type: ActionSetPathQuery, Value: "/x?y=1"},
		Action{Type: ActionReplaceURL, Regex: "a", Value: "b"},
		Action{Type: ActionDeleteHeader, Name: "X-Old"},
		setHeader("X-New", "v"),
		Action{Type: ActionReplaceHeader, Name: "Cookie", Regex: "a", Value: "b", Sensitive: true},
		Action{Type: ActionSetBody, Value: "body"},
		Action{Type: ActionReplaceBody, Regex: "a", Value: "$0$0"})
	resp := rule(2, PhaseResponse, 0, Matchers{Status: []string{"404", "5xx"}, RespHeaders: []HeaderMatcher{{Name: "Server"}}, RespBodyRegex: "a", BodyRegex: "b"},
		Action{Type: ActionDeleteHeader, Name: "Server"},
		setHeader("X-New", "v"),
		Action{Type: ActionReplaceHeader, Name: "Set-Cookie", Regex: "a", Value: "b"},
		Action{Type: ActionSetBody, Value: ""},
		Action{Type: ActionReplaceBody, Regex: "a", Value: "b"},
		Action{Type: ActionSetStatus, Value: "200"})
	for _, r := range []Rule{req, resp} {
		if err := Validate(r); err != nil {
			t.Errorf("rule %d: %v", r.ID, err)
		}
	}
}

// Every refusal of the save-time validation.
func TestValidateForbidden(t *testing.T) {
	long := strings.Repeat("a", MaxPatternSize+1)
	big := strings.Repeat("a", MaxValueSize+1)
	ok := setHeader("X-A", "v")
	cases := map[string]Rule{
		"empty name":           {Phase: PhaseRequest, Actions: []Action{ok}},
		"bad phase":            {Name: "r", Phase: "both", Actions: []Action{ok}},
		"no action":            rule(1, PhaseRequest, 0, Matchers{}),
		"unknown action":       rule(1, PhaseRequest, 0, Matchers{}, Action{Type: "set_host", Value: "evil.example"}),
		"set_method CONNECT":   rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetMethod, Value: "CONNECT"}),
		"set_method connect":   rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetMethod, Value: "connect"}),
		"set_method not token": rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetMethod, Value: "GET /"}),
		"set_method response":  rule(1, PhaseResponse, 0, Matchers{}, Action{Type: ActionSetMethod, Value: "POST"}),
		"path absolute URL":    rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetPathQuery, Value: "http://evil.example/x"}),
		"path relative":        rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetPathQuery, Value: "evil.example/x"}),
		"path control char":    rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetPathQuery, Value: "/a\r\nHost: evil"}),
		"path response":        rule(1, PhaseResponse, 0, Matchers{}, Action{Type: ActionSetPathQuery, Value: "/x"}),
		"replace_url response": rule(1, PhaseResponse, 0, Matchers{}, Action{Type: ActionReplaceURL, Regex: "a", Value: "b"}),
		"replace no regex":     rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceBody, Value: "b"}),
		"replace bad regex":    rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceBody, Regex: "(", Value: "b"}),
		"action regex 1 KiB":   rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceBody, Regex: long, Value: "b"}),
		"value 1 MiB":          rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetBody, Value: big}),
		"replacement 1 MiB":    rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceBody, Regex: "a", Value: big}),
		"header name":          rule(1, PhaseRequest, 0, Matchers{}, setHeader("X A", "v")),
		"header name empty":    rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionDeleteHeader}),
		"header value CR":      rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "a\rb")),
		"header value LF":      rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "a\nb")),
		"header value NUL":     rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "a\x00b")),
		"replacement LF":       rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceHeader, Name: "X-A", Regex: "a", Value: "b\nc"}),
		"set_status request":   rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetStatus, Value: "200"}),
		"set_status text":      rule(1, PhaseResponse, 0, Matchers{}, Action{Type: ActionSetStatus, Value: "ok"}),
		"matcher regex 1 KiB":  rule(1, PhaseRequest, 0, Matchers{URLRegex: long}, ok),
		"matcher bad regex":    rule(1, PhaseRequest, 0, Matchers{BodyRegex: "("}, ok),
		"matcher header name":  rule(1, PhaseRequest, 0, Matchers{Headers: []HeaderMatcher{{Name: "X A"}}}, ok),
		"matcher header regex": rule(1, PhaseRequest, 0, Matchers{Headers: []HeaderMatcher{{Name: "X-A", ValueRegex: "("}}}, ok),
		"matcher method":       rule(1, PhaseRequest, 0, Matchers{Methods: []string{"GET POST"}}, ok),
		"status in request":    rule(1, PhaseRequest, 0, Matchers{Status: []string{"200"}}, ok),
		"resp header request":  rule(1, PhaseRequest, 0, Matchers{RespHeaders: []HeaderMatcher{{Name: "Server"}}}, ok),
		"resp body request":    rule(1, PhaseRequest, 0, Matchers{RespBodyRegex: "a"}, ok),
		"status syntax":        rule(1, PhaseResponse, 0, Matchers{Status: []string{"6xx"}}, ok),
		"status syntax word":   rule(1, PhaseResponse, 0, Matchers{Status: []string{"ok"}}, ok),
	}
	for _, name := range []string{"Host", "content-length", "Transfer-Encoding", "Connection", "Proxy-Authorization", "proxy-anything",
		"Keep-Alive", "TE", "Trailer", "Expect", "Upgrade"} {
		cases["set_header "+name] = rule(1, PhaseRequest, 0, Matchers{}, setHeader(name, "v"))
		cases["delete_header "+name] = rule(1, PhaseResponse, 0, Matchers{}, Action{Type: ActionDeleteHeader, Name: name})
		cases["replace_header "+name] = rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceHeader, Name: name, Regex: "a", Value: "b"})
	}
	for _, status := range []string{"199", "204", "304", "600"} {
		cases["set_status "+status] = rule(1, PhaseResponse, 0, Matchers{}, Action{Type: ActionSetStatus, Value: status})
	}
	for name, r := range cases {
		if err := Validate(r); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestValidateHostGlob(t *testing.T) {
	ok := setHeader("X-A", "v")
	for host, want := range map[string]bool{
		"example.com":      true,
		"*.a.b":            true,
		"*.example.com":    true,
		"::1":              true,
		"a.*.b":            false,
		"*":                false,
		"*.":               false,
		"*.*.example.com":  false,
		"*example.com":     false,
		"example.com:8080": false,
		"example.com/path": false,
	} {
		err := Validate(rule(1, PhaseRequest, 0, Matchers{Host: host}, ok))
		if (err == nil) != want {
			t.Errorf("host %q: accepted=%v, want %v (%v)", host, err == nil, want, err)
		}
	}
}

// A validation message names the action, never its value.
func TestValidateErrorOmitsValue(t *testing.T) {
	const secret = "s3cr3t-value"
	for _, a := range []Action{
		{Type: ActionSetMethod, Value: secret + " x", Sensitive: true},
		{Type: ActionSetPathQuery, Value: secret, Sensitive: true},
		{Type: ActionSetHeader, Name: "X-A", Value: secret + "\n", Sensitive: true},
		{Type: ActionSetStatus, Value: secret, Sensitive: true},
		{Type: "nope", Value: secret, Sensitive: true},
	} {
		phase := PhaseRequest
		if a.Type == ActionSetStatus {
			phase = PhaseResponse
		}
		err := Validate(rule(1, phase, 0, Matchers{}, a))
		if err == nil || strings.Contains(err.Error(), secret) {
			t.Errorf("%s: error %v", a.Type, err)
		}
	}
}

func TestCompileLoadError(t *testing.T) {
	valid := rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "v"))
	invalid := rule(2, PhaseRequest, 0, Matchers{}, setHeader("Host", "evil.example"))
	disabledInvalid := rule(3, PhaseRequest, 0, Matchers{}, setHeader("Host", "evil.example"))
	disabledInvalid.Enabled = false
	disabled := rule(4, PhaseResponse, 0, Matchers{}, setHeader("X-A", "v"))
	disabled.Enabled = false
	s := Compile([]Rule{valid, invalid, disabledInvalid, disabled}, Options{})
	if s.Len(PhaseRequest) != 1 || s.Len(PhaseResponse) != 0 {
		t.Fatalf("active rules: request=%d response=%d, want 1 and 0", s.Len(PhaseRequest), s.Len(PhaseResponse))
	}
	errs := s.LoadErrors()
	if len(errs) != 1 || !strings.Contains(errs[2], "Host") {
		t.Fatalf("load errors = %v, want one for rule 2 naming Host", errs)
	}
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/", nil, "")})
	if got := res.Request.Header.Get("X-A"); got != "v" || res.Request.Header.Get("Host") != "" {
		t.Fatalf("the valid rule must apply and the invalid one must not: X-A=%q", got)
	}
	var none *Set
	if none.Len(PhaseRequest) != 0 || none.LoadErrors() != nil || none.Apply(PhaseRequest, Input{}).Changed {
		t.Fatal("a nil Set must hold no rule")
	}
}

func TestErrorLog(t *testing.T) {
	l := &ErrorLog{}
	if _, ok := l.Get(7); ok {
		t.Fatal("empty log returned an entry")
	}
	l.record(7, ErrClassExpansion)
	l.record(7, ErrClassInvalidURL)
	e, ok := l.Get(7)
	if !ok || e.Class != ErrClassInvalidURL || e.Count != 2 || e.At.IsZero() {
		t.Fatalf("entry = %+v %v", e, ok)
	}
	l.Forget(7)
	if _, ok := l.Get(7); ok {
		t.Fatal("Forget kept the entry")
	}
	var none *ErrorLog
	none.record(1, ErrClassPanic) // a Set compiled without a log
}
