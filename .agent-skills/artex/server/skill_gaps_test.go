package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestSkillGapsReport(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	task, err := m.CreateTask("skill gaps", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() { _ = m.pg.DeleteTask(taskID) }()
	defer func() { _, _ = m.pg.Exec(`DELETE FROM skill_usage WHERE task_id=$1`, taskID) }()

	if _, err := m.pg.Exec(`
INSERT INTO skill_usage(skill,agent_key,task_id,found) VALUES
 ('rsi-test-graphql','worker',$1,false),
 ('rsi-test-graphql','worker',$1,false),
 ('rsi-test-graphql','worker',$1,true),
 ('rsi-test-cloud','worker',$1,false),
 ('rsi-test-known','worker',$1,true)`, taskID); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	defer stopTestServer(t, s, cancel)
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		return rec
	}

	rec := get("/api/skill-gaps")
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out struct {
		Gaps []struct {
			Skill    string `json:"skill"`
			AgentKey string `json:"agent_key"`
			Misses   int    `json:"misses"`
			Hits     int    `json:"hits"`
		} `json:"gaps"`
		Count int `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	bySkill := map[string]struct {
		misses, hits int
		agent        string
	}{}
	for _, g := range out.Gaps {
		bySkill[g.Skill] = struct {
			misses, hits int
			agent        string
		}{g.Misses, g.Hits, g.AgentKey}
	}
	if got := bySkill["rsi-test-graphql"]; got.misses != 2 || got.hits != 1 || got.agent != "worker" {
		t.Fatalf("graphql gap=%+v want misses=2 hits=1 agent=worker", got)
	}
	if got := bySkill["rsi-test-cloud"]; got.misses != 1 {
		t.Fatalf("cloud gap=%+v want misses=1", got)
	}
	if _, ok := bySkill["rsi-test-known"]; ok {
		t.Fatal("a hit-only skill must not appear in the miss report")
	}
	first := out.Gaps[0].Skill
	if first != "rsi-test-graphql" {
		t.Fatalf("ordering: first=%q want rsi-test-graphql (highest misses)", first)
	}

	rec = get("/api/skill-gaps?limit=1")
	if rec.Code != http.StatusOK {
		t.Fatalf("limit status=%d body=%s", rec.Code, rec.Body.String())
	}
	var limited struct {
		Gaps []struct {
			Skill string `json:"skill"`
		} `json:"gaps"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &limited); err != nil {
		t.Fatal(err)
	}
	if len(limited.Gaps) != 1 || limited.Gaps[0].Skill != "rsi-test-graphql" {
		t.Fatalf("limit=1 returned %+v", limited.Gaps)
	}
	if rec := get("/api/skill-gaps?limit=abc"); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad limit status=%d want 400", rec.Code)
	}
}
