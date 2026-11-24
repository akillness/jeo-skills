package db

import "testing"

// The report path reads proof strength, the two attestations, both evidence
// versions and the reporter-written body in one query; the task findings list keeps
// its own lean meta query. Both are exercised here because the 13-column Scan in
// FindingQualityByNodeID has no other coverage: a column added, dropped or reordered
// silently shifts fields into each other, and nothing else would notice.
func TestFindingQualityByNodeID(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()
	tk, err := d.CreateTask("finding quality lookup", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(tk.ID)

	es := d.Exploration(tk.ExplorationID)
	rec, err := es.RecordFinding(t.Context(), RecordFindingInput{
		TaskID: tk.ID, VulnClass: "IDOR", Severity: "high", Summary: "with proof", Worker: "test",
		Counterevidence:     "guessing a UUID returned 404",
		ConfidenceRationale: "two accounts returned each other's order",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteFinding(rec.FindingID)
	if err := d.SetFindingVerification(rec.FindingID, VerificationVerified, 3, "reproduced twice on staging"); err != nil {
		t.Fatal(err)
	}
	const body = "## Overview\n\nThe 200 carries the victim's order body.\n\n## Fix\n\nbind the owner server-side."
	if _, err := d.SetFindingReportVersionByNodeID(t.Context(), rec.NodeID, body, nil); err != nil {
		t.Fatal(err)
	}
	// Binding or re-binding evidence is what bumps evidence_version; moving it after
	// the report was written is exactly what makes that report stale.
	if _, err := d.Exec(`UPDATE findings SET evidence_version=evidence_version+1 WHERE id=$1`, rec.FindingID); err != nil {
		t.Fatal(err)
	}

	// 1) The report-only query carries the whole proof-strength footprint.
	got, err := d.FindingQualityByNodeID(tk.ID)
	if err != nil {
		t.Fatal(err)
	}
	q, ok := got[rec.NodeID]
	if !ok {
		t.Fatalf("node %d missing from the quality lookup (%d rows)", rec.NodeID, len(got))
	}
	if q.ID != rec.FindingID {
		t.Errorf("record id = %d, want %d", q.ID, rec.FindingID)
	}
	if q.Status != FindingPending {
		t.Errorf("status = %q, want %q", q.Status, FindingPending)
	}
	if q.PoeLevel != 3 || q.VerificationStatus != VerificationVerified {
		t.Errorf("poe/verification = %d/%q, want 3/%q", q.PoeLevel, q.VerificationStatus, VerificationVerified)
	}
	if q.VerificationNote != "reproduced twice on staging" {
		t.Errorf("verification note = %q", q.VerificationNote)
	}
	if q.Counterevidence != "guessing a UUID returned 404" {
		t.Errorf("counterevidence = %q", q.Counterevidence)
	}
	if q.ConfidenceRationale != "two accounts returned each other's order" {
		t.Errorf("confidence rationale = %q", q.ConfidenceRationale)
	}
	if q.Report != body {
		t.Errorf("report body = %q, want %q", q.Report, body)
	}
	if q.EvidenceVersion != 1 || q.ReportEvidenceVersion != 0 {
		t.Errorf("versions = %d/%d, want 1/0", q.EvidenceVersion, q.ReportEvidenceVersion)
	}
	if !q.ReportStale() {
		t.Error("a report written before the evidence moved must be stale")
	}
	if q.TrafficCount != 0 {
		t.Errorf("traffic count = %d, want 0", q.TrafficCount)
	}

	// 2) The findings list keeps its lean query, and it must still resolve the row.
	meta, err := d.FindingMetaByNodeID(tk.ID)
	if err != nil {
		t.Fatal(err)
	}
	m, ok := meta[rec.NodeID]
	if !ok {
		t.Fatalf("node %d missing from the meta lookup", rec.NodeID)
	}
	if m.ID != rec.FindingID || m.Status != FindingPending || m.TrafficCount != 0 {
		t.Errorf("meta = {id:%d status:%q traffic:%d}, want {id:%d status:%q traffic:0}", m.ID, m.Status, m.TrafficCount, rec.FindingID, FindingPending)
	}

	// 3) Rows are keyed by task: another task sees its own (empty) set, not this one.
	other, err := d.CreateTask("finding quality lookup (other)", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(other.ID)
	if rows, err := d.FindingQualityByNodeID(other.ID); err != nil {
		t.Fatal(err)
	} else if len(rows) != 0 {
		t.Errorf("other task sees %d rows, want 0", len(rows))
	}
}
