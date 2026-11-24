package db

import (
	"slices"
	"testing"
)

// The actor whitelist is enforced in Go (there is no SQL CHECK). It must reject
// before touching the database, so this runs without Postgres.
func TestResolveInterceptRejectsUnknownActor(t *testing.T) {
	d := &DB{}
	for _, actor := range []string{"", "unknown", "Human", "admin"} {
		if ok, err := d.ResolveIntercept(1, "allowed", "allow", "fixture", actor); err == nil || ok {
			t.Fatalf("decided_by %q accepted: ok=%t err=%v", actor, ok, err)
		}
	}
}

func TestInterceptDecidedBy(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	scope := "approval-decided-by"
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, scope) })
	rule, err := d.CreateInterceptRule("decided-by fixture", "tool_name", "string", "Bash", "deny", "fixture", 1, false, false, 0, "deny")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_rules WHERE id=$1`, rule.ID) })

	input := []byte(`{"command":"fixture"}`)
	decided := func(ruleID int64, status, reason string) int64 {
		t.Helper()
		id, err := d.CreateDecidedIntercept(ruleID, 0, scope, "test", "Bash", input, status, reason)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	asked := func() int64 {
		t.Helper()
		id, err := d.CreateInterceptPending(0, 0, scope, "test", "Bash", input, ModelReasonPrefix+" confirm")
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	resolved := func(status, action, reason, actor string) int64 {
		t.Helper()
		id := asked()
		if ok, err := d.ResolveIntercept(id, status, action, reason, actor); err != nil || !ok {
			t.Fatalf("resolve %s/%s: ok=%t err=%v", status, actor, ok, err)
		}
		return id
	}

	ruleID := decided(rule.ID, "denied", "fixture")
	modelID := decided(0, "allowed", ModelReasonPrefix+" fixture")
	pendingID := asked()
	humanAllowID := resolved("allowed", "allow", "user approved execution", "human")
	humanDenyID := resolved("denied", "deny", "user rejected execution", "human")
	timeoutID := resolved("timeout", "deny", "approval timed out, applying timeout policy", "system")
	// A cancellation is a system refusal even though its status is 'denied'.
	cancelledID := resolved("denied", "deny", "work cancelled", "system")

	want := map[int64]string{
		ruleID: "rule", modelID: "model", pendingID: "",
		humanAllowID: "human", humanDenyID: "human",
		timeoutID: "system", cancelledID: "system",
	}
	for id, actor := range want {
		stored, err := d.GetInterceptPending(id)
		if err != nil || stored == nil || stored.DecidedBy != actor {
			t.Fatalf("stored decided_by for %d: %+v err=%v, want %q", id, stored, err, actor)
		}
		detail, err := d.GetInterceptDetail(id)
		if err != nil || detail == nil || detail.DecidedBy != actor {
			t.Fatalf("detail decided_by for %d: %+v err=%v, want %q", id, detail, err, actor)
		}
	}
	rows, err := d.ListTaskIntercepts(scope)
	if err != nil || len(rows) != len(want) {
		t.Fatalf("list: %d rows err=%v", len(rows), err)
	}
	for _, r := range rows {
		if r.DecidedBy != want[r.ID] {
			t.Fatalf("listed decided_by for %d = %q, want %q", r.ID, r.DecidedBy, want[r.ID])
		}
	}

	// A rejected actor must leave the request pending and unattributed.
	if ok, err := d.ResolveIntercept(pendingID, "allowed", "allow", "fixture", "admin"); err == nil || ok {
		t.Fatalf("invalid actor resolved the request: ok=%t err=%v", ok, err)
	}
	if p, err := d.GetInterceptPending(pendingID); err != nil || p.Status != "pending" || p.DecidedBy != "" {
		t.Fatalf("pending row changed: %+v err=%v", p, err)
	}

	filtered := func(filter InterceptApprovalFilter) []int64 {
		t.Helper()
		rows, total, err := d.ListTaskInterceptsPage(scope, 1, 100, filter)
		if err != nil || total != len(rows) {
			t.Fatalf("filter %+v: total=%d rows=%d err=%v", filter, total, len(rows), err)
		}
		ids := []int64{}
		for _, r := range rows {
			ids = append(ids, r.ID)
		}
		slices.Sort(ids)
		return ids
	}
	for _, tc := range []struct {
		filter InterceptApprovalFilter
		want   []int64
	}{
		// Neither the human decisions nor the timeout of a model-raised ask.
		{InterceptApprovalFilter{DecidedBy: "model"}, []int64{modelID}},
		{InterceptApprovalFilter{DecidedBy: "rule"}, []int64{ruleID}},
		{InterceptApprovalFilter{DecidedBy: "human"}, []int64{humanAllowID, humanDenyID}},
		{InterceptApprovalFilter{DecidedBy: "system"}, []int64{timeoutID, cancelledID}},
		{InterceptApprovalFilter{Status: "denied", DecidedBy: "human"}, []int64{humanDenyID}},
		{InterceptApprovalFilter{Status: "denied", DecidedBy: "system"}, []int64{cancelledID}},
		{InterceptApprovalFilter{DecidedBy: "human' OR 1=1 --"}, []int64{}},
	} {
		if got := filtered(tc.filter); !slices.Equal(got, tc.want) {
			t.Fatalf("filter %+v: got %v want %v", tc.filter, got, tc.want)
		}
	}

	// Rows decided before the column existed: decided_by stays empty everywhere it
	// is read, decision_source keeps its own column, nothing is rewritten, and no
	// decided_by filter matches them.
	if _, err := d.Exec(`UPDATE intercept_pending SET decided_by='' WHERE id IN ($1,$2,$3)`, ruleID, modelID, timeoutID); err != nil {
		t.Fatal(err)
	}
	legacy := map[int64]string{ruleID: "rule", modelID: "model", timeoutID: "model"}
	for id, source := range legacy {
		detail, err := d.GetInterceptDetail(id)
		if err != nil || detail == nil || detail.DecidedBy != "" || detail.DecisionSource != source {
			t.Fatalf("legacy detail for %d: %+v err=%v, want decided_by \"\" and decision_source %q", id, detail, err, source)
		}
		stored, err := d.GetInterceptPending(id)
		if err != nil || stored == nil || stored.DecidedBy != "" {
			t.Fatalf("legacy row %d rewritten: %+v err=%v", id, stored, err)
		}
	}
	rows, err = d.ListTaskIntercepts(scope)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if source, ok := legacy[r.ID]; ok && (r.DecidedBy != "" || r.DecisionSource != source) {
			t.Fatalf("legacy list row %d: decided_by=%q decision_source=%q, want \"\" and %q", r.ID, r.DecidedBy, r.DecisionSource, source)
		}
	}
	for _, actor := range []string{"human", "rule", "model", "system"} {
		for _, id := range filtered(InterceptApprovalFilter{DecidedBy: actor}) {
			if _, ok := legacy[id]; ok {
				t.Fatalf("legacy row %d matched decided_by=%s", id, actor)
			}
		}
	}
	// decision_source still finds them through its own filter.
	if got := filtered(InterceptApprovalFilter{DecisionSource: "rule"}); !slices.Contains(got, ruleID) {
		t.Fatalf("legacy rule row missing from decision_source=rule: %v", got)
	}
}
