package agent

import (
	"strings"
	"testing"
)

func TestRenderSystemOverrideAndFallback(t *testing.T) {
	t.Cleanup(func() { SetPromptOverride(nil) })

	// no override → built-in default
	SetPromptOverride(nil)
	if got := renderSystem("planner", "DEFAULT", PlannerVars{Goal: "g"}); got != "DEFAULT" {
		t.Fatalf("no override should give default, got %q", got)
	}

	// override → rendered with vars
	SetPromptOverride(func(k string) (string, bool) {
		if k == "planner" {
			return "Goal:{{.Goal}} Scope:{{.Scope}}", true
		}
		return "", false
	})
	if got := renderSystem("planner", "DEFAULT", PlannerVars{Goal: "capture X", Scope: "*.x.com"}); got != "Goal:capture X Scope:*.x.com" {
		t.Fatalf("override render: %q", got)
	}

	// override referencing a non-catalog var → execution error → fallback to default
	SetPromptOverride(func(k string) (string, bool) { return "{{.NotInCatalog}}", true })
	if got := renderSystem("planner", "DEFAULT", PlannerVars{Goal: "x"}); got != "DEFAULT" {
		t.Fatalf("bad var should fall back to default, got %q", got)
	}

	// full plannerSystem path: DB body [A] is honored, then the code-owned tail
	// [C] (intermediate artifact output rules) is ALWAYS appended — editing the body
	// can't drop it.
	SetPromptOverride(func(k string) (string, bool) { return "PLANNER {{.Goal}}", true })
	got := plannerSystem("capture X", "/data", "/data")
	if !strings.HasPrefix(got, "PLANNER capture X") {
		t.Fatalf("plannerSystem body not honored: %q", got)
	}
	if !strings.Contains(got, "Intermediate artifact output rules") || !strings.Contains(got, "/data") {
		t.Fatalf("plannerSystem missing code-owned artifact tail: %q", got)
	}

	// worker dual-text via {{if .ProxyAddr}} in a user template, plus the code tail:
	// [B] trafficTool present only when RECORDING (caCert set — the MITM is on, so
	// the traffic_* tools exist), [C] artifact spec always present. The trafficTool
	// block is gated on the CA (arg 2), NOT on ProxyAddr — a global egress proxy
	// with capture off routes traffic but records nothing.
	SetPromptOverride(func(k string) (string, bool) {
		return "{{if .ProxyAddr}}via proxy {{.ProxyAddr}}{{else}}manual{{end}}", true
	})
	recording := workerSystem("127.0.0.1:8080", "/ca.pem", "/data", "/data")
	if !strings.HasPrefix(recording, "via proxy 127.0.0.1:8080") {
		t.Fatalf("worker proxy branch body: %q", recording)
	}
	if !strings.Contains(recording, "traffic_search") {
		t.Fatalf("worker while recording should inject trafficTool: %q", recording)
	}
	if strings.Contains(recording, "traffic_refs") {
		t.Fatalf("worker bypassed shared optional evidence policy: %q", recording)
	}
	if !strings.Contains(recording, "Intermediate artifact output rules") {
		t.Fatalf("worker missing artifact tail: %q", recording)
	}
	// Egress proxy set but capture OFF (no CA): the ProxyAddr template branch still
	// renders, but the trafficTool block must NOT — those tools are not registered.
	egressOnly := workerSystem("127.0.0.1:8080", "", "/data", "/data")
	if !strings.HasPrefix(egressOnly, "via proxy 127.0.0.1:8080") {
		t.Fatalf("worker egress-only branch body: %q", egressOnly)
	}
	if strings.Contains(egressOnly, "traffic_search") {
		t.Fatalf("worker without recording must NOT inject trafficTool: %q", egressOnly)
	}
	noProxy := workerSystem("", "", "/data", "/data")
	if !strings.HasPrefix(noProxy, "manual") {
		t.Fatalf("worker no-proxy branch body: %q", noProxy)
	}
	if strings.Contains(noProxy, "traffic_search") {
		t.Fatalf("worker without proxy must NOT inject trafficTool: %q", noProxy)
	}
}
