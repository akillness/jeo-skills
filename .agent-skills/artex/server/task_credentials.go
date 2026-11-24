package server

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/notify"
)

// Task credential HTTP handlers (#3). The agent-side write path is the
// save_task_credential tool; these routes serve the UI (task detail tab) and the
// creation dialog.

// taskCredentialDTO masks the password server-side; an empty password stays
// empty (the "agent generates" mode). Agent tools read the stored value directly.
func taskCredentialDTO(c db.TaskCredential) map[string]any {
	pass := c.Password
	if pass != "" {
		pass = notify.MaskedPrefix
	}
	return map[string]any{
		"id": c.ID, "task_id": c.TaskID, "domain": c.Domain, "username": c.Username,
		"password": pass, "source": c.Source, "note": c.Note,
		"created_at": c.CreatedAt, "updated_at": c.UpdatedAt,
	}
}

func (s *Server) taskCredentialTaskID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	t, ok := s.m.Task(r.PathValue("id"))
	if !ok {
		writeErr(w, 404, "task not found")
		return 0, false
	}
	id, err := strconv.ParseInt(t.ID, 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 500, "task id is not numeric")
		return 0, false
	}
	return id, true
}

func (s *Server) listTaskCredentials(w http.ResponseWriter, r *http.Request) {
	id, ok := s.taskCredentialTaskID(w, r)
	if !ok {
		return
	}
	list, err := s.m.PG().TaskCredentials(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, c := range list {
		out = append(out, taskCredentialDTO(c))
	}
	writeJSON(w, 200, out)
}

func (s *Server) addTaskCredential(w http.ResponseWriter, r *http.Request) {
	id, ok := s.taskCredentialTaskID(w, r)
	if !ok {
		return
	}
	var req taskCredentialReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "bad json: "+err.Error())
		return
	}
	if notify.IsMasked(req.Password) {
		writeErr(w, 400, "password is a masked placeholder; enter the real password")
		return
	}
	// source=user: manual adds from the UI (e.g. relaying an OTP-verified account).
	// An empty password stays allowed here — the "agent generates" mode.
	c, err := s.m.PG().UpsertTaskCredential(id, db.TaskCredentialInput{
		Domain: req.Domain, Username: req.Username, Password: req.Password,
		Source: "user", Note: req.Note,
	})
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	writeJSON(w, 201, taskCredentialDTO(c))
}

func (s *Server) deleteTaskCredential(w http.ResponseWriter, r *http.Request) {
	id, ok := s.taskCredentialTaskID(w, r)
	if !ok {
		return
	}
	cid, err := strconv.ParseInt(r.PathValue("cid"), 10, 64)
	if err != nil || cid <= 0 {
		writeErr(w, 400, "invalid credential id")
		return
	}
	if err := s.m.PG().DeleteTaskCredential(id, cid); err != nil {
		writeErr(w, 404, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
