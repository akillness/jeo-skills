package server

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
)

// PG: on an existing database whose stored record_fact row predates the source
// field (and was edited by the operator), the startup seeders add the source
// enum without touching the operator's text, a second run changes nothing, and
// ToolResolve then serves the source property to the model.
func TestRecordFactSourceSchemaUpgrade(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	t.Cleanup(func() { agent.SetToolResolve(nil) })
	pg := m.pg

	old, err := pg.GetTool("record_fact")
	if err != nil || old == nil {
		t.Fatal("missing record_fact", err)
	}
	bindings, _ := json.Marshal(old.Agents)
	t.Cleanup(func() { pg.UpdateTool(old.Key, old.Description, old.Schema, bindings, old.Enabled) })

	// Simulate a pre-provenance row customised by the operator: no source
	// property on the facts items, an edited description and an edited
	// parameter description (facts-only contract: the items carry the fields).
	var schema map[string]any
	if err := json.Unmarshal(old.Schema, &schema); err != nil {
		t.Fatal(err)
	}
	props := schema["properties"].(map[string]any)["facts"].(map[string]any)["items"].(map[string]any)["properties"].(map[string]any)
	delete(props, "source")
	props["confidence"].(map[string]any)["description"] = "operator confidence text"
	custom, _ := json.Marshal(schema)
	if err := pg.UpdateTool("record_fact", "operator description", custom, bindings, true); err != nil {
		t.Fatal(err)
	}
	if src := resolvedRecordFactProps(t)["source"]; src == nil {
		t.Fatal("runtime contract repair must expose source even before startup migration")
	}

	snapshot := func() (string, string, time.Time) {
		var desc, sch string
		var upd time.Time
		if err := pg.QueryRow(`SELECT description, schema::text, updated_at FROM tools WHERE key='record_fact'`).Scan(&desc, &sch, &upd); err != nil {
			t.Fatal(err)
		}
		return desc, sch, upd
	}
	s.seedOrchestrationTools()
	desc1, sch1, upd1 := snapshot()
	s.seedOrchestrationTools()
	desc2, sch2, upd2 := snapshot()
	if desc1 != desc2 || sch1 != sch2 || !upd1.Equal(upd2) {
		t.Fatalf("second run changed the row: %q %s %v -> %q %s %v", desc1, sch1, upd1, desc2, sch2, upd2)
	}

	tool, err := pg.GetTool("record_fact")
	if err != nil || tool == nil {
		t.Fatal(err)
	}
	var got struct {
		Properties struct {
			Facts struct {
				Items struct {
					Properties map[string]map[string]any `json:"properties"`
				} `json:"items"`
			} `json:"facts"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(tool.Schema, &got); err != nil {
		t.Fatal(err)
	}
	itemProps := got.Properties.Facts.Items.Properties
	wantEnum := "[target_response tool_output third_party_intel operator_input inference]"
	if src := itemProps["source"]; src == nil || fmt.Sprint(src["enum"]) != wantEnum {
		t.Fatalf("upgrade did not add the source enum: %s", tool.Schema)
	}
	if tool.Description != "operator description" || itemProps["confidence"]["description"] != "operator confidence text" || len(itemProps) != len(props)+1 {
		t.Fatalf("operator configuration overwritten: %q %s", tool.Description, tool.Schema)
	}

	resolved := resolvedRecordFactProps(t)
	src, _ := resolved["source"].(map[string]any)
	if src == nil || fmt.Sprint(src["enum"]) != wantEnum {
		t.Fatalf("ToolResolve does not serve the source enum: %v", resolved)
	}
}

// resolvedRecordFactProps returns the facts[] item properties of record_fact as
// ToolResolve serves it to the worker.
func resolvedRecordFactProps(t *testing.T) map[string]any {
	t.Helper()
	tools := agent.ToolResolve()(context.Background(), "worker", agent.NewToolSet(nil, "").WorkerTools())
	for _, tl := range tools {
		if tl.Name() == "record_fact" {
			props, _ := tl.InputSchema()["properties"].(map[string]any)
			facts, _ := props["facts"].(map[string]any)
			items, _ := facts["items"].(map[string]any)
			itemProps, _ := items["properties"].(map[string]any)
			return itemProps
		}
	}
	t.Fatal("worker lost record_fact")
	return nil
}
