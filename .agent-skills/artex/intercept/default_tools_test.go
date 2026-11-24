package intercept

import "testing"

// TestDefaultEnabledToolsCoverExecutors pins the tools that must be gated when no
// intercept_enabled_tools setting has been saved. ExecuteExtraTool and Monitor
// dispatch MCP / deferred tools and background commands, so leaving them out let
// those calls bypass every rule.
func TestDefaultEnabledToolsCoverExecutors(t *testing.T) {
	got := map[string]bool{}
	for _, name := range defaultEnabledTools {
		got[name] = true
	}
	for _, want := range []string{"Bash", "Write", "Edit", "MultiEdit", "ExecuteExtraTool", "Monitor"} {
		if !got[want] {
			t.Errorf("defaultEnabledTools must include %q", want)
		}
	}
	for _, readOnly := range []string{"list_assets", "traffic_search", "Read"} {
		if got[readOnly] {
			t.Errorf("defaultEnabledTools must not gate the read-only tool %q by default", readOnly)
		}
	}
}

// TestEnabledToolsFromSettingNeverDisablesTheGate: an unset or malformed setting
// must keep the defaults, not turn the rule system off.
func TestEnabledToolsFromSettingNeverDisablesTheGate(t *testing.T) {
	for _, tc := range []struct {
		name string
		val  string
		ok   bool
	}{
		{"unset", "", false},
		{"malformed", "{not json", true},
		{"wrong shape", `"Bash"`, true},
	} {
		got := enabledToolsFromSetting(tc.val, tc.ok)
		if !got["Bash"] || !got["ExecuteExtraTool"] || !got["Monitor"] {
			t.Errorf("%s: enabled tools %v, want the defaults", tc.name, got)
		}
	}
	// A valid explicit list replaces the defaults.
	got := enabledToolsFromSetting(`["Bash"]`, true)
	if !got["Bash"] || got["WebFetch"] {
		t.Fatalf("explicit list: %v, want only Bash", got)
	}
}
