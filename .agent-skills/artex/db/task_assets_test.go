package db

import (
	"errors"
	"fmt"
	"testing"
	"time"
)

func TestRegisterTaskAssetScopesCreatesAssetsAndPersistsTextScope(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered FIRST so it runs LAST, after the row cleanups below.
	t.Cleanup(func() { d.Close() })

	task, err := d.CreateTask("manual scope registration", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	suffix := time.Now().UnixNano()
	domain := fmt.Sprintf("manual-scope-%d.example.test", suffix)
	ip := fmt.Sprintf("203.0.%d.%d", (suffix/250)%250, suffix%250+1)
	inputs := []ScopeInput{
		{Kind: "domain", Value: domain},
		{Kind: "ip", Value: ip},
		{Kind: "cidr", Value: "198.51.100.0/24"},
		{Kind: "icp", Value: " ICP 12345678-1 "},
		{Kind: "keyword", Value: " Acme   Security "},
	}

	first, err := d.Assets().RegisterTaskAssetScopes(task.ID, inputs)
	if err != nil {
		t.Fatal(err)
	}
	if first.Requested != 5 || first.AssetsLinked != 2 || first.AssetsExisting != 0 || first.ScopesAdded != 5 || first.ScopesExisting != 0 {
		t.Fatalf("unexpected first mutation: %+v", first)
	}
	assets, err := d.Assets().QueryByTask(task.ID, "", 10, 0)
	if err != nil || len(assets) != 2 {
		t.Fatalf("task assets=%+v err=%v", assets, err)
	}
	assetIDs := make([]int64, 0, len(assets))
	for _, asset := range assets {
		assetIDs = append(assetIDs, asset.ID)
		if asset.TaskSource != "manual" || asset.TaskSourceSummary != manualTaskScopeSummary {
			t.Fatalf("unexpected task asset provenance: %+v", asset)
		}
	}
	t.Cleanup(func() {
		_, err := d.Assets().DeleteByIDs(assetIDs)
		cleanupErr(t, "assets", err)
	})
	scopes, err := d.Assets().ListTaskScope(task.ID)
	if err != nil || len(scopes) != 5 {
		t.Fatalf("task scope=%+v err=%v", scopes, err)
	}
	values := map[string]string{}
	for _, scope := range scopes {
		values[scope.Kind] = scope.Value
	}
	if values["icp"] != NormalizeICP(inputs[3].Value) || values["keyword"] != normalizeKeyword(inputs[4].Value) {
		t.Fatalf("text scope not normalized: %+v", values)
	}

	second, err := d.Assets().RegisterTaskAssetScopes(task.ID, inputs)
	if err != nil {
		t.Fatal(err)
	}
	if second.AssetsExisting != 2 || second.AssetsLinked != 0 || second.ScopesExisting != 5 || second.ScopesAdded != 0 {
		t.Fatalf("unexpected idempotent mutation: %+v", second)
	}

	rollbackDomain := fmt.Sprintf("rollback-%d.example.test", suffix)
	_, err = d.Assets().RegisterTaskAssetScopes(task.ID, []ScopeInput{
		{Kind: "domain", Value: rollbackDomain},
		{Kind: "cidr", Value: "10.0.0.0/8"},
	})
	if !errors.Is(err, ErrTaskAssetInvalid) {
		t.Fatalf("invalid CIDR error=%v", err)
	}
	var rollbackAssets int
	if err := d.QueryRow(`SELECT count(*) FROM assets WHERE type='root_domain' AND domain=$1`, rollbackDomain).Scan(&rollbackAssets); err != nil {
		t.Fatal(err)
	}
	if rollbackAssets != 0 {
		t.Fatalf("invalid request created %d assets", rollbackAssets)
	}
}

func TestTaskAssetAttachDetachPreservesGlobalAssetAndAnchors(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered FIRST so it runs LAST, after the row cleanups below.
	t.Cleanup(func() { d.Close() })

	task, err := d.CreateTask("asset editing", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	assetID, err := d.Assets().UpsertRootDomain(UpsertRootDomainReq{Domain: fmt.Sprintf("manual-%d.example.test", time.Now().UnixNano())})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, err := d.Assets().DeleteByIDs([]int64{assetID})
		cleanupErr(t, "asset", err)
	})

	mutation, err := d.Assets().AttachAssetsToTask(task.ID, []int64{assetID, assetID}, "authorized asset list item 3")
	if err != nil {
		t.Fatal(err)
	}
	if mutation.Requested != 1 || mutation.Attached != 1 || mutation.Existing != 0 {
		t.Fatalf("unexpected first mutation: %+v", mutation)
	}
	assets, err := d.Assets().QueryByTask(task.ID, "", 10, 0)
	if err != nil || len(assets) != 1 {
		t.Fatalf("task assets=%+v err=%v", assets, err)
	}
	if assets[0].TaskSource != "manual" || assets[0].TaskSourceSummary != "authorized asset list item 3" {
		t.Fatalf("unexpected provenance: %+v", assets[0])
	}

	intentID, err := d.Exploration(task.ExplorationID).AddIntent(map[string]any{"summary": "test asset"}, 5, []int64{assetID}, "human")
	if err != nil {
		t.Fatal(err)
	}
	detached, err := d.Assets().DetachAssetFromTask(task.ID, assetID)
	if err != nil || !detached {
		t.Fatalf("detach=%v err=%v", detached, err)
	}
	if assets, err := d.Assets().QueryByTask(task.ID, "", 10, 0); err != nil || len(assets) != 0 {
		t.Fatalf("detached task assets=%+v err=%v", assets, err)
	}
	var global, anchors, links int
	_ = d.QueryRow(`SELECT count(*) FROM assets WHERE id=$1`, assetID).Scan(&global)
	_ = d.QueryRow(`SELECT count(*) FROM exploration_anchors WHERE node_id=$1 AND asset_id=$2`, intentID, assetID).Scan(&anchors)
	_ = d.QueryRow(`SELECT count(*) FROM task_asset_links WHERE task_id=$1 AND asset_id=$2`, task.ID, assetID).Scan(&links)
	if global != 1 || anchors != 1 || links != 0 {
		t.Fatalf("global=%d anchors=%d links=%d", global, anchors, links)
	}
}

func TestIntentAssetsIncludesDirectSourceProvenance(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered FIRST so it runs LAST, after the row cleanups below.
	t.Cleanup(func() { d.Close() })

	source, err := d.CreateTask("source assets", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	current, err := d.CreateTaskWithOptions("current assets", "goal", TaskCreateOptions{SourceTaskIDs: []int64{source.ID}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupErr(t, "current task", d.DeleteTask(current.ID))
		cleanupErr(t, "source task", d.DeleteTask(source.ID))
	})

	intentHost := fmt.Sprintf("intent-%d.example.test", time.Now().UnixNano())
	assetID, err := d.Assets().UpsertHTTPService(UpsertHTTPServiceReq{
		URL: "https://" + intentHost, TaskID: source.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, err := d.Assets().DeleteByIDs([]int64{assetID})
		cleanupErr(t, "asset", err)
		// UpsertHTTPService also creates the parent subdomain and root_domain rows.
		_, err = d.Exec(`DELETE FROM assets WHERE domain IN ($1, 'example.test')`, intentHost)
		cleanupErr(t, "parent assets", err)
	})
	intentID, err := d.Exploration(source.ExplorationID).AddIntent(map[string]any{"summary": "source worker"}, 5, []int64{assetID}, "planner")
	if err != nil {
		t.Fatal(err)
	}
	if err := d.Exploration(source.ExplorationID).SetNodeState(intentID, "done"); err != nil {
		t.Fatal(err)
	}
	nodeID := intentID
	if err := d.Assets().SetTaskAssetSource(source.ID, assetID, "agent", "worker registered via insert_assets", &nodeID); err != nil {
		t.Fatal(err)
	}

	assets, err := d.Assets().IntentAssets(current.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(assets) != 1 || assets[0].IntentID != intentID || assets[0].SourceTaskID != source.ID || !assets[0].Inherited {
		t.Fatalf("unexpected intent assets: %+v", assets)
	}
	if assets[0].Source != "agent" || assets[0].SourceSummary == "" || assets[0].SourceNodeID == nil || *assets[0].SourceNodeID != intentID {
		t.Fatalf("unexpected intent provenance: %+v", assets[0])
	}
}
