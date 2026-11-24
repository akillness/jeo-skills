package db

import (
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"
)

// cleanupTreeFixtures deletes the assets and findings created by one test case.
// It must be registered with defer (not t.Cleanup): t.Cleanup runs after the
// test function returns, by which time defer d.Close() has already closed the
// connection — the cleanup would silently fail and leave dirty data in the
// shared development database.
func cleanupTreeFixtures(d *DB, taskID int64, rootDomains ...string) {
	d.Exec(`DELETE FROM assets WHERE root_domain = ANY($1::text[])`, rootDomains) //nolint:errcheck
	d.DeleteFindingsByTask(taskID)                                                //nolint:errcheck
}

// seedTreeAsset inserts one asset row.
func seedTreeAsset(t *testing.T, d *DB, kind string, cols map[string]any) int64 {
	t.Helper()
	names := []string{"type"}
	values := []any{kind}
	placeholders := []string{"$1"}
	for k, v := range cols {
		values = append(values, v)
		names = append(names, k)
		placeholders = append(placeholders, "$"+strconv.Itoa(len(values)))
	}
	q := "INSERT INTO assets(" + strings.Join(names, ",") + ") VALUES (" +
		strings.Join(placeholders, ",") + ") RETURNING id"
	var id int64
	if err := d.QueryRow(q, values...).Scan(&id); err != nil {
		t.Fatalf("seed %s asset: %v", kind, err)
	}
	return id
}

func nodeByKey(tree *FindingAssetTree, key string) *FindingAssetNode {
	for i := range tree.Nodes {
		if tree.Nodes[i].Key == key {
			return &tree.Nodes[i]
		}
	}
	return nil
}

// TestBuildFindingAssetTree covers the whole shape of the "by asset" tree: the
// root→subdomain→service→endpoint chain gets rebuilt from a finding that only
// points at the leaf, ancestors aggregate their subtree, assets without any
// finding stay out, and a finding whose asset row is gone lands in the
// unassigned bucket.
func TestBuildFindingAssetTree(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()

	tk, err := d.CreateTask("asset tree test", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(tk.ID)

	const root = "tree-test.example"
	const sub = "api.tree-test.example"
	defer cleanupTreeFixtures(d, tk.ID, root)
	rootID := seedTreeAsset(t, d, "root_domain", map[string]any{"domain": root, "root_domain": root})
	subID := seedTreeAsset(t, d, "subdomain", map[string]any{"domain": sub, "root_domain": root})
	svcID := seedTreeAsset(t, d, "service", map[string]any{
		"domain": sub, "root_domain": root, "url": "https://" + sub, "port": 443, "service_type": "http",
	})
	epID := seedTreeAsset(t, d, "endpoint", map[string]any{
		"domain": sub, "root_domain": root, "url": "https://" + sub + "/admin", "port": 443, "method": "GET",
	})
	// Another service under the same domain, with no findings attached — it must
	// not appear in the tree.
	seedTreeAsset(t, d, "service", map[string]any{
		"domain": sub, "root_domain": root, "url": "http://" + sub + ":8080", "port": 8080, "service_type": "http",
	})

	// Attach the finding only to the deepest endpoint; the ancestor chain must be
	// reconstructed by the tree builder itself.
	if _, err := d.AddFinding(tk.ID, 0, "XSS", "reflected XSS", "high", "s", "e", "w", []int64{epID}); err != nil {
		t.Fatal(err)
	}
	// One attached directly to the service, to verify the difference between
	// Self and Total.
	if _, err := d.AddFinding(tk.ID, 0, "Info", "information disclosure", "low", "s", "e", "w", []int64{svcID}); err != nil {
		t.Fatal(err)
	}
	// The asset row does not exist (deleted asset) → the unlinked bucket.
	if _, err := d.AddFinding(tk.ID, 0, "Misc", "orphan", "medium", "s", "e", "w", []int64{999000111}); err != nil {
		t.Fatal(err)
	}

	tree, err := d.BuildFindingAssetTree(FindingFilter{TaskID: strconv.FormatInt(tk.ID, 10)})
	if err != nil {
		t.Fatal(err)
	}
	if tree.FindingTotal != 3 {
		t.Fatalf("finding_total: want 3, got %d", tree.FindingTotal)
	}

	rootNode := nodeByKey(tree, assetKey(rootID))
	subNode := nodeByKey(tree, assetKey(subID))
	svcNode := nodeByKey(tree, assetKey(svcID))
	epNode := nodeByKey(tree, assetKey(epID))
	for name, n := range map[string]*FindingAssetNode{
		"root": rootNode, "subdomain": subNode, "service": svcNode, "endpoint": epNode,
	} {
		if n == nil {
			t.Fatalf("%s node missing from tree", name)
		}
	}

	// Parent-child chain: endpoint → service → subdomain → root_domain.
	if epNode.Parent != svcNode.Key {
		t.Errorf("endpoint parent: want %s, got %s", svcNode.Key, epNode.Parent)
	}
	if svcNode.Parent != subNode.Key {
		t.Errorf("service parent: want %s, got %s", subNode.Key, svcNode.Parent)
	}
	if subNode.Parent != rootNode.Key {
		t.Errorf("subdomain parent: want %s, got %s", rootNode.Key, subNode.Parent)
	}
	if rootNode.Parent != "" {
		t.Errorf("root parent: want top level, got %s", rootNode.Parent)
	}

	// Aggregation: the root domain has two (the endpoint's high + the service's
	// low); the service has one itself and two in its subtree.
	if rootNode.Total != 2 || rootNode.High != 1 || rootNode.Low != 1 {
		t.Errorf("root totals: want 2/high1/low1, got %d/high%d/low%d", rootNode.Total, rootNode.High, rootNode.Low)
	}
	if rootNode.Self != 0 {
		t.Errorf("root self: want 0 (ancestor only), got %d", rootNode.Self)
	}
	if svcNode.Total != 2 || svcNode.Self != 1 {
		t.Errorf("service total/self: want 2/1, got %d/%d", svcNode.Total, svcNode.Self)
	}
	if epNode.Total != 1 || epNode.Self != 1 {
		t.Errorf("endpoint total/self: want 1/1, got %d/%d", epNode.Total, epNode.Self)
	}

	// The sibling service without findings does not enter the tree.
	for _, n := range tree.Nodes {
		if n.Label == "http://"+sub+":8080" {
			t.Errorf("asset without findings should be hidden: %+v", n)
		}
	}

	// The unlinked bucket takes in the finding that points at a deleted asset.
	none := nodeByKey(tree, FindingUnassignedAsset)
	if none == nil || none.Total != 1 || none.Medium != 1 {
		t.Fatalf("unassigned bucket: want 1 medium, got %+v", none)
	}
}

// TestFindingAssetScopeFilter verifies that selecting a node narrows the
// findings list to that node's whole subtree, and that the unassigned sentinel
// works too.
func TestFindingAssetScopeFilter(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()

	tk, err := d.CreateTask("asset scope filter test", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(tk.ID)

	const root = "scope-test.example"
	const sub = "api.scope-test.example"
	const other = "other-scope-test.example"
	defer cleanupTreeFixtures(d, tk.ID, root, other)
	rootID := seedTreeAsset(t, d, "root_domain", map[string]any{"domain": root, "root_domain": root})
	subID := seedTreeAsset(t, d, "subdomain", map[string]any{"domain": sub, "root_domain": root})
	otherID := seedTreeAsset(t, d, "root_domain", map[string]any{"domain": other, "root_domain": other})

	if _, err := d.AddFinding(tk.ID, 0, "A", "on the subdomain", "high", "s", "e", "w", []int64{subID}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.AddFinding(tk.ID, 0, "B", "on another root domain", "high", "s", "e", "w", []int64{otherID}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.AddFinding(tk.ID, 0, "C", "without an asset", "high", "s", "e", "w", nil); err != nil {
		t.Fatal(err)
	}
	// A finding pointing at a deleted asset is just as "unlinked" as one with an
	// empty asset_ids — the tree's bucket takes it in, and the list filter must
	// find it too; if the two disagree, the number on the bucket ends up larger
	// than the rows shown after clicking through.
	if _, err := d.AddFinding(tk.ID, 0, "D", "asset deleted", "high", "s", "e", "w", []int64{999000333}); err != nil {
		t.Fatal(err)
	}

	base := FindingFilter{TaskID: strconv.FormatInt(tk.ID, 10)}
	cases := []struct {
		name  string
		scope string
		want  int
	}{
		{"whole subtree", assetKey(rootID), 1},  // only the subdomain finding under the root domain
		{"leaf node", assetKey(subID), 1},       // the subdomain itself
		{"another tree", assetKey(otherID), 1},  // no cross-contamination
		{"unlinked", FindingUnassignedAsset, 2}, // empty asset_ids + pointing at a deleted asset
		{"nonexistent node", "a:999000222", 0},  // node absent under the current filter → empty result, not unfiltered
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := base
			f.AssetScope = tc.scope
			items, total, err := d.ListFindingsPage(f, 1, 50)
			if err != nil {
				t.Fatal(err)
			}
			if total != tc.want || len(items) != tc.want {
				t.Fatalf("scope %s: want %d findings, got total=%d items=%d", tc.scope, tc.want, total, len(items))
			}
		})
	}

	// Without a scope all four are present.
	if _, total, err := d.ListFindingsPage(base, 1, 50); err != nil || total != 4 {
		t.Fatalf("unscoped: want 4, got %d (%v)", total, err)
	}

	// The tree's unlinked-bucket count must match the rows found after clicking
	// through — this is exactly the assertion that breaks when the two
	// interpretations diverge.
	tree, err := d.BuildFindingAssetTree(base)
	if err != nil {
		t.Fatal(err)
	}
	none := nodeByKey(tree, FindingUnassignedAsset)
	if none == nil || none.Total != 2 {
		t.Fatalf("unassigned bucket count: want 2, got %+v", none)
	}
}

// TestFindingCompanyScopeFilter pins the company attribution rule. A finding
// belongs to company C when one of its live assets has company_id = C. With no
// live asset (empty asset_ids, or only deleted asset ids) it belongs to C only
// when its task has a task_scope row of kind 'company' for C. Otherwise it
// shows under "all companies" only. Unknown and non-numeric ids match nothing.
func TestFindingCompanyScopeFilter(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered first so it runs last: every t.Cleanup below still has the connection.
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	newCompany := func(name string) int64 {
		t.Helper()
		key := fmt.Sprintf("%s %d", name, stamp)
		var id int64
		if err := d.QueryRow(`INSERT INTO companies(name, nkey) VALUES ($1, $1) RETURNING id`, key).Scan(&id); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { d.Exec(`DELETE FROM companies WHERE id = $1`, id) }) //nolint:errcheck
		return id
	}
	companyA := newCompany("scope test co a")
	companyB := newCompany("scope test co b")
	companyE := newCompany("scope test co empty")

	newTask := func(name string, company int64) int64 {
		t.Helper()
		tk, err := d.CreateTask(name, "goal", nil, 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { d.DeleteFindingsByTask(tk.ID); d.DeleteTask(tk.ID) }) //nolint:errcheck
		if company > 0 {
			if _, err := d.Exec(`INSERT INTO task_scope(task_id, kind, company_id, source) VALUES ($1, 'company', $2, 'manual')`, tk.ID, company); err != nil {
				t.Fatal(err)
			}
		}
		return tk.ID
	}
	taskA := newTask("company scope a", companyA)
	taskB := newTask("company scope b", companyB)
	taskE := newTask("company scope empty", companyE)
	taskNone := newTask("company scope none", 0)

	rootA := fmt.Sprintf("company-scope-a-%d.example", stamp)
	rootB := fmt.Sprintf("company-scope-b-%d.example", stamp)
	rootGone := fmt.Sprintf("company-scope-gone-%d.example", stamp)
	t.Cleanup(func() { cleanupTreeFixtures(d, 0, rootA, rootB, rootGone) })
	assetA := seedTreeAsset(t, d, "root_domain", map[string]any{"domain": rootA, "root_domain": rootA, "company_id": companyA})
	assetB := seedTreeAsset(t, d, "root_domain", map[string]any{"domain": rootB, "root_domain": rootB, "company_id": companyB})
	// An asset of company A that is deleted: the finding left on it has no live asset.
	gone := seedTreeAsset(t, d, "root_domain", map[string]any{"domain": rootGone, "root_domain": rootGone, "company_id": companyA})

	add := func(task int64, name string, assets []int64) {
		t.Helper()
		if _, err := d.AddFinding(task, 0, name, name, "high", "s", "e", "w", assets); err != nil {
			t.Fatal(err)
		}
	}
	add(taskA, "a-on-asset", []int64{assetA})
	add(taskB, "b-on-asset", []int64{assetB})
	add(taskB, "b-unanchored", nil)
	add(taskB, "b-deleted-asset", []int64{gone})
	add(taskE, "e-unanchored", nil)
	add(taskNone, "no-scope-unanchored", nil)
	if _, err := d.Exec(`DELETE FROM assets WHERE id = $1`, gone); err != nil {
		t.Fatal(err)
	}

	idA, idB, idE := strconv.FormatInt(companyA, 10), strconv.FormatInt(companyB, 10), strconv.FormatInt(companyE, 10)
	cases := []struct {
		name string
		f    FindingFilter
		want []string
	}{
		{"own asset only", FindingFilter{Company: idA}, []string{"a-on-asset"}},
		{"task-scoped unanchored and deleted asset", FindingFilter{Company: idB}, []string{"b-on-asset", "b-unanchored", "b-deleted-asset"}},
		{"asset_scope c: matches Company", FindingFilter{AssetScope: companyKey(companyB)}, []string{"b-on-asset", "b-unanchored", "b-deleted-asset"}},
		{"company without assets", FindingFilter{Company: idE}, []string{"e-unanchored"}},
		{"nonexistent company", FindingFilter{Company: "999000444"}, nil},
		{"nonexistent company node", FindingFilter{AssetScope: "c:999000444"}, nil},
		{"non-numeric company", FindingFilter{Company: "abc"}, nil},
		{"company node outside the company", FindingFilter{Company: idA, AssetScope: companyKey(companyB)}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			items, total, err := d.ListFindingsPage(tc.f, 1, 50)
			if err != nil {
				t.Fatal(err)
			}
			got := map[string]bool{}
			for _, it := range items {
				got[it.Name] = true
			}
			if total != len(tc.want) || len(items) != len(tc.want) {
				t.Fatalf("%+v: want %v, got total=%d names=%v", tc.f, tc.want, total, got)
			}
			for _, name := range tc.want {
				if !got[name] {
					t.Fatalf("%+v: want %v, got %v", tc.f, tc.want, got)
				}
			}
		})
	}

	// The unscoped finding only appears under "all companies".
	if items, _, err := d.ListFindingsPage(FindingFilter{TaskID: strconv.FormatInt(taskNone, 10)}, 1, 50); err != nil || len(items) != 1 {
		t.Fatalf("all companies: want the unscoped finding, got %d err=%v", len(items), err)
	}

	// The asset tree keeps the company: B's tree holds B's asset and the
	// unlinked bucket (its 2 findings with no live asset), never company A.
	tree, err := d.BuildFindingAssetTree(FindingFilter{Company: idB})
	if err != nil {
		t.Fatal(err)
	}
	if tree.FindingTotal != 3 {
		t.Fatalf("tree under B: want 3 findings, got %d", tree.FindingTotal)
	}
	keys := map[string]FindingAssetNode{}
	for _, n := range tree.Nodes {
		keys[n.Key] = n
	}
	if _, ok := keys[assetKey(assetA)]; ok {
		t.Fatalf("tree under B holds company A's asset: %+v", tree.Nodes)
	}
	if _, ok := keys[companyKey(companyA)]; ok {
		t.Fatalf("tree under B holds company A: %+v", tree.Nodes)
	}
	if _, ok := keys[assetKey(assetB)]; !ok {
		t.Fatalf("tree under B misses its asset: %+v", tree.Nodes)
	}
	if n := keys[FindingUnassignedAsset]; n.Total != 2 {
		t.Fatalf("tree under B: want 2 unlinked findings, got %+v", n)
	}

	// The stat cards count with the same rule as the list.
	st, err := d.FindingStatsForCompany(idB)
	if err != nil {
		t.Fatal(err)
	}
	if st.Total != 3 || st.High != 3 || len(st.Tasks) != 1 || st.Tasks[0].ID != taskB {
		t.Fatalf("stats under B: want 3 high findings of task %d, got %+v", taskB, st)
	}
	if st, err := d.FindingStatsForCompany("999000444"); err != nil || st.Total != 0 {
		t.Fatalf("stats under a nonexistent company: want 0, got %+v err=%v", st, err)
	}
}
