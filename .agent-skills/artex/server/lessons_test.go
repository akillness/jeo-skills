package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestRSILessonsMode(t *testing.T) {
	cases := map[string]string{"": "off", "off": "off", "shadow": "shadow", "INJECT": "inject", "nonsense": "off"}
	for raw, want := range cases {
		t.Setenv("ARTEX_RSI_LESSONS", raw)
		if got := rsiLessonsMode(); got != want {
			t.Fatalf("ARTEX_RSI_LESSONS=%q -> %q, want %q", raw, got, want)
		}
	}
}

func TestTaskLessonsExtractionAndIdempotency(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	if _, err := m.pg.Exec(`DELETE FROM rsi_lessons`); err != nil {
		t.Fatal(err)
	}
	task, err := m.CreateTask("lessons", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() {
		_, _ = m.pg.DeleteFindingsByTask(taskID)
		_ = m.pg.DeleteTask(taskID)
	}()
	defer func() { _, _ = m.pg.Exec(`DELETE FROM rsi_lessons`) }()

	if _, err := m.pg.Exec(`
INSERT INTO findings(task_id,vulnclass,name,summary,severity,status) VALUES
 ($1,'xss','Reflected XSS','reflected in search','high','confirmed'),
 ($1,'ssrf','Webhook SSRF','webhook fetch','high','false_positive'),
 ($1,'idor','Invoice IDOR','invoice read','medium','confirmed')`, taskID); err != nil {
		t.Fatal(err)
	}
	if _, err := m.pg.Exec(`
INSERT INTO finding_retests(finding_id,status,verdict,snapshot)
SELECT id,'completed','fixed','{}'::jsonb FROM findings WHERE task_id=$1 AND name='Invoice IDOR'`, taskID); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	defer stopTestServer(t, s, cancel)
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	call := func(method, path string) (int, map[string]any) {
		req := httptest.NewRequest(method, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out
	}
	getLessons := func() (map[string]any, map[int64]int) {
		code, out := call(http.MethodGet, "/api/tasks/"+task.ID+"/lessons")
		if code != http.StatusOK {
			t.Fatalf("lessons status=%d body=%v", code, out)
		}
		support := map[int64]int{}
		list, _ := out["lessons"].([]any)
		for _, raw := range list {
			item, _ := raw.(map[string]any)
			id := int64(item["id"].(float64))
			support[id] = int(item["support"].(float64))
		}
		return out, support
	}

	code, out := call(http.MethodPost, "/api/tasks/"+task.ID+"/lessons/extract")
	if code != http.StatusOK {
		t.Fatalf("extract status=%d body=%v", code, out)
	}
	if n, _ := out["extracted"].(float64); int(n) != 4 {
		t.Fatalf("extracted=%v want 4 (positive, negative, positive, caution)", out["extracted"])
	}
	preview, supportBefore := getLessons()
	if preview["count"].(float64) != 4 {
		t.Fatalf("count=%v want 4", preview["count"])
	}
	block, _ := preview["block"].(string)
	if block == "" || !strings.Contains(block, "not instructions") {
		t.Fatalf("rendered block missing or unlabeled: %q", block)
	}
	for _, kind := range []string{"positive", "negative", "caution"} {
		if !strings.Contains(block, "["+kind+",") {
			t.Fatalf("block missing %s lesson:\n%s", kind, block)
		}
	}

	// Re-extraction must not inflate support: evidence is keyed per source.
	if code, out := call(http.MethodPost, "/api/tasks/"+task.ID+"/lessons/extract"); code != http.StatusOK {
		t.Fatalf("second extract status=%d body=%v", code, out)
	}
	_, supportAfter := getLessons()
	for id, before := range supportBefore {
		if supportAfter[id] != before {
			t.Fatalf("lesson %d support changed on re-extraction: %d -> %d", id, before, supportAfter[id])
		}
	}

	if code, _ := call(http.MethodGet, "/api/tasks/999999999/lessons"); code != http.StatusNotFound {
		t.Fatalf("unknown task status=%d", code)
	}
	if code, _ := call(http.MethodPost, "/api/tasks/nope/lessons/extract"); code != http.StatusBadRequest {
		t.Fatalf("bad id status=%d", code)
	}
}

func TestTerminalStatusExtractsLessons(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	if _, err := m.pg.Exec(`DELETE FROM rsi_lessons`); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.pg.Exec(`DELETE FROM rsi_lessons`) }()
	task, err := m.CreateTask("auto lessons", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	taskID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer func() {
		_, _ = m.pg.DeleteFindingsByTask(taskID)
		_ = m.pg.DeleteTask(taskID)
	}()
	if _, err := m.pg.Exec(`
INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
VALUES ($1,'xss','Reflected XSS','reflected in search','high','confirmed')`, taskID); err != nil {
		t.Fatal(err)
	}
	if err := m.SetTaskStatus(task.ID, "done"); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	defer stopTestServer(t, s, cancel)
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/tasks/"+task.ID+"/lessons", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("lessons status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out struct {
		Count int    `json:"count"`
		Block string `json:"block"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Count != 1 || !strings.Contains(out.Block, "[positive,") {
		t.Fatalf("terminal status did not extract: count=%d block=%q", out.Count, out.Block)
	}
}
