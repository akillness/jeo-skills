package agent

import "strings"
import "testing"

// The deadline contract must stay in the executor seeds: no work whose
// timeout can outlive the remaining budget; near the end, land instead of
// open. Pattern adapted from bug-bounty-hunting-prompts (MIT).
func TestPromptSeedsCarryDeadlineContract(t *testing.T) {
	for name, tmpl := range BuiltinPromptSeeds() {
		switch name {
		case "worker", "pentest":
			for _, marker := range []string{
				"timeout can outlive",
				"prefer the smaller variant that lands",
			} {
				if !strings.Contains(tmpl, marker) {
					t.Errorf("%s seed missing deadline-contract marker %q", name, marker)
				}
			}
		}
	}
}
