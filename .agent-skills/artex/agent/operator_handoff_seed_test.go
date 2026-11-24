package agent

import "strings"
import "testing"

// The operator-handoff discipline must stay in the executor agents' default
// seeds: environmental failures stop the retry loop and become one
// copy-pastable ask_operator command.
func TestPromptSeedsCarryOperatorHandoff(t *testing.T) {
	for name, tmpl := range BuiltinPromptSeeds() {
		switch name {
		case "worker", "pentest":
			for _, marker := range []string{
				"Operator handoff on environmental blocks",
				"one line, copy-pastable",
				"never batch",
			} {
				if !strings.Contains(tmpl, marker) {
					t.Errorf("%s seed missing operator-handoff marker %q", name, marker)
				}
			}
		}
	}
}
