package agent

import (
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestRecordFactAssetAliases(t *testing.T) {
	d := testDB(t)
	defer d.Close()
	task, err := d.CreateTask("fact asset alias", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(task.ID)
	assets := d.Assets()
	first, err := assets.UpsertRootDomain(db.UpsertRootDomainReq{Domain: "fact-alias-one.example", TaskID: task.ID})
	if err != nil {
		t.Fatal(err)
	}
	second, err := assets.UpsertRootDomain(db.UpsertRootDomainReq{Domain: "fact-alias-two.example", TaskID: task.ID})
	if err != nil {
		t.Fatal(err)
	}
	defer assets.DeleteByIDs([]int64{first, second})
	store := d.Exploration(task.ExplorationID)
	tools := NewToolSet(store, "worker")
	check := func(t *testing.T, id int64, want []int64) {
		t.Helper()
		rows, err := d.Query("SELECT asset_id FROM exploration_anchors WHERE node_id=$1 ORDER BY asset_id", id)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var got []int64
		for rows.Next() {
			var asset int64
			if err := rows.Scan(&asset); err != nil {
				t.Fatal(err)
			}
			got = append(got, asset)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		slices.Sort(want)
		if !slices.Equal(got, want) {
			t.Fatalf("anchors = %v, want %v", got, want)
		}
	}
	for _, tc := range []struct{ name, fields string }{
		{"canonical", fmt.Sprintf(`"asset_ids":[%d,%d,%d]`, first, second, first)},
		{"alias", fmt.Sprintf(`"tested_asset_ids":[%d,%d]`, first, second)},
		{"equal sets", fmt.Sprintf(`"asset_ids":[%d,%d],"tested_asset_ids":[%d,%d,%d]`, first, second, second, first, first)},
		{"numeric strings", fmt.Sprintf(`"tested_asset_ids":["%d","%d"]`, first, second)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			out := callGuardTool(t, tools.recordFact(), fmt.Sprintf(`{"summary":%q,%s}`, tc.name, tc.fields))
			if out.IsError {
				t.Fatal(out.Flatten())
			}
			id, err := strconv.ParseInt(strings.TrimPrefix(out.Flatten(), "fact recorded: "), 10, 64)
			if err != nil {
				t.Fatal(out.Flatten(), err)
			}
			check(t, id, []int64{first, second})
		})
	}
	before := tools.Writes().Facts
	for _, fields := range []string{
		fmt.Sprintf(`"asset_ids":[%d],"tested_asset_ids":[%d]`, first, second),
		fmt.Sprintf(`"asset_ids":[],"tested_asset_ids":[%d]`, first),
		fmt.Sprintf(`"tested_asset_ids":[%d,0]`, first),
		fmt.Sprintf(`"asset_ids":[%d,-1]`, first),
		`"tested_asset_ids":[null]`,
		`"tested_asset_ids":[1.5]`,
		`"tested_asset_ids":["invalid"]`,
	} {
		out := callGuardTool(t, tools.recordFact(), `{"summary":"invalid assets",`+fields+`}`)
		if !out.IsError || !strings.Contains(out.Flatten(), "asset_ids") {
			t.Fatalf("accepted %s: %q", fields, out.Flatten())
		}
	}
	if tools.Writes().Facts != before {
		t.Fatal("invalid asset lists wrote facts")
	}

	out := callGuardTool(t, tools.recordFact(), fmt.Sprintf(`{"facts":[{"summary":"batch alias","tested_asset_ids":[%d]},{"summary":"batch conflict","asset_ids":[%d],"tested_asset_ids":[%d]},{"summary":"no inherited assets"}]}`, first, first, second))
	var batch struct {
		IDs    []int64           `json:"ids"`
		Errors map[string]string `json:"errors"`
	}
	if err := json.Unmarshal([]byte(out.Flatten()), &batch); err != nil {
		t.Fatal(out.Flatten(), err)
	}
	if len(batch.IDs) != 3 || batch.IDs[0] <= 0 || batch.IDs[1] != 0 || batch.IDs[2] <= 0 || !strings.Contains(batch.Errors["1"], "same asset IDs") {
		t.Fatalf("batch: %s", out.Flatten())
	}
	check(t, batch.IDs[0], []int64{first})
	check(t, batch.IDs[2], nil)

	before = tools.Writes().Facts
	malformed := callGuardTool(t, tools.recordFact(), fmt.Sprintf(`{"facts":[{"summary":"must not be saved"},{"summary":"bad list","tested_asset_ids":%d}]}`, first))
	if !malformed.IsError || tools.Writes().Facts != before {
		t.Fatal("malformed list caused a partial write", malformed.Flatten())
	}
}

func TestRecordFactAssetAliasSchema(t *testing.T) {
	schema := NewToolSet(nil, "").recordFact().InputSchema()
	props := schema["properties"].(map[string]any)
	// Facts-only contract: the alias lives on the items.
	if len(props) != 1 || props["facts"] == nil {
		t.Fatalf("top level must hold facts only: %v", props)
	}
	item := props["facts"].(map[string]any)["items"].(map[string]any)
	itemProps, _ := item["properties"].(map[string]any)
	for _, name := range []string{"summary", "asset_ids", "tested_asset_ids"} {
		if itemProps[name] == nil {
			t.Fatalf("batch schema missing %s", name)
		}
	}
}

func TestRecordFactRejectsMissingAssets(t *testing.T) {
	d := testDB(t)
	defer d.Close()
	task, err := d.CreateTask("missing fact anchors", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(task.ID)
	assets := d.Assets()
	var ids []int64
	for _, name := range []string{"missing-fact-one.example", "missing-fact-two.example", "existing-fact.example"} {
		id, err := assets.UpsertRootDomain(db.UpsertRootDomainReq{Domain: name, TaskID: task.ID})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	defer assets.DeleteByIDs(ids)
	if _, err := assets.DeleteByIDs(ids[:2]); err != nil {
		t.Fatal(err)
	}
	tools := NewToolSet(d.Exploration(task.ExplorationID), "worker")
	var beforeFacts int
	if err := d.QueryRow("SELECT count(*) FROM exploration_nodes WHERE exploration_id=$1 AND kind='fact'", task.ExplorationID).Scan(&beforeFacts); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"asset_ids", "tested_asset_ids"} {
		out := callGuardTool(t, tools.recordFact(), fmt.Sprintf(`{"summary":"missing anchors","%s":[%d,%d,%d]}`, field, ids[0], ids[1], ids[2]))
		if !out.IsError || !strings.Contains(out.Flatten(), "do not exist") ||
			!strings.Contains(out.Flatten(), strconv.FormatInt(ids[0], 10)) ||
			!strings.Contains(out.Flatten(), strconv.FormatInt(ids[1], 10)) ||
			strings.Contains(out.Flatten(), "23503") || strings.Contains(out.Flatten(), "foreign key") {
			t.Fatalf("missing assets did not produce an actionable error: %s", out.Flatten())
		}
	}
	var count int
	if err := d.QueryRow("SELECT count(*) FROM exploration_nodes WHERE exploration_id=$1 AND kind='fact'", task.ExplorationID).Scan(&count); err != nil || count != beforeFacts || tools.Writes().Facts != 0 {
		t.Fatalf("failed anchors left facts: count=%d err=%v", count, err)
	}
	out := callGuardTool(t, tools.recordFact(), fmt.Sprintf(`{"facts":[{"summary":"valid","asset_ids":[%d]},{"summary":"missing","tested_asset_ids":[%d]}]}`, ids[2], ids[0]))
	var batch struct {
		IDs    []int64           `json:"ids"`
		Errors map[string]string `json:"errors"`
	}
	if err := json.Unmarshal([]byte(out.Flatten()), &batch); err != nil {
		t.Fatal(out.Flatten(), err)
	}
	if !out.IsError || len(batch.IDs) != 2 || batch.IDs[0] <= 0 || batch.IDs[1] != 0 || !strings.Contains(batch.Errors["1"], "do not exist") || tools.Writes().Facts != 1 {
		t.Fatal("missing asset batch handling:", out.Flatten())
	}
}
