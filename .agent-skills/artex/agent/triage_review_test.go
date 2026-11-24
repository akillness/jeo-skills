package agent

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/Autumn-27/artex/db"
)

// The caps bound a request in BYTES, but a byte-index cut through a multi-byte
// rune leaves a broken character: the JSON encoder sends U+FFFD and the decider
// reads garbage where the evidence tail was. Every cut must land on a boundary.
func TestCapTextCutsOnRuneBoundary(t *testing.T) {
	for _, tc := range []struct {
		name string
		text string
		cap  int
	}{
		{"cyrillic", strings.Repeat("уязвимость ", 80), 51},
		{"cjk", strings.Repeat("数据泄露", 100), 401},
		{"mixed", "SQLi: " + strings.Repeat("инъекция ", 90), 333},
	} {
		t.Run(tc.name, func(t *testing.T) {
			out := capText(tc.text, tc.cap)
			if !utf8.ValidString(out) {
				t.Fatalf("capText(%d) produced invalid UTF-8", tc.cap)
			}
			if !strings.HasSuffix(out, "…") {
				t.Fatalf("capText(%d) dropped the ellipsis", tc.cap)
			}
			body := strings.TrimSuffix(out, "…")
			if len(body) > tc.cap {
				t.Fatalf("capText(%d) kept %d bytes", tc.cap, len(body))
			}
			if !strings.HasPrefix(tc.text, body) {
				t.Fatalf("capText(%d) is not a prefix of the input", tc.cap)
			}
		})
	}
}

// The assembled state has its own byte ceiling; the same rule applies there, and
// the whole state must still parse as text.
func TestBuildDuplicateStateCutsOnRuneBoundary(t *testing.T) {
	existing := make([]TriageCandidate, 0, 40)
	for i := 0; i < 40; i++ {
		existing = append(existing, TriageCandidate{
			FindingID: int64(i + 1),
			Name:      "数据泄露",
			Summary:   strings.Repeat("утечка данных через параметр ", 20),
		})
	}
	state := buildDuplicateState(TriageCandidate{Name: "SQLi", Summary: strings.Repeat("данные ", 200)}, existing)
	if len(state) > triageMaxStateChars {
		t.Fatalf("state is %d bytes, cap is %d", len(state), triageMaxStateChars)
	}
	if !utf8.ValidString(state) {
		t.Fatal("state was cut mid-rune")
	}
}

// The question and the suppression answer carry the findings-table id, while
// update_finding_report addresses the exploration node — the candidate list has
// to keep both so the answer can name the one the agent needs to act on.
func TestTriageCandidatesCarryNodeID(t *testing.T) {
	nodes := []*db.Node{
		{ID: 41, FindingID: 7, Payload: []byte(`{"name":"SQLi","vulnclass":"sqli","severity":"high","summary":"s"}`)},
		{ID: 42, FindingID: 0, Payload: []byte(`{"name":"no finding row"}`)},
	}
	out := triageCandidates(nodes, db.RecordFindingInput{})
	if len(out) != 1 {
		t.Fatalf("candidates = %d, want 1 (node without a finding row is skipped)", len(out))
	}
	if out[0].NodeID != 41 || out[0].FindingID != 7 {
		t.Fatalf("candidate ids = node %d / finding %d, want 41 / 7", out[0].NodeID, out[0].FindingID)
	}
}

func TestWithNodeIDMapsFindingToNode(t *testing.T) {
	existing := []TriageCandidate{{FindingID: 7, NodeID: 41}, {FindingID: 9, NodeID: 55}}
	if got := withNodeID(DuplicateAnswer{DuplicateOf: 9, Confidence: 0.8}, existing); got.DuplicateOfNode != 55 {
		t.Fatalf("DuplicateOfNode = %d, want 55", got.DuplicateOfNode)
	}
	if got := withNodeID(DuplicateAnswer{}, existing); got.DuplicateOfNode != 0 {
		t.Fatalf("distinct answer carried node %d", got.DuplicateOfNode)
	}
	// An id the question never offered must not invent a node.
	if got := withNodeID(DuplicateAnswer{DuplicateOf: 999}, existing); got.DuplicateOfNode != 0 {
		t.Fatalf("unoffered id mapped to node %d", got.DuplicateOfNode)
	}
}
