package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	actool "github.com/Autumn-27/norma/tool"
)

func TestFindingWorkflowSharedAssemblyAndSwitch(t *testing.T) {
	oldPolicy, oldResolve, oldAugment := FindingTrafficBindingEnabled(), ToolResolve(), ToolAugment()
	t.Cleanup(func() {
		SetFindingTrafficBindingEnabled(oldPolicy)
		SetToolResolve(oldResolve)
		SetToolAugment(oldAugment)
	})
	SetToolAugment(nil)
	on := false
	SetFindingTrafficBindingEnabled(func() bool { return on })
	ts := NewToolSet(nil, "fixture")
	SetToolResolve(func(_ context.Context, _ string, base []actool.CoreTool) []actool.CoreTool {
		out := make([]actool.CoreTool, len(base))
		for i, tool := range base {
			out[i] = DecorateTool(tool, "CUSTOM DESCRIPTION", tool.InputSchema())
		}
		return out
	})
	for _, role := range []string{"worker", "planner", "mainagent", "auto", "pentest", "custom-agent"} {
		for _, enabled := range []bool{false, true, false} {
			on = enabled
			out, def, cleanup := AugmentTools(t.Context(), role, []actool.CoreTool{ts.addFinding(), ts.addHint()})
			cleanup()
			system, _ := deferredSystem("USER CUSTOM PROMPT", def)
			if !strings.HasPrefix(system[0], "USER CUSTOM PROMPT") {
				t.Fatal("custom prompt replaced")
			}
			if strings.Contains(system[0], "traffic_refs") != on {
				t.Fatalf("%s: guidance ignored switch: %v", role, on)
			}
			if !on {
				// The switch strips the tool and the schema, so the tool descriptions
				// must say so: otherwise the agent chases bind_finding_traffic, which
				// is not in its toolset, and burns turns on it.
				if def.FindingGuidance != "" {
					t.Fatalf("%s: disabled deployment must keep the standing guidance empty, got %q", role, def.FindingGuidance)
				}
				noted := false
				for _, tool := range out {
					if !strings.Contains(tool.Description(), "automatic traffic binding is OFF") {
						continue
					}
					noted = true
					// The tool that carries traffic parameters is the one whose
					// schema lost them, so it must name the absent tool.
					if tool.Name() == "report_finding" && !strings.Contains(tool.Description(), "bind_finding_traffic") {
						t.Fatalf("%s: report_finding note must name the absent tool", role)
					}
				}
				if !noted {
					t.Fatalf("%s: disabled deployment must state on the tools that binding is off", role)
				}
			}
			if on && (!strings.Contains(system[0], "TCP") || !strings.Contains(system[0], "evidence_hint_id")) {
				t.Fatal("missing optional/handoff contract")
			}
			for _, tool := range out {
				if !strings.HasPrefix(tool.Description(), "CUSTOM DESCRIPTION") {
					t.Fatal("custom description replaced")
				}
				raw, _ := json.Marshal(tool.InputSchema())
				var schema map[string]any
				json.Unmarshal(raw, &schema)
				props := schema["properties"].(map[string]any)
				if (props["traffic_refs"] != nil) != on {
					t.Fatalf("%s: binding schema ignored switch", role)
				}
				if tool.Name() == "add_hint" {
					nested := props["hints"].(map[string]any)["items"].(map[string]any)["properties"].(map[string]any)
					if (nested["traffic_refs"] != nil) != on {
						t.Fatal("nested hint schema ignored switch")
					}
				}
			}
		}
	}
	on = true
	SetToolResolve(func(context.Context, string, []actool.CoreTool) []actool.CoreTool { return nil })
	out, def, cleanup := AugmentTools(t.Context(), "planner", []actool.CoreTool{ts.addFinding()})
	defer cleanup()
	if len(out) != 0 || def.FindingGuidance != "" {
		t.Fatal("reintroduced disabled tool or its guidance")
	}
}

func TestFindingWorkflowToolsTrafficCaptureOffNotice(t *testing.T) {
	oldPolicy, oldCapture, oldResolve, oldAugment := FindingTrafficBindingEnabled(), TrafficCaptureEnabled(), ToolResolve(), ToolAugment()
	t.Cleanup(func() {
		SetFindingTrafficBindingEnabled(oldPolicy)
		SetTrafficCaptureEnabled(oldCapture)
		SetToolResolve(oldResolve)
		SetToolAugment(oldAugment)
	})
	SetToolAugment(nil)
	SetToolResolve(nil)
	ts := NewToolSet(nil, "fixture")
	base := []actool.CoreTool{ts.proveGoal(), ts.addFinding(), ts.addHint()}

	for _, binding := range []bool{false, true} {
		SetFindingTrafficBindingEnabled(func() bool { return binding })

		calls := 0
		SetTrafficCaptureEnabled(func() bool {
			calls++
			return false
		})
		outOff, _, clOff := AugmentTools(t.Context(), "planner", base)
		clOff()
		if calls != 1 {
			t.Fatalf("binding=%v: capture hook called %d times for %d tools, want 1", binding, calls, len(base))
		}
		for _, tool := range outOff {
			desc := tool.Description()
			switch tool.Name() {
			case "prove_goal", "report_finding":
				if !strings.Contains(desc, "traffic capture is currently OFF") {
					t.Fatalf("binding=%v %s: expected capture-off notice in description, got %q", binding, tool.Name(), desc)
				}
			case "add_hint":
				if strings.Contains(desc, "traffic capture is currently OFF") {
					t.Fatalf("binding=%v add_hint: unexpected capture-off notice", binding)
				}
			}
		}

		SetTrafficCaptureEnabled(func() bool { return true })
		outOn, _, clOn := AugmentTools(t.Context(), "planner", base)
		clOn()
		for _, tool := range outOn {
			if strings.Contains(tool.Description(), "traffic capture is currently OFF") {
				t.Fatalf("binding=%v %s: unexpected capture-off notice when capture is ON", binding, tool.Name())
			}
		}
	}
}
