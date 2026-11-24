package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/llmrec"
)

func TestLLMContextSummaryEndpointAuthAndAggregation(t *testing.T) {
	s, request := ingestServer(t)

	// Unauthenticated request -> 401.
	rNoAuth := httptest.NewRequest(http.MethodGet, "/api/llm/context/summary", nil)
	wNoAuth := httptest.NewRecorder()
	s.Handler().ServeHTTP(wNoAuth, rNoAuth)
	if wNoAuth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated /api/llm/context/summary status=%d, want 401", wNoAuth.Code)
	}

	taskID := fmt.Sprintf("srv-ctx-%d", time.Now().UnixNano())
	t.Cleanup(func() { _, _ = s.m.PG().Exec(`DELETE FROM llm_context WHERE task_id=$1`, taskID) })

	if err := s.m.PG().InsertLLMContext(&db.LLMContext{
		TaskID: taskID, Worker: "worker", Model: "test-model", Profile: "p1",
		ToolCount: 8, MessageCount: 5,
		SystemStaticBytes: 250, ToolsBytes: 250,
		MessagesUserBytes: 400, MessagesAssistantBytes: 100, ToolResultBytes: 300,
		LastMessageBytes: 200,
		InputTokens:      1000, OutputTokens: 120, CacheRead: 700, CacheWrite: 100, Status: "ok",
	}); err != nil {
		t.Fatal(err)
	}

	t.Setenv(llmrec.ContextTelemetryEnv, "1")
	w := request(http.MethodGet, "/api/llm/context/summary?days=7&top=5&task="+taskID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("GET /api/llm/context/summary status=%d body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		Enabled       bool                     `json:"enabled"`
		ByWorkerModel []db.LLMContextGroupStat `json:"by_worker_model"`
		TopTasks      []db.LLMContextTaskStat  `json:"top_tasks"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if !resp.Enabled || len(resp.ByWorkerModel) != 1 || len(resp.TopTasks) != 1 {
		t.Fatalf("unexpected summary response: %+v", resp)
	}
	g := resp.ByWorkerModel[0]
	if g.Worker != "worker" || g.Model != "test-model" || g.Calls != 1 || g.InputTokensTotal != 1000 ||
		g.CacheReadRatio < 0.699 || g.CacheReadRatio > 0.701 ||
		g.Shares.SystemStatic < 0.249 || g.Shares.Tools < 0.249 || g.Shares.MessagesUser < 0.399 {
		t.Fatalf("unexpected group stat: %+v", g)
	}
}
