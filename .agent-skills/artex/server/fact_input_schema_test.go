package server

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
	actool "github.com/Autumn-27/norma/tool"
)

func TestRecordFactInputSchemaUpgrade(t *testing.T) {
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
	legacy := map[string]any{
		"type": "object", "required": []string{"summary"},
		"anyOf": []any{map[string]any{"required": []string{"summary"}}},
		"properties": map[string]any{
			"summary":    map[string]any{"type": "string", "description": "operator summary"},
			"confidence": map[string]any{"type": "string", "default": "inferred"},
			"custom":     map[string]any{"type": "string"},
			"facts":      map[string]any{"type": "array", "items": map[string]any{"type": "object"}},
		},
	}
	raw, _ := json.Marshal(legacy)
	if err := pg.UpdateTool("record_fact", "operator tool", raw, bindings, old.Enabled); err != nil {
		t.Fatal(err)
	}
	// Facts-only contract: the top level holds facts and
	// nothing else; the earlier top-level fact fields and their operator
	// annotations are dropped (the handler still accepts the legacy shapes),
	// item annotations survive.
	check := func(schema map[string]any) {
		t.Helper()
		if req, _ := schema["required"].([]any); len(req) != 1 || req[0] != "facts" {
			if reqS, _ := schema["required"].([]string); len(reqS) != 1 || reqS[0] != "facts" {
				t.Fatalf("facts must be the only required property: %v", schema["required"])
			}
		}
		if _, ok := schema["anyOf"]; ok {
			t.Fatal("root anyOf still present")
		}
		if schema["additionalProperties"] != false {
			t.Fatal("unknown fields allowed")
		}
		props := schema["properties"].(map[string]any)
		if len(props) != 1 || props["facts"] == nil {
			t.Fatalf("top level must hold facts only: %v", props)
		}
		items := props["facts"].(map[string]any)["items"].(map[string]any)
		itemProps := items["properties"].(map[string]any)
		if itemProps["tested_asset_ids"] == nil || itemProps["summary"] == nil || itemProps["source"] == nil {
			t.Fatal("repaired schema missing alias, batch summary or source")
		}
		if err := actool.ValidateInput(schema, json.RawMessage(`{"facts":[{"summary":"complete batch item"}]}`)); err != nil {
			t.Fatal("valid batch rejected", err)
		}
	}
	// Runtime repair protects cached or edited rows even before startup migration.
	tools := agent.ToolResolve()(context.Background(), "worker", agent.NewToolSet(nil, "").WorkerTools())
	found := false
	for _, tool := range tools {
		if tool.Name() == "record_fact" {
			check(tool.InputSchema())
			found = true
		}
	}
	if !found {
		t.Fatal("record_fact not resolved")
	}
	s.seedFactInputSchema()
	repaired, err := pg.GetTool("record_fact")
	if err != nil || repaired == nil {
		t.Fatal(err)
	}
	var schema map[string]any
	if err := json.Unmarshal(repaired.Schema, &schema); err != nil {
		t.Fatal(err)
	}
	check(schema)
	if repaired.Description != "operator tool" || repaired.Enabled != old.Enabled {
		t.Fatal("operator tool settings changed")
	}
	var before, after time.Time
	if err := pg.QueryRow("SELECT updated_at FROM tools WHERE key='record_fact'").Scan(&before); err != nil {
		t.Fatal(err)
	}
	s.seedFactInputSchema()
	if err := pg.QueryRow("SELECT updated_at FROM tools WHERE key='record_fact'").Scan(&after); err != nil {
		t.Fatal(err)
	}
	if !before.Equal(after) {
		t.Fatal("second migration changed the row")
	}
}

// recordFactLegacySchema is the stored record_fact schema of the earlier
// contract: fact fields at the top level beside facts[], with the texts that
// referred to the top level, plus an operator annotation on an item field.
func recordFactLegacySchema(t *testing.T) (string, map[string]string) {
	t.Helper()
	_, legacyFacts, legacyItems := agent.RecordFactLegacyDescriptions()
	item := map[string]any{"type": "object", "required": []string{"summary"}, "additionalProperties": false, "properties": map[string]any{
		"summary":    map[string]any{"type": "string", "minLength": 1, "description": legacyItems["summary"]},
		"intent_id":  map[string]any{"type": "integer", "description": legacyItems["intent_id"]},
		"detail":     map[string]any{"type": "string", "description": "Details of this fact, including all related observations."},
		"confidence": map[string]any{"type": "string", "description": "operator confidence note", "default": "inferred"},
		"source":     map[string]any{"type": "string", "enum": []string{"target_response", "tool_output", "third_party_intel", "operator_input", "inference"}, "description": "where the content came from"},
	}}
	schema := map[string]any{"type": "object", "additionalProperties": false, "properties": map[string]any{
		"summary":   map[string]any{"type": "string", "minLength": 1, "description": legacyItems["summary"]},
		"intent_id": map[string]any{"type": "integer", "description": legacyItems["intent_id"]},
		"detail":    map[string]any{"type": "string", "description": "Details of this fact, including all related observations."},
		"source":    map[string]any{"type": "string", "enum": []string{"inference"}},
		"facts":     map[string]any{"type": "array", "minItems": 1, "description": legacyFacts[0], "items": item},
	}}
	raw, _ := json.Marshal(schema)
	return string(raw), legacyItems
}

func recordFactSeed(t *testing.T) agent.ToolSeed {
	t.Helper()
	for _, sd := range agent.BuiltinToolSeeds() {
		if sd.Key == "record_fact" {
			return sd
		}
	}
	t.Fatal("record_fact seed missing")
	return agent.ToolSeed{}
}

// A database that still stores the earlier record_fact contract (text and
// schema) is brought to the facts-only contract once: description replaced
// when it is the previous default, facts/item descriptions replaced when they
// are the earlier texts, operator annotations kept, top-level fact fields
// gone, source enum present on the items. A second run changes nothing, and
// an operator-edited description is left alone.
func TestRefreshRecordFactContract(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer m.Close()
	s := &Server{m: m}
	seed := recordFactSeed(t)
	seedSchema, _ := json.Marshal(seed.Schema)
	seedAgents, _ := json.Marshal(seed.Agents)
	restore := func() {
		_ = m.pg.UpsertToolForce("record_fact", seed.Desc, seedSchema, seedAgents)
		_, _ = m.pg.Exec(`DELETE FROM settings WHERE key='tool_schema_refresh_record_fact_facts_only'`)
	}
	defer restore()

	legacyTool, _, legacyItems := agent.RecordFactLegacyDescriptions()
	legacySchema, _ := recordFactLegacySchema(t)
	run := func(desc string) {
		t.Helper()
		if err := m.pg.UpsertToolForce("record_fact", desc, json.RawMessage(legacySchema), seedAgents); err != nil {
			t.Fatal(err)
		}
		if _, err := m.pg.Exec(`DELETE FROM settings WHERE key='tool_schema_refresh_record_fact_facts_only'`); err != nil {
			t.Fatal(err)
		}
		s.seedFactInputSchema()
		s.seedFactSourceSchema()
		s.refreshRecordFactContract()
	}
	for _, desc := range legacyTool {
		run(desc)
		row, err := m.pg.GetTool("record_fact")
		if err != nil || row == nil {
			t.Fatalf("row: %v", err)
		}
		if row.Description != seed.Desc {
			t.Fatalf("description not refreshed from a known default: %q", row.Description[:60])
		}
		var schema map[string]any
		if err := json.Unmarshal(row.Schema, &schema); err != nil {
			t.Fatal(err)
		}
		props := schema["properties"].(map[string]any)
		if len(props) != 1 || props["facts"] == nil {
			t.Fatalf("top level still holds fact fields: %v", props)
		}
		facts := props["facts"].(map[string]any)
		items := facts["items"].(map[string]any)["properties"].(map[string]any)
		canonItems := seed.Schema["properties"].(map[string]any)["facts"].(map[string]any)["items"].(map[string]any)["properties"].(map[string]any)
		if facts["description"] != seed.Schema["properties"].(map[string]any)["facts"].(map[string]any)["description"] {
			t.Fatalf("facts description not refreshed: %v", facts["description"])
		}
		for name := range legacyItems {
			if items[name].(map[string]any)["description"] != canonItems[name].(map[string]any)["description"] {
				t.Fatalf("item %s description not refreshed: %v", name, items[name])
			}
		}
		if items["confidence"].(map[string]any)["description"] != "operator confidence note" || items["confidence"].(map[string]any)["default"] != "inferred" {
			t.Fatalf("operator annotation lost: %v", items["confidence"])
		}
		if enum, _ := items["source"].(map[string]any)["enum"].([]any); len(enum) != 5 {
			t.Fatalf("source enum missing on the items: %v", items["source"])
		}
		if v, _, _ := m.pg.GetSetting("tool_schema_refresh_record_fact_facts_only"); v != "true" {
			t.Fatal("flag not set")
		}
		// Second start: nothing changes.
		var updated1, updated2 string
		_ = m.pg.QueryRow(`SELECT updated_at::text FROM tools WHERE key='record_fact'`).Scan(&updated1)
		s.seedFactInputSchema()
		s.seedFactSourceSchema()
		s.refreshRecordFactContract()
		_ = m.pg.QueryRow(`SELECT updated_at::text FROM tools WHERE key='record_fact'`).Scan(&updated2)
		if updated1 != updated2 {
			t.Fatal("second start rewrote the row")
		}
	}
	// An operator-edited description is kept; the schema is still repaired.
	run("my own record_fact text")
	row, _ := m.pg.GetTool("record_fact")
	if row == nil || row.Description != "my own record_fact text" {
		t.Fatalf("operator description replaced: %v", row)
	}
	if !strings.Contains(string(row.Schema), `"facts"`) || strings.Contains(string(row.Schema), legacyItems["intent_id"]) {
		t.Fatalf("schema not repaired beside an operator description: %s", row.Schema)
	}
}

// A start on which the refresh fails must not spend the one-time flag: the
// next start retries and the stored default text is refreshed then.
func TestFix410RefreshFlagNotSetOnFailure(t *testing.T) {
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer m.Close()
	s := &Server{m: m}
	const flag = "tool_schema_refresh_record_fact_facts_only"
	seed := recordFactSeed(t)
	seedSchema, _ := json.Marshal(seed.Schema)
	seedAgents, _ := json.Marshal(seed.Agents)
	legacyTool, _, _ := agent.RecordFactLegacyDescriptions()
	legacySchema, _ := recordFactLegacySchema(t)
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := m.pg.Exec(query, args...); err != nil {
			t.Fatal(err)
		}
	}
	const dropTrigger = `DROP TRIGGER IF EXISTS fix410_fail_update ON tools`
	defer func() {
		_, _ = m.pg.Exec(dropTrigger)
		_, _ = m.pg.Exec(`DROP FUNCTION IF EXISTS fix410_fail_update()`)
		_ = m.pg.UpsertToolForce("record_fact", seed.Desc, seedSchema, seedAgents)
		_, _ = m.pg.Exec(`DELETE FROM settings WHERE key=$1`, flag)
	}()
	exec(`CREATE OR REPLACE FUNCTION fix410_fail_update() RETURNS trigger LANGUAGE plpgsql AS
'BEGIN RAISE EXCEPTION ''fix410: simulated transient failure''; END'`)

	start := func() {
		s.seedFactInputSchema()
		s.seedFactSourceSchema()
		s.refreshRecordFactContract()
	}
	for _, tc := range []struct {
		name        string
		fail, clear func()
	}{
		{"update fails", func() {
			exec(`CREATE TRIGGER fix410_fail_update BEFORE UPDATE ON tools
FOR EACH ROW WHEN (OLD.key = 'record_fact') EXECUTE FUNCTION fix410_fail_update()`)
		}, func() { exec(dropTrigger) }},
		{"schema does not decode", func() {
			exec(`UPDATE tools SET schema='[]'::jsonb WHERE key='record_fact'`)
		}, func() {
			exec(`UPDATE tools SET schema=$1::jsonb WHERE key='record_fact'`, legacySchema)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// A database that stores the earlier default text and has not run the refresh.
			if err := m.pg.UpsertToolForce("record_fact", legacyTool[0], json.RawMessage(legacySchema), seedAgents); err != nil {
				t.Fatal(err)
			}
			exec(`DELETE FROM settings WHERE key=$1`, flag)

			tc.fail()
			start()
			if v, ok, _ := m.pg.GetSetting(flag); ok {
				t.Errorf("flag is %q after a failed refresh: later starts skip it", v)
			}
			if row, _ := m.pg.GetTool("record_fact"); row == nil || row.Description != legacyTool[0] {
				t.Fatal("the simulated failure did not leave the earlier description in place")
			}

			tc.clear()
			start()
			row, err := m.pg.GetTool("record_fact")
			if err != nil || row == nil {
				t.Fatalf("row: %v", err)
			}
			if row.Description != seed.Desc {
				t.Errorf("the next start did not refresh the description: %.60q", row.Description)
			}
			if v, _, _ := m.pg.GetSetting(flag); v != "true" {
				t.Errorf("flag = %q after a successful refresh, want true", v)
			}
		})
	}
}
