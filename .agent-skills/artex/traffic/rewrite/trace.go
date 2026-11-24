package rewrite

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// Outcomes of a trace line.
const (
	OutcomeApplied = "applied"
	OutcomeSkipped = "skipped"
	OutcomeError   = "error"
)

// Reasons of a skipped line.
const (
	ReasonStream           = "not rewritten: stream"
	ReasonBinary           = "not rewritten: binary"
	ReasonBodyTooLarge     = "not rewritten: body too large"
	ReasonContentEncoding  = "not rewritten: content-encoding"
	ReasonNoBodyAllowed    = "not rewritten: no body allowed"
	ReasonConnectionHeader = "header named in Connection"
)

// Error classes: the only thing the engine reports about a failed rule. They
// are the Reason of an error line and the Class of a LastError.
const (
	ErrClassInvalidURL = "invalid_url"     // a rewritten path and query is not a valid request URI
	ErrClassExpansion  = "expansion_limit" // a replace result exceeds MaxExpansion
	ErrClassPanic      = "panic"
	// ErrClassTransport is recorded by the proxy, not the engine: the request a
	// rule rewrote could not be sent or answered.
	ErrClassTransport = "transport_error"
)

// Source kinds of a trace line in exchange_rewrites.
const (
	SourceKindRule = "rule"
	SourceKindHook = "hook"
)

// TraceLine is one row of an exchange's rewrite trace, in order. An exchange is
// rewritten when it has at least one applied line.
type TraceLine struct {
	Phase       Phase
	SourceKind  string // "rule" (default when empty) | "hook"
	RuleID      int64  // 0 on a global or hook line
	HookID      int64  // 0 on a rule or global line
	HookVersion int    // 0 on a rule or global line
	// RuleSnapshot is the rule or hook metadata as JSON, on its first line in the exchange only.
	RuleSnapshot string
	Action       string
	Field        string // "method", "url", "header:<Name>", "body" or "status"
	Outcome      string
	Reason       string
	// BeforeHash and AfterHash are SHA-256 in hex. Once a sensitive action wrote
	// the field they are the keyed fingerprint instead, or empty without a key.
	BeforeHash string
	AfterHash  string
	// After is the new value. It is nil for a sensitive action, for a field a
	// sensitive action wrote earlier in the phase, and for every body line but
	// the last one of the phase.
	After []byte
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// fingerprint is HMAC-SHA256 truncated to 128 bits. It is not comparable
// between instances, and there is no unkeyed fallback.
func (s *Set) fingerprint(b []byte) string {
	if len(s.traceKey) == 0 {
		return ""
	}
	m := hmac.New(sha256.New, s.traceKey)
	m.Write(b)
	return hex.EncodeToString(m.Sum(nil)[:16])
}

type snapshotAction struct {
	Type        string  `json:"type"`
	Name        string  `json:"name,omitempty"`
	Regex       string  `json:"regex,omitempty"`
	Value       *string `json:"value,omitempty"`
	Sensitive   bool    `json:"sensitive,omitempty"`
	ValueLen    int     `json:"value_len,omitempty"`
	ValueSHA256 string  `json:"value_sha256,omitempty"`
}

func ruleSnapshot(r Rule) string {
	actions := make([]snapshotAction, 0, len(r.Actions))
	for _, a := range r.Actions {
		sa := snapshotAction{Type: a.Type, Name: a.Name, Regex: a.Regex, Sensitive: a.Sensitive}
		switch {
		case a.Sensitive:
		case len(a.Value) > snapshotValueMax:
			sa.ValueLen, sa.ValueSHA256 = len(a.Value), sha256Hex([]byte(a.Value))
		default:
			v := a.Value
			sa.Value = &v
		}
		actions = append(actions, sa)
	}
	out, _ := json.Marshal(struct {
		ID       int64            `json:"id"`
		Name     string           `json:"name"`
		Phase    Phase            `json:"phase"`
		Priority int              `json:"priority"`
		Matchers Matchers         `json:"matchers"`
		Actions  []snapshotAction `json:"actions"`
	}{r.ID, r.Name, r.Phase, r.Priority, r.Matchers, actions})
	return string(out)
}
