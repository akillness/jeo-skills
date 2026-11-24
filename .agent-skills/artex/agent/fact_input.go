package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Match strings.TrimSpace, including Unicode whitespace, in the published schema.
const factWhitespace = "\t\n\v\f\r \u0085   -     　"

func factAssetIDSchema() map[string]any {
	return map[string]any{
		"type": []string{"integer", "string"}, "minimum": 1,
		"pattern": "^[" + factWhitespace + "]*\\+?0*[1-9][0-9]*[" + factWhitespace + "]*$",
	}
}

// factItemSchema is one fact: the shape of every facts[] item. It is also the
// shape of the legacy single-fact call (fields at the top level, no facts),
// which the handler still accepts but the published schema no longer shows.
func factItemSchema() map[string]any {
	schema := obj(map[string]any{
		"summary":          str("Required: a non-empty one-sentence summary of this conclusion."),
		"intent_id":        idp("The intent that produced this fact. Omit it to link the fact to the intent this worker is running; a batch may name a different intent per item."),
		"detail":           str("Details of this fact, including all related observations."),
		"evidence":         str("One line of key evidence: the command and the most proving output lines. Put longer output in detail."),
		"confidence":       str("observed (seen directly in output) | inferred (inferred from phenomena). Label negative conclusions honestly."),
		"source":           map[string]any{"type": "string", "enum": factSources, "description": "where the content came from: target_response | tool_output | third_party_intel | operator_input | inference (default when omitted)"},
		"asset_ids":        map[string]any{"type": "array", "items": factAssetIDSchema(), "description": "Asset IDs explicitly involved in this fact. Use asset_ids as the canonical field; tested_asset_ids is accepted as an alias. If both are provided, they must name the same set. Do not infer IDs from the intent."},
		"tested_asset_ids": map[string]any{"type": "array", "items": factAssetIDSchema(), "description": "Compatibility alias for asset_ids, not an additional list. When both are provided their sets must match. Only include assets actually involved in this conclusion."},
	}, "summary")
	summary := schema["properties"].(map[string]any)["summary"].(map[string]any)
	summary["minLength"] = 1
	summary["pattern"] = "[^" + factWhitespace + "]"
	schema["additionalProperties"] = false
	return schema
}

// recordFactFactsDescription documents the only top-level property of
// record_fact. The wording tells a model that tends to fill every declared
// property that there is nothing else to fill.
const recordFactFactsDescription = "The facts to record, usually exactly one. Every item is a complete fact with its own summary. This is the only top-level property: never send summary, detail, evidence, confidence, source, intent_id or asset ids beside facts. Returned ids match item order; retry only failed indices."

// recordFactContractNote is appended to the record_fact description: the one
// call shape the model is given.
const recordFactContractNote = "\n★Call shape: exactly {\"facts\":[{...}]} with one item per distinct conclusion (usually one item). Each item carries its own summary, detail, evidence, confidence, source, asset_ids and, when it differs from the intent you are running, intent_id. Nothing else at the top level; a top-level fact field beside facts is refused and nothing is written."

// RecordFactContractNote exposes the text to the server's one-time refresh.
func RecordFactContractNote() string { return recordFactContractNote }

// recordFactSchema is the published input contract: facts[] and nothing else.
// Providers reject root-level anyOf, and the earlier contract (fact fields at
// the top level beside facts[]) made models fill both; the handler alone keeps
// the legacy shapes alive.
func recordFactSchema() map[string]any {
	schema := obj(map[string]any{
		"facts": map[string]any{
			"type": "array", "minItems": 1, "items": factItemSchema(),
			"description": recordFactFactsDescription,
		},
	}, "facts")
	schema["additionalProperties"] = false
	return schema
}

// RepairRecordFactSchema brings a stored or cached record_fact schema to the
// facts-only contract. The structure always comes from the code; of the stored
// schema only the annotations (description, default) of facts and of its known
// item fields survive. Top-level fact fields of the earlier contract are
// dropped: the handler still accepts them, but the model must not see them.
func RepairRecordFactSchema(stored map[string]any) map[string]any {
	out := recordFactSchema()
	facts := out["properties"].(map[string]any)["facts"].(map[string]any)
	storedProps, _ := stored["properties"].(map[string]any)
	storedFacts, _ := storedProps["facts"].(map[string]any)
	if storedFacts == nil {
		return out
	}
	if d, ok := storedFacts["description"].(string); ok && strings.TrimSpace(d) != "" {
		facts["description"] = d
	}
	storedItems, _ := storedFacts["items"].(map[string]any)
	storedItemProps, _ := storedItems["properties"].(map[string]any)
	itemProps := facts["items"].(map[string]any)["properties"].(map[string]any)
	for name, p := range itemProps {
		sp, _ := storedItemProps[name].(map[string]any)
		if sp == nil {
			continue
		}
		prop := p.(map[string]any)
		for _, key := range []string{"description", "default"} {
			if v, ok := sp[key]; ok && v != nil {
				prop[key] = v
			}
		}
	}
	return out
}

type recordFactInput struct {
	Facts []factItem `json:"facts"`
	factItem
}

// Validate exact field names before decoding: encoding/json otherwise treats
// Summary, SUMMARY, etc. as aliases even with DisallowUnknownFields enabled.
// Three input shapes reach the handler: the published one ({facts:[...]}), the
// legacy single fact (fields at the top level, no facts) and the legacy batch
// with a top-level intent_id as the default of its items.
func decodeRecordFactInput(in json.RawMessage) (recordFactInput, bool, error) {
	var out recordFactInput
	fields, err := exactFactFields(in, true)
	if err != nil {
		return out, false, err
	}
	_, batch := fields["facts"]
	if batch {
		var items []json.RawMessage
		if err := json.Unmarshal(fields["facts"], &items); err != nil {
			return out, true, fmt.Errorf("facts must be an array: %w", err)
		}
		if len(items) == 0 {
			return out, true, fmt.Errorf("facts must be a non-empty array of complete facts, each with its own summary")
		}
		itemFields := make([]map[string]json.RawMessage, len(items))
		for i, item := range items {
			f, err := exactFactFields(item, false)
			if err != nil {
				return out, true, fmt.Errorf("facts[%d]: %w", i, err)
			}
			itemFields[i] = f
		}
		if err := checkBatchTopLevel(fields, itemFields); err != nil {
			return out, true, err
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(in))
	decoder.DisallowUnknownFields() // Also applies recursively to every factItem.
	if err := decoder.Decode(&out); err != nil {
		return out, batch, err
	}
	return out, batch, nil
}

// checkBatchTopLevel enforces the contract at the top level of a facts[] call,
// where only facts and (legacy) intent_id carry meaning. Any other top-level
// field is refused by name before anything is written, including empty
// placeholders and copies of a fact's fields: a value there is at best
// redundant and at worst a second, conflicting claim. The message names the
// one accepted shape, so a model that filled every declared property of an
// older schema learns where the fields belong.
func checkBatchTopLevel(fields map[string]json.RawMessage, items []map[string]json.RawMessage) error {
	var extra []string
	for name := range fields {
		if name == "intent_id" || name == "facts" {
			continue
		}
		extra = append(extra, fmt.Sprintf("%q", name))
	}
	if len(extra) == 0 {
		return nil
	}
	sort.Strings(extra)
	return fmt.Errorf("top-level field(s) %s are not allowed beside facts (%d item(s)): record_fact takes only {\"facts\":[...]}; put every field of a fact inside its facts item and send nothing else at the top level", strings.Join(extra, ", "), len(items))
}

func exactFactFields(in json.RawMessage, topLevel bool) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(in, &fields); err != nil {
		return nil, err
	}
	if fields == nil {
		return nil, fmt.Errorf("record_fact input and each fact must be objects")
	}
	for name := range fields {
		switch name {
		case "summary", "detail", "evidence", "confidence", "source", "intent_id", "asset_ids", "tested_asset_ids":
		case "facts":
			if !topLevel {
				return nil, fmt.Errorf("unknown field %q", name)
			}
		default:
			return nil, fmt.Errorf("unknown field %q (field names are case-sensitive)", name)
		}
	}
	return fields, nil
}
