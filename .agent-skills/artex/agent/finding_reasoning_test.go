package agent

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// Pure: report_finding advertises counterevidence / confidence_rationale as
// optional string properties.
func TestReportFindingSchemaReasoningFieldsOptional(t *testing.T) {
	schema := NewToolSet(nil, "").addFinding().InputSchema()
	props, _ := schema["properties"].(map[string]any)
	required, _ := schema["required"].([]string)
	if !slices.Contains(required, "vulnclass") {
		t.Fatalf("unexpected required list shape: %#v", schema["required"])
	}
	for _, name := range []string{"counterevidence", "confidence_rationale"} {
		p, ok := props[name].(map[string]any)
		if !ok {
			t.Fatalf("report_finding schema missing %s", name)
		}
		if p["type"] != "string" {
			t.Fatalf("%s type = %v, want string", name, p["type"])
		}
		if desc, _ := p["description"].(string); !strings.HasPrefix(desc, "optional") {
			t.Fatalf("%s description should say optional: %q", name, desc)
		}
		if slices.Contains(required, name) {
			t.Fatalf("%s must not be required: %v", name, required)
		}
	}
}

// PG: the tool passes both fields into storage, and omitting them never blocks
// a finding.
func TestReportFindingStoresReasoningFields(t *testing.T) {
	d := testDB(t)
	defer d.Close()
	task, err := d.CreateTask("reasoning fields", "fixture", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = d.DeleteFindingsByTask(task.ID)
		_ = d.DeleteTask(task.ID)
	}()
	ts := NewToolSet(nil, "")
	ts.ts, ts.taskID = d.Exploration(task.ExplorationID), task.ID
	for _, tc := range []struct{ extra, counter, rationale string }{
		{`,"counterevidence":"WAF blocked 4 of 5 encodings","confidence_rationale":"the 5th returned the other tenant's row"`, "WAF blocked 4 of 5 encodings", "the 5th returned the other tenant's row"},
		{"", "", ""},
	} {
		res, err := ts.addFinding().Call(t.Context(), json.RawMessage(`{"vulnclass":"SQLI","severity":"high","summary":"reasoning fixture","evidence":"output"`+tc.extra+`}`), nil)
		if err != nil || !strings.HasPrefix(res.Flatten(), "finding recorded: ") {
			t.Fatalf("report_finding rejected: %v %s", err, res.Flatten())
		}
		var out db.RecordedFinding
		if err := json.Unmarshal([]byte(strings.SplitN(res.Flatten(), "\n", 2)[1]), &out); err != nil {
			t.Fatal(err)
		}
		f, err := d.GetFinding(out.FindingID)
		if err != nil || f == nil {
			t.Fatalf("GetFinding: %v %v", f, err)
		}
		if f.Counterevidence != tc.counter || f.ConfidenceRationale != tc.rationale {
			t.Fatalf("stored (%q, %q), want (%q, %q)", f.Counterevidence, f.ConfidenceRationale, tc.counter, tc.rationale)
		}
	}
}
