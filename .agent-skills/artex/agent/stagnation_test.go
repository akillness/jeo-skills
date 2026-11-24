package agent

import (
	"encoding/json"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func nodeWithSummary(id int64, summary string) *db.Node {
	payload, _ := json.Marshal(map[string]any{"summary": summary})
	return &db.Node{ID: id, Kind: db.KindIntent, State: "done", Payload: payload}
}

func TestDetectStagnation(t *testing.T) {
	done := []*db.Node{
		nodeWithSummary(10, "Enumerate endpoints on https://target.example.com/api/v2"),
		nodeWithSummary(22, "Enumerate endpoints on https://target.example.com/api/v3"),
		nodeWithSummary(35, "enumerate endpoints on https://target.example.com/api/v9"),
		nodeWithSummary(40, "Review authentication flow for token replay"),
	}
	if got := detectStagnation(done, nil); len(got) != 1 {
		t.Fatalf("expected 1 stagnating direction, got %d: %+v", len(got), got)
	} else if got[0]["repeats"] != 3 {
		t.Fatalf("repeats=%v want 3", got[0]["repeats"])
	}

	// a finding produced after the first repeat disarms the direction
	findingPayload, _ := json.Marshal(map[string]any{"summary": "IDOR found"})
	findings := []*db.Node{{ID: 25, Kind: db.KindFinding, Payload: findingPayload}}
	if got := detectStagnation(done, findings); len(got) != 0 {
		t.Fatalf("expected no stagnation once a finding exists, got %+v", got)
	}

	// below the repeat threshold: nothing
	if got := detectStagnation(done[:2], nil); len(got) != 0 {
		t.Fatalf("expected no stagnation below threshold, got %+v", got)
	}
}
