package server

import (
	"encoding/json"
	"log"

	"github.com/Autumn-27/artex/agent"
)

// SeedTool only inserts new rows. Repair existing built-ins too, while keeping
// descriptions, bindings, enabled/deferred flags and parameter annotations.

// refreshRecordFactContract brings an already-seeded record_fact row to the
// facts-only contract (one-time, settings flag). SeedTool is first-insert-only
// and ToolResolve serves the stored text, so without this an old database keeps
// describing the earlier contract (fact fields at the top level beside facts[])
// to the model. Only text equal to the previous code default is replaced:
//   - the tool description;
//   - the facts property and item descriptions that referred to the top level.
//
// Operator edits stay; a description that matches no known default is logged
// as such and left in place. The schema structure itself is repaired by
// seedFactInputSchema on every start (RepairRecordFactSchema).
//
// The flag is written only once the outcome is known: the UPDATE succeeded
// (also when it changed no row) or the row is not the built-in one. A failed
// read, decode or UPDATE leaves it unset, so the next start retries.
func (s *Server) refreshRecordFactContract() {
	const flag = "tool_schema_refresh_record_fact_facts_only"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	done := func() { _ = s.m.pg.SetSetting(flag, "true") }
	var seed *agent.ToolSeed
	for _, sd := range agent.BuiltinToolSeeds() {
		if sd.Key == "record_fact" {
			seed = &sd
			break
		}
	}
	row, err := s.m.pg.GetTool("record_fact")
	if err != nil {
		log.Printf("[facts] read record_fact for the contract refresh: %v", err)
		return
	}
	if row == nil || seed == nil {
		return
	}
	if !row.System || row.Kind != "builtin" {
		done()
		return
	}
	legacyTool, legacyFacts, legacyItems := agent.RecordFactLegacyDescriptions()
	desc := row.Description
	switch {
	case desc == seed.Desc:
	case sliceHas(legacyTool, desc):
		desc = seed.Desc
	default:
		log.Printf("[facts] record_fact description does not match a known default (operator edit or an older release); the facts-only schema is published anyway, review the text in the tool catalog")
	}
	var schema map[string]any
	if err := json.Unmarshal(row.Schema, &schema); err != nil {
		log.Printf("[facts] decode record_fact schema: %v", err)
		return
	}
	repaired := agent.RepairRecordFactSchema(schema)
	facts := repaired["properties"].(map[string]any)["facts"].(map[string]any)
	canonFacts := seed.Schema["properties"].(map[string]any)["facts"].(map[string]any)
	if d, ok := facts["description"].(string); ok && sliceHas(legacyFacts, d) {
		facts["description"] = canonFacts["description"]
	}
	items := facts["items"].(map[string]any)["properties"].(map[string]any)
	canonItems := canonFacts["items"].(map[string]any)["properties"].(map[string]any)
	for name, old := range legacyItems {
		prop, _ := items[name].(map[string]any)
		want, _ := canonItems[name].(map[string]any)
		if prop != nil && want != nil && prop["description"] == old {
			prop["description"] = want["description"]
		}
	}
	raw, err := json.Marshal(repaired)
	if err != nil {
		return
	}
	if _, err := s.m.pg.Exec(`UPDATE tools SET description=$1, schema=$2::jsonb, updated_at=now()
WHERE key='record_fact' AND system AND kind='builtin'
  AND (description IS DISTINCT FROM $1 OR schema IS DISTINCT FROM $2::jsonb)`, desc, string(raw)); err != nil {
		log.Printf("[facts] refresh record_fact contract: %v", err)
		return
	}
	done()
	log.Printf("[facts] record_fact now publishes the facts-only contract (one-time)")
}

func sliceHas(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func (s *Server) seedFactInputSchema() {
	row, err := s.m.pg.GetTool("record_fact")
	if err != nil {
		log.Printf("[facts] read record_fact schema: %v", err)
		return
	}
	if row == nil || !row.System || row.Kind != "builtin" {
		return
	}
	var schema map[string]any
	if err := json.Unmarshal(row.Schema, &schema); err != nil {
		log.Printf("[facts] decode record_fact schema: %v", err)
		return
	}
	raw, err := json.Marshal(agent.RepairRecordFactSchema(schema))
	if err != nil {
		log.Printf("[facts] encode record_fact schema: %v", err)
		return
	}
	// Compare-and-swap preserves concurrent operator edits; JSONB equality
	// avoids changing updated_at again on every startup.
	if _, err := s.m.pg.Exec(`UPDATE tools SET schema=$2::jsonb, updated_at=now()
WHERE key='record_fact' AND system AND kind='builtin'
  AND schema=$1::jsonb AND schema IS DISTINCT FROM $2::jsonb`, string(row.Schema), string(raw)); err != nil {
		log.Printf("[facts] repair record_fact schema: %v", err)
	}
}
