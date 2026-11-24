package agent

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

func TestRecordFactSummaryContract(t *testing.T) {
	tools := NewToolSet(guardTaskStore(t), "worker")
	tool := tools.recordFact()
	for _, input := range []string{
		`{}`, `null`, `[]`,
		`{"summary":""}`, `{"summary":"   "}`,
		`{"summary":"must not substitute","facts":[]}`,
		`{"summary":"must not substitute","facts":null}`,
		`{"summary":"must not inherit","facts":[{"detail":"missing summary"}]}`,
		`{"facts":[{"summary":"must not save"},{"summary":42}]}`,
	} {
		out := callGuardTool(t, tool, input)
		if !out.IsError {
			t.Errorf("accepted %s: %s", input, out.Flatten())
		}
	}
	if tools.Writes().Facts != 0 {
		t.Fatal("invalid inputs wrote facts")
	}
	single := callGuardTool(t, tool, `{"summary":"valid single"}`)
	if single.IsError {
		t.Fatal(single.Flatten())
	}
	batch := callGuardTool(t, tool, `{"facts":[{"summary":"valid batch"},{"detail":"missing summary"}]}`)
	var result struct {
		IDs    []int64           `json:"ids"`
		Errors map[string]string `json:"errors"`
		Retry  string            `json:"retry_instruction"`
	}
	if err := json.Unmarshal([]byte(batch.Flatten()), &result); err != nil {
		t.Fatal(batch.Flatten(), err)
	}
	if !batch.IsError || len(result.IDs) != 2 || result.IDs[0] <= 0 || result.IDs[1] != 0 ||
		!strings.Contains(result.Errors["1"], "summary") || result.Retry == "" || tools.Writes().Facts != 2 {
		t.Fatalf("partial failure is not actionable: %s", batch.Flatten())
	}
}

// A stored schema of the earlier contract (fact fields at the top level beside
// facts[], operator annotations, a stray property) is republished as the
// facts-only contract; annotations of facts and of its items survive, the top
// level loses every fact field, and the result is idempotent.
func TestRecordFactStoredContractRepair(t *testing.T) {
	old := map[string]any{
		"type": "object", "required": []any{"summary"},
		"anyOf": []any{map[string]any{"required": []string{"summary"}}},
		"properties": map[string]any{
			"summary":      map[string]any{"type": "string", "description": "operator summary"},
			"confidence":   map[string]any{"type": "string", "default": "inferred"},
			"custom_field": map[string]any{"type": "string"},
			"facts": map[string]any{"type": "array", "description": "operator facts", "items": map[string]any{"type": "object", "properties": map[string]any{
				"summary":    map[string]any{"type": "string", "description": "operator item summary"},
				"confidence": map[string]any{"type": "string", "default": "observed"},
				"custom":     map[string]any{"type": "string"},
			}}},
		},
	}
	base := NewToolSet(nil, "").recordFact()
	repaired := DecorateTool(base, "operator tool", old)
	schema := repaired.InputSchema()
	if req, _ := schema["required"].([]string); len(req) != 1 || req[0] != "facts" {
		t.Fatalf("facts must be the only required property: %v", schema["required"])
	}
	if _, exists := schema["anyOf"]; exists {
		t.Fatal("root anyOf reaches the provider")
	}
	props := schema["properties"].(map[string]any)
	if len(props) != 1 || props["facts"] == nil || schema["additionalProperties"] != false {
		t.Fatalf("top level must hold facts only: %v", props)
	}
	facts := props["facts"].(map[string]any)
	item := facts["items"].(map[string]any)
	required := item["required"].([]string)
	if len(required) != 1 || required[0] != "summary" || facts["minItems"] != 1 {
		t.Fatal("batch must require a nonempty list with a summary per item")
	}
	itemProps := item["properties"].(map[string]any)
	if itemProps["summary"].(map[string]any)["minLength"] != 1 {
		t.Fatal("empty summaries permitted by schema")
	}
	if repaired.Description() != "operator tool" || facts["description"] != "operator facts" ||
		itemProps["summary"].(map[string]any)["description"] != "operator item summary" ||
		itemProps["confidence"].(map[string]any)["default"] != "observed" || itemProps["custom"] != nil {
		t.Fatalf("item annotations lost or stray property kept: %v", itemProps)
	}
	if _, ok := old["properties"].(map[string]any)["tested_asset_ids"]; ok {
		t.Fatal("shared old schema mutated")
	}
	first, _ := json.Marshal(schema)
	second, _ := json.Marshal(DecorateTool(base, "", schema).InputSchema())
	if string(first) != string(second) {
		t.Fatal("repair is not idempotent")
	}
	var roundTrip map[string]any
	if err := json.Unmarshal(first, &roundTrip); err != nil {
		t.Fatal(err)
	}
	if err := actool.ValidateInput(roundTrip, json.RawMessage(`{"facts":[{"summary":"batch"}]}`)); err != nil {
		t.Fatalf("SDK rejects the published shape after catalog round trip: %v", err)
	}
	// The legacy single shape no longer passes the published schema; the
	// handler validates its own input instead, also behind the catalog wrapper.
	if err := actool.ValidateInput(roundTrip, json.RawMessage(`{"summary":"single"}`)); err == nil {
		t.Fatal("published schema must require facts")
	}
	for _, tool := range []actool.CoreTool{base, repaired} {
		r, ok := tool.(interface{ AcceptsRawInput() bool })
		if !ok || !r.AcceptsRawInput() {
			t.Fatalf("%T must opt out of the harness schema check", tool)
		}
	}
}

func TestRecordFactStrictFields(t *testing.T) {
	tools := NewToolSet(guardTaskStore(t), "worker")
	for _, tc := range []struct{ input, field string }{
		{`{"summary":"valid","typo":1}`, "typo"},
		{`{"Summary":"case alias"}`, "Summary"},
		{`{"summary":"valid","Facts":[]}`, "Facts"},
		{`{"facts":[{"summary":"first"},{"summary":"second","typo":1}]}`, "typo"},
		{`{"facts":[{"summary":"first"},{"Summary":"case alias"}]}`, "Summary"},
		{`{"facts":[{"summary":"first"},{"summary":"second","ASSET_IDS":[]}]}`, "ASSET_IDS"},
		{`{"facts":[{"summary":"nested","facts":[]}]}`, "facts"},
		{`{"summary":"ignored","facts":[{"summary":"batch"}]}`, "summary"},
		{`{"detail":"ignored","facts":[{"summary":"batch"}]}`, "detail"},
		{`{"evidence":"ignored","facts":[{"summary":"batch"}]}`, "evidence"},
		{`{"source":"inference","facts":[{"summary":"batch"}]}`, "source"},
		{`{"confidence":"inferred","facts":[{"summary":"batch"}]}`, "confidence"},
		{`{"asset_ids":[],"facts":[{"summary":"batch"}]}`, "asset_ids"},
		{`{"tested_asset_ids":[],"facts":[{"summary":"batch"}]}`, "tested_asset_ids"},
	} {
		out := callGuardTool(t, tools.recordFact(), tc.input)
		if !out.IsError || !strings.Contains(out.Flatten(), tc.field) {
			t.Errorf("input %s: want named rejection for %s, got %s", tc.input, tc.field, out.Flatten())
		}
	}
	if tools.Writes().Facts != 0 {
		t.Fatal("malformed fields caused partial writes")
	}
	for _, input := range []string{
		`{"facts":[null]}`, `{"facts":[[]]}`, `{"summary":"valid"} {"summary":"extra object"}`,
	} {
		if _, _, err := decodeRecordFactInput(json.RawMessage(input)); err == nil {
			t.Errorf("accepted %s", input)
		}
	}
	if _, batch, err := decodeRecordFactInput(json.RawMessage(`{"intent_id":1,"facts":[{"summary":"valid","intent_id":2}]}`)); err != nil || !batch {
		t.Fatalf("valid batch: %v %v", batch, err)
	}
}

func TestRecordFactSchemaMatchesStrings(t *testing.T) {
	props := factItemSchema()["properties"].(map[string]any)
	summary := regexp.MustCompile(props["summary"].(map[string]any)["pattern"].(string))
	for _, value := range []string{"", " ", "\t\r\n", "\u00a0\u0085", "\u2003\u3000", "conclusion", "  observed  "} {
		if got, want := summary.MatchString(value), strings.TrimSpace(value) != ""; got != want {
			t.Errorf("summary %q: schema=%v runtime=%v", value, got, want)
		}
	}
	id := regexp.MustCompile(factAssetIDSchema()["pattern"].(string))
	for _, value := range []string{"1", "001", "+1", " +001 ", "\u200312\u3000", "", "0", "-1", "1.5", "a"} {
		raw, _ := json.Marshal(value)
		if got, want := id.MatchString(value), pid(raw) > 0; got != want {
			t.Errorf("asset ID %q: schema=%v runtime=%v", value, got, want)
		}
	}
	for _, input := range []string{
		`{"facts":[{"summary":"batch","asset_ids":["1",2]}]}`,
		`{"facts":[{"summary":"batch","tested_asset_ids":["1",2]}]}`,
	} {
		if err := actool.ValidateInput(recordFactSchema(), json.RawMessage(input)); err != nil {
			t.Errorf("numeric-string compatibility rejected: %v", err)
		}
	}
}

// A model that fills every declared property of the earlier schema sends the
// single fact inside facts[] and a copy (or a placeholder) of every fact field
// beside it. Such a call is refused by name before any write, whether the
// copies are identical, empty or dummies, and the message names the one shape
// that is accepted. The published schema no longer declares those fields.
func TestRecordFactRefusesTopLevelCopiesBesideFacts(t *testing.T) {
	store := guardTaskStore(t)
	intentID := addGuardNode(t, store, db.KindIntent, map[string]any{"summary": "fingerprint the service"}, "running")
	tools := NewToolSet(store, "worker")
	before, err := store.ListByKind(db.KindFact, 100)
	if err != nil {
		t.Fatal(err)
	}
	id := strconv.FormatInt(intentID, 10)
	fact := `{"summary":"TLS 1.0 is offered on port 8443","detail":"the handshake succeeded with TLSv1.0","evidence":"openssl s_client -tls1 → Protocol: TLSv1","confidence":"observed","source":"tool_output","intent_id":` + id + `,"asset_ids":[]}`
	for _, tc := range []struct{ call, want string }{
		// an exact copy of every field beside facts[]
		{`{"summary":"TLS 1.0 is offered on port 8443","detail":"the handshake succeeded with TLSv1.0","evidence":"openssl s_client -tls1 → Protocol: TLSv1","confidence":"observed","source":"tool_output","intent_id":` + id + `,"asset_ids":[],"facts":[` + fact + `]}`, `"asset_ids", "confidence", "detail", "evidence", "source", "summary"`},
		// empty placeholders only
		{`{"summary":"","detail":"","evidence":"","confidence":"","source":"","asset_ids":[],"tested_asset_ids":[],"intent_id":` + id + `,"facts":[` + fact + `]}`, `"asset_ids", "confidence", "detail", "evidence", "source", "summary", "tested_asset_ids"`},
		// dummy values
		{`{"summary":"x","facts":[` + fact + `]}`, `"summary"`},
		{`{"summary":null,"facts":[` + fact + `]}`, `"summary"`},
	} {
		w := tools.Writes().Facts
		r := callGuardTool(t, tools.recordFact(), tc.call)
		if !r.IsError || !strings.Contains(r.Flatten(), tc.want) || !strings.Contains(r.Flatten(), `record_fact takes only {"facts":[...]}`) || tools.Writes().Facts != w {
			t.Errorf("%s: want refusal naming %s, got %s (writes %d→%d)", tc.call, tc.want, r.Flatten(), w, tools.Writes().Facts)
		}
	}
	if n, err := store.ListByKind(db.KindFact, 100); err != nil || len(n) != len(before) {
		t.Fatalf("refused calls wrote facts: %d → %d %v", len(before), len(n), err)
	}
	// The same fact in the published shape is written once and linked.
	res := callGuardTool(t, tools.recordFact(), `{"facts":[`+fact+`]}`)
	if res.IsError || tools.Writes().Facts != 1 {
		t.Fatalf("published shape refused: %s", res.Flatten())
	}
	var out struct {
		IDs []int64 `json:"ids"`
	}
	if err := json.Unmarshal([]byte(res.Flatten()), &out); err != nil || len(out.IDs) != 1 || out.IDs[0] <= 0 {
		t.Fatalf("batch result must carry exactly one id: %s", res.Flatten())
	}
	if yielded, err := store.FactsYielded(intentID); err != nil || len(yielded) != 1 || yielded[0] != out.IDs[0] {
		t.Fatalf("fact not linked to the intent: %v %v", yielded, err)
	}
	node, err := store.GetNode(out.IDs[0])
	if err != nil || node == nil {
		t.Fatal(err)
	}
	var payload map[string]any
	_ = json.Unmarshal(node.Payload, &payload)
	// The item's fields are what got stored; the server then downgrades the
	// claim because no recorded activity carries its evidence (#124 row 1).
	if payload["summary"] != "TLS 1.0 is offered on port 8443" || payload["source"] != "inference" || payload["confidence"] != "inferred" || payload["provenance"] != factProvenanceUnverified {
		t.Fatalf("fact payload: %s", node.Payload)
	}
}

// Conflicting copies, placeholders, unknown fields, bad asset ids, missing
// summaries and empty batches are refused, and nothing is written by a
// refused call.
func TestRecordFactBatchTopLevelConflicts(t *testing.T) {
	store := guardTaskStore(t)
	tools := NewToolSet(store, "worker")
	before, err := store.ListByKind(db.KindFact, 100) // the task's origin fact
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ call, want string }{
		// dummy summaries a model may send after a refusal
		{`{"summary":"x","facts":[{"summary":"real conclusion"}]}`, `"summary"`},
		{`{"summary":"placeholder","detail":"test","evidence":"test","facts":[{"summary":"real","detail":"real detail","evidence":"real evidence"}]}`, `"detail", "evidence", "summary"`},
		{`{"summary":"contradictory","facts":[{"summary":"different"}]}`, `"summary"`},
		{`{"detail":"invented","facts":[{"summary":"legitimate"}]}`, `"detail"`},
		{`{"confidence":"observed","facts":[{"summary":"fact says inferred","confidence":"inferred"}]}`, `"confidence"`},
		{`{"source":"inference","facts":[{"summary":"fact says tool_output","source":"tool_output"}]}`, `"source"`},
		{`{"asset_ids":[1],"facts":[{"summary":"fact has other assets","asset_ids":[2]}]}`, `"asset_ids"`},
		{`{"summary":"first","facts":[{"summary":"first"},{"summary":"second"}]}`, `(2 item(s))`},
		{`{"summary":"x","typo":1,"facts":[{"summary":"unknown field"}]}`, `"typo"`},
		{`{"facts":[{"summary":"unknown nested","typo":1}]}`, `"typo"`},
		{`{"facts":[{"summary":"bad asset id","asset_ids":["abc"]}]}`, `asset`},
		{`{"summary":"must not inherit","facts":[{"detail":"missing summary"}]}`, `"summary"`},
		{`{"summary":"x","facts":[]}`, `non-empty`},
		{`{"facts":[]}`, `non-empty`},
		{`{"summary":"","facts":[]}`, `non-empty`},
	} {
		w := tools.Writes().Facts
		r := callGuardTool(t, tools.recordFact(), tc.call)
		if !r.IsError || !strings.Contains(r.Flatten(), tc.want) || tools.Writes().Facts != w {
			t.Errorf("%s: want refusal mentioning %s, got %s (writes %d→%d)", tc.call, tc.want, r.Flatten(), w, tools.Writes().Facts)
		}
	}
	if n, err := store.ListByKind(db.KindFact, 100); err != nil || len(n) != len(before) {
		t.Fatalf("refused calls wrote facts: %d → %d %v", len(before), len(n), err)
	}
}

// The published schema holds facts[] and nothing else, and the description
// names that one shape; the earlier "two shapes" wording is gone.
func TestRecordFactSchemaIsFactsOnly(t *testing.T) {
	schema := recordFactSchema()
	props := schema["properties"].(map[string]any)
	if len(props) != 1 || props["facts"] == nil {
		t.Fatalf("top-level properties: %v", props)
	}
	if req, _ := schema["required"].([]string); len(req) != 1 || req[0] != "facts" || schema["additionalProperties"] != false {
		t.Fatalf("facts must be required and the only property: %v %v", schema["required"], schema["additionalProperties"])
	}
	facts := props["facts"].(map[string]any)
	if d, _ := facts["description"].(string); !strings.Contains(d, "never send summary") {
		t.Errorf("facts description must forbid top-level copies: %q", d)
	}
	item := facts["items"].(map[string]any)["properties"].(map[string]any)
	for _, name := range []string{"summary", "intent_id", "detail", "evidence", "confidence", "source", "asset_ids", "tested_asset_ids"} {
		if item[name] == nil {
			t.Errorf("facts[] item lacks %s", name)
		}
	}
	for name, d := range map[string]string{
		"summary":   item["summary"].(map[string]any)["description"].(string),
		"intent_id": item["intent_id"].(map[string]any)["description"].(string),
	} {
		if strings.Contains(d, "top level") || strings.Contains(d, "top-level") {
			t.Errorf("facts[].%s still refers to a top level: %q", name, d)
		}
	}
	desc := NewToolSet(nil, "").recordFact().Description()
	if !strings.HasSuffix(desc, recordFactContractNote) || strings.Contains(desc, "top-level intent_id") {
		t.Fatalf("record_fact description must describe the facts-only contract: %q", desc)
	}
	// The seed the catalog stores is the same contract.
	for _, seed := range BuiltinToolSeeds() {
		if seed.Key != "record_fact" {
			continue
		}
		if seed.Desc != desc {
			t.Fatal("seed description differs from the tool")
		}
		if p := seed.Schema["properties"].(map[string]any); len(p) != 1 || p["facts"] == nil {
			t.Fatalf("seed schema is not facts-only: %v", p)
		}
	}
}

// A facts[] item without intent_id is linked to the intent the worker runs
// (SetOwnerNode); a legacy top-level intent_id still wins; a planner ToolSet
// (owner = the task root, not an intent) writes an unlinked fact.
func TestRecordFactDefaultsToRunningIntent(t *testing.T) {
	store := guardTaskStore(t)
	running := addGuardNode(t, store, db.KindIntent, map[string]any{"summary": "running intent"}, "running")
	other := addGuardNode(t, store, db.KindIntent, map[string]any{"summary": "other intent"}, "open")
	tools := NewToolSet(store, "worker")
	tools.SetOwnerNode(running)
	ids := func(res actool.Result) []int64 {
		t.Helper()
		var out struct {
			IDs []int64 `json:"ids"`
		}
		if err := json.Unmarshal([]byte(res.Flatten()), &out); err != nil || len(out.IDs) != 1 || out.IDs[0] <= 0 {
			t.Fatalf("batch result: %s", res.Flatten())
		}
		return out.IDs
	}
	res := callGuardTool(t, tools.recordFact(), `{"facts":[{"summary":"linked to the running intent","confidence":"observed","source":"tool_output"}]}`)
	if res.IsError {
		t.Fatal(res.Flatten())
	}
	first := ids(res)[0]
	if yielded, err := store.FactsYielded(running); err != nil || len(yielded) != 1 || yielded[0] != first {
		t.Fatalf("fact %d not linked to the running intent %d: %v %v", first, running, yielded, err)
	}
	res = callGuardTool(t, tools.recordFact(), `{"intent_id":`+strconv.FormatInt(other, 10)+`,"facts":[{"summary":"legacy top-level intent"}]}`)
	if res.IsError {
		t.Fatal(res.Flatten())
	}
	second := ids(res)[0]
	if yielded, err := store.FactsYielded(other); err != nil || len(yielded) != 1 || yielded[0] != second {
		t.Fatalf("legacy top-level intent_id must win: %v %v", yielded, err)
	}
	res = callGuardTool(t, tools.recordFact(), `{"facts":[{"summary":"item intent","intent_id":`+strconv.FormatInt(other, 10)+`}]}`)
	if res.IsError {
		t.Fatal(res.Flatten())
	}
	third := ids(res)[0]
	if yielded, _ := store.FactsYielded(other); len(yielded) != 2 || yielded[1] != third && yielded[0] != third {
		t.Fatalf("item intent_id must win: %v", yielded)
	}
	if yielded, _ := store.FactsYielded(running); len(yielded) != 1 {
		t.Fatalf("running intent gained facts it did not produce: %v", yielded)
	}
	planner := NewToolSet(store, "planner")
	origin, err := store.ListByKind(db.KindFact, 1)
	if err != nil || len(origin) == 0 {
		t.Fatalf("origin fact: %v", err)
	}
	planner.SetOwnerNode(origin[0].ID)
	res = callGuardTool(t, planner.recordFact(), `{"facts":[{"summary":"planner fact without intent"}]}`)
	if res.IsError || planner.Writes().Facts != 1 {
		t.Fatalf("planner write refused: %s", res.Flatten())
	}
	if yielded, _ := store.FactsYielded(running); len(yielded) != 1 {
		t.Fatalf("planner fact must not be linked to a worker intent: %v", yielded)
	}
}
