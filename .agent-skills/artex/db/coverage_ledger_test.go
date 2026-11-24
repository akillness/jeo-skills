package db

import (
	"encoding/json"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func TestBuildCoverageLedgerGaps(t *testing.T) {
	e := func(surface, risk, outcome, evidence, reason string) CoverageEntry {
		return CoverageEntry{Surface: surface, RiskArea: risk, Outcome: outcome, Evidence: evidence, Reason: reason}
	}
	cases := []struct {
		name       string
		entries    []CoverageEntry
		mandatory  []string
		want       []string // CoverageGap.String()
		unexamined []string
	}{
		{"mandatory class with no entry is unexamined, never clean", nil, []string{"SQLi"},
			[]string{"unrecorded_risk_class sqli"}, []string{"sqli"}},
		{"needs_follow_up is a gap", []CoverageEntry{e("/login", "idor", OutcomeNeedsFollowUp, "", "")}, nil,
			[]string{"needs_follow_up /login idor"}, nil},
		{"no_issue_found without evidence is a gap", []CoverageEntry{e("/q", "sqli", OutcomeNoIssueFound, " ", "")}, []string{"sqli"},
			[]string{"missing_evidence /q sqli"}, nil},
		{"no_issue_found with evidence closes the class", []CoverageEntry{e("/q", "sqli", OutcomeNoIssueFound, "fact 12", "")}, []string{"SQLi "},
			nil, nil},
		{"ruled_out without reason is a gap", []CoverageEntry{e("/a", "xss", OutcomeRuledOut, "", "")}, nil,
			[]string{"missing_reason /a xss"}, nil},
		{"not_applicable without reason is a gap", []CoverageEntry{e("/a", "ssrf", OutcomeNotApplicable, "", "")}, nil,
			[]string{"missing_reason /a ssrf"}, nil},
		{"all three sources, unrecorded first", []CoverageEntry{e("/b", "xss", OutcomeNeedsFollowUp, "", ""), e("/c", "rce", OutcomeNoIssueFound, "", "")}, []string{"xss", "idor"},
			[]string{"unrecorded_risk_class idor", "needs_follow_up /b xss", "missing_evidence /c rce"}, []string{"idor"}},
		{"no goals and no entries: no obligation, no gap", nil, nil, nil, nil},
		{"reported closes the class", []CoverageEntry{e("/r", "sqli", OutcomeReported, "", "")}, []string{"sqli"}, nil, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			l := BuildCoverageLedger(c.entries, c.mandatory, CoverageCompleteness{})
			got := []string{}
			for _, g := range l.Gaps {
				got = append(got, g.String())
			}
			if c.want == nil {
				c.want = []string{}
			}
			if c.unexamined == nil {
				c.unexamined = []string{}
			}
			if !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(l.Unexamined, c.unexamined) {
				t.Fatalf("gaps=%v unexamined=%v, want %v %v", got, l.Unexamined, c.want, c.unexamined)
			}
		})
	}
}

func TestCoverageCompletenessFor(t *testing.T) {
	cases := []struct {
		status               string
		paused, budget, past bool
		state                string
	}{
		{"done", false, false, false, "complete"},
		{"timeout", false, false, true, "timeout"},
		{"done", false, false, true, "timeout"}, // goals met on the final timeout round
		{"timeout", false, true, false, "budget"},
		{"done", false, true, false, "budget"}, // budget wrap-up that met the goals
		{"failed", false, false, false, "aborted"},
		{"running", true, false, false, "paused"},
		{"running", false, false, false, "in_progress"},
	}
	for _, c := range cases {
		got := CoverageCompletenessFor(c.status, c.paused, c.budget, c.past)
		if got.State != c.state || got.Complete != (c.state == "complete") || got.Caveat == "" {
			t.Errorf("%+v: got %+v", c, got)
		}
	}
}

// The GET coverage document carries entries, gaps and completeness at top level.
func TestCoverageJSONCarriesLedger(t *testing.T) {
	l := BuildCoverageLedger(nil, []string{"sqli"}, CoverageCompletenessFor("timeout", false, false, true))
	b, _ := json.Marshal(&Coverage{Enabled: true, ByType: []CoverageByType{}, CoverageLedger: l})
	var m map[string]json.RawMessage
	_ = json.Unmarshal(b, &m)
	for _, k := range []string{"entries", "gaps", "unexamined", "completeness", "by_type"} {
		if _, ok := m[k]; !ok {
			t.Fatalf("missing %q in %s", k, b)
		}
	}
	if !strings.Contains(string(m["gaps"]), "unrecorded_risk_class") {
		t.Fatalf("gaps=%s", m["gaps"])
	}
}

// PG: upsert keeps one current row per (task, surface, risk_area) and appends history;
// the loaded ledger reads goal vulnclass and the budget end marker.
func TestRecordCoverageUpsertHistory(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered FIRST so it runs LAST, after the row cleanup below.
	t.Cleanup(func() { d.Close() })
	task, err := d.CreateTaskWithOptions("coverage ledger", "g", TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	as := d.Assets()
	store := d.Exploration(task.ExplorationID)
	for _, vc := range []string{"SQLi", "XSS"} {
		if _, err := store.AddGoal(map[string]any{"text": "g " + vc, "vulnclass": vc}, "test"); err != nil {
			t.Fatal(err)
		}
	}
	for _, e := range []CoverageEntry{
		{Surface: "/q", RiskArea: "SQLi", Outcome: OutcomeNeedsFollowUp},
		{Surface: "/q", RiskArea: "sqli", Outcome: OutcomeNoIssueFound, Evidence: "fact 7"},
	} {
		if err := as.RecordCoverage(task.ID, e); err != nil {
			t.Fatal(err)
		}
	}
	if err := as.RecordCoverage(task.ID, CoverageEntry{Surface: "/q", RiskArea: "x", Outcome: "clean"}); err == nil {
		t.Fatal("invalid outcome accepted")
	}
	var current, history int
	_ = d.QueryRow(`SELECT count(*) FROM coverage_ledger WHERE task_id=$1`, task.ID).Scan(&current)
	_ = d.QueryRow(`SELECT count(*) FROM coverage_ledger_history WHERE task_id=$1`, task.ID).Scan(&history)
	if current != 1 || history != 2 {
		t.Fatalf("current=%d history=%d, want 1 and 2", current, history)
	}
	l, err := as.CoverageLedger(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(l.Entries) != 1 || l.Entries[0].Outcome != OutcomeNoIssueFound || len(l.Gaps) != 1 || l.Gaps[0].String() != "unrecorded_risk_class xss" {
		t.Fatalf("ledger=%+v", l)
	}
	if l.Completeness.State != "in_progress" {
		t.Fatalf("completeness=%+v", l.Completeness)
	}
	if won, err := d.SetTerminalStatusGuarded(task.ID, "done", EndReasonBudget); err != nil || !won {
		t.Fatalf("settle won=%v err=%v", won, err)
	}
	if l, _ = as.CoverageLedger(task.ID); l.Completeness.Complete || l.Completeness.State != "budget" {
		t.Fatalf("completeness after budget=%+v", l.Completeness)
	}
}

// PG: the budget end reason belongs to one run. Budget wrap-up, then a revive,
// later planner/worker activity (even one carrying the old activity marker) and
// a normal done: the task is complete, not budget.
func TestCoverageCompletenessBudgetThenReviveDone(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered FIRST so it runs LAST, after the row cleanup below.
	t.Cleanup(func() { d.Close() })
	task, err := d.CreateTaskWithOptions("coverage revive", "g", TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	as, store := d.Assets(), d.Exploration(task.ExplorationID)
	state := func() string {
		t.Helper()
		l, err := as.CoverageLedger(task.ID)
		if err != nil {
			t.Fatal(err)
		}
		return l.Completeness.State
	}
	if won, err := d.SetTerminalStatusGuarded(task.ID, "timeout", EndReasonBudget); err != nil || !won {
		t.Fatalf("budget settle won=%v err=%v", won, err)
	}
	if s := state(); s != "budget" {
		t.Fatalf("after budget settle: %s", s)
	}
	if won, _ := d.SetTerminalStatusGuarded(task.ID, "done", ""); won { // a losing writer stores nothing
		t.Fatal("guard overwritten")
	}
	if s := state(); s != "budget" {
		t.Fatalf("after losing writer: %s", s)
	}
	if err := d.SetStatus(task.ID, "running"); err != nil { // revive
		t.Fatal(err)
	}
	for _, w := range []string{"planner", "worker-1", "system"} {
		if _, err := store.AppendActivity(Activity{Worker: w, Kind: "text", Metadata: json.RawMessage(`{"end_reason":"budget"}`)}); err != nil {
			t.Fatal(err)
		}
	}
	if s := state(); s != "in_progress" {
		t.Fatalf("revived run: %s", s)
	}
	if won, err := d.SetTerminalStatusGuarded(task.ID, "done", ""); err != nil || !won {
		t.Fatalf("done won=%v err=%v", won, err)
	}
	if s := state(); s != "complete" {
		t.Fatalf("revived run ended normally: %s, want complete", s)
	}
	// ClearRunEndReason never touches a terminal task.
	if _, err := d.Exec(`UPDATE tasks SET status='timeout', end_reason='budget' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	if err := d.ClearRunEndReason(task.ID); err != nil {
		t.Fatal(err)
	}
	if s := state(); s != "budget" {
		t.Fatalf("terminal end_reason cleared: %s", s)
	}
}

// PG: a task holds at most MaxCoverageRowsPerTask current rows; a new key beyond
// the cap is refused, an existing key is still updated.
func TestRecordCoverageRowCap(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered FIRST so it runs LAST, after the row cleanup below.
	t.Cleanup(func() { d.Close() })
	task, err := d.CreateTaskWithOptions("coverage cap", "g", TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	if _, err := d.Exec(`INSERT INTO coverage_ledger(task_id, surface, risk_area, outcome)
SELECT $1, '/s' || g, 'xss', 'needs_follow_up' FROM generate_series(1, $2::int) g`, task.ID, MaxCoverageRowsPerTask); err != nil {
		t.Fatal(err)
	}
	as := d.Assets()
	err = as.RecordCoverage(task.ID, CoverageEntry{Surface: "/new", RiskArea: "xss", Outcome: OutcomeNeedsFollowUp})
	if err == nil || !strings.Contains(err.Error(), "max 2000") {
		t.Fatalf("new key past the cap: err=%v", err)
	}
	if err := as.RecordCoverage(task.ID, CoverageEntry{Surface: "/s1", RiskArea: "xss", Outcome: OutcomeRuledOut, Reason: "static page"}); err != nil {
		t.Fatalf("update of an existing key refused: %v", err)
	}
}

// Every agent-reported field is folded to one line and length-checked before any
// write; an over-long field is refused, never truncated.
func TestNormalizeCoverageEntry(t *testing.T) {
	e, err := normalizeCoverageEntry(CoverageEntry{
		Surface: " /a\r\n\n\t[[x]]\x00\x7f\u0085 b  ", RiskArea: " SQLi\n", Outcome: OutcomeNoIssueFound,
		Evidence: "fact\n\n12", Reason: "\tr\x1b[31m",
	})
	if err != nil {
		t.Fatal(err)
	}
	if e.Surface != "/a [[x]] b" || e.RiskArea != "sqli" || e.Evidence != "fact 12" || e.Reason != "r [31m" {
		t.Fatalf("normalised=%+v", e)
	}
	ok := CoverageEntry{Surface: "/s", RiskArea: "xss", Outcome: OutcomeReported}
	for _, c := range []struct {
		name string
		edit func(*CoverageEntry, int)
		max  int
	}{
		{"surface", func(e *CoverageEntry, n int) { e.Surface = strings.Repeat("s", n) }, 200},
		{"risk_area", func(e *CoverageEntry, n int) { e.RiskArea = strings.Repeat("r", n) }, 64},
		{"evidence", func(e *CoverageEntry, n int) { e.Evidence = strings.Repeat("é", n) }, 500},
		{"reason", func(e *CoverageEntry, n int) { e.Reason = strings.Repeat("x", n) }, 500},
	} {
		at, over := ok, ok
		c.edit(&at, c.max)
		c.edit(&over, c.max+1)
		if _, err := normalizeCoverageEntry(at); err != nil {
			t.Errorf("%s at the limit refused: %v", c.name, err)
		}
		want := c.name + " too long (max " + strconv.Itoa(c.max) + ")"
		if _, err := normalizeCoverageEntry(over); err == nil || err.Error() != want {
			t.Errorf("%s over the limit: err=%v, want %q", c.name, err, want)
		}
	}
	if _, err := normalizeCoverageEntry(CoverageEntry{Surface: "\n\t", RiskArea: "xss", Outcome: OutcomeReported}); err == nil {
		t.Fatal("blank surface accepted")
	}
}
