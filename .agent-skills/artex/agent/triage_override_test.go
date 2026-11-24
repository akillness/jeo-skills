package agent

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// dupTriageClient answers "the same defect" every time, so the suppression path
// runs without a decision-model server.
type dupTriageClient struct{ target int64 }

func (c dupTriageClient) Duplicate(context.Context, TriageCandidate, []TriageCandidate) (DuplicateAnswer, error) {
	return DuplicateAnswer{DuplicateOf: c.target, Confidence: 0.99}, nil
}

func findingNodes(t *testing.T, ts *ToolSet) []*db.Node {
	t.Helper()
	nodes, err := ts.ts.ListByKindWithSources(db.KindFinding, 50)
	if err != nil {
		t.Fatal(err)
	}
	if err := ts.ts.PopulateFindingTrafficIDs(nodes); err != nil {
		t.Fatal(err)
	}
	return nodes
}

// The suppression answer tells the agent to register a genuinely distinct defect
// again — that advice is unactionable unless a retry can bypass the check. This
// walks the whole path: suppress, then override, and checks the answer names the
// NODE id update_finding_report needs, not only the findings-table id.
func TestReportFindingForceRegisterOverridesSuppression(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	task, err := d.CreateTaskWithOptions("triage override", "exercise the duplicate override", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })

	ts := NewToolSet(d.Exploration(task.ExplorationID), "worker-1")
	ts.SetTaskID(task.ID)
	body := `{"vulnclass":"sqli","severity":"high","summary":"GET /rest/products/search?q= is concatenated into SQL; UNION SELECT dumps Users."}`

	if res := callGuardTool(t, ts.addFinding(), body); res.IsError {
		t.Fatalf("first report_finding failed: %s", res.Flatten())
	}
	nodes := findingNodes(t, ts)
	if len(nodes) != 1 {
		t.Fatalf("findings after the first call = %d, want 1", len(nodes))
	}
	fid, nid := nodes[0].FindingID, nodes[0].ID
	if fid <= 0 || nid <= 0 {
		t.Fatalf("fixture ids = finding %d / node %d", fid, nid)
	}

	ts.SetTriageClient(dupTriageClient{target: fid})
	res := callGuardTool(t, ts.addFinding(), body)
	if res.IsError {
		t.Fatalf("suppressed report_finding returned an error: %s", res.Flatten())
	}
	text := res.Flatten()
	if !strings.Contains(text, "duplicate_not_registered") {
		t.Fatalf("second call was not suppressed: %s", text)
	}
	// The caller must be able to act on the answer: both ids, and the node id is
	// the one update_finding_report takes.
	var ans struct {
		DuplicateOfFindingID int64 `json:"duplicate_of_finding_id"`
		DuplicateOfNodeID    int64 `json:"duplicate_of_finding_node_id"`
	}
	payload := text[strings.Index(text, "{"):]
	if err := json.Unmarshal([]byte(payload), &ans); err != nil {
		t.Fatalf("suppression answer is not JSON: %v (%s)", err, text)
	}
	if ans.DuplicateOfFindingID != fid || ans.DuplicateOfNodeID != nid {
		t.Fatalf("answer ids = finding %d / node %d, want %d / %d", ans.DuplicateOfFindingID, ans.DuplicateOfNodeID, fid, nid)
	}
	if !strings.Contains(text, "finding_id="+strconv.FormatInt(nid, 10)) {
		t.Fatalf("answer does not point at the node id: %s", text)
	}
	if got := len(findingNodes(t, ts)); got != 1 {
		t.Fatalf("findings after suppression = %d, want 1", got)
	}

	// force_register is the way out: the same call now registers.
	forced := `{"force_register":true,"vulnclass":"sqli","severity":"high","summary":"GET /rest/products/search?q= is concatenated into SQL; UNION SELECT dumps Users."}`
	if res := callGuardTool(t, ts.addFinding(), forced); res.IsError {
		t.Fatalf("forced report_finding failed: %s", res.Flatten())
	} else if strings.Contains(res.Flatten(), "duplicate_not_registered") {
		t.Fatalf("force_register was ignored: %s", res.Flatten())
	}
	if got := len(findingNodes(t, ts)); got != 2 {
		t.Fatalf("findings after force_register = %d, want 2", got)
	}
}

// The parameter has to be advertised, or the model never learns the way out.
func TestReportFindingAdvertisesForceRegister(t *testing.T) {
	schema := NewToolSet(nil, "").addFinding().InputSchema()
	raw, err := json.Marshal(schema)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "force_register") {
		t.Fatalf("report_finding schema does not advertise force_register: %s", raw)
	}
}
