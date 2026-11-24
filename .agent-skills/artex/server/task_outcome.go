package server

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strconv"
)

// taskOutcome returns one task's production and cost baseline. It is the
// measurement layer for later RSI comparisons (harness2, Google Research,
// arXiv 2610.14224): nothing here changes agent behavior.
func (s *Server) taskOutcome(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid task id")
		return
	}
	outcome, err := s.m.PG().TaskOutcome(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, 404, "task not found")
		return
	}
	if err != nil {
		log.Printf("[tasks] outcome query failed for %d: %v", id, err)
		writeErr(w, 500, "outcome query failed")
		return
	}
	writeJSON(w, 200, outcome)
}
