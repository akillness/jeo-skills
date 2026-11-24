package db

import (
	"strconv"
	"testing"
)

// counterevidence / confidence_rationale are optional: they round-trip through
// RecordFinding and every read path, and default to "" when not given.
func TestFindingReasoningFieldsRoundTrip(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()
	tk, err := d.CreateTask("finding reasoning fields", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(tk.ID)
	es := d.Exploration(tk.ExplorationID)
	with, err := es.RecordFinding(t.Context(), RecordFindingInput{TaskID: tk.ID, VulnClass: "IDOR", Severity: "medium", Summary: "with reasoning", Worker: "test",
		Counterevidence: "UUID guessing returned 404", ConfidenceRationale: "two accounts, same response body"})
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteFinding(with.FindingID)
	without, err := es.RecordFinding(t.Context(), RecordFindingInput{TaskID: tk.ID, VulnClass: "IDOR", Severity: "low", Summary: "without reasoning", Worker: "test"})
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteFinding(without.FindingID)
	want := map[int64][2]string{
		with.FindingID:    {"UUID guessing returned 404", "two accounts, same response body"},
		without.FindingID: {"", ""},
	}
	check := func(src string, f *DBFinding) {
		t.Helper()
		w, ok := want[f.ID]
		if !ok {
			return
		}
		if f.Counterevidence != w[0] || f.ConfidenceRationale != w[1] {
			t.Fatalf("%s finding %d: got (%q, %q), want (%q, %q)", src, f.ID, f.Counterevidence, f.ConfidenceRationale, w[0], w[1])
		}
	}
	for id := range want {
		f, err := d.GetFinding(id)
		if err != nil || f == nil {
			t.Fatalf("GetFinding(%d): %v %v", id, f, err)
		}
		check("GetFinding", f)
	}
	filter := FindingFilter{TaskID: strconv.FormatInt(tk.ID, 10)}
	page, total, err := d.ListFindingsPage(filter, 1, 50)
	if err != nil || total != 2 {
		t.Fatalf("ListFindingsPage: total=%d err=%v", total, err)
	}
	for _, f := range page {
		check("ListFindingsPage", f)
	}
	exported, err := d.ListFindingsForExport(filter, nil)
	if err != nil || len(exported) != 2 {
		t.Fatalf("ListFindingsForExport: n=%d err=%v", len(exported), err)
	}
	for _, f := range exported {
		check("ListFindingsForExport", f)
	}
}
