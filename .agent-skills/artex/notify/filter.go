package notify

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// Filter is the contract for the notification_channels.filter JSONB column: the
// filter conditions of a channel instance. All fields are optional, and an absent
// field means "no filtering" — which is exactly the fallback semantics for
// malformed configuration; see ParseFilter.
type Filter struct {
	// MinSeverity is the minimum severity threshold (low/medium/high/critical);
	// empty = no threshold.
	MinSeverity string `json:"min_severity"`
	// TaskIDs / AssetIDs: an empty array means unrestricted; non-empty requires
	// the event to intersect with it.
	TaskIDs  []int64 `json:"task_ids"`
	AssetIDs []int64 `json:"asset_ids"`
	// VulnClassInclude: empty means accept everything; non-empty requires
	// vulnclass to hit any of the keywords.
	// VulnClassExclude: hitting any keyword excludes the event (exclusion takes
	// precedence over inclusion).
	// Matching is case-insensitive substring — safer than regex: a user
	// misconfiguring a regex cannot silently disable the channel.
	VulnClassInclude []string `json:"vulnclass_include"`
	VulnClassExclude []string `json:"vulnclass_exclude"`
	// OnStatusChange decides whether the channel receives vulnerability
	// status-change events (only meaningful in realtime mode).
	OnStatusChange bool `json:"on_status_change"`
}

// ParseFilter parses a channel's filter configuration.
//
// **It never returns an error.** This is a deliberate design choice: malformed
// filter configuration always degrades to a zero-value Filter (= no filtering =
// everything matches), because for a vulnerability notification system, **pushing
// one extra message is far better than silently dropping a high-severity one**.
// Turning a parse failure into "do not push" would hand the user a channel that
// looks configured but pushes nothing — the worst failure mode of all.
func ParseFilter(raw []byte) Filter {
	var f Filter
	if len(raw) == 0 {
		return f
	}
	// On parse failure f stays at its zero value, i.e. no filtering.
	_ = json.Unmarshal(raw, &f)
	return f
}

// ValidMinSeverity reports whether s is a valid severity threshold (an empty
// string means no threshold).
func ValidMinSeverity(s string) bool {
	if s == "" {
		return true
	}
	_, ok := severityRank[s]
	return ok
}

// Validate checks the **value-restricted** fields of a filter configuration; it
// is called when saving a channel.
//
// Why it must be enforced at write time: Match treats an unknown threshold as
// `rank >= 0`, which is always true — in other words, one typo in min_severity
// ("hgih") makes the filter **silently degrade** into "push everything". This is
// consistent with this package's "rather over-push than miss" trade-off (nothing
// is missed), but the consequence is that the user believes they are doing
// tiered pushing while actually flooding the group with every vulnerability, and
// nothing hints at the misconfiguration. This kind of "silent degradation" is
// exactly what should be blocked at the entry point.
//
// Note that Validate is only used on the **write** path. The read path still
// follows ParseFilter's lenient semantics, so bad values already present in
// historical data do not make the whole channel unreadable.
func (f Filter) Validate() error {
	if !ValidMinSeverity(f.MinSeverity) {
		return fmt.Errorf("invalid min_severity %q; valid values: low / medium / high / critical, or empty for no threshold", f.MinSeverity)
	}
	return nil
}

// Match decides whether an event should be delivered to a channel carrying this
// filter.
//
// **It never returns an error**, for the same reason as ParseFilter: any internal
// anomaly is treated as "match". Order of checks: event kind → severity
// threshold → task/asset scope → vulnerability class keywords.
func Match(f Filter, s Snapshot) bool {
	// Status-change events are only received by channels that explicitly opted
	// in. Default is off, because the vast majority of users expect "push" to
	// mean "a new vulnerability was found", not a running log of every status
	// transition.
	if s.Kind == EventFindingStatusChanged && !f.OnStatusChange {
		return false
	}
	if !AtLeast(s.Severity, f.MinSeverity) {
		return false
	}
	if len(f.TaskIDs) > 0 && !slices.Contains(f.TaskIDs, s.TaskID) {
		return false
	}
	if len(f.AssetIDs) > 0 && !intersectsInt(f.AssetIDs, s.AssetIDs) {
		return false
	}
	// Exclusion first: hitting any exclusion keyword knocks the event out, even
	// if it also hits the include list.
	if len(f.VulnClassExclude) > 0 && containsAnyFold(s.VulnClass, f.VulnClassExclude) {
		return false
	}
	if len(f.VulnClassInclude) > 0 && !containsAnyFold(s.VulnClass, f.VulnClassInclude) {
		return false
	}
	return true
}

func intersectsInt(a, b []int64) bool {
	// Linear scan is fine for small sets; both sides are on the order of "a few
	// dozen hand-picked entries", so building a map costs more than it saves.
	for _, v := range b {
		if slices.Contains(a, v) {
			return true
		}
	}
	return false
}

// containsAnyFold reports whether s contains any of the keywords
// (case-insensitive).
func containsAnyFold(s string, keywords []string) bool {
	lower := strings.ToLower(s)
	for _, kw := range keywords {
		kw = strings.ToLower(strings.TrimSpace(kw))
		if kw != "" && strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}
