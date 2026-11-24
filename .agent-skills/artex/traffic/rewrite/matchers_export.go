package rewrite

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
)

// CompiledMatchers wraps the compiled matcher state of a rewrite rule so
// tampering hooks reuse the exact same matcher validation and evaluation.
type CompiledMatchers struct {
	r *compiledRule
}

// CompileMatchers validates and compiles m for phase ("request" or "response").
func CompileMatchers(phase Phase, m Matchers) (*CompiledMatchers, error) {
	if phase != PhaseRequest && phase != PhaseResponse {
		return nil, validatePhaseErr(phase)
	}
	r := &compiledRule{phase: phase}
	if err := r.compileMatchers(m); err != nil {
		return nil, err
	}
	return &CompiledMatchers{r: r}, nil
}

func validatePhaseErr(phase Phase) error {
	_, err := compileRule(Rule{Name: "m", Phase: phase})
	return err
}

// MatchHead evaluates head-only matchers (method, host, url, headers, status).
func (cm *CompiledMatchers) MatchHead(req Request, resp Response) bool {
	if cm == nil || cm.r == nil {
		return true
	}
	return cm.r.matchHead(&state{req: req, resp: resp})
}

// MatchBody evaluates body regex matchers.
func (cm *CompiledMatchers) MatchBody(req Request, resp Response) bool {
	if cm == nil || cm.r == nil {
		return true
	}
	return cm.r.matchBody(&state{req: req, resp: resp})
}

// ValidateHeaderTarget validates that name is a legal, non-forbidden header name
// and returns its canonical form.
func ValidateHeaderTarget(name string) (string, error) { return headerTarget(name) }

// ValidateHeaderValue rejects CRLF and NUL bytes in a header value.
func ValidateHeaderValue(v string) error { return headerValue(v) }

// ValidToken reports whether s is an RFC 9110 token.
func ValidToken(s string) bool { return validToken(s) }

// ParsePathQuery parses a path and query starting with '/'.
func ParsePathQuery(s string) (*url.URL, bool) { return parsePathQuery(s) }

// BodyAllowedForStatus reports whether HTTP status allows a body (not 1xx/204/304).
func BodyAllowedForStatus(status int) bool { return bodyAllowedForStatus(status) }

// BodyDependentHeaders returns headers invalidated when a body is rewritten.
func BodyDependentHeaders() []string { return bodyDependentHeaders }

// SHA256Hex returns the lowercase hex SHA-256 digest of b.
func SHA256Hex(b []byte) string { return sha256Hex(b) }

// Fingerprint returns the 128-bit keyed HMAC-SHA256 hex digest of b, or ""
// when key is empty (matching sensitive rewrite-rule trace fingerprints).
func Fingerprint(key, b []byte) string {
	if len(key) == 0 {
		return ""
	}
	m := hmac.New(sha256.New, key)
	m.Write(b)
	return hex.EncodeToString(m.Sum(nil)[:16])
}

// HasConnectionHeader reports whether name is listed in the Connection header.
func HasConnectionHeader(h http.Header, canonicalName string) bool {
	for _, v := range h.Values("Connection") {
		for _, part := range splitComma(v) {
			if http.CanonicalHeaderKey(part) == canonicalName {
				return true
			}
		}
	}
	return false
}

func splitComma(s string) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			part := trimOWS(s[start:i])
			if part != "" {
				out = append(out, part)
			}
			start = i + 1
		}
	}
	return out
}

func trimOWS(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}
