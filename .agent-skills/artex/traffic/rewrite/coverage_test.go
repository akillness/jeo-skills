package rewrite

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestNoteError(t *testing.T) {
	log := &ErrorLog{}
	s := Compile([]Rule{rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "v"))}, Options{Errors: log})
	s.NoteError(1, ErrClassTransport)
	e, ok := log.Get(1)
	if !ok || e.Class != ErrClassTransport || e.Count != 1 {
		t.Fatalf("NoteError: %+v ok=%v", e, ok)
	}
	s.NoteError(1, ErrClassTransport)
	e, _ = log.Get(1)
	if e.Count != 2 {
		t.Fatalf("second NoteError count=%d, want 2", e.Count)
	}

	var none *Set
	none.NoteError(1, ErrClassPanic)
}

func TestApplyNilURL(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "1")))
	res := s.Apply(PhaseRequest, Input{Request: Request{Method: "GET", Header: http.Header{}}})
	if !res.Changed || res.Request.Header.Get("X-A") != "1" {
		t.Fatalf("nil URL: changed=%v header=%v", res.Changed, res.Request.Header)
	}
	if res.Request.URL == nil {
		t.Fatal("nil URL not replaced")
	}
}

func TestNilHeaderCopy(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-New", "v")))
	res := s.Apply(PhaseRequest, Input{Request: Request{Method: "GET", URL: mustURL("http://h.example/"), Header: nil}})
	if !res.Changed || res.Request.Header.Get("X-New") != "v" {
		t.Fatalf("nil header: changed=%v header=%v", res.Changed, res.Request.Header)
	}

	s2 := compile(t, Options{}, rule(1, PhaseResponse, 0, Matchers{}, setHeader("X-New", "v")))
	res = s2.Apply(PhaseResponse, Input{
		Request:  Request{Method: "GET", URL: mustURL("http://h.example/"), Header: http.Header{}},
		Response: Response{Status: 200, Header: nil, Body: []byte("ok")},
	})
	if !res.Changed || res.Response.Header.Get("X-New") != "v" {
		t.Fatalf("nil response header: changed=%v header=%v", res.Changed, res.Response.Header)
	}
}

func TestCompileMatchers(t *testing.T) {
	cm, err := CompileMatchers(PhaseRequest, Matchers{Methods: []string{"GET", "POST"}, Host: "*.example.com"})
	if err != nil {
		t.Fatal(err)
	}
	req := request("POST", "https://api.example.com/v1", nil, "")
	if !cm.MatchHead(req, Response{}) {
		t.Error("expected match")
	}
	if cm.MatchHead(request("DELETE", "https://api.example.com/v1", nil, ""), Response{}) {
		t.Error("DELETE should not match")
	}

	cm2, err := CompileMatchers(PhaseResponse, Matchers{Status: []string{"4xx"}, RespBodyRegex: "err"})
	if err != nil {
		t.Fatal(err)
	}
	resp := Response{Status: 404, Body: []byte("error")}
	if !cm2.MatchHead(Request{URL: mustURL("http://h.example/")}, resp) {
		t.Error("expected status match")
	}
	if !cm2.MatchBody(Request{}, resp) {
		t.Error("expected body match")
	}
	if cm2.MatchBody(Request{}, Response{Status: 404, Body: []byte("ok")}) {
		t.Error("body should not match")
	}

	_, err = CompileMatchers("both", Matchers{})
	if err == nil {
		t.Error("bad phase accepted")
	}

	_, err = CompileMatchers(PhaseRequest, Matchers{Status: []string{"200"}})
	if err == nil {
		t.Error("status matcher in request phase accepted")
	}
}

func TestCompiledMatchersNilReceiver(t *testing.T) {
	var cm *CompiledMatchers
	if !cm.MatchHead(Request{}, Response{}) {
		t.Error("nil CompiledMatchers.MatchHead should return true")
	}
	if !cm.MatchBody(Request{}, Response{}) {
		t.Error("nil CompiledMatchers.MatchBody should return true")
	}

	cm = &CompiledMatchers{}
	if !cm.MatchHead(Request{}, Response{}) {
		t.Error("zero CompiledMatchers.MatchHead should return true")
	}
	if !cm.MatchBody(Request{}, Response{}) {
		t.Error("zero CompiledMatchers.MatchBody should return true")
	}
}

func TestValidateHeaderTarget(t *testing.T) {
	name, err := ValidateHeaderTarget("X-Custom")
	if err != nil || name != "X-Custom" {
		t.Fatalf("got %q %v", name, err)
	}
	_, err = ValidateHeaderTarget("Host")
	if err == nil {
		t.Error("Host accepted")
	}
	_, err = ValidateHeaderTarget("Proxy-Auth")
	if err == nil {
		t.Error("Proxy- accepted")
	}
	_, err = ValidateHeaderTarget("")
	if err == nil {
		t.Error("empty accepted")
	}
}

func TestValidateHeaderValue(t *testing.T) {
	if err := ValidateHeaderValue("good value"); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"a\rb", "a\nb", "a\x00b"} {
		if err := ValidateHeaderValue(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestValidToken(t *testing.T) {
	if !ValidToken("GET") {
		t.Error("GET rejected")
	}
	if !ValidToken("x-custom-header") {
		t.Error("x-custom-header rejected")
	}
	if ValidToken("") {
		t.Error("empty accepted")
	}
	if ValidToken("bad header") {
		t.Error("space accepted")
	}
	if ValidToken("bad\theader") {
		t.Error("tab accepted")
	}
}

func TestParsePathQuery(t *testing.T) {
	u, ok := ParsePathQuery("/path?q=1")
	if !ok || u.Path != "/path" || u.RawQuery != "q=1" {
		t.Fatalf("got %v %v", u, ok)
	}
	_, ok = ParsePathQuery("relative")
	if ok {
		t.Error("relative path accepted")
	}
	_, ok = ParsePathQuery("")
	if ok {
		t.Error("empty path accepted")
	}
}

func TestBodyAllowedForStatus(t *testing.T) {
	for status, want := range map[int]bool{
		100: false, 101: false, 199: false,
		200: true, 204: false, 299: true,
		304: false, 403: true, 500: true,
	} {
		if got := BodyAllowedForStatus(status); got != want {
			t.Errorf("status %d: got %v want %v", status, got, want)
		}
	}
}

func TestBodyDependentHeaders(t *testing.T) {
	got := BodyDependentHeaders()
	if len(got) == 0 {
		t.Fatal("empty")
	}
	want := map[string]bool{"Content-Length": true, "Etag": true, "Content-Md5": true, "Content-Encoding": true}
	for _, h := range got {
		if !want[h] {
			t.Errorf("unexpected header %q", h)
		}
	}
}

func TestSHA256Hex(t *testing.T) {
	got := SHA256Hex([]byte("hello"))
	if len(got) != 64 {
		t.Fatalf("length %d", len(got))
	}
	if got != sha256Hex([]byte("hello")) {
		t.Error("mismatch with internal function")
	}
}

func TestFingerprint(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	fp := Fingerprint(key, []byte("hello"))
	if len(fp) != 32 {
		t.Fatalf("fingerprint length %d, want 32 hex chars (128 bits)", len(fp))
	}
	if Fingerprint(nil, []byte("hello")) != "" {
		t.Error("nil key should return empty")
	}
	if Fingerprint([]byte{}, []byte("hello")) != "" {
		t.Error("empty key should return empty")
	}
	if fp2 := Fingerprint(key, []byte("world")); fp2 == fp {
		t.Error("different inputs same fingerprint")
	}
	if fp3 := Fingerprint([]byte("other-key-other-key-other-key-ot"), []byte("hello")); fp3 == fp {
		t.Error("different keys same fingerprint")
	}
}

func TestHasConnectionHeader(t *testing.T) {
	h := http.Header{"Connection": {"keep-alive, X-Custom"}}
	if !HasConnectionHeader(h, "X-Custom") {
		t.Error("X-Custom not found")
	}
	if !HasConnectionHeader(h, "Keep-Alive") {
		t.Error("Keep-Alive not found")
	}
	if HasConnectionHeader(h, "X-Other") {
		t.Error("X-Other found")
	}
	if HasConnectionHeader(http.Header{}, "X-Custom") {
		t.Error("empty header found something")
	}
	multi := http.Header{"Connection": {"X-A", "X-B, X-C"}}
	if !HasConnectionHeader(multi, "X-A") {
		t.Error("X-A not found in multi-value")
	}
	if !HasConnectionHeader(multi, "X-C") {
		t.Error("X-C not found in multi-value")
	}
	tabs := http.Header{"Connection": {"\t X-Tab \t"}}
	if !HasConnectionHeader(tabs, "X-Tab") {
		t.Error("X-Tab with tab whitespace not found")
	}
}

func TestParseStatusEdgeCases(t *testing.T) {
	if err := Validate(rule(1, PhaseResponse, 0, Matchers{Status: []string{"4ab"}}, setHeader("X-A", "v"))); err == nil {
		t.Error("status 4ab accepted")
	}
	if err := Validate(rule(1, PhaseResponse, 0, Matchers{Status: []string{"0xx"}}, setHeader("X-A", "v"))); err == nil {
		t.Error("status 0xx accepted")
	}
	if err := Validate(rule(1, PhaseResponse, 0, Matchers{Status: []string{"99"}}, setHeader("X-A", "v"))); err == nil {
		t.Error("status 99 accepted")
	}
	if err := Validate(rule(1, PhaseResponse, 0, Matchers{Status: []string{"1234"}}, setHeader("X-A", "v"))); err == nil {
		t.Error("status 1234 accepted")
	}
}

func TestRespHeadersBadRegex(t *testing.T) {
	err := Validate(rule(1, PhaseResponse, 0, Matchers{RespHeaders: []HeaderMatcher{{Name: "Server", ValueRegex: "("}}}, setHeader("X-A", "v")))
	if err == nil {
		t.Error("bad resp_headers regex accepted")
	}
}

func TestRespBodyRegexBadPattern(t *testing.T) {
	err := Validate(rule(1, PhaseResponse, 0, Matchers{RespBodyRegex: "("}, setHeader("X-A", "v")))
	if err == nil {
		t.Error("bad resp_body_regex accepted")
	}
}

func TestRespBodyRegexTooLong(t *testing.T) {
	long := strings.Repeat("a", MaxPatternSize+1)
	err := Validate(rule(1, PhaseResponse, 0, Matchers{RespBodyRegex: long}, setHeader("X-A", "v")))
	if err == nil {
		t.Error("too-long resp_body_regex accepted")
	}
}

func TestHostGlobExactLengthMatch(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{Host: "*.example.com"}, setHeader("X-A", "1")))
	req := request("GET", "http://example.com/", nil, "")
	res := s.Apply(PhaseRequest, Input{Request: req})
	if res.Changed {
		t.Error("*.example.com matched example.com (same suffix length)")
	}
}

func TestApplyNoRulesForPhase(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "1")))
	res := s.Apply(PhaseResponse, Input{Request: request("GET", "http://h.example/", nil, ""), Response: response(200, nil, "ok")})
	if res.Changed || len(res.Lines) != 0 {
		t.Fatal("response phase should have no rules")
	}
}

func TestSetStatusNoChange(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseResponse, 0, Matchers{}, Action{Type: ActionSetStatus, Value: "200"}))
	res := s.Apply(PhaseResponse, Input{
		Request:  request("GET", "http://h.example/", nil, ""),
		Response: response(200, nil, "ok"),
	})
	if res.Changed || len(res.Lines) != 0 {
		t.Fatal("setting status to same value should not produce a line")
	}
}

func TestSetMethodNoChange(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetMethod, Value: "GET"}))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/", nil, "")})
	if res.Changed || len(res.Lines) != 0 {
		t.Fatal("setting method to same value should not produce a line")
	}
}

func TestReplaceURLNoMatch(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceURL, Regex: "zzz", Value: "/other"}))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/path", nil, "")})
	if res.Changed || len(res.Lines) != 0 {
		t.Fatal("replace_url with no match should not change anything")
	}
}

func TestReplaceURLSameResult(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceURL, Regex: "^(.*)$", Value: "$1"}))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/path?q=1", nil, "")})
	if res.Changed || len(res.Lines) != 0 {
		t.Fatal("replace_url producing same result should not change anything")
	}
}

func TestContentEncodingWhitespace(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionSetBody, Value: "new"}))
	req := request("POST", "http://h.example/", http.Header{"Content-Encoding": {"  identity  "}}, "old")
	res := s.Apply(PhaseRequest, Input{Request: req})
	if !res.Changed || string(res.Request.Body) != "new" {
		t.Fatal("identity with whitespace should be treated as no encoding")
	}
}

func TestTaintedField(t *testing.T) {
	s := compile(t, Options{TraceKey: testKey},
		rule(1, PhaseRequest, 0, Matchers{},
			Action{Type: ActionSetHeader, Name: "X-Token", Value: "secret", Sensitive: true}))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/", nil, "")})
	if res.Tainted == nil || !res.Tainted["header:X-Token"] {
		t.Fatalf("Tainted = %v, want header:X-Token", res.Tainted)
	}
}

func TestNoTaintedField(t *testing.T) {
	s := compile(t, Options{}, rule(1, PhaseRequest, 0, Matchers{}, setHeader("X-A", "v")))
	res := s.Apply(PhaseRequest, Input{Request: request("GET", "http://h.example/", nil, "")})
	if res.Tainted != nil {
		t.Fatalf("Tainted = %v, want nil", res.Tainted)
	}
}

func TestReplaceHeaderExpansionLimit(t *testing.T) {
	grow := strings.Repeat("b", MaxValueSize)
	s := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceHeader, Name: "X-A", Regex: "a", Value: grow}))
	req := request("GET", "http://h.example/", http.Header{"X-A": {"aa"}}, "")
	res := s.Apply(PhaseRequest, Input{Request: req})
	wantLines(t, res.Lines, "1:replace_header:header:X-A:error:expansion_limit")
}

func TestReplaceURLExpansionNoMatchLeavesURL(t *testing.T) {
	s := compile(t, Options{},
		rule(1, PhaseRequest, 0, Matchers{}, Action{Type: ActionReplaceURL, Regex: "NOMATCH", Value: "/x"}))
	req := request("GET", "http://h.example/path", nil, "")
	res := s.Apply(PhaseRequest, Input{Request: req})
	if res.Changed {
		t.Fatal("no match should leave URL unchanged")
	}
}

func TestMultipleBodyActionsTraceKeepsLast(t *testing.T) {
	s := compile(t, Options{},
		rule(1, PhaseResponse, 0, Matchers{},
			Action{Type: ActionSetBody, Value: "first"},
			Action{Type: ActionReplaceBody, Regex: "first", Value: "second"}),
		rule(2, PhaseResponse, 1, Matchers{},
			Action{Type: ActionSetBody, Value: "final"}))
	res := s.Apply(PhaseResponse, Input{
		Request:  request("GET", "http://h.example/", nil, ""),
		Response: response(200, nil, "original"),
	})
	for i, l := range res.Lines {
		if l.Field == "body" && l.Outcome == OutcomeApplied {
			if i == len(res.Lines)-1 {
				if string(l.After) != "final" {
					t.Fatalf("last body line after=%q, want final", l.After)
				}
			} else if l.After != nil {
				t.Fatalf("non-last body line %d has after=%q", i, l.After)
			}
		}
	}
}

func TestRequestBodyIneligibleInResponsePhase(t *testing.T) {
	s := compile(t, Options{},
		rule(1, PhaseResponse, 0, Matchers{BodyRegex: "pattern"}, setHeader("X-A", "1")))
	big := request("POST", "http://h.example/", nil, strings.Repeat("a", MaxBodySize+1))
	res := s.Apply(PhaseResponse, Input{Request: big, Response: response(200, nil, "ok")})
	wantLines(t, res.Lines, "1:::skipped:not rewritten: body too large")
}

func mustURL(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		panic(err)
	}
	return u
}
