package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
)

// Pure parameter validation: runs without Postgres.
func TestInterceptFilterParamsDecidedBy(t *testing.T) {
	for _, actor := range []string{"", "human", "rule", "model", "system"} {
		filter, err := interceptFilterParams(url.Values{"decided_by": {actor}})
		if err != nil || filter.DecidedBy != actor {
			t.Fatalf("decided_by=%q: %+v err=%v", actor, filter, err)
		}
	}
	for _, actor := range []string{"invalid", "MODEL", "unknown", "human' OR 1=1 --"} {
		if _, err := interceptFilterParams(url.Values{"decided_by": {actor}}); err == nil {
			t.Fatalf("decided_by=%q accepted", actor)
		}
	}
}

// Drives every real writer (rule/model log, HTTP decide, timeout, cancellation)
// and reads the actor back through the HTTP lists.
func TestInterceptDecidedByHTTP(t *testing.T) {
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
	s := &Server{m: m, jwtKey: []byte("approval-decided-by-test-key")}
	h := s.Handler()
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	scope := "approval-http-decided-by"
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1`, scope) })
	rule, err := d.CreateInterceptRule("decided-by http fixture", "tool_name", "string", "Bash", "deny", "fixture", 1, false, false, 0, "deny")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM intercept_rules WHERE id=$1`, rule.ID) })
	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// Every step below adds exactly one row to the scope; added returns it.
	want := map[int64]string{}
	added := func(actor, status string) int64 {
		t.Helper()
		rows, err := d.ListTaskIntercepts(scope)
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range rows {
			if _, known := want[r.ID]; known {
				continue
			}
			if r.Status != status {
				t.Fatalf("new row %d has status %q, want %q", r.ID, r.Status, status)
			}
			want[r.ID] = actor
			return r.ID
		}
		t.Fatalf("no new row for %s/%s", actor, status)
		return 0
	}
	ctx := intercept.WithTaskContext(context.Background(), scope, "test", nil)
	input := []byte(`{"command":"fixture"}`)
	modelAsk := intercept.Decision{Action: "ask", Message: db.ModelReasonPrefix + " confirm"}

	m.interceptor.Log(ctx, 0, intercept.Decision{Action: "deny", RuleID: rule.ID, Message: "fixture"}, "Bash", input, "denied")
	ruleID := added("rule", "denied")
	m.interceptor.Log(ctx, 0, intercept.Decision{Action: "allow", Message: db.ModelReasonPrefix + " fixture"}, "Bash", input, "allowed")
	modelID := added("model", "allowed")

	for _, decision := range []string{"allowed", "denied"} {
		id, err := d.CreateInterceptPending(0, 0, scope, "test", "Bash", input, modelAsk.Message)
		if err != nil {
			t.Fatal(err)
		}
		if r := do(http.MethodPost, fmt.Sprintf("/api/intercept/pending/%d/decide", id), `{"decision":"`+decision+`"}`); r.Code != 200 {
			t.Fatalf("decide %s: %d %s", decision, r.Code, r.Body.String())
		}
		if got := added("human", decision); got != id {
			t.Fatalf("decided row %d, want %d", got, id)
		}
	}

	timed := modelAsk
	timed.TimeoutEnabled, timed.TimeoutSeconds, timed.TimeoutAction = true, 1, "deny"
	if m.interceptor.HandleAsk(ctx, 0, timed, "Bash", input) {
		t.Fatal("timeout policy deny allowed the call")
	}
	added("system", "timeout")

	// Work cancelled: a system refusal recorded with status 'denied', on both
	// the no-timeout and the timeout-armed wait.
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if m.interceptor.HandleAsk(cancelled, 0, modelAsk, "Bash", input) {
		t.Fatal("cancelled ask allowed the call")
	}
	added("system", "denied")
	timed.TimeoutSeconds = 60
	if m.interceptor.HandleAsk(cancelled, 0, timed, "Bash", input) {
		t.Fatal("cancelled timed ask allowed the call")
	}
	added("system", "denied")

	if _, err := d.CreateInterceptPending(0, 0, scope, "test", "Bash", input, modelAsk.Message); err != nil {
		t.Fatal(err)
	}
	added("", "pending")

	type item struct {
		ID        int64   `json:"id"`
		Status    string  `json:"status"`
		DecidedBy *string `json:"decided_by"`
	}
	list := func(path string) (items []item, total int) {
		t.Helper()
		rec := do(http.MethodGet, path, "")
		var body struct {
			Items []item `json:"items"`
			Total int    `json:"total"`
		}
		if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &body) != nil {
			t.Fatalf("%s: %d %s", path, rec.Code, rec.Body.String())
		}
		for _, it := range body.Items {
			if it.DecidedBy == nil {
				t.Fatalf("%s: item %d has no decided_by field", path, it.ID)
			}
		}
		return body.Items, body.Total
	}
	task := "/api/intercept/task/" + scope
	items, total := list(task)
	if total != len(want) || len(items) != len(want) {
		t.Fatalf("task list: total=%d items=%d want=%d", total, len(items), len(want))
	}
	for _, it := range items {
		if *it.DecidedBy != want[it.ID] {
			t.Fatalf("item %d (%s) decided_by=%q, want %q", it.ID, it.Status, *it.DecidedBy, want[it.ID])
		}
	}

	for _, tc := range []struct {
		query string
		total int
	}{
		{"?decided_by=model", 1},
		{"?decided_by=rule", 1},
		{"?decided_by=human", 2},
		{"?decided_by=system", 3},
		{"?status=denied&decided_by=human", 1},
		{"?status=denied&decided_by=system", 2},
		{"?status=timeout&decided_by=model", 0},
	} {
		items, total := list(task + tc.query)
		if total != tc.total || len(items) != tc.total {
			t.Fatalf("%s: total=%d items=%d want=%d", tc.query, total, len(items), tc.total)
		}
		for _, it := range items {
			if !strings.Contains(tc.query, "decided_by="+*it.DecidedBy) {
				t.Fatalf("%s returned item %d decided by %q", tc.query, it.ID, *it.DecidedBy)
			}
		}
	}
	if items, _ := list(task + "?decided_by=model"); len(items) != 1 || items[0].ID != modelID {
		t.Fatalf("decided_by=model returned %+v, want only %d", items, modelID)
	}
	// The global history holds other tests' rows too: none of this test's human,
	// rule or system decisions may surface under decided_by=model.
	items, _ = list("/api/intercept/history?size=100&decided_by=model")
	for _, it := range items {
		if actor, mine := want[it.ID]; *it.DecidedBy != "model" || mine && actor != "model" {
			t.Fatalf("history decided_by=model returned item %d (%s) decided by %q", it.ID, it.Status, *it.DecidedBy)
		}
	}

	for _, base := range []string{"/api/intercept/history", task} {
		for _, query := range []string{"?decided_by=invalid", "?decided_by=MODEL", "?decided_by=unknown", "?page=1&decided_by=human%27+OR+1%3D1--"} {
			if rec := do(http.MethodGet, base+query, ""); rec.Code != 400 {
				t.Fatalf("invalid filter %s%s: %d %s", base, query, rec.Code, rec.Body.String())
			}
		}
	}

	// A row decided before the column existed keeps an empty decided_by; its
	// decision_source stays in its own field and no decided_by filter returns it.
	if _, err := d.Exec(`UPDATE intercept_pending SET decided_by='' WHERE id=$1`, ruleID); err != nil {
		t.Fatal(err)
	}
	rec := do(http.MethodGet, fmt.Sprintf("/api/intercept/history/%d", ruleID), "")
	var legacy struct {
		DecidedBy      *string `json:"decided_by"`
		DecisionSource string  `json:"decision_source"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &legacy) != nil ||
		legacy.DecidedBy == nil || *legacy.DecidedBy != "" || legacy.DecisionSource != "rule" {
		t.Fatalf("legacy detail: %d %s", rec.Code, rec.Body.String())
	}
	if items, total := list(task + "?decided_by=rule"); total != 0 || len(items) != 0 {
		t.Fatalf("legacy row matched decided_by=rule: %+v", items)
	}
	items, _ = list(task + "?decision_source=rule")
	if len(items) != 1 || items[0].ID != ruleID || *items[0].DecidedBy != "" {
		t.Fatalf("legacy row under decision_source=rule: %+v", items)
	}
}
