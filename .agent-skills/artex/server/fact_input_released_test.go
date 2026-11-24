package server

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
)

// The record_fact texts seeded by the releases v0.4.0 to v0.6.0, copied from
// agent/tools.go at those tags. They are kept here, apart from the agent
// package's list of known defaults, so the test fails when that list drifts
// from the released bytes.
const fix410ReleasedDescription = "Write an exploration [fact/conclusion] into the exploration graph, linked to the intent that produced it (intent_id). Used to record exploration results — both [positive conclusions] like fingerprinting/enumeration, and [negative conclusions] like 'port closed'/'parameter not injectable'/'no login entry found'.\n" +
	"⚠️Multiple observations from one exploration must be [consolidated into ONE fact], not split into many; whenever they can be merged into one fact, use one: summary = a one-sentence summary of this conclusion, detail = the related details (may contain multiple concrete items). Example: a fingerprinting intent → one fact {summary:'identified the tech stack and response characteristics of site X', detail:'nginx 1.25 / Vue3 / 200 / title=.. / body_len=..'}, rather than one fact each for status code, fingerprint, and title. One intent usually produces exactly one fact; splitting too finely bloats the graph endlessly.\n" +
	"★The facts array writes several [mutually distinct] conclusions at once (each may omit intent_id, defaulting to the top-level intent_id). Returns an ids array, same length and order as facts.\n" +
	"⚠️Write only conclusions you [actually saw] in tool output — don't extrapolate. evidence and confidence keep inaccurate conclusions from polluting the graph:\n" +
	"  · evidence = [one line] of key evidence supporting this conclusion (the command + the one or two most proving output lines), **keep it brief** — details belong in detail; don't paste large output blocks here.\n" +
	"  · confidence = observed (seen directly in output) | inferred (inferred from phenomena).\n" +
	"  · **Negative conclusions** (not injectable / port closed / no entry found, etc.) state only \"observation + tentative reading\" — state what you actually saw; whether to abandon the direction is for the planner to decide globally; always provide evidence, mark inferred when the means weren't exhausted or the evidence is weak (including probed only once, looks-like), and mark observed only when truly exhausted and directly seen."

const fix410ReleasedFactsDescription = "[use when there are several distinct conclusions] array of facts; element fields same as the top-level fields below (summary/detail/evidence/confidence/intent_id/asset_ids); omitting intent_id falls back to the top-level intent_id. The returned ids match this array in length and order."

// A database seeded by a release stores the released record_fact description,
// the released facts property description and facts items without properties.
// The one-time refresh replaces both texts with the current ones and sets its
// flag; texts an operator edited match no known default and stay as stored.
func TestFix410ReleasedDefaultsRefreshed(t *testing.T) {
	for _, c := range []struct {
		name, text, sum string
		size            int
	}{
		{"description", fix410ReleasedDescription, "0da5cec5cde7f5e6f41343418fcc2a7d132d6520f336efb39fcbf1ab6ac51957", 2038},
		{"facts description", fix410ReleasedFactsDescription, "eb054843a6b33dd39b94ba0648f292babb9cf9bdd106ee4eff6bf593d3f3edf4", 286},
	} {
		sum := sha256.Sum256([]byte(c.text))
		if len(c.text) != c.size || hex.EncodeToString(sum[:]) != c.sum {
			t.Fatalf("the released %s in this test is not the released text: %d bytes, sha256 %x", c.name, len(c.text), sum)
		}
	}
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	s := &Server{m: m}
	const flag = "tool_schema_refresh_record_fact_facts_only"
	seed := recordFactSeed(t)
	seedSchema, _ := json.Marshal(seed.Schema)
	seedAgents, _ := json.Marshal(seed.Agents)
	defer func() {
		_ = m.pg.UpsertToolForce("record_fact", seed.Desc, seedSchema, seedAgents)
		_, _ = m.pg.Exec(`DELETE FROM settings WHERE key=$1`, flag)
	}()
	currentFacts := seed.Schema["properties"].(map[string]any)["facts"].(map[string]any)["description"]

	// start stores the row as a release seeded it, with the given two texts,
	// runs the startup steps and returns the two texts as stored afterwards.
	start := func(desc, factsDesc string) (string, any) {
		t.Helper()
		str := func(d string) map[string]any { return map[string]any{"type": "string", "description": d} }
		schema, _ := json.Marshal(map[string]any{"type": "object", "properties": map[string]any{
			"facts":      map[string]any{"type": "array", "description": factsDesc, "items": map[string]any{"type": "object"}},
			"summary":    str("a [one-sentence summary] of this exploration's conclusion (a condensation of detail)"),
			"intent_id":  map[string]any{"type": "integer", "description": "the id of the intent that produced this fact (the intent you claimed; the default for each item in batch mode)"},
			"detail":     str("details related to this fact: write all of this exploration's observations here"),
			"evidence":   str("[one line] of key evidence: the command + the one or two most proving output lines. Keep it brief; don't paste large output blocks (details go in detail)."),
			"confidence": str("observed (seen directly in output) | inferred (inferred from phenomena). Always label negative conclusions honestly."),
			"asset_ids":  map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "related asset ids (optional, 0/1/many): which assets this fact involves"},
		}})
		if err := m.pg.UpsertToolForce("record_fact", desc, schema, seedAgents); err != nil {
			t.Fatal(err)
		}
		if _, err := m.pg.Exec(`DELETE FROM settings WHERE key=$1`, flag); err != nil {
			t.Fatal(err)
		}
		s.seedFactInputSchema()
		s.seedFactSourceSchema()
		s.refreshRecordFactContract()
		if v, _, _ := m.pg.GetSetting(flag); v != "true" {
			t.Errorf("flag = %q after the refresh, want true", v)
		}
		row, err := m.pg.GetTool("record_fact")
		if err != nil || row == nil {
			t.Fatalf("row: %v", err)
		}
		var stored struct {
			Properties map[string]map[string]any `json:"properties"`
		}
		if err := json.Unmarshal(row.Schema, &stored); err != nil {
			t.Fatal(err)
		}
		if len(stored.Properties) != 1 || stored.Properties["facts"] == nil {
			t.Fatalf("top level still holds fact fields: %s", row.Schema)
		}
		return row.Description, stored.Properties["facts"]["description"]
	}

	desc, factsDesc := start(fix410ReleasedDescription, fix410ReleasedFactsDescription)
	if desc != seed.Desc {
		t.Errorf("released description not replaced by the current one: %.60q", desc)
	}
	if factsDesc != currentFacts {
		t.Errorf("released facts description not replaced by the current one: %v", factsDesc)
	}

	editedDesc := fix410ReleasedDescription + "\nOperator note: record every negative result."
	editedFacts := fix410ReleasedFactsDescription + " Operator note: one fact per host."
	desc, factsDesc = start(editedDesc, editedFacts)
	if desc != editedDesc {
		t.Errorf("operator description changed: %.60q", desc)
	}
	if factsDesc != editedFacts {
		t.Errorf("operator facts description changed: %v", factsDesc)
	}
}
