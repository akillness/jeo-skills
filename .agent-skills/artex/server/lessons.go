package server

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

// rsiLessonsMode reads the shadow-mode switch:
//
//	off (default)  no selection, no logging, no prompt change
//	shadow         select lessons and log what would have been shown
//	inject         select, log, and append the block to planner/worker prompts
//
// The flag is read per task-bundle build, so changing it needs a new task or a
// task-agent invalidation, not a restart.
func rsiLessonsMode() string {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("ARTEX_RSI_LESSONS"))) {
	case "shadow":
		return "shadow"
	case "inject":
		return "inject"
	default:
		return "off"
	}
}

// wireTaskLessons selects the lessons visible to a task and, in inject mode,
// attaches the rendered block to the planner and worker. The block is
// code-owned: it is appended after the rendered prompt and cannot be removed
// by editing the prompt in the UI. Usage is logged in both modes so a later
// comparison can tell which tasks saw which lessons.
func (s *Server) wireTaskLessons(t *Task, wk *agent.Worker, pl *agent.Planner) {
	mode := rsiLessonsMode()
	if mode == "off" || t == nil {
		return
	}
	taskID, err := strconv.ParseInt(t.ID, 10, 64)
	if err != nil {
		return
	}
	lessons, err := s.m.PG().TaskLessons(context.Background(), taskID, 8)
	if err != nil {
		log.Printf("[rsi] lesson selection failed for task %s: %v", t.ID, err)
		return
	}
	block, ids := db.RenderLessons(lessons, 1800)
	if block == "" {
		return
	}
	if mode == "inject" {
		wk.SetLessonsBlock(block)
		pl.SetLessonsBlock(block)
	}
	if err := s.m.PG().LogLessonUsage(context.Background(), taskID, ids, mode); err != nil {
		log.Printf("[rsi] lesson usage log failed for task %s: %v", t.ID, err)
	}
}

// taskLessons returns the lessons visible to one task plus the rendered block.
// Read-only: it never extracts.
func (s *Server) taskLessons(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid task id")
		return
	}
	lessons, err := s.m.PG().TaskLessons(r.Context(), id, 50)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, 404, "task not found")
		return
	}
	if err != nil {
		log.Printf("[rsi] lesson list failed for task %d: %v", id, err)
		writeErr(w, 500, "lesson query failed")
		return
	}
	block, _ := db.RenderLessons(lessons, 1800)
	writeJSON(w, 200, map[string]any{
		"mode":    rsiLessonsMode(),
		"lessons": lessons,
		"block":   block,
		"count":   len(lessons),
	})
}

// extractTaskLessons derives candidate lessons from one task's findings and
// retests. It is idempotent; call it after the task closes (the manager does
// this automatically on terminal status) or manually for a backfill.
func (s *Server) extractTaskLessons(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid task id")
		return
	}
	n, err := s.m.PG().ExtractLessonsForTask(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, 404, "task not found")
		return
	}
	if err != nil {
		log.Printf("[rsi] lesson extraction failed for task %d: %v", id, err)
		writeErr(w, 500, "lesson extraction failed")
		return
	}
	writeJSON(w, 200, map[string]any{"extracted": n})
}
