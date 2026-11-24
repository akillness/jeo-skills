package server

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// Pure: FindingDTO carries both reasoning fields and omits them when empty.
func TestFindingDTOReasoningFields(t *testing.T) {
	d := findingFromDB(&db.DBFinding{ID: 1, Counterevidence: "blocked by WAF", ConfidenceRationale: "row of tenant B returned"}, nil)
	if d.Counterevidence != "blocked by WAF" || d.ConfidenceRationale != "row of tenant B returned" {
		t.Fatalf("DTO lost reasoning fields: %+v", d)
	}
	raw, _ := json.Marshal(d)
	if !strings.Contains(string(raw), `"counterevidence":"blocked by WAF"`) || !strings.Contains(string(raw), `"confidence_rationale":"row of tenant B returned"`) {
		t.Fatalf("JSON missing reasoning fields: %s", raw)
	}
	raw, _ = json.Marshal(findingFromDB(&db.DBFinding{ID: 2}, nil))
	if strings.Contains(string(raw), "counterevidence") || strings.Contains(string(raw), "confidence_rationale") {
		t.Fatalf("empty reasoning fields should be omitted: %s", raw)
	}
}

func TestFindingDTOReportState(t *testing.T) {
	raw, _ := json.Marshal(findingFromDB(&db.DBFinding{ID: 1}, nil))
	if !strings.Contains(string(raw), `"report_state":"none"`) {
		t.Fatalf("empty report_state should serialize as none: %s", raw)
	}
	d := findingFromDB(&db.DBFinding{ID: 2, ReportState: db.FindingReportSubmitted}, nil)
	if d.ReportState != db.FindingReportSubmitted {
		t.Fatalf("report_state lost: %q", d.ReportState)
	}
}

// PG: the detail endpoint returns the stored fields, and the report_finding
// schema upgrade adds both properties to an existing (customized) row without
// overwriting it.
func TestFindingReasoningDetailAndSchemaUpgrade(t *testing.T) {
	s, f, req := trafficEvidenceServer(t)
	pg := s.m.pg
	var taskID int64
	if err := pg.QueryRow(`SELECT task_id FROM findings WHERE id=$1`, f.FindingID).Scan(&taskID); err != nil {
		t.Fatal(err)
	}
	var expID int64
	if err := pg.QueryRow(`SELECT exploration_id FROM tasks WHERE id=$1`, taskID).Scan(&expID); err != nil {
		t.Fatal(err)
	}
	rec, err := pg.Exploration(expID).RecordFinding(context.Background(), db.RecordFindingInput{TaskID: taskID, VulnClass: "TEST", Severity: "low", Summary: "reasoning detail", Worker: "test",
		Counterevidence: "admin path returned 403", ConfidenceRationale: "user path returned the admin record"})
	if err != nil {
		t.Fatal(err)
	}
	w := req("GET", fmt.Sprintf("/api/exploration/findings/%d", rec.FindingID), "")
	if w.Code != 200 {
		t.Fatalf("detail status %d: %s", w.Code, w.Body)
	}
	var got FindingDTO
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Counterevidence != "admin path returned 403" || got.ConfidenceRationale != "user path returned the admin record" {
		t.Fatalf("detail DTO lost reasoning fields: %+v", got)
	}

	old, err := pg.GetTool("report_finding")
	if err != nil || old == nil {
		t.Fatal("missing report_finding", err)
	}
	t.Cleanup(func() {
		bindings, _ := json.Marshal(old.Agents)
		pg.UpdateTool(old.Key, old.Description, old.Schema, bindings, old.Enabled)
	})
	custom := json.RawMessage(`{"type":"object","properties":{"evidence":{"type":"string","description":"user evidence instructions"}},"required":["evidence"]}`)
	if err := pg.UpdateTool("report_finding", "user description", custom, json.RawMessage(`["worker"]`), false); err != nil {
		t.Fatal(err)
	}
	for range 2 { // idempotent
		s.seedFindingEvidenceSchema()
	}
	tool, err := pg.GetTool("report_finding")
	if err != nil || tool == nil {
		t.Fatal(err)
	}
	var schema struct {
		Properties map[string]map[string]any `json:"properties"`
		Required   []string                  `json:"required"`
	}
	if err := json.Unmarshal(tool.Schema, &schema); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"counterevidence", "confidence_rationale"} {
		if schema.Properties[name]["type"] != "string" {
			t.Fatalf("upgrade did not add %s: %s", name, tool.Schema)
		}
	}
	if tool.Enabled || tool.Description != "user description" || len(schema.Required) != 1 || schema.Required[0] != "evidence" || schema.Properties["evidence"]["description"] != "user evidence instructions" {
		t.Fatalf("custom configuration overwritten: %+v %s", tool, tool.Schema)
	}
}
