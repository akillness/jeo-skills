package notify

import "testing"

func TestParseFilterMalformedFallsBackToMatchAll(t *testing.T) {
	// Malformed JSON, empty input, fields of the wrong type — all must degrade to
	// a zero-value Filter, i.e. "no filtering". This invariant is where "rather
	// over-push than miss" lands: if this ever changes to erroring or partial
	// parsing, one mistyped character silently drops every high-severity
	// notification.
	cases := []struct {
		name string
		raw  string
	}{
		{"empty input", ""},
		{"invalid JSON", `{not json`},
		{"truncated JSON", `{"min_severity":`},
		{"type mismatch", `{"min_severity": 123, "task_ids": "abc"}`},
		{"top-level array", `[1,2,3]`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := ParseFilter([]byte(tc.raw))
			if f.MinSeverity != "" || len(f.TaskIDs) != 0 || len(f.AssetIDs) != 0 {
				t.Fatalf("malformed configuration should degrade to a zero-value Filter, got %+v", f)
			}
			// A zero-value Filter must match any event.
			ev := Snapshot{Kind: EventFindingCreated, Severity: "low", VulnClass: "XSS"}
			if !Match(f, ev) {
				t.Fatal("a zero-value Filter should match all events")
			}
		})
	}
}

func TestMatchSeverityThreshold(t *testing.T) {
	ev := func(sev string) Snapshot {
		return Snapshot{Kind: EventFindingCreated, Severity: sev}
	}
	cases := []struct {
		min    string
		sev    string
		expect bool
	}{
		{"", "low", true},
		{"", "critical", true},
		{"high", "critical", true},
		{"high", "high", true},
		{"high", "medium", false},
		{"high", "low", false},
		{"critical", "high", false},
		{"critical", "critical", true},
		// Unknown severities have ordinal 0 and should be stopped by any non-empty
		// threshold (when in doubt, do not push).
		{"low", "", false},
		{"low", "unknown", false},
		{"", "", true},
	}
	for _, tc := range cases {
		got := Match(Filter{MinSeverity: tc.min}, ev(tc.sev))
		if got != tc.expect {
			t.Errorf("min=%q sev=%q: want %v got %v", tc.min, tc.sev, tc.expect, got)
		}
	}
}

func TestMatchScopeRestrictions(t *testing.T) {
	ev := Snapshot{
		Kind:      EventFindingCreated,
		Severity:  "high",
		TaskID:    7,
		AssetIDs:  []int64{10, 20},
		VulnClass: "SQL injection",
	}
	cases := []struct {
		name   string
		filter Filter
		expect bool
	}{
		{"empty scope = unrestricted", Filter{}, true},
		{"task hit", Filter{TaskIDs: []int64{7}}, true},
		{"task miss", Filter{TaskIDs: []int64{8}}, false},
		{"task multi-select with hit", Filter{TaskIDs: []int64{8, 7}}, true},
		{"assets intersect", Filter{AssetIDs: []int64{20, 99}}, true},
		{"assets do not intersect", Filter{AssetIDs: []int64{99}}, false},
		{"task and asset both hit", Filter{TaskIDs: []int64{7}, AssetIDs: []int64{10}}, true},
		{"task hit but asset miss", Filter{TaskIDs: []int64{7}, AssetIDs: []int64{99}}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Match(tc.filter, ev); got != tc.expect {
				t.Errorf("want %v got %v", tc.expect, got)
			}
		})
	}
}

func TestMatchVulnClassKeywords(t *testing.T) {
	ev := func(class string) Snapshot {
		return Snapshot{Kind: EventFindingCreated, Severity: "high", VulnClass: class}
	}
	cases := []struct {
		name   string
		filter Filter
		class  string
		expect bool
	}{
		{"empty include = accept all", Filter{}, "any class", true},
		{"include hit", Filter{VulnClassInclude: []string{"SQL"}}, "SQL injection", true},
		{"include miss", Filter{VulnClassInclude: []string{"command execution"}}, "SQL injection", false},
		{"include multi-word any hit", Filter{VulnClassInclude: []string{"command execution", "SQL"}}, "SQL injection", true},
		{"case insensitive", Filter{VulnClassInclude: []string{"sql"}}, "SQL injection", true},
		{"exclude hit excludes", Filter{VulnClassExclude: []string{"information disclosure"}}, "information disclosure", false},
		{"exclude miss passes", Filter{VulnClassExclude: []string{"information disclosure"}}, "SQL injection", true},
		// Exclusion takes precedence over inclusion: an event hitting both should
		// be knocked out.
		{"exclusion takes precedence over inclusion", Filter{
			VulnClassInclude: []string{"SQL"},
			VulnClassExclude: []string{"injection"},
		}, "SQL injection", false},
		// Pure-whitespace keywords must be ignored, otherwise they degrade into
		// "match any string containing a space".
		{"whitespace keywords ignored", Filter{VulnClassInclude: []string{"", "  "}}, "SQL injection", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Match(tc.filter, ev(tc.class)); got != tc.expect {
				t.Errorf("want %v got %v", tc.expect, got)
			}
		})
	}
}

func TestMatchStatusChangeRequiresOptIn(t *testing.T) {
	ev := Snapshot{Kind: EventFindingStatusChanged, Severity: "critical", FromStatus: "pending", ToStatus: "fixed"}
	// Default off: what most people mean by "push vulnerabilities" is discovering
	// new vulnerabilities, not a running log of status changes.
	if Match(Filter{MinSeverity: "low"}, ev) {
		t.Fatal("status-change events should be skipped when not enabled")
	}
	if !Match(Filter{OnStatusChange: true}, ev) {
		t.Fatal("status-change events should match once on_status_change is enabled")
	}
	// Creation events are not affected by on_status_change.
	created := Snapshot{Kind: EventFindingCreated, Severity: "critical"}
	if !Match(Filter{MinSeverity: "low"}, created) {
		t.Fatal("creation events should not depend on on_status_change")
	}
}
