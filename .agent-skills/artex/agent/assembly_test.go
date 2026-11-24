package agent

import (
	"context"
	"sync"
	"testing"

	actool "github.com/Autumn-27/norma/tool"
)

// Server wiring installs the hooks while restored tasks may already be assembling
// tools, rendering prompts and building settlement configs on other goroutines.
// Readers and writers run concurrently here, so under -race any unsynchronised
// hook access is reported regardless of scheduling.
func TestAgentHooksConcurrentSwap(t *testing.T) {
	oldAugment, oldResolve, oldPolicy := ToolAugment(), ToolResolve(), FindingTrafficBindingEnabled()
	oldPrompt, oldWrapup, oldWrapupTurns := PromptOverride(), WrapupOverride(), WrapupMaxTurnsOverride()
	oldTimeout, oldTimeoutTurns := WrapupTaskTimeoutOverride(), WrapupTaskTimeoutTurnsOverride()
	t.Cleanup(func() {
		SetToolAugment(oldAugment)
		SetToolResolve(oldResolve)
		SetFindingTrafficBindingEnabled(oldPolicy)
		SetPromptOverride(oldPrompt)
		SetWrapupOverride(oldWrapup)
		SetWrapupMaxTurnsOverride(oldWrapupTurns)
		SetWrapupTaskTimeoutOverride(oldTimeout)
		SetWrapupTaskTimeoutTurnsOverride(oldTimeoutTurns)
	})
	augment := func(context.Context, string) ([]actool.CoreTool, DeferredInfo, func()) {
		return nil, DeferredInfo{}, nil
	}
	resolve := func(_ context.Context, _ string, in []actool.CoreTool) []actool.CoreTool { return in }
	policy := func() bool { return false }
	text := func(string) (string, bool) { return "", false }
	turns := func(string) (int, bool) { return 0, false }
	setAll := func(on bool) {
		if on {
			SetToolAugment(augment)
			SetToolResolve(resolve)
			SetFindingTrafficBindingEnabled(policy)
			SetPromptOverride(text)
			SetWrapupOverride(text)
			SetWrapupMaxTurnsOverride(turns)
			SetWrapupTaskTimeoutOverride(text)
			SetWrapupTaskTimeoutTurnsOverride(turns)
			return
		}
		SetToolAugment(nil)
		SetToolResolve(nil)
		SetFindingTrafficBindingEnabled(nil)
		SetPromptOverride(nil)
		SetWrapupOverride(nil)
		SetWrapupMaxTurnsOverride(nil)
		SetWrapupTaskTimeoutOverride(nil)
		SetWrapupTaskTimeoutTurnsOverride(nil)
	}

	const rounds = 200
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			for range rounds {
				out, _, cleanup := AugmentTools(context.Background(), "worker", nil)
				cleanup()
				if len(out) != 0 {
					t.Errorf("AugmentTools(nil base) = %d tools, want 0", len(out))
					return
				}
				if got := renderSystem("planner", "DEFAULT", PlannerVars{}); got != "DEFAULT" {
					t.Errorf("renderSystem = %q, want the default", got)
					return
				}
				if st := wrapupSettlementForTask("worker", nil, true); st.Prompt != WrapupDefault("worker") {
					t.Errorf("settlement prompt = %q, want the default", st.Prompt)
					return
				}
			}
		})
	}
	wg.Go(func() {
		for range rounds {
			setAll(true)
			setAll(false)
		}
	})
	wg.Wait()
}
