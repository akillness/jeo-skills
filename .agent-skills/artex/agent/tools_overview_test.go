package agent

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/Autumn-27/artex/db"
)

func TestOverviewTextBudgetIsFairAndUTF8Safe(t *testing.T) {
	if got := relatedOverviewBudgetForSources(1); got != relatedOverviewMaxTextPerSource {
		t.Fatalf("single source budget=%d want=%d", got, relatedOverviewMaxTextPerSource)
	}
	perSource := relatedOverviewBudgetForSources(db.MaxTaskSourceCount)
	if perSource*db.MaxTaskSourceCount > relatedOverviewTotalTextRunes {
		t.Fatalf("aggregate budget exceeded: per_source=%d", perSource)
	}

	budget := overviewTextBudget{remaining: 5}
	got := budget.take(strings.Repeat("α", 10), 20)
	if !utf8.ValidString(got) {
		t.Fatalf("budget truncation produced invalid UTF-8: %q", got)
	}
	if utf8.RuneCountInString(got) != 5 || !budget.truncated || budget.remaining != 0 {
		t.Fatalf("unexpected truncation: got=%q budget=%+v", got, budget)
	}
	if tail := budget.take("more", 20); tail != "" {
		t.Fatalf("exhausted budget returned more text: %q", tail)
	}
}

func TestCompactFindingIncludesStatus(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{
		"summary": "SQLi on /search", "vulnclass": "sqli", "severity": "high", "status": "false_positive",
	})
	m := compactFinding(&db.Node{ID: 7, State: "confirmed", Payload: payload})
	if m["state"] != "confirmed" {
		t.Fatalf("node state: %#v", m["state"])
	}
	if m["status"] != "false_positive" {
		t.Fatalf("status: %#v", m["status"])
	}
	if m["vulnclass"] != "sqli" || m["severity"] != "high" || m["summary"] != "SQLi on /search" {
		t.Fatalf("fields: %#v", m)
	}

	plain, _ := json.Marshal(map[string]any{"summary": "x"})
	m = compactFinding(&db.Node{ID: 8, State: "confirmed", Payload: plain})
	if _, ok := m["status"]; ok {
		t.Fatalf("empty payload should omit status: %#v", m)
	}
}

func TestGraphOverviewFindingListCarriesStatus(t *testing.T) {
	s := guardTaskStore(t)
	addGuardNode(t, s, db.KindFinding, map[string]any{"summary": "noise", "status": "false_positive"}, "confirmed")
	addGuardNode(t, s, db.KindFinding, map[string]any{"summary": "real", "status": "confirmed"}, "confirmed")
	ov := NewToolSet(s, "planner").graphOverviewData()
	if ov["findings_total"] != 1 {
		t.Fatalf("findings_total=%v, want 1 actionable finding", ov["findings_total"])
	}
	list, _ := ov["finding_list"].([]map[string]any)
	if len(list) != 2 {
		t.Fatalf("finding_list=%v, want both rows", list)
	}
	sawFP, sawReal := false, false
	for _, item := range list {
		switch item["status"] {
		case "false_positive":
			sawFP = true
		case "confirmed":
			sawReal = true
		}
	}
	if !sawFP || !sawReal {
		t.Fatalf("finding_list statuses: %#v", list)
	}
}
