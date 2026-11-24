package intercept

import (
	"slices"
	"testing"
)

// The closed-question answers of a judge ask are stored in
// intercept_pending.audit (JSONB), with the reason prefix that makes the row a
// model decision.
func TestClosedJudgeAnswersStored(t *testing.T) {
	d := targetTestDB(t)
	const task = "closed-judge-audit"
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, task) })
	f := &fakeCompleter{reply: closedReply(map[string]string{QPentestAction: "yes", QLiveConfig: "unknown"})}
	dec, _ := judgeWith(t.Context(), closedCfg(), nil, f.complete, "Bash", benignArgs)
	const reason = "[model] ask live_config=unknown: ev live_config"
	if dec.Action != "ask" || dec.Message != reason {
		t.Fatalf("decision %s %q, want ask %q", dec.Action, dec.Message, reason)
	}
	id, err := d.CreateInterceptPending(dec.RuleID, 0, task, "test", "Bash", benignArgs, dec.Message, auditFor(t.Context(), dec, benignArgs, "pending"))
	if err != nil {
		t.Fatal(err)
	}
	detail, err := d.GetInterceptDetail(id)
	if err != nil || detail == nil || detail.Audit == nil {
		t.Fatalf("detail %+v: %v", detail, err)
	}
	if detail.Reason != reason || detail.DecisionSource != "model" || len(dec.JudgeAnswers) != len(closedQuestions) ||
		!slices.Equal(detail.Audit.JudgeAnswers, dec.JudgeAnswers) {
		t.Fatalf("stored reason=%q source=%q answers=%+v", detail.Reason, detail.DecisionSource, detail.Audit.JudgeAnswers)
	}
}
