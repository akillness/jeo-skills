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

func TestTaskOutcomeCard(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	task, err := m.CreateTask("outcome card", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() {
		_, _ = m.pg.DeleteFindingsByTask(taskID)
		_ = m.pg.DeleteTask(taskID)
	}()
	// skill_usage has no foreign keys, so DeleteTask leaves these rows behind,
	// and their misses would outrank TestSkillGapsReport's fixture in later runs.
	defer func() { _, _ = m.pg.Exec(`DELETE FROM skill_usage WHERE task_id=$1`, taskID) }()

	if _, err := m.pg.Exec(`
INSERT INTO findings(task_id,vulnclass,name,severity,status) VALUES
 ($1,'xss','A','high','confirmed'),
 ($1,'sqli','B','critical','fixed'),
 ($1,'csrf','C','medium','pending'),
 ($1,'xss','D','low','false_positive'),
 ($1,'idor','E','high','duplicate')`, taskID); err != nil {
		t.Fatal(err)
	}
	if _, err := m.pg.Exec(`
INSERT INTO finding_retests(finding_id,status,verdict,snapshot)
SELECT id,'completed','reproduced','{}'::jsonb FROM findings WHERE task_id=$1 AND name='A'`, taskID); err != nil {
		t.Fatal(err)
	}
	if _, err := m.pg.Exec(`
INSERT INTO finding_retests(finding_id,status,verdict,snapshot)
SELECT id,'completed','fixed','{}'::jsonb FROM findings WHERE task_id=$1 AND name='B'`, taskID); err != nil {
		t.Fatal(err)
	}
	if _, err := m.pg.Exec(`
INSERT INTO activity(exploration_id,kind,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens)
VALUES ($1,'result',11,7,3,2), ($1,'tool_result',999,999,999,999)`, task.ExpID); err != nil {
		t.Fatal(err)
	}
	if _, err := m.pg.Exec(`
INSERT INTO tool_usage(tool_key,task_id) VALUES ('traffic_search',$1),('report_finding',$1)`, taskID); err != nil {
		t.Fatal(err)
	}
	if _, err := m.pg.Exec(`
INSERT INTO skill_usage(skill,task_id,found) VALUES ('api-recon',$1,true),('graphql-audit',$1,false)`, taskID); err != nil {
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

	rec := get("/api/tasks/" + task.ID + "/outcome")
	if rec.Code != http.StatusOK {
		t.Fatalf("outcome status=%d body=%s", rec.Code, rec.Body.String())
	}
	var got db.TaskOutcome
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.TaskID != taskID || got.Status != "created" {
		t.Fatalf("task identity: %+v", got)
	}
	wantFindings := db.TaskOutcomeFindings{
		Total: 5, Confirmed: 2, Open: 1, FalsePositive: 1, Duplicate: 1,
		Critical: 1, High: 1, Medium: 0, Low: 0,
	}
	if got.Findings != wantFindings {
		t.Fatalf("findings=%+v want %+v", got.Findings, wantFindings)
	}
	if got.Retests.Reproduced != 1 || got.Retests.Fixed != 1 || got.Retests.Inconclusive != 0 {
		t.Fatalf("retests=%+v", got.Retests)
	}
	if got.Tokens.InputTokens != 11 || got.Tokens.OutputTokens != 7 ||
		got.Tokens.CacheReadTokens != 3 || got.Tokens.CacheWriteTokens != 2 {
		t.Fatalf("tokens=%+v (non-result rows must be excluded)", got.Tokens)
	}
	if got.ToolCalls != 2 {
		t.Fatalf("tool_calls=%d want 2", got.ToolCalls)
	}
	if got.SkillMisses != 1 {
		t.Fatalf("skill_misses=%d want 1", got.SkillMisses)
	}
	if got.WallSeconds < 0 {
		t.Fatalf("wall_seconds=%d", got.WallSeconds)
	}

	if rec := get("/api/tasks/999999999/outcome"); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown task status=%d body=%s", rec.Code, rec.Body.String())
	}
	if rec := get("/api/tasks/not-a-number/outcome"); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad id status=%d body=%s", rec.Code, rec.Body.String())
	}
}
