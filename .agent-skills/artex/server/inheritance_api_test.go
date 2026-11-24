package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestInheritedActivityDetailAndRelationDeletion(t *testing.T) {
	// #78: t.TempDir() cleanup raced with background writers that outlive
	// m.Close (TempDir RemoveAll: directory not empty, under CI load). Use a
	// manual dir with a tolerated cleanup, and close the manager via t.Cleanup
	// registered FIRST so it runs LAST (LIFO): the DeleteTask cleanups below
	// then execute while the database is still open instead of racing a closed
	// one ("sql: database is closed" teardown noise).
	dir, err := os.MkdirTemp("", "inherited-activity-*")
	if err != nil {
		t.Fatal(err)
	}
	m, err := NewManager(dir, "")
	if err != nil {
		_ = os.RemoveAll(dir)
		db.SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() {
		_ = m.Close()
		_ = os.RemoveAll(dir) // tolerated: a late background writer may still hold it
	})

	source, err := m.CreateTaskWithOptions("detail source", "source goal", db.TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	sourceID := mustTaskID(t, source.ID)
	current, err := m.CreateTaskWithOptions("detail current", "current goal", db.TaskCreateOptions{SourceTaskIDs: []int64{sourceID}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = m.DeleteTask(current.ID, DeleteTaskOptions{})
		_, _ = m.DeleteTask(source.ID, DeleteTaskOptions{})
	})

	plannerStep, err := source.Store.AppendActivity(db.Activity{
		Worker: "planner", Kind: "text", Summary: "private planner", Detail: "private planner detail",
	})
	if err != nil {
		t.Fatal(err)
	}
	intentID, err := source.Store.AddIntent(map[string]any{"summary": "completed source work"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	if err := source.Store.SetIntentState(intentID, "done"); err != nil {
		t.Fatal(err)
	}
	workerStep, err := source.Store.AppendActivity(db.Activity{
		NodeID: &intentID, Worker: "worker", Kind: "result", Summary: "shared result", Detail: "shared worker detail",
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	defer stopTestServer(t, s, cancel)
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	fetchDetail := func(stepID int64) string {
		req := httptest.NewRequest(http.MethodGet,
			fmt.Sprintf("/api/exploration/activity/%d?task=%s", stepID, current.ID), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("activity detail %d: status=%d body=%s", stepID, rec.Code, rec.Body.String())
		}
		var body struct {
			Detail string `json:"detail"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body.Detail
	}
	if got := fetchDetail(plannerStep); got != "" {
		t.Fatalf("source planner transcript leaked through API: %q", got)
	}
	if got := fetchDetail(workerStep); got != "shared worker detail" {
		t.Fatalf("terminal inherited worker detail missing: %q", got)
	}

	if _, err := m.DeleteTask(source.ID, DeleteTaskOptions{}); err != nil {
		t.Fatal(err)
	}
	currentAfter, ok := m.Task(current.ID)
	if !ok || len(currentAfter.SourceTaskIDs) != 0 {
		t.Fatalf("deleted source remained in live task DTO state: %+v", currentAfter)
	}
}

func mustTaskID(t *testing.T, raw string) int64 {
	t.Helper()
	var id int64
	if _, err := fmt.Sscan(raw, &id); err != nil || id <= 0 {
		t.Fatalf("bad task id %q: %v", raw, err)
	}
	return id
}
