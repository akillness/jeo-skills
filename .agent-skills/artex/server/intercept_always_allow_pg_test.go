package server

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
)

// PG test: needs a PostgreSQL database (ARTEX_PG_DSN); skipped without one.
// POST /api/intercept/pending/{id}/always-allow derives the rule from the
// stored row, never from the body, and leaves the request pending.
func TestInterceptAlwaysAllowPG(t *testing.T) {
	dsn, _, err := db.DSN()
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	d, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	m := &Manager{pg: d, interceptor: intercept.New(d)}
	s := &Server{m: m, jwtKey: []byte("always-allow-test-key")}
	h := s.Handler()
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	const scope = "always-allow-http"
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, scope)
		_, _ = d.Exec(`DELETE FROM intercept_rules WHERE name LIKE 'always-allow: %'`)
	})
	pending := func(tool, cmd string) int64 {
		t.Helper()
		input, _ := json.Marshal(map[string]string{"command": cmd})
		id, err := d.CreateInterceptPending(0, 0, scope, "test", tool, input, "ask")
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	post := func(id int64, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/intercept/pending/%d/always-allow", id), strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	ruleCount := func() int {
		t.Helper()
		rules, err := d.ListInterceptRules()
		if err != nil {
			t.Fatal(err)
		}
		return len(rules)
	}
	type result struct {
		Rule    db.InterceptRule `json:"rule"`
		Created bool             `json:"created"`
	}

	id := pending("Bash", "gh pr list --json title")
	before := ruleCount()
	// The body carries dummy tokens and another command: all of it is ignored.
	dummy := `{"pending_id":1,"command":"rm -rf /","pattern":"[\"rm\"]","token":"dummy-token","access_token":"dummy"}`
	rec := post(id, dummy)
	if rec.Code != 200 {
		t.Fatalf("always-allow: %d %s", rec.Code, rec.Body)
	}
	var got result
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	r := got.Rule
	if !got.Created || r.Pattern != `["gh","pr","list"]` || r.MatchType != "argv" || r.MatchTarget != "tool_input" ||
		r.Action != "allow" || !r.Enabled || r.Priority != -1000 || r.Name != "always-allow: gh pr list" ||
		!r.TimeoutEnabled || r.TimeoutSeconds != 60 || r.TimeoutAction != "deny" {
		t.Fatalf("rule %+v created=%v", r, got.Created)
	}
	if n := ruleCount(); n != before+1 {
		t.Fatalf("rule count %d, want %d", n, before+1)
	}
	if p, err := d.GetInterceptPending(id); err != nil || p == nil || p.Status != "pending" {
		t.Fatalf("pending row after always-allow: %+v %v", p, err)
	}
	// The cache was invalidated: the new rule matches at once.
	if dec, ok := m.interceptor.Match("Bash", []byte(`{"command":"gh pr list --limit 5"}`)); !ok || dec.RuleID != r.ID {
		t.Fatalf("match after creation: %+v %v", dec, ok)
	}

	// An identical rule is reused, not duplicated.
	rec = post(pending("Bash", "gh pr list"), "")
	var again result
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &again) != nil || again.Created || again.Rule.ID != r.ID {
		t.Fatalf("second always-allow: %d %s", rec.Code, rec.Body)
	}
	if n := ruleCount(); n != before+1 {
		t.Fatalf("rule count after reuse %d, want %d", n, before+1)
	}

	// Refusals: 400 and no rule.
	for name, c := range map[string][2]string{
		"not Bash":    {"shell_open", "gh pr list"},
		"compound":    {"Bash", "gh pr list; id"},
		"denylisted":  {"Bash", "python3.11 -c 'import os'"},
		"path to env": {"Bash", "/usr/bin/env gh pr list"},
	} {
		rid := pending(c[0], c[1])
		if rec := post(rid, dummy); rec.Code != 400 {
			t.Errorf("%s: %d %s, want 400", name, rec.Code, rec.Body)
		}
		if p, _ := d.GetInterceptPending(rid); p == nil || p.Status != "pending" {
			t.Errorf("%s: pending row changed: %+v", name, p)
		}
	}
	if n := ruleCount(); n != before+1 {
		t.Fatalf("rule count after refusals %d, want %d", n, before+1)
	}

	// A decided request is refused.
	decided := pending("Bash", "gh pr view 1")
	if err := d.DecideInterceptPending(decided, "denied"); err != nil {
		t.Fatal(err)
	}
	if rec := post(decided, ""); rec.Code != 409 {
		t.Fatalf("decided request: %d %s, want 409", rec.Code, rec.Body)
	}

	// The detail carries the prefix for the button label.
	req := httptest.NewRequest("GET", fmt.Sprintf("/api/intercept/history/%d", id), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	drec := httptest.NewRecorder()
	h.ServeHTTP(drec, req)
	var detail struct {
		Status            string `json:"status"`
		AlwaysAllowPrefix string `json:"always_allow_prefix"`
	}
	if drec.Code != 200 || json.Unmarshal(drec.Body.Bytes(), &detail) != nil || detail.AlwaysAllowPrefix != "gh pr list" || detail.Status != "pending" {
		t.Fatalf("detail: %d %s", drec.Code, drec.Body)
	}
}
