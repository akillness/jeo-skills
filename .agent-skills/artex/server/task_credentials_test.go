package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// Task credentials (#3): declared at creation, listed/upserted/deleted via the
// API, and recorded by the agent path (ExplorationStore upsert, source=agent).
func TestTaskCredentialsFlow(t *testing.T) {
	s, _, request := trafficEvidenceServer(t)

	// Create a task carrying two credentials: one complete, one "agent generates".
	var created struct {
		ID string `json:"id"`
	}
	resp := request("POST", "/api/tasks", `{
		"description": "credential flow test",
		"goal": "Verify credential handling against the lab target at http://127.0.0.1:9/v1 and record the outcome.",
		"credentials": [
			{"domain": "target.example.com", "username": "alias@test", "password": "s3cret!", "note": "program alias account"},
			{"domain": "target.example.com", "username": "", "password": ""}
		]
	}`)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("an entry without a username must be rejected, got HTTP %d: %s", resp.Code, resp.Body.String())
	}

	resp = request("POST", "/api/tasks", `{
		"description": "credential flow test",
		"goal": "Verify credential handling against the lab target at http://127.0.0.1:9/v1 and record the outcome.",
		"credentials": [
			{"domain": "target.example.com", "username": "alias@test", "password": "s3cret!", "note": "program alias account"},
			{"domain": "app.target.example.com", "username": "agent-account", "password": ""}
		]
	}`)
	if resp.Code != http.StatusCreated {
		t.Fatalf("create with credentials failed, HTTP %d: %s", resp.Code, resp.Body.String())
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &created); err != nil || created.ID == "" {
		t.Fatalf("bad create response: %s", resp.Body.String())
	}
	taskNum := json.Number(created.ID)
	id, err := taskNum.Int64()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = s.m.pg.DeleteTask(id)
		// The first POST with an invalid credential entry returns 400 after
		// creating a task/exploration row; remove any remaining fixture rows.
		_, _ = s.m.PG().Exec(`DELETE FROM tasks WHERE description = 'credential flow test'`)
		_, _ = s.m.PG().Exec(`DELETE FROM explorations WHERE description = 'credential flow test'`)
		_, _ = s.m.PG().Exec(`DELETE FROM assets WHERE type = 'ip' AND ip = '127.0.0.1'`)
	})

	// List: both rows, user source, order stable.
	resp = request("GET", fmt.Sprintf("/api/tasks/%s/credentials", created.ID), "")
	if resp.Code != http.StatusOK {
		t.Fatalf("list failed, HTTP %d: %s", resp.Code, resp.Body.String())
	}
	var list []db.TaskCredential
	if err := json.Unmarshal(resp.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("want 2 credentials, got %d: %s", len(list), resp.Body.String())
	}
	if list[0].Domain != "target.example.com" || list[0].Username != "alias@test" || list[0].Password != "__masked__" || list[0].Note != "program alias account" {
		t.Fatalf("declared credential mismatch: %+v", list[0])
	}
	if list[1].Password != "" {
		t.Fatalf("agent-generates entry must keep an empty password until recorded, got %q", list[1].Password)
	}

	// The agent path records the generated password onto the empty entry.
	if _, err := s.m.PG().UpsertTaskCredential(id, db.TaskCredentialInput{
		Domain: "app.target.example.com", Username: "agent-account", Password: "generated-strong-pass",
		Source: "agent",
	}); err != nil {
		t.Fatal(err)
	}
	list, err = s.m.PG().TaskCredentials(id)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[1].Password != "generated-strong-pass" || list[1].Source != "agent" {
		t.Fatalf("agent record must update in place, got %+v", list[1])
	}

	// Manual add + delete through the API.
	resp = request("POST", fmt.Sprintf("/api/tasks/%s/credentials", created.ID),
		`{"domain":"other.example.com","username":"relay","password":"otp-verified"}`)
	if resp.Code != http.StatusCreated {
		t.Fatalf("manual add failed, HTTP %d: %s", resp.Code, resp.Body.String())
	}
	var added db.TaskCredential
	if err := json.Unmarshal(resp.Body.Bytes(), &added); err != nil {
		t.Fatal(err)
	}
	resp = request("DELETE", fmt.Sprintf("/api/tasks/%s/credentials/%d", created.ID, added.ID), "")
	if resp.Code != http.StatusOK {
		t.Fatalf("delete failed, HTTP %d: %s", resp.Code, resp.Body.String())
	}
	list, _ = s.m.PG().TaskCredentials(id)
	if len(list) != 2 {
		t.Fatalf("after delete want 2 credentials, got %d", len(list))
	}

	// A delete from another task must not cross tasks.
	resp = request("DELETE", fmt.Sprintf("/api/tasks/%s/credentials/999999", created.ID), "")
	if resp.Code != http.StatusNotFound {
		t.Fatalf("foreign credential delete must 404, got HTTP %d", resp.Code)
	}
}
