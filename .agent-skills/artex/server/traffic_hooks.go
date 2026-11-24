package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic"
	"github.com/Autumn-27/artex/traffic/rewrite"
)

// --- capture-proxy constrained Go tampering hooks (P4.2) ---
// Global configuration, operator/admin only, never exposed as an agent tool.
// Execution is opt-in behind ARTEX_TAMPER_HOOKS_ENABLED=1 (off by default).

type tamperHookReq struct {
	Name     string           `json:"name"`
	Enabled  bool             `json:"enabled"`
	Phase    rewrite.Phase    `json:"phase"`
	Priority int              `json:"priority"`
	Matchers rewrite.Matchers `json:"matchers"`
	Source   string           `json:"source"`
	Note     string           `json:"note"`
}

type tamperHookDTO struct {
	ID           int64              `json:"id"`
	Name         string             `json:"name"`
	Enabled      bool               `json:"enabled"`
	Phase        string             `json:"phase"`
	Priority     int                `json:"priority"`
	Matchers     rewrite.Matchers   `json:"matchers"`
	Source       string             `json:"source"`
	SourceSHA256 string             `json:"source_sha256"`
	Version      int                `json:"version"`
	Note         string             `json:"note"`
	CreatedAt    time.Time          `json:"created_at"`
	UpdatedAt    time.Time          `json:"updated_at"`
	LoadError    string             `json:"load_error,omitempty"`
	LastError    *rewrite.LastError `json:"last_error,omitempty"`
}

type tamperHookVersionDTO struct {
	ID           int64            `json:"id"`
	HookID       int64            `json:"hook_id"`
	Version      int              `json:"version"`
	Name         string           `json:"name"`
	Phase        string           `json:"phase"`
	Priority     int              `json:"priority"`
	Matchers     rewrite.Matchers `json:"matchers"`
	Source       string           `json:"source"`
	SourceSHA256 string           `json:"source_sha256"`
	Note         string           `json:"note"`
	CreatedAt    time.Time        `json:"created_at"`
}

type tamperDryRunReq struct {
	HookID   int64            `json:"hook_id,omitempty"`
	Name     string           `json:"name,omitempty"`
	Phase    rewrite.Phase    `json:"phase,omitempty"`
	Matchers rewrite.Matchers `json:"matchers"`
	Source   string           `json:"source,omitempty"`
	Request  struct {
		Method  string              `json:"method"`
		URL     string              `json:"url"`
		Headers map[string][]string `json:"headers"`
		Body    string              `json:"body"`
	} `json:"request"`
	Response struct {
		Status  int                 `json:"status"`
		Headers map[string][]string `json:"headers"`
		Body    string              `json:"body"`
	} `json:"response"`
}

var errTamperHookInvalid = errors.New("invalid tampering hook")

func tamperHookInvalid(err error) error { return fmt.Errorf("%w: %v", errTamperHookInvalid, err) }

func tamperHookWriteErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		writeErr(w, 404, "tampering hook not found")
	case errors.Is(err, errTamperHookInvalid), errors.Is(err, db.ErrTrafficTamperHookLimit), errors.Is(err, db.ErrTrafficTamperHookEnabledLimit):
		writeErr(w, 400, err.Error())
	default:
		writeErr(w, 500, err.Error())
	}
}

func decodeTamperHookRow(row db.TrafficTamperHook) (traffic.HookDef, error) {
	var m rewrite.Matchers
	if len(row.Matchers) > 0 {
		if err := json.Unmarshal(row.Matchers, &m); err != nil {
			return traffic.HookDef{}, err
		}
	}
	return traffic.HookDef{
		ID: row.ID, Name: row.Name, Enabled: row.Enabled, Phase: rewrite.Phase(row.Phase),
		Priority: row.Priority, Matchers: m, Source: row.Source, SourceSHA256: row.SourceSHA256,
		Version: row.Version, Note: row.Note,
	}, nil
}

func (m *Manager) tamperHookDTO(row db.TrafficTamperHook) tamperHookDTO {
	var matchers rewrite.Matchers
	_ = json.Unmarshal(row.Matchers, &matchers)
	out := tamperHookDTO{
		ID: row.ID, Name: row.Name, Enabled: row.Enabled, Phase: row.Phase,
		Priority: row.Priority, Matchers: matchers, Source: row.Source,
		SourceSHA256: row.SourceSHA256, Version: row.Version, Note: row.Note,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
	m.hookMu.Lock()
	if m.hookLoadErrs != nil {
		out.LoadError = m.hookLoadErrs[row.ID]
	}
	m.hookMu.Unlock()
	if hs := m.hookSet.Load(); hs != nil {
		out.LastError = hs.LastError(row.ID)
	}
	return out
}

// reloadTamperHooks compiles enabled hooks into an immutable snapshot and swaps
// it onto the capture proxy. When ARTEX_TAMPER_HOOKS_ENABLED is off (default),
// zero hooks are loaded and the proxy receives nil (baseline fast path).
func (m *Manager) reloadTamperHooks() {
	m.hookMu.Lock()
	defer m.hookMu.Unlock()
	if !traffic.TamperHooksEnabledFromEnv() {
		m.hookLoadErrs = nil
		m.hookSet.Store(nil)
		if m.traffic != nil {
			m.traffic.SetTamperHooks(nil)
		}
		return
	}
	rows, err := m.pg.ListTrafficTamperHooks()
	if err != nil {
		log.Printf("[traffic] tampering hooks not reloaded: %v", err)
		return
	}
	defs := make([]traffic.HookDef, 0, len(rows))
	decodeErrs := map[int64]string{}
	for _, row := range rows {
		d, err := decodeTamperHookRow(row)
		if err != nil {
			if row.Enabled {
				decodeErrs[row.ID] = "the stored hook cannot be decoded"
			}
			continue
		}
		defs = append(defs, d)
	}
	hs, loadErrs := traffic.CompileHooks(defs, db.TrafficTraceKey())
	for id, msg := range decodeErrs {
		loadErrs[id] = msg
	}
	for id, msg := range loadErrs {
		log.Printf("[traffic] tampering hook %d not loaded: %s", id, msg)
	}
	m.hookLoadErrs = loadErrs
	m.hookSet.Store(hs)
	if m.traffic != nil {
		m.traffic.SetTamperHooks(hs)
	}
}

func (s *Server) tamperListHooks(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	rows, err := pg.ListTrafficTamperHooks()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	hooks := make([]tamperHookDTO, 0, len(rows))
	for _, row := range rows {
		hooks = append(hooks, s.m.tamperHookDTO(row))
	}
	writeJSON(w, 200, map[string]any{
		"hooks":          hooks,
		"enabled_by_env": traffic.TamperHooksEnabledFromEnv(),
	})
}

func (s *Server) tamperCreateHook(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req tamperHookReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	def := traffic.HookDef{
		Name: req.Name, Enabled: false, Phase: req.Phase, Priority: req.Priority,
		Matchers: req.Matchers, Source: req.Source, Note: req.Note,
	}
	if err := traffic.ValidateHookDef(def); err != nil {
		tamperHookWriteErr(w, tamperHookInvalid(err))
		return
	}
	matchersJSON, _ := json.Marshal(req.Matchers)
	row, err := pg.CreateTrafficTamperHook(db.TrafficTamperHook{
		Name: req.Name, Enabled: false, Phase: string(req.Phase), Priority: req.Priority,
		Matchers: matchersJSON, Source: req.Source, Note: req.Note,
	})
	if err != nil {
		tamperHookWriteErr(w, err)
		return
	}
	s.m.reloadTamperHooks()
	writeJSON(w, 200, s.m.tamperHookDTO(row))
}

func (s *Server) tamperUpdateHook(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid hook id")
		return
	}
	var req tamperHookReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	def := traffic.HookDef{
		ID: id, Name: req.Name, Enabled: req.Enabled, Phase: req.Phase, Priority: req.Priority,
		Matchers: req.Matchers, Source: req.Source, Note: req.Note,
	}
	if err := traffic.ValidateHookDef(def); err != nil {
		tamperHookWriteErr(w, tamperHookInvalid(err))
		return
	}
	matchersJSON, _ := json.Marshal(req.Matchers)
	row, err := pg.UpdateTrafficTamperHook(id, func(stored db.TrafficTamperHook) (db.TrafficTamperHook, error) {
		return db.TrafficTamperHook{
			Name: req.Name, Enabled: req.Enabled, Phase: string(req.Phase), Priority: req.Priority,
			Matchers: matchersJSON, Source: req.Source, Note: req.Note,
		}, nil
	})
	if err != nil {
		tamperHookWriteErr(w, err)
		return
	}
	s.m.reloadTamperHooks()
	writeJSON(w, 200, s.m.tamperHookDTO(row))
}

func (s *Server) tamperDeleteHook(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid hook id")
		return
	}
	if err := pg.DeleteTrafficTamperHook(id); err != nil {
		tamperHookWriteErr(w, err)
		return
	}
	s.m.reloadTamperHooks()
	writeJSON(w, 200, map[string]any{"deleted": true})
}

func (s *Server) tamperToggleHook(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid hook id")
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := pg.ToggleTrafficTamperHook(id, body.Enabled); err != nil {
		tamperHookWriteErr(w, err)
		return
	}
	row, err := pg.GetTrafficTamperHook(id)
	if err != nil {
		tamperHookWriteErr(w, err)
		return
	}
	s.m.reloadTamperHooks()
	writeJSON(w, 200, s.m.tamperHookDTO(row))
}

func (s *Server) tamperListHookVersions(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid hook id")
		return
	}
	if _, err := pg.GetTrafficTamperHook(id); err != nil {
		tamperHookWriteErr(w, err)
		return
	}
	vers, err := pg.ListTrafficTamperHookVersions(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	out := make([]tamperHookVersionDTO, 0, len(vers))
	for _, v := range vers {
		var m rewrite.Matchers
		_ = json.Unmarshal(v.Matchers, &m)
		out = append(out, tamperHookVersionDTO{
			ID: v.ID, HookID: v.HookID, Version: v.Version, Name: v.Name,
			Phase: v.Phase, Priority: v.Priority, Matchers: m, Source: v.Source,
			SourceSHA256: v.SourceSHA256, Note: v.Note, CreatedAt: v.CreatedAt,
		})
	}
	writeJSON(w, 200, map[string]any{"versions": out})
}

func (s *Server) tamperRollbackHook(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid hook id")
		return
	}
	var body struct {
		Version int `json:"version"`
	}
	if err := decode(w, r, &body); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if body.Version <= 0 {
		writeErr(w, 400, "version must be > 0")
		return
	}
	row, err := pg.RollbackTrafficTamperHook(id, body.Version)
	if err != nil {
		tamperHookWriteErr(w, err)
		return
	}
	s.m.reloadTamperHooks()
	writeJSON(w, 200, s.m.tamperHookDTO(row))
}

func (s *Server) tamperDryRunHook(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req tamperDryRunReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	var def traffic.HookDef
	if req.HookID > 0 {
		row, err := pg.GetTrafficTamperHook(req.HookID)
		if err != nil {
			tamperHookWriteErr(w, err)
			return
		}
		def, err = decodeTamperHookRow(row)
		if err != nil {
			writeErr(w, 400, "stored hook cannot be decoded")
			return
		}
	} else {
		name := req.Name
		if name == "" {
			name = "dry-run"
		}
		def = traffic.HookDef{
			Name: name, Phase: req.Phase, Matchers: req.Matchers, Source: req.Source, Version: 1,
		}
	}

	rawURL := req.Request.URL
	if rawURL == "" {
		rawURL = "https://example.test/"
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		writeErr(w, 400, "invalid request.url: "+err.Error())
		return
	}
	method := req.Request.Method
	if method == "" {
		method = http.MethodGet
	}
	status := req.Response.Status
	if status == 0 {
		status = http.StatusOK
	}
	reqHdr := http.Header{}
	for k, vs := range req.Request.Headers {
		reqHdr[http.CanonicalHeaderKey(k)] = append([]string(nil), vs...)
	}
	respHdr := http.Header{}
	for k, vs := range req.Response.Headers {
		respHdr[http.CanonicalHeaderKey(k)] = append([]string(nil), vs...)
	}

	res, err := traffic.DryRunHook(def, rewrite.Input{
		Request:  rewrite.Request{Method: method, URL: u, Header: reqHdr, Body: []byte(req.Request.Body)},
		Response: rewrite.Response{Status: status, Header: respHdr, Body: []byte(req.Response.Body)},
	}, db.TrafficTraceKey())
	if err != nil {
		tamperHookWriteErr(w, tamperHookInvalid(err))
		return
	}
	writeJSON(w, 200, map[string]any{
		"changed": res.Changed,
		"request": map[string]any{
			"method":  res.Request.Method,
			"url":     res.Request.URL.String(),
			"headers": res.Request.Header,
			"body":    string(res.Request.Body),
		},
		"response": map[string]any{
			"status":  res.Response.Status,
			"headers": res.Response.Header,
			"body":    string(res.Response.Body),
		},
		"lines": res.Lines,
	})
}
