package agent

import "strings"
import "testing"

// The duplicate discipline must stay in the executor seeds (check for an
// existing finding before registering) and in the reporter (no duplicate
// reports, one finding per report).
func TestPromptSeedsCarryDedupDiscipline(t *testing.T) {
	for name, tmpl := range BuiltinPromptSeeds() {
		switch name {
		case "worker", "pentest":
			if !strings.Contains(tmpl, "not registering a duplicate") {
				t.Errorf("%s seed missing pre-report duplicate check", name)
			}
		}
	}
	for _, marker := range []string{
		"No duplicates",
		"One finding per report, no collapsing",
		"explicit duplicate pass",
	} {
		if !strings.Contains(ReporterDefaultPrompt, marker) {
			t.Errorf("reporter prompt missing dedup marker %q", marker)
		}
	}
}
