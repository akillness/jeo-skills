package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

var (
	testSecretsOnce sync.Once
	testSecretsDir  string
)

func ensureTestSecrets(t *testing.T, d *db.DB) {
	t.Helper()
	if os.Getenv("ARTEX_SECRET_KEY") == "" {
		t.Setenv("ARTEX_SECRET_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	}
	testSecretsOnce.Do(func() {
		dir := filepath.Join(os.TempDir(), "artex-agent-test-secrets")
		_ = os.MkdirAll(dir, 0o700)
		testSecretsDir = dir
	})
	if err := d.InitSecrets(testSecretsDir); err != nil {
		t.Fatalf("InitSecrets: %v", err)
	}
}

// guardTaskStore creates a throwaway task (PG) and returns its exploration store.
// It has no goal node until the test adds one.
func guardTaskStore(t *testing.T) *db.ExplorationStore {
	t.Helper()
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	task, err := d.CreateTaskWithOptions("agentic guards", "exercise the goal and hint guards", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	return d.Exploration(task.ExplorationID)
}

func callGuardTool(t *testing.T, tool actool.CoreTool, input string) actool.Result {
	t.Helper()
	res, err := tool.Call(context.Background(), json.RawMessage(input), nil)
	if err != nil {
		t.Fatalf("%s: transport error: %v", tool.Name(), err)
	}
	return res
}

func addGuardNode(t *testing.T, s *db.ExplorationStore, kind string, payload map[string]any, state string) int64 {
	t.Helper()
	id, err := s.AddNode(kind, payload, 0, state, "worker-1", nil)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func nodeState(t *testing.T, s *db.ExplorationStore, id int64) string {
	t.Helper()
	n, err := s.GetNode(id)
	if err != nil || n == nil {
		t.Fatalf("node %d: %v", id, err)
	}
	return n.State
}

// goal_met refuses while a goal node is open, and ends the task once every goal
// is met (#124, F5).
func TestGoalMetRefusesWhileGoalsOpen(t *testing.T) {
	s := guardTaskStore(t)
	open := addGuardNode(t, s, db.KindGoal, map[string]any{"text": "read the admin panel"}, "open")
	addGuardNode(t, s, db.KindGoal, map[string]any{"text": "list the users"}, "met")

	tsx := NewToolSet(s, "planner")
	res := callGuardTool(t, tsx.goalMet(), `{"reason":"the data says we are done"}`)
	if !res.IsError || !strings.Contains(res.Flatten(), "1 of 2 goals") || !strings.Contains(res.Flatten(), "prove_goal") {
		t.Fatalf("open goal: want a refusal naming the open goals and prove_goal, got IsError=%v %q", res.IsError, res.Flatten())
	}
	if tsx.GoalMet {
		t.Fatal("goal_met set GoalMet while a goal is open")
	}

	if err := s.SetNodeState(open, "met"); err != nil {
		t.Fatal(err)
	}
	res = callGuardTool(t, tsx.goalMet(), `{"reason":"both goals proven"}`)
	if res.IsError || !tsx.GoalMet || tsx.Reason != "both goals proven" {
		t.Fatalf("all goals met: IsError=%v GoalMet=%v reason=%q %q", res.IsError, tsx.GoalMet, tsx.Reason, res.Flatten())
	}
}

// A task without goal nodes keeps the old goal_met behavior.
func TestGoalMetWithoutGoalNodes(t *testing.T) {
	tsx := NewToolSet(guardTaskStore(t), "planner")
	res := callGuardTool(t, tsx.goalMet(), `{"reason":"task goal reached"}`)
	if res.IsError || !tsx.GoalMet {
		t.Fatalf("no goal node: IsError=%v GoalMet=%v %q", res.IsError, tsx.GoalMet, res.Flatten())
	}
}

func seedTestTrafficSnapshot(trafficID, rawURL, reqHash, respHash string) db.TrafficEvidenceSnapshot {
	snap := db.TrafficEvidenceSnapshot{
		SourceTrafficID: trafficID,
		URL:             rawURL,
		Method:          "GET",
		Status:          200,
		ReqHash:         reqHash,
		RespHash:        respHash,
	}
	snap.ID = db.TrafficSnapshotID(snap)
	return snap
}

// seedFindingAsset records the HTTP service asset a proven finding links to: a
// finding without a linked asset never proves a goal.
func seedFindingAsset(t *testing.T, d *db.DB, task *db.Task, rawURL string) int64 {
	t.Helper()
	id, err := d.Assets().UpsertHTTPService(db.UpsertHTTPServiceReq{URL: rawURL, TaskID: task.ID})
	if err != nil {
		t.Fatalf("seed finding asset: %v", err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM assets WHERE id=$1`, id) })
	return id
}

func seedProvenFinding(t *testing.T, d *db.DB, task *db.Task, trafficID, rawURL string, assetIDs []int64) *db.RecordedFinding {
	t.Helper()
	ensureTestSecrets(t, d)
	snap := seedTestTrafficSnapshot(trafficID, rawURL, "req-"+trafficID, "resp-"+trafficID)
	var rec *db.RecordedFinding
	err := d.WithEvidenceTx(context.Background(), func(tx *sql.Tx) error {
		var e error
		rec, e = db.RecordFindingTx(context.Background(), tx, db.RecordFindingInput{
			TaskID:        task.ID,
			ExplorationID: task.ExplorationID,
			VulnClass:     "sqli",
			Name:          "Users dump",
			Severity:      "high",
			Summary:       "user table dumped with traffic proof",
			Worker:        "worker-1",
			AssetIDs:      assetIDs,
		}, []db.PreparedTrafficEvidence{{
			Ref:      db.TrafficRef{TrafficID: trafficID, Role: "proof", Note: "verified capture"},
			Snapshot: snap,
		}})
		return e
	})
	if err != nil {
		t.Fatalf("seed proven finding: %v", err)
	}
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM finding_traffic_bindings WHERE finding_id=$1`, rec.FindingID)
		_, _ = d.Exec(`DELETE FROM traffic_evidence_snapshots WHERE id=$1`, snap.ID)
	})
	return rec
}

// prove_goal accepts a fact only when its confidence is observed; a finding
// requires at least one server-verified bound traffic_ref (bare findings without
// bound traffic are refused, while a finding with bound traffic closes the goal)
// (#124, F5, P4.3).
func TestProveGoalRequiresObservedFact(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	task, err := d.CreateTaskWithOptions("agentic guards", "exercise the goal and finding proof guards", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	s := d.Exploration(task.ExplorationID)

	goalA := addGuardNode(t, s, db.KindGoal, map[string]any{"text": "get admin"}, "open")
	goalB := addGuardNode(t, s, db.KindGoal, map[string]any{"text": "dump the users"}, "open")
	inferred := addGuardNode(t, s, db.KindFact, map[string]any{"summary": "admin is probably reachable", "confidence": "inferred"}, "confirmed")
	unlabeled := addGuardNode(t, s, db.KindFact, map[string]any{"summary": "admin reachable"}, "confirmed")
	observed := addGuardNode(t, s, db.KindFact, map[string]any{"summary": "logged in as admin", "confidence": " Observed "}, "confirmed")
	bareFinding := addGuardNode(t, s, db.KindFinding, map[string]any{"summary": "user table dumped"}, "confirmed")
	provenFinding := seedProvenFinding(t, d, task, "ex-guard-1", "https://guard.example.test/api/users",
		[]int64{seedFindingAsset(t, d, task, "https://guard.example.test/api/users")})

	tsx := NewToolSet(s, "planner")
	tsx.SetTrafficProofChecker(func(_ context.Context, id string) (bool, error) { return id == "ex-guard-1", nil })
	prove := func(goal, ev int64) actool.Result {
		return callGuardTool(t, tsx.proveGoal(), `{"goal_id":`+strconv.FormatInt(goal, 10)+`,"evidence_id":`+strconv.FormatInt(ev, 10)+`,"reason":"x"}`)
	}

	for name, ev := range map[string]int64{"inferred": inferred, "unlabeled": unlabeled} {
		res := prove(goalA, ev)
		if !res.IsError || !strings.Contains(res.Flatten(), "observed") || !strings.Contains(res.Flatten(), "stays open") {
			t.Fatalf("%s fact: want a refusal, got IsError=%v %q", name, res.IsError, res.Flatten())
		}
		if st := nodeState(t, s, goalA); st != "open" {
			t.Fatalf("%s fact: goal state %q, want open", name, st)
		}
	}
	if tsx.GoalMet {
		t.Fatal("a refused proof set GoalMet")
	}

	if res := prove(goalA, observed); res.IsError || nodeState(t, s, goalA) != "met" {
		t.Fatalf("observed fact: IsError=%v state=%q %q", res.IsError, nodeState(t, s, goalA), res.Flatten())
	}
	if tsx.GoalMet {
		t.Fatal("GoalMet set while goal B is open")
	}
	// Bare finding without bound traffic must be refused; goal B stays open and GoalMet stays false.
	if res := prove(goalB, bareFinding); !res.IsError || nodeState(t, s, goalB) != "open" || tsx.GoalMet {
		t.Fatalf("bare finding must be refused: IsError=%v state=%q GoalMet=%v %q", res.IsError, nodeState(t, s, goalB), tsx.GoalMet, res.Flatten())
	}
	// Finding with real bound traffic closes goal B and sets GoalMet.
	if res := prove(goalB, provenFinding.NodeID); res.IsError || nodeState(t, s, goalB) != "met" || !tsx.GoalMet {
		t.Fatalf("proven finding: IsError=%v state=%q GoalMet=%v %q", res.IsError, nodeState(t, s, goalB), tsx.GoalMet, res.Flatten())
	}
}

// add_hint stores the calling ToolSet as the hint's origin and passes it to the
// trigger (#124, F6): an orchestrator hint is not labelled human, and the main
// agent (worker "human") still is.
func TestAddHintRecordsOrigin(t *testing.T) {
	s := guardTaskStore(t)
	for _, origin := range []string{"orchestrator", "human"} {
		tsx := NewToolSet(s, origin)
		var gotOrigin string
		var gotTexts []string
		tsx.SetNotifyHint(func(o string, texts []string) { gotOrigin, gotTexts = o, texts })
		res := callGuardTool(t, tsx.AddHintTool(), `{"text":"focus on the export endpoint"}`)
		out := res.Flatten()
		if res.IsError || !strings.HasPrefix(out, "hint added: ") {
			t.Fatalf("%s: add_hint failed: %q", origin, out)
		}
		id, err := strconv.ParseInt(strings.TrimPrefix(out, "hint added: "), 10, 64)
		if err != nil {
			t.Fatalf("%s: hint id in %q: %v", origin, out, err)
		}
		n, err := s.GetNode(id)
		if err != nil || n == nil || n.Kind != db.KindHint || n.Origin != origin {
			t.Fatalf("%s: hint node %+v err=%v, want origin %q", origin, n, err, origin)
		}
		if gotOrigin != origin || len(gotTexts) != 1 || gotTexts[0] != "focus on the export endpoint" {
			t.Fatalf("%s: trigger got origin=%q texts=%v", origin, gotOrigin, gotTexts)
		}
	}
}

// renderTriggers names the writer of a hint from its origin; only the main agent
// is "the human" (#124, F6). The hint case never reads the store. Since F3 a hint
// not written by the operator is framed as data.
func TestRenderTriggersHintOrigin(t *testing.T) {
	env := newDataEnvelope()
	framed := "\n" + env.wrap("hints", "h1") + "\n"
	for origin, want := range map[string]string{
		"human":        "- [operator] The human (via the main agent) added a strategic hint: h1",
		"orchestrator": "- A cross-task orchestration added a strategic hint: " + framed,
		"worker-3":     "- An agent (worker-3) added a strategic hint: " + framed,
		"":             "- A source that was not recorded added a strategic hint: " + framed,
	} {
		got := renderTriggers([]TriggerEvent{{Kind: "hint", Hints: []string{"h1"}, HintOrigin: origin}}, env, triggerLookup{})
		if !strings.Contains(got, want) || strings.Contains(got, "The human (main agent)") {
			t.Errorf("origin %q: got %q, want %q", origin, got, want)
		}
	}
	got := renderTriggers([]TriggerEvent{{Kind: "hint", Hints: []string{"h1", "h2"}, HintOrigin: "orchestrator"}}, env, triggerLookup{})
	if !strings.Contains(got, "- A cross-task orchestration added 2 strategic hints: \n"+env.wrap("hints", "h1; h2")) {
		t.Errorf("batch: got %q", got)
	}
}
