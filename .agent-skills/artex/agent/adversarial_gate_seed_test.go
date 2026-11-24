package agent

import "strings"
import "testing"

// The adversarial gate (disprove axes, evidence-cited eliminations, anti-merge,
// zero-findings-valid) must stay in the executor agents' default seeds, and the
// retester must stay an evidence-cited adversary. Methodology adapted from
// VulnHunter (Apache-2.0) and bug-bounty-hunting-prompts (MIT).
func TestPromptSeedsCarryAdversarialGate(t *testing.T) {
	for name, tmpl := range BuiltinPromptSeeds() {
		switch name {
		case "worker", "pentest":
			for _, marker := range []string{
				"actively tried to disprove it",
				"Eliminations need evidence at the same bar as confirmations",
				"Do not merge distinct candidates",
				"Zero confirmed findings is a valid outcome",
			} {
				if !strings.Contains(tmpl, marker) {
					t.Errorf("%s seed missing adversarial-gate marker %q", name, marker)
				}
			}
		}
	}
	for _, marker := range []string{
		"argue the opposite case",
		"cites the specific requests, responses, or controls",
	} {
		if !strings.Contains(RetesterDefaultPrompt, marker) {
			t.Errorf("retester prompt missing adversarial marker %q", marker)
		}
	}
}
