package server

import (
	"net/http"
	"strings"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/llmrec"
)

// pgLLMContextSummary returns aggregated context-size telemetry from
// llm_context: per-(worker, model) input percentiles, pro-rata section shares
// over real input_tokens, cache_read/input ratio, and top tasks by input
// tokens. Read-only reporting endpoint (no UI in Phase A).
func (s *Server) pgLLMContextSummary(w http.ResponseWriter, r *http.Request) {
	pg := s.m.PG()
	if pg == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"enabled":         llmrec.ContextTelemetryEnabled(),
			"by_worker_model": []db.LLMContextGroupStat{},
			"top_tasks":       []db.LLMContextTaskStat{},
		})
		return
	}
	q := r.URL.Query()
	summary, err := pg.LLMContextSummary(db.LLMContextQuery{
		Days:     atoiDefault(q.Get("days"), 30),
		TaskID:   strings.TrimSpace(q.Get("task")),
		TopTasks: atoiDefault(q.Get("top"), 20),
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":         llmrec.ContextTelemetryEnabled(),
		"by_worker_model": summary.ByWorkerModel,
		"top_tasks":       summary.TopTasks,
	})
}
