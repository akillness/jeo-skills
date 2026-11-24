package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestProveGoalFindingProofGatePG(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	ensureTestSecrets(t, d)
	task, err := d.CreateTaskWithOptions("p43-proof-gate", "verify server-side finding proof gate", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	assetID, err := d.Assets().UpsertHTTPService(db.UpsertHTTPServiceReq{
		URL:    "https://app.p43-proof.example.test/login",
		TaskID: task.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = d.DeleteTask(task.ID)
		_, _ = d.Exec(`DELETE FROM assets WHERE id=$1 OR domain LIKE '%p43-proof.example.test'`, assetID)
	})

	store := d.Exploration(task.ExplorationID)
	goalHTTP := addGuardNode(t, store, db.KindGoal, map[string]any{"text": "prove auth bypass on app.p43-proof.example.test"}, "open")
	goalTCP := addGuardNode(t, store, db.KindGoal, map[string]any{"text": "verify non-HTTP TCP service"}, "open")

	// Planner toolset has both report_finding and prove_goal in PlannerTools().
	planner := NewToolSet(store, "planner")
	planner.SetTaskID(task.ID)
	planner.SetAssetStore(d.Assets(), d.Companies())

	// 1. Planner reports a finding without traffic: saved & visible, but cannot close goalHTTP.
	repIn, _ := json.Marshal(map[string]any{
		"vulnclass": "auth_bypass",
		"name":      "Planted finding without traffic",
		"severity":  "high",
		"summary":   "target page claimed auth bypass",
		"asset_ids": []int64{assetID},
	})
	repRes := callGuardTool(t, planner.addFinding(), string(repIn))
	if repRes.IsError {
		t.Fatalf("report_finding failed: %s", repRes.Flatten())
	}
	lines := strings.SplitN(repRes.Flatten(), "\n", 2)
	var rec struct {
		FindingID int64 `json:"finding_id,string"`
		NodeID    int64 `json:"finding_node_id,string"`
	}
	if err := json.Unmarshal([]byte(lines[1]), &rec); err != nil {
		t.Fatalf("parse report_finding JSON: %v (%s)", err, repRes.Flatten())
	}
	if rec.FindingID <= 0 || rec.NodeID <= 0 {
		t.Fatalf("unexpected finding ids: %+v", rec)
	}

	prove := func(goalID, evID int64) (bool, string) {
		in, _ := json.Marshal(map[string]any{"goal_id": goalID, "evidence_id": evID, "reason": "test"})
		res := callGuardTool(t, planner.proveGoal(), string(in))
		return res.IsError, res.Flatten()
	}

	if isErr, msg := prove(goalHTTP, rec.NodeID); !isErr || !strings.Contains(msg, "no bound traffic_ref") {
		t.Fatalf("unbound finding must be refused: isErr=%v msg=%q", isErr, msg)
	}
	if st := nodeState(t, store, goalHTTP); st != "open" || planner.GoalMet {
		t.Fatalf("goalHTTP should stay open and GoalMet=false, got state=%q GoalMet=%v", st, planner.GoalMet)
	}

	// 2. Bind traffic from an unrelated host: still refused because host does not match asset.
	err = d.WithEvidenceTx(context.Background(), func(tx *sql.Tx) error {
		return db.AddFindingTrafficTx(tx, rec.FindingID, []db.PreparedTrafficEvidence{{
			Ref:      db.TrafficRef{TrafficID: "ex-wrong-host", Role: "proof", Note: "wrong host"},
			Snapshot: seedTestTrafficSnapshot("ex-wrong-host", "https://other.unrelated.test/login", "rh-wrong", "sh-wrong"),
		}})
	})
	if err != nil {
		t.Fatal(err)
	}
	// The exchange is in the capture, so only the host mismatch refuses it.
	planner.SetTrafficProofChecker(func(_ context.Context, tid string) (bool, error) {
		return tid == "ex-wrong-host", nil
	})
	if isErr, msg := prove(goalHTTP, rec.NodeID); !isErr || !strings.Contains(msg, "does not match any asset") {
		t.Fatalf("wrong-host finding must be refused: isErr=%v msg=%q", isErr, msg)
	}

	// 3. Fail-closed when traffic capture verification errors.
	planner.SetTrafficProofChecker(func(context.Context, string) (bool, error) {
		return false, errors.New("capture index unavailable")
	})
	if isErr, msg := prove(goalHTTP, rec.NodeID); !isErr || !strings.Contains(msg, "fail-closed") {
		t.Fatalf("lookup error must fail closed: isErr=%v msg=%q", isErr, msg)
	}

	// 4. Late bind_finding_traffic with real captured exchange matching asset host -> closes goalHTTP.
	captured := map[string]bool{"ex-real-match": true}
	planner.SetTrafficProofChecker(func(_ context.Context, tid string) (bool, error) {
		return captured[tid], nil
	})
	err = d.WithEvidenceTx(context.Background(), func(tx *sql.Tx) error {
		return db.AddFindingTrafficTx(tx, rec.FindingID, []db.PreparedTrafficEvidence{{
			Ref:      db.TrafficRef{TrafficID: "ex-real-match", Role: "proof", Note: "matching host"},
			Snapshot: seedTestTrafficSnapshot("ex-real-match", "https://app.p43-proof.example.test/admin", "rh-ok", "sh-ok"),
		}})
	})
	if err != nil {
		t.Fatal(err)
	}
	if isErr, msg := prove(goalHTTP, rec.NodeID); isErr || nodeState(t, store, goalHTTP) != "met" {
		t.Fatalf("verified bound finding should close goalHTTP: isErr=%v state=%q msg=%q", isErr, nodeState(t, store, goalHTTP), msg)
	}

	// 5. Non-HTTP goal closes via an observed tool_output fact (not via finding exemption).
	nonHTTPFact := addGuardNode(t, store, db.KindFact, map[string]any{
		"summary":    "nmap confirmed port 6379 open with unauthenticated Redis INFO",
		"source":     "tool_output",
		"confidence": "observed",
	}, "confirmed")
	if isErr, msg := prove(goalTCP, nonHTTPFact); isErr || nodeState(t, store, goalTCP) != "met" || !planner.GoalMet {
		t.Fatalf("non-HTTP observed tool_output fact should close goalTCP and task: isErr=%v state=%q GoalMet=%v msg=%q",
			isErr, nodeState(t, store, goalTCP), planner.GoalMet, msg)
	}
}

func TestScopeExpansionClassificationPG(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	ensureTestSecrets(t, d)
	task, err := d.CreateTaskWithOptions("p43-scope-expand", "test scope expansion logging", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })

	store := d.Exploration(task.ExplorationID)
	tsx := NewToolSet(store, "planner")
	tsx.SetTaskID(task.ID)
	tsx.SetAssetStore(d.Assets(), d.Companies())

	callScope := func(kind, value, reason string) map[string]any {
		t.Helper()
		in, _ := json.Marshal(map[string]any{"kind": kind, "value": value, "reason": reason})
		res := callGuardTool(t, tsx.addTaskScope(), string(in))
		if res.IsError {
			t.Fatalf("add_task_scope(%s, %s) failed: %s", kind, value, res.Flatten())
		}
		var out map[string]any
		if err := json.Unmarshal([]byte(res.Flatten()), &out); err != nil {
			t.Fatalf("unmarshal add_task_scope: %v", err)
		}
		added, _ := out["added"].([]any)
		if len(added) != 1 {
			t.Fatalf("expected 1 added scope row, got %+v", out)
		}
		return added[0].(map[string]any)
	}

	// Initial declared scope: not an expansion.
	r1 := callScope("root_domain", "p43-scope.example.test", "operator goal target")
	if r1["expanded"] != false {
		t.Fatalf("initial root_domain should have expanded=false, got %+v", r1)
	}
	r2 := callScope("cidr", "10.43.0.0/16", "operator CIDR")
	// Note: adding a second unrelated root CIDR after an initial root_domain IS an expansion.
	if r2["expanded"] != true {
		t.Fatalf("new CIDR outside root_domain should be recorded as expanded=true, got %+v", r2)
	}

	// Covered by existing root_domain / CIDR: automatic, expanded=false.
	r3 := callScope("subdomain", "api.p43-scope.example.test", "subdomain under declared root")
	if r3["expanded"] != false {
		t.Fatalf("subdomain under root_domain should have expanded=false, got %+v", r3)
	}
	r4 := callScope("ip", "10.43.1.9", "host inside declared CIDR")
	if r4["expanded"] != false {
		t.Fatalf("IP inside declared CIDR should have expanded=false, got %+v", r4)
	}

	// Out-of-scope expansion: allowed without approval, recorded with source, reason, and expanded=true.
	r5 := callScope("root_domain", "external.other.test", "SSO redirect target")
	if r5["expanded"] != true || r5["source"] != "agent" || r5["reason"] != "SSO redirect target" {
		t.Fatalf("out-of-scope addition should record expansion metadata, got %+v", r5)
	}

	rows, err := d.Assets().ListTaskScope(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	foundExpanded := false
	for _, row := range rows {
		if row.Domain == "other.test" {
			foundExpanded = row.Expanded && row.Source == "agent" && row.Reason == "SSO redirect target"
		}
	}
	if !foundExpanded {
		t.Fatalf("ListTaskScope did not persist expanded=true + source + reason for external.other.test: %+v", rows)
	}
	_ = strconv.Itoa(0)
}
