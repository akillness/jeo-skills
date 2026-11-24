package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

const assessmentUserAgent = "ARTEX-Assessment/1.0"

var (
	assessmentReference = regexp.MustCompile(`^[A-Za-z0-9._-]{0,64}$`)
	asciiDNSLabel       = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$`)
)

// TaskUserAgents maps opted-in task IDs to their allowed origins and label.
type TaskUserAgents map[string]AssessmentIdentity

func (a *TaskUserAgents) UnmarshalJSON(data []byte) error {
	var entries map[string]AssessmentIdentity
	if err := json.Unmarshal(data, &entries); err != nil {
		return fmt.Errorf("task_user_agents: %w", err)
	}
	for taskID := range entries {
		id, err := strconv.ParseInt(taskID, 10, 64)
		if err != nil || id <= 0 || strconv.FormatInt(id, 10) != taskID {
			return errors.New("task_user_agents task IDs must be positive integers written without a sign or leading zeroes")
		}
	}
	*a = entries
	return nil
}

// AssessmentIdentity holds a task's validated assessment identifier and allowed
// HTTP(S) origins. The zero value is disabled.
type AssessmentIdentity struct {
	userAgent string
	origins   map[string]struct{}
}

func (a *AssessmentIdentity) UnmarshalJSON(data []byte) error {
	var entry struct {
		Reference json.RawMessage `json:"reference"`
		Origins   []string        `json:"origins"`
	}
	if err := json.Unmarshal(data, &entry); err != nil {
		return err
	}
	if len(entry.Origins) == 0 {
		return errors.New("each task requires a nonempty origins list")
	}
	ua := assessmentUserAgent
	if entry.Reference != nil {
		var ref *string
		if err := json.Unmarshal(entry.Reference, &ref); err != nil || ref == nil || !assessmentReference.MatchString(*ref) {
			return errors.New("reference must be an empty string or contain 1 to 64 characters from A-Z, a-z, 0-9, dot, underscore and hyphen")
		}
		if *ref != "" {
			ua += " (engagement=" + *ref + ")"
		}
	}
	origins := make(map[string]struct{}, len(entry.Origins))
	for i, raw := range entry.Origins {
		u, err := url.Parse(raw)
		if err != nil || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawPath != "" || u.RawQuery != "" || u.ForceQuery || strings.Contains(raw, "#") {
			return fmt.Errorf("origins entry %d must be an exact HTTP(S) origin without credentials, path, query or fragment", i+1)
		}
		key := assessmentOriginKey(u)
		if key == "" {
			return fmt.Errorf("origins entry %d requires HTTP(S), an ASCII DNS name or IP address, and a valid port", i+1)
		}
		origins[key] = struct{}{}
	}
	*a = AssessmentIdentity{userAgent: ua, origins: origins}
	return nil
}

// UserAgent returns the stable identifier for this assessment identity.
func (a AssessmentIdentity) UserAgent() string { return a.userAgent }

// AllowsOrigin reports whether the URL belongs to a configured origin.
func (a AssessmentIdentity) AllowsOrigin(u *url.URL) bool {
	if len(a.origins) == 0 {
		return false
	}
	_, ok := a.origins[assessmentOriginKey(u)]
	return ok
}

// SameAssessmentOrigin compares URLs using the same rules as the origin list.
func SameAssessmentOrigin(a, b *url.URL) bool {
	key := assessmentOriginKey(a)
	return key != "" && key == assessmentOriginKey(b)
}

func assessmentOriginKey(u *url.URL) string {
	if u == nil || u.Opaque != "" || strings.HasSuffix(u.Host, ":") {
		return ""
	}
	var port string
	switch u.Scheme {
	case "http":
		port = "80"
	case "https":
		port = "443"
	default:
		return ""
	}
	if p := u.Port(); p != "" {
		n, err := strconv.ParseUint(p, 10, 16)
		if err != nil || n == 0 || strconv.FormatUint(n, 10) != p {
			return ""
		}
		port = p
	}
	host := u.Hostname()
	bracketed := strings.HasPrefix(u.Host, "[")
	if addr, err := netip.ParseAddr(host); err == nil {
		if addr.Zone() != "" || addr.Is6() != bracketed {
			return ""
		}
		host = addr.String()
	} else {
		if bracketed || len(host) > 253 {
			return ""
		}
		for label := range strings.SplitSeq(host, ".") {
			if !asciiDNSLabel.MatchString(label) {
				return ""
			}
		}
		host = strings.ToLower(host) // the label check ensures ASCII-only folding
	}
	return u.Scheme + "://" + net.JoinHostPort(host, port)
}
