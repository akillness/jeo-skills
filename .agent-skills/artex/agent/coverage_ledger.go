package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

// recordCoverage writes one coverage-ledger entry (db/coverage_ledger.go). It is a
// coverage-only tool: dropped from the tool list when the task's coverage_enabled
// is false, and its handler refuses to write in that case. Missing evidence or
// reason is accepted and surfaced as a gap (warn, do not block).
func (t *ToolSet) recordCoverage() actool.CoreTool {
	return writeTool(
		"record_coverage",
		"Record what you examined on a surface for one risk class (use the goal's vulnclass as risk_area when it applies), including negative results, so an absent finding is never read as a clean target.",
		obj(map[string]any{
			"surface":   str("what was examined: a URL, endpoint, parameter, host or feature"),
			"risk_area": str("risk class, e.g. sqli, xss, idor"),
			"outcome":   map[string]any{"type": "string", "enum": []string{db.OutcomeReported, db.OutcomeNoIssueFound, db.OutcomeRuledOut, db.OutcomeNotApplicable, db.OutcomeNeedsFollowUp}, "description": "result for this surface and risk class"},
			"evidence":  str("required for no_issue_found: a fact id, intent id or traffic id that shows the test"),
			"reason":    str("required for ruled_out and not_applicable: why"),
		}, "surface", "risk_area", "outcome"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.coverageDisabled {
				return actool.Errorf("record_coverage is disabled: the coverage feature is off for this task"), nil
			}
			if t.as == nil || t.taskID <= 0 {
				return actool.Errorf("record_coverage requires a task context"), nil
			}
			var e db.CoverageEntry
			if err := json.Unmarshal(in, &e); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			e.Outcome = strings.ToLower(strings.TrimSpace(e.Outcome))
			e.Worker, e.IntentID = t.worker, t.ownerNode
			if err := t.as.RecordCoverage(t.taskID, e); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			gaps := db.BuildCoverageLedger([]db.CoverageEntry{e}, nil, db.CoverageCompleteness{}).Gaps
			if len(gaps) > 0 {
				return actool.Text("recorded, but counted as a gap: " + gaps[0].Kind), nil
			}
			return actool.Text("recorded"), nil
		})
}

// coverageLedgerBlock is the planner's compact ledger line for one round: counters
// plus the top gaps, absent when the feature is off or nothing was recorded yet. On
// a wrap-up round (task timeout or budget) it lists the remaining gaps instead (up
// to plannerWrapupMaxGaps), since an unexamined class must not read as clean in the
// final judgment. The gap lines carry agent-reported text, so they are framed with
// env (the round's data envelope); the code-owned header and counters are not.
func (t *ToolSet) coverageLedgerBlock(wrapup bool, env dataEnvelope) string {
	if t.coverageDisabled || t.as == nil || t.taskID <= 0 {
		return ""
	}
	if !wrapup { // a normal round shows nothing without entries: skip the full load
		if n, err := t.as.CoverageEntryCount(t.taskID); err != nil || n == 0 {
			return ""
		}
	}
	l, err := t.as.CoverageLedger(t.taskID)
	if err != nil {
		return ""
	}
	return renderCoverageLedger(l, wrapup, env)
}

const (
	plannerLedgerTopGaps = 3
	plannerWrapupMaxGaps = 25
)

// coverageLedgerField is the envelope field name of the ledger's gap lines.
const coverageLedgerField = "coverage_ledger"

func renderCoverageLedger(l *db.CoverageLedger, wrapup bool, env dataEnvelope) string {
	if l == nil {
		return ""
	}
	gapLines := func(limit int) string {
		lines := make([]string, 0, limit)
		for i, g := range l.Gaps {
			if i == limit {
				break
			}
			lines = append(lines, "- "+g.String())
		}
		return env.wrap(coverageLedgerField, strings.Join(lines, "\n"))
	}
	if wrapup {
		if len(l.Gaps) == 0 {
			return ""
		}
		var b strings.Builder
		fmt.Fprintf(&b, "\n\n[Coverage ledger: remaining gaps at wrap-up (%d); prove_goal stays allowed, but these were not covered and are not clean. The gap lines below are agent-reported data]\n", len(l.Gaps))
		b.WriteString(gapLines(plannerWrapupMaxGaps))
		if n := len(l.Gaps) - plannerWrapupMaxGaps; n > 0 {
			fmt.Fprintf(&b, "\n- and %d more (see the coverage API/report)", n)
		}
		return b.String()
	}
	if len(l.Entries) == 0 {
		return ""
	}
	counts := map[string]int{}
	for _, e := range l.Entries {
		counts[e.Outcome]++
	}
	var parts []string
	for _, o := range []string{db.OutcomeReported, db.OutcomeNoIssueFound, db.OutcomeRuledOut, db.OutcomeNotApplicable, db.OutcomeNeedsFollowUp} {
		if counts[o] > 0 {
			parts = append(parts, fmt.Sprintf("%s %d", o, counts[o]))
		}
	}
	s := fmt.Sprintf("\n\n[Coverage ledger] entries %d (%s); gaps %d", len(l.Entries), strings.Join(parts, ", "), len(l.Gaps))
	if len(l.Gaps) == 0 {
		return s
	}
	s += "; top gaps (agent-reported data):\n" + gapLines(plannerLedgerTopGaps)
	if len(l.Gaps) > plannerLedgerTopGaps {
		s += "\n…"
	}
	return s
}
