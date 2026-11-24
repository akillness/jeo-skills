package server

import (
	"encoding/json"
	"testing"

	"github.com/Autumn-27/artex/traffic"
)

// The traffic_get description that says traffic_search never finds a value a
// rewrite rule wrote replaces the original built-in text once, and never a
// description the user edited.
func TestTrafficGetDescriptionUpgrade(t *testing.T) {
	s, _, _ := trafficEvidenceServer(t)
	pg := s.m.pg
	old, err := pg.GetTool("traffic_get")
	if err != nil || old == nil {
		t.Fatal("missing tool traffic_get", err)
	}
	bindings, _ := json.Marshal(old.Agents)
	t.Cleanup(func() { pg.UpdateTool("traffic_get", old.Description, old.Schema, bindings, old.Enabled) })
	const flag = "traffic_get_rewrite_description_v1"
	legacy := "Fetch the raw request/response of one captured traffic record by id (truncated when too large). Use together with traffic_search to avoid re-curling. A WebSocket (status 101) or SSE (text/event-stream) record shows only its handshake here; read its messages with traffic_messages."

	for _, c := range []struct{ stored, want string }{
		{legacy, traffic.TrafficGetDescription},
		{"USER DESCRIPTION", "USER DESCRIPTION"},
	} {
		if err := pg.UpdateTool("traffic_get", c.stored, old.Schema, bindings, old.Enabled); err != nil {
			t.Fatal(err)
		}
		if err := pg.SetSetting(flag, "false"); err != nil {
			t.Fatal(err)
		}
		s.seedFindingWorkflowTools()
		row, _ := pg.GetTool("traffic_get")
		if row.Description != c.want {
			t.Fatalf("stored %q: description %q, want %q", c.stored, row.Description, c.want)
		}
		if v, _, _ := pg.GetSetting(flag); v != "true" {
			t.Fatal("flag not set")
		}
	}
}
