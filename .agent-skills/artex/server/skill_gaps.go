package server

import (
	"log"
	"net/http"
	"strconv"
)

// skillGaps reports skills the agent asked for but the platform did not
// provide, aggregated by skill, agent, and task category. The source is the
// existing skill_usage miss rows, so the backlog is evidence-backed rather than
// inferred. Read-only: it creates no skill and changes no prompt.
func (s *Server) skillGaps(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 500 {
			writeErr(w, 400, "limit must be an integer between 1 and 500")
			return
		}
		limit = n
	}
	gaps, err := s.m.PG().SkillGaps(r.Context(), limit)
	if err != nil {
		log.Printf("[skills] gap query failed: %v", err)
		writeErr(w, 500, "skill gap query failed")
		return
	}
	writeJSON(w, 200, map[string]any{"gaps": gaps, "count": len(gaps)})
}
