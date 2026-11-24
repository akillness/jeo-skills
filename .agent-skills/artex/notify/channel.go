package notify

import (
	"context"
	"errors"
	"sort"
	"strconv"
	"strings"
)

// Channel is the adapter for one notification channel. Implementations must be
// **stateless**: the same instance is shared concurrently by multiple channel
// configurations, and credentials are always passed in via the cfg parameter.
type Channel interface {
	// Kind returns the channel type identifier; it must match the registry key.
	Kind() string
	// Validate is called when saving a configuration and checks required fields and
	// formats. The returned error is shown directly to the configurator, so the
	// message must say "which field is missing" rather than a vague "invalid config".
	Validate(cfg map[string]any) error
	// Send delivers one message and returns the **number of items actually
	// delivered** plus an error.
	//
	// Why return a count: every platform has a message length limit, and an
	// aggregated message that cannot hold the whole batch gets truncated. If the
	// caller unconditionally marked the whole batch as delivered, the truncated
	// items would vanish — invisible in the message and shown as succeeded in the
	// delivery history, with no way to discover the findings were never sent. By
	// returning kept, the caller marks only the first kept items and leaves the
	// rest for the next batch.
	//
	// A returned error means delivery failed; *PermanentError means do not retry.
	// On failure kept is meaningless and the caller should ignore it.
	Send(ctx context.Context, cfg map[string]any, m Message) (int, error)
	// DefaultRatePerMin returns the channel's officially recommended per-minute
	// delivery cap, used as the default rate limit when a channel instance is
	// created. 0 means no known limit.
	DefaultRatePerMin() int
	// SecretKeys returns the config keys that are credentials. The API masks these
	// values on readback, and a masked value on update keeps the stored original.
	// Only the implementation itself knows which fields are credentials (for WeCom
	// the entire Webhook address is a credential, while for DingTalk only the
	// secret inside it is), so this knowledge must come from the channel, not be
	// guessed by upper layers.
	SecretKeys() []string
	// DestinationKeys returns the config keys that decide "where messages go".
	//
	// Like SecretKeys this is security-relevant: the destination address and the
	// credentials are two independent sets of fields. If "change only the address,
	// keep the credentials as-is" were allowed, anyone who can edit the channel
	// config could send the stored real credentials to a server they control, and
	// the config masking would be pointless.
	// See PrepareConfigUpdate.
	DestinationKeys() []string
}

// registry is the channel registry. Deliberately an explicit literal instead of
// init() self-registration: "which channels exist" is visible in one place, and a
// newly added channel surfaces omissions at compile time rather than via runtime
// side effects.
var registry = map[string]Channel{
	KindDingTalk: dingTalkChannel{},
	KindFeishu:   feishuChannel{},
	KindWeCom:    weComChannel{},
	KindWebhook:  webhookChannel{},
	KindTelegram: telegramChannel{},
	KindEmail:    emailChannel{},
}

// Get returns the channel implementation for a type.
func Get(kind string) (Channel, bool) {
	c, ok := registry[kind]
	return c, ok
}

// ValidKind reports whether kind is a supported channel type.
func ValidKind(kind string) bool {
	_, ok := registry[kind]
	return ok
}

// Kinds returns all supported channel types in lexicographic order (for a stable UI dropdown).
func Kinds() []string {
	out := make([]string, 0, len(registry))
	for k := range registry {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// PermanentError marks a delivery failure that must not be retried: bad
// credentials, destination refusal, invalid request body, etc. Retries only make
// sense for transient failures (network blips, rate limiting, peer 5xx); backing
// off and retrying a permanent failure never succeeds and buries the real error
// in retry logs.
type PermanentError struct{ Err error }

func (e *PermanentError) Error() string { return e.Err.Error() }
func (e *PermanentError) Unwrap() error { return e.Err }

// Permanent marks err as a permanent failure. A nil err returns nil,
// so it can be written as `return Permanent(someCheck())`.
func Permanent(err error) error {
	if err == nil {
		return nil
	}
	return &PermanentError{Err: err}
}

// IsPermanent reports whether err's chain carries the permanent-failure marker.
func IsPermanent(err error) bool {
	var pe *PermanentError
	return errors.As(err, &pe)
}

// ---- config-reading helpers ----
//
// Channel configs come from a JSONB database column; after encoding/json
// deserialization they are map[string]any, with all numbers as float64 and arrays
// as []any. The helpers below unify that conversion and tolerate type deviations
// from users leaving fields empty in the UI (e.g. entering the port as a string).

// cfgString reads a string config item, always trimming surrounding whitespace —
// easy to pick up when copy-pasting from a web form.
func cfgString(cfg map[string]any, key string) string {
	v, ok := cfg[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

// cfgInt reads an integer config item, accepting both float64 (the JSON default)
// and string sources.
func cfgInt(cfg map[string]any, key string) int {
	switch v := cfg[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil {
			return 0
		}
		return n
	default:
		return 0
	}
}

// cfgBool reads a boolean config item, also accepting the strings "true"/"1".
func cfgBool(cfg map[string]any, key string) bool {
	switch v := cfg[key].(type) {
	case bool:
		return v
	case string:
		s := strings.ToLower(strings.TrimSpace(v))
		return s == "true" || s == "1" || s == "yes"
	default:
		return false
	}
}

// cfgStrings reads a string-array config item, trimming whitespace and dropping
// empty strings.
func cfgStrings(cfg map[string]any, key string) []string {
	raw, ok := cfg[key].([]any)
	if !ok {
		// Also accept a single string, to simplify form submissions with one value.
		if s := cfgString(cfg, key); s != "" {
			return []string{s}
		}
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		s, ok := v.(string)
		if !ok {
			continue
		}
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// cfgMap reads a string-map config item (e.g. custom HTTP headers), trimming keys
// and dropping empty keys.
func cfgMap(cfg map[string]any, key string) map[string]string {
	raw, ok := cfg[key].(map[string]any)
	if !ok {
		return nil
	}
	out := make(map[string]string, len(raw))
	for k, v := range raw {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		s, ok := v.(string)
		if !ok {
			continue
		}
		out[k] = s
	}
	return out
}
