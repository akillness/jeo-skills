package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic/rewrite"
)

// --- capture-proxy rewrite rules ---
//
// Global rules, admin only, never an agent tool. This layer stores, validates
// and compiles them and hands the compiled snapshot to the proxy; the proxy
// does not apply rewrite rules yet.

// rewriteActionDTO is an action on the wire. The value of a sensitive action is
// never returned: a read leaves Value out and sets ValueSet. On update, a
// sensitive action sent without a value keeps the stored one, provided the
// stored rule has exactly one sensitive action of the same type, canonical
// header name and regex, wherever it stands; none or several is refused.
type rewriteActionDTO struct {
	Type      string  `json:"type"`
	Name      string  `json:"name,omitempty"`
	Regex     string  `json:"regex,omitempty"`
	Value     *string `json:"value,omitempty"`
	Sensitive bool    `json:"sensitive,omitempty"`
	ValueSet  bool    `json:"value_set,omitempty"`
}

type rewriteRuleReq struct {
	Name     string             `json:"name"`
	Enabled  bool               `json:"enabled"`
	Phase    rewrite.Phase      `json:"phase"`
	Priority int                `json:"priority"`
	Matchers rewrite.Matchers   `json:"matchers"`
	Actions  []rewriteActionDTO `json:"actions"`
	Note     string             `json:"note"`
}

type rewriteRuleDTO struct {
	ID        int64              `json:"id"`
	Name      string             `json:"name"`
	Enabled   bool               `json:"enabled"`
	Phase     string             `json:"phase"`
	Priority  int                `json:"priority"`
	Matchers  rewrite.Matchers   `json:"matchers"`
	Actions   []rewriteActionDTO `json:"actions"`
	Note      string             `json:"note"`
	CreatedAt time.Time          `json:"created_at"`
	UpdatedAt time.Time          `json:"updated_at"`
	// LoadError is why an enabled rule is left out of the running snapshot.
	LoadError string `json:"load_error,omitempty"`
	// LastError is the rule's most recent run-time error, kept in memory only.
	LastError *rewrite.LastError `json:"last_error,omitempty"`
}

// errRewriteInvalid marks a rule the validation refuses (HTTP 400).
var errRewriteInvalid = errors.New("invalid rewrite rule")

const rewriteUndecodable = "the stored rule cannot be decoded"

// decodeRewriteRule turns a stored row into the engine's rule.
func decodeRewriteRule(row db.TrafficRewriteRule) (rewrite.Rule, error) {
	r := rewrite.Rule{ID: row.ID, Name: row.Name, Enabled: row.Enabled, Phase: rewrite.Phase(row.Phase), Priority: row.Priority, Note: row.Note}
	if err := json.Unmarshal(row.Matchers, &r.Matchers); err != nil {
		return r, err
	}
	return r, json.Unmarshal(row.Actions, &r.Actions)
}

func encodeRewriteRule(r rewrite.Rule) db.TrafficRewriteRule {
	matchers, _ := json.Marshal(r.Matchers)
	actions, _ := json.Marshal(r.Actions)
	return db.TrafficRewriteRule{Name: r.Name, Enabled: r.Enabled, Phase: string(r.Phase), Priority: r.Priority, Matchers: matchers, Actions: actions, Note: r.Note}
}

// rule builds the rule a request describes. stored is the rule being updated,
// nil on create: it supplies the sensitive values the request left out.
//
// A stored sensitive value is not written to a new destination: when one is
// kept, the host matcher must not change (compared case-insensitively). The
// url_regex matcher is not compared, an accepted limit: a kept value can follow
// a rule whose url_regex changes on the same host.
func (req rewriteRuleReq) rule(stored *rewrite.Rule) (rewrite.Rule, error) {
	r := rewrite.Rule{Name: req.Name, Enabled: req.Enabled, Phase: req.Phase, Priority: req.Priority, Matchers: req.Matchers, Note: req.Note}
	kept := false
	for i, a := range req.Actions {
		out := rewrite.Action{Type: a.Type, Name: a.Name, Regex: a.Regex, Sensitive: a.Sensitive}
		switch {
		case a.Value != nil:
			out.Value = *a.Value
		case a.Sensitive && a.Type != rewrite.ActionDeleteHeader:
			if stored == nil {
				return r, fmt.Errorf("action %d (%s): a sensitive action needs a value", i+1, a.Type)
			}
			var match []rewrite.Action
			for _, old := range stored.Actions {
				if old.Sensitive && old.Type == a.Type && http.CanonicalHeaderKey(old.Name) == http.CanonicalHeaderKey(a.Name) && old.Regex == a.Regex {
					match = append(match, old)
				}
			}
			if len(match) != 1 {
				return r, fmt.Errorf("action %d (%s): %d stored sensitive actions match its type, header name and regex, exactly one is needed to keep a value: send the value", i+1, a.Type, len(match))
			}
			out.Value = match[0].Value
			kept = true
		}
		r.Actions = append(r.Actions, out)
	}
	if kept && !strings.EqualFold(stored.Matchers.Host, req.Matchers.Host) {
		return r, errors.New("destination changed (host matcher) while a stored sensitive value was kept: send the value again or clear it; stored secrets are not written to a new destination")
	}
	return r, nil
}

// rewriteRuleDTO renders a stored row without the value of any sensitive action.
func (m *Manager) rewriteRuleDTO(row db.TrafficRewriteRule) rewriteRuleDTO {
	out := rewriteRuleDTO{ID: row.ID, Name: row.Name, Enabled: row.Enabled, Phase: row.Phase, Priority: row.Priority,
		Actions: []rewriteActionDTO{}, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
	r, err := decodeRewriteRule(row)
	if err != nil {
		out.LoadError = rewriteUndecodable
		return out
	}
	out.Matchers = r.Matchers
	for _, a := range r.Actions {
		d := rewriteActionDTO{Type: a.Type, Name: a.Name, Regex: a.Regex, Sensitive: a.Sensitive}
		if a.Sensitive {
			d.ValueSet = a.Type != rewrite.ActionDeleteHeader
		} else {
			v := a.Value
			d.Value = &v
		}
		out.Actions = append(out.Actions, d)
	}
	out.LoadError = m.rewriteSet.Load().LoadErrors()[row.ID]
	if e, ok := m.rewriteErrors.Get(row.ID); ok {
		out.LastError = &e
	}
	return out
}

// reloadRewriteRules compiles the stored rules and publishes the snapshot to
// the proxy. It runs at startup once the traffic store is open, and after every
// rule change. On a read failure the previous snapshot stays.
func (m *Manager) reloadRewriteRules() {
	m.rewriteMu.Lock()
	defer m.rewriteMu.Unlock()
	rows, err := m.pg.ListTrafficRewriteRules()
	if err != nil {
		log.Printf("[traffic] rewrite rules not reloaded: %v", err)
		return
	}
	rules := make([]rewrite.Rule, 0, len(rows))
	for _, row := range rows {
		r, err := decodeRewriteRule(row)
		if err != nil {
			log.Printf("[traffic] rewrite rule %d not loaded: %s", row.ID, rewriteUndecodable)
			continue
		}
		rules = append(rules, r)
	}
	set := rewrite.Compile(rules, rewrite.Options{TraceKey: db.TrafficTraceKey(), Errors: &m.rewriteErrors})
	for id, reason := range set.LoadErrors() {
		log.Printf("[traffic] rewrite rule %d not loaded: %s", id, reason)
	}
	m.rewriteSet.Store(set)
	if m.traffic != nil {
		m.traffic.SetRewriteRules(set)
	}
}

// rewriteWriteErr answers a failed rule write.
func rewriteWriteErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		writeErr(w, 404, "rewrite rule not found")
	case errors.Is(err, errRewriteInvalid), errors.Is(err, db.ErrTrafficRewriteRuleLimit), errors.Is(err, db.ErrTrafficRewriteEnabledLimit):
		writeErr(w, 400, err.Error())
	default:
		writeErr(w, 500, err.Error())
	}
}

func rewriteInvalid(err error) error { return fmt.Errorf("%w: %v", errRewriteInvalid, err) }

func (s *Server) rewriteListRules(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	rows, err := pg.ListTrafficRewriteRules()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	rules := make([]rewriteRuleDTO, 0, len(rows))
	for _, row := range rows {
		rules = append(rules, s.m.rewriteRuleDTO(row))
	}
	writeJSON(w, 200, map[string]any{"rules": rules})
}

// rewriteCreateRule creates a rule disabled, whatever the request says: a rule
// is enabled by the toggle or by an update.
func (s *Server) rewriteCreateRule(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req rewriteRuleReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	rule, err := req.rule(nil)
	if err == nil {
		rule.Enabled = false
		err = rewrite.Validate(rule)
	}
	if err != nil {
		rewriteWriteErr(w, rewriteInvalid(err))
		return
	}
	row, err := pg.CreateTrafficRewriteRule(encodeRewriteRule(rule))
	if err != nil {
		rewriteWriteErr(w, err)
		return
	}
	s.m.reloadRewriteRules()
	writeJSON(w, 200, s.m.rewriteRuleDTO(row))
}

func (s *Server) rewriteUpdateRule(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, 400, "bad rule id")
		return
	}
	var req rewriteRuleReq
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	row, err := pg.UpdateTrafficRewriteRule(id, func(stored db.TrafficRewriteRule) (db.TrafficRewriteRule, error) {
		var keep *rewrite.Rule
		if old, err := decodeRewriteRule(stored); err == nil {
			keep = &old
		}
		rule, err := req.rule(keep)
		if err == nil {
			err = rewrite.Validate(rule)
		}
		if err != nil {
			return stored, rewriteInvalid(err)
		}
		return encodeRewriteRule(rule), nil
	})
	if err != nil {
		rewriteWriteErr(w, err)
		return
	}
	s.m.rewriteErrors.Forget(id)
	s.m.reloadRewriteRules()
	writeJSON(w, 200, s.m.rewriteRuleDTO(row))
}

func (s *Server) rewriteDeleteRule(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, 400, "bad rule id")
		return
	}
	if err := pg.DeleteTrafficRewriteRule(id); err != nil {
		rewriteWriteErr(w, err)
		return
	}
	s.m.rewriteErrors.Forget(id)
	s.m.reloadRewriteRules()
	writeJSON(w, 200, map[string]any{"deleted": id})
}

func (s *Server) rewriteToggleRule(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, 400, "bad rule id")
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := decode(w, r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.Enabled {
		// A rule saved under older validation rules is checked again before it runs.
		stored, err := pg.GetTrafficRewriteRule(id)
		if err != nil {
			rewriteWriteErr(w, err)
			return
		}
		rule, err := decodeRewriteRule(stored)
		if err == nil {
			err = rewrite.Validate(rule)
		}
		if err != nil {
			rewriteWriteErr(w, rewriteInvalid(err))
			return
		}
	}
	if err := pg.ToggleTrafficRewriteRule(id, req.Enabled); err != nil {
		rewriteWriteErr(w, err)
		return
	}
	s.m.reloadRewriteRules()
	writeJSON(w, 200, map[string]any{"ok": true, "enabled": req.Enabled})
}
