package agent

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// Synthetic replay of the record_fact call shapes a model produces, replayed
// against the handler in the package test database. The shapes mirror what
// was observed in production before the facts-only contract (a model filling
// every declared top-level property beside facts[]) without using recorded
// data. Checked per call: the verdict, that an accepted call writes exactly one
// node per facts item linked to the intent and anchored to the assets, and
// that a refused call writes nothing and names the top-level fields.
func TestRecordFactShapesReplay(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	task, err := d.CreateTaskWithOptions("record_fact shapes", "replay synthetic record_fact call shapes", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	store := d.Exploration(task.ExplorationID)
	intentID := addGuardNode(t, store, db.KindIntent, map[string]any{"summary": "enumerate the service"}, "running")
	var assets []int64
	for i := 1; i <= 2; i++ {
		id, err := d.Assets().UpsertIP(db.UpsertIPReq{IP: fmt.Sprintf("203.0.113.%d", i), TaskID: task.ID})
		if err != nil {
			t.Fatal(err)
		}
		assets = append(assets, id)
	}
	t.Cleanup(func() { _, _ = d.Assets().DeleteByIDs(assets) })
	tools := NewToolSet(store, "worker")
	tools.SetOwnerNode(intentID)
	tool := tools.recordFact()

	iid := strconv.FormatInt(intentID, 10)
	a1, a2 := strconv.FormatInt(assets[0], 10), strconv.FormatInt(assets[1], 10)
	item := func(n int) string {
		return fmt.Sprintf(`{"summary":"conclusion %d","detail":"detail %d","evidence":"cmd %d → line","confidence":"observed","source":"tool_output","asset_ids":[%s]}`, n, n, n, a1)
	}
	type shape struct {
		name   string
		call   string
		accept bool
		items  int
		fields string // named in the refusal
	}
	shapes := []shape{
		{"published: one item", `{"facts":[` + item(1) + `]}`, true, 1, ""},
		{"published: two items", `{"facts":[` + item(1) + `,` + item(2) + `]}`, true, 2, ""},
		{"published: item with its own intent_id and alias", `{"facts":[{"summary":"alias","tested_asset_ids":["` + a2 + `"],"intent_id":` + iid + `}]}`, true, 1, ""},
		{"legacy batch: top-level intent_id", `{"intent_id":` + iid + `,"facts":[` + item(3) + `]}`, true, 1, ""},
		{"legacy single", `{"summary":"single fact","confidence":"inferred","asset_ids":[` + a2 + `]}`, true, 1, ""},
		{"copies of every field beside facts", `{"summary":"conclusion 1","detail":"detail 1","evidence":"cmd 1 → line","confidence":"observed","source":"tool_output","asset_ids":[` + a1 + `],"facts":[` + item(1) + `]}`, false, 1, `"asset_ids", "confidence", "detail", "evidence", "source", "summary"`},
		{"empty placeholders beside facts", `{"summary":"","detail":"","asset_ids":[],"tested_asset_ids":[],"facts":[` + item(1) + `]}`, false, 1, `"asset_ids", "detail", "summary", "tested_asset_ids"`},
		{"dummy summary beside facts", `{"summary":"x","facts":[` + item(1) + `]}`, false, 1, `"summary"`},
		{"abbreviated copy beside facts", `{"summary":"short","detail":"short detail","facts":[` + item(1) + `]}`, false, 1, `"detail", "summary"`},
		{"conflicting source beside facts", `{"source":"inference","facts":[` + item(1) + `]}`, false, 1, `"source"`},
		{"top-level summary beside two items", `{"summary":"conclusion 1","facts":[` + item(1) + `,` + item(2) + `]}`, false, 2, `"summary"`},
	}
	for _, s := range shapes {
		before := tools.Writes().Facts
		linked, _ := store.FactsYielded(intentID)
		res := callGuardTool(t, tool, s.call)
		written := tools.Writes().Facts - before
		if !res.IsError != s.accept {
			t.Errorf("%s: accepted=%v want %v: %s", s.name, !res.IsError, s.accept, res.Flatten())
			continue
		}
		if !s.accept {
			if written != 0 || !strings.Contains(res.Flatten(), "top-level field(s) "+s.fields) || !strings.Contains(res.Flatten(), "no facts were written") {
				t.Errorf("%s: refusal must write nothing and name %s: %s (writes %d)", s.name, s.fields, res.Flatten(), written)
			}
			continue
		}
		if written != s.items {
			t.Errorf("%s: wrote %d facts for %d items", s.name, written, s.items)
		}
		after, _ := store.FactsYielded(intentID)
		if len(after) != len(linked)+s.items {
			t.Errorf("%s: intent links %d → %d for %d items", s.name, len(linked), len(after), s.items)
		}
		ids := after[len(linked):]
		if strings.HasPrefix(s.call, `{"facts"`) || strings.HasPrefix(s.call, `{"intent_id"`) {
			var out struct {
				IDs []int64 `json:"ids"`
			}
			if err := json.Unmarshal([]byte(res.Flatten()), &out); err != nil || len(out.IDs) != s.items {
				t.Errorf("%s: ids: %s", s.name, res.Flatten())
			}
		}
		for _, id := range ids {
			node, err := store.GetNode(id)
			if err != nil || node == nil || node.Kind != db.KindFact {
				t.Fatalf("%s: fact %d: %v", s.name, id, err)
			}
			var payload map[string]any
			_ = json.Unmarshal(node.Payload, &payload)
			if sum, _ := payload["summary"].(string); sum == "" || sum == "x" {
				t.Errorf("%s: stored summary %q", s.name, sum)
			}
			if strings.Contains(s.call, "asset_ids") {
				anchored := false
				for _, asset := range assets {
					refs, err := store.AssetRefs(asset)
					if err != nil {
						t.Fatal(err)
					}
					for _, r := range refs {
						if r.ID == id {
							anchored = true
						}
					}
				}
				if !anchored {
					t.Errorf("%s: fact %d not anchored to an asset", s.name, id)
				}
			}
		}
	}
}
