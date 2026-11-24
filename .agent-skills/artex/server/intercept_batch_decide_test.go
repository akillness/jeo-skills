package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/intercept"
)

func TestInterceptBatchDecideHTTP(t *testing.T) {
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
	s := &Server{m: m, jwtKey: []byte("approval-batch-decide-test-key")}
	h := s.Handler()
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	scope := "approval-http-batch-decide"
	// A target request needs a numeric task scope; no foreign key ties it to tasks.
	targetTask := 900000000 + time.Now().UnixNano()%1000000
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM intercept_pending WHERE task_id=$1 OR task_id=$2`, scope, strconv.FormatInt(targetTask, 10))
	})
	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	pending := func(cmd string) int64 {
		t.Helper()
		input, _ := json.Marshal(map[string]string{"command": cmd})
		id, err := d.CreateInterceptPending(0, 0, scope, "test", "Bash", input, "fixture")
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	id1, id2, id3 := pending("ls"), pending("nmap -sV target.example"), pending("sudo rm -rf / ; cat /etc/shadow")

	// The pending JSON keeps every historical field and adds risk.
	var historical map[string]any
	raw, _ := json.Marshal(db.InterceptPending{})
	_ = json.Unmarshal(raw, &historical)
	checkFields := func(where string, item map[string]any) {
		t.Helper()
		for key := range historical {
			if _, ok := item[key]; !ok {
				t.Errorf("%s: field %q missing from %v", where, key, item)
			}
		}
		risk, ok := item["risk"].(map[string]any)
		if !ok || risk["level"] == nil || risk["score"] == nil || risk["reasons"] == nil {
			t.Errorf("%s: risk = %v", where, item["risk"])
		}
	}
	var list struct {
		Pending []map[string]any `json:"pending"`
	}
	if r := do(http.MethodGet, "/api/intercept/pending", ""); r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &list) != nil {
		t.Fatalf("list pending: %d %s", r.Code, r.Body.String())
	}
	levels := map[int64]string{}
	for _, item := range list.Pending {
		id := int64(item["id"].(float64))
		if id == id1 || id == id2 || id == id3 {
			checkFields("list", item)
			levels[id] = item["risk"].(map[string]any)["level"].(string)
		}
	}
	if levels[id1] != "low" || levels[id2] != "medium" || levels[id3] != "high" {
		t.Fatalf("risk levels = %v, want low/medium/high", levels)
	}
	var one map[string]any
	if r := do(http.MethodGet, fmt.Sprintf("/api/intercept/pending/%d", id3), ""); r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &one) != nil {
		t.Fatalf("get pending: %d %s", r.Code, r.Body.String())
	}
	checkFields("get", one)

	type result struct {
		ID    int64  `json:"id"`
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	type batchResponse struct {
		Decided int      `json:"decided"`
		Failed  int      `json:"failed"`
		Results []result `json:"results"`
	}
	batch := func(body string) batchResponse {
		t.Helper()
		r := do(http.MethodPost, "/api/intercept/pending/batch-decide", body)
		var out batchResponse
		if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &out) != nil {
			t.Fatalf("batch %s: %d %s", body, r.Code, r.Body.String())
		}
		return out
	}

	// Duplicates are decided once.
	out := batch(fmt.Sprintf(`{"ids":[%d,%d,%d],"decision":"allowed"}`, id1, id2, id1))
	if out.Decided != 2 || out.Failed != 0 || len(out.Results) != 2 || out.Results[0] != (result{ID: id1, OK: true}) || out.Results[1] != (result{ID: id2, OK: true}) {
		t.Fatalf("allow batch = %+v", out)
	}
	// An already decided id fails alone; the rest of the batch is decided.
	out = batch(fmt.Sprintf(`{"ids":[%d,%d],"decision":"denied"}`, id1, id3))
	if out.Decided != 1 || out.Failed != 1 || len(out.Results) != 2 ||
		out.Results[0].ID != id1 || out.Results[0].OK || !strings.Contains(out.Results[0].Error, "already") ||
		out.Results[1] != (result{ID: id3, OK: true}) {
		t.Fatalf("deny batch = %+v", out)
	}
	for id, want := range map[int64]string{id1: "allowed", id2: "allowed", id3: "denied"} {
		p, err := d.GetInterceptPending(id)
		if err != nil || p == nil || p.Status != want || p.DecidedBy != "human" || p.DecidedAt == nil {
			t.Fatalf("row %d = %+v err=%v, want %s by human with decided_at", id, p, err, want)
		}
	}

	// A target request without an address cannot be approved: it fails and
	// stays pending, the other id in the batch is still approved.
	empty, created, err := d.FindOrCreateTargetRequest(db.TargetRequest{
		Scope: db.TargetScopeRef{TaskID: targetTask}, Host: "empty.example.com", Port: 443,
		ToolName: "WebFetch", ToolInput: []byte(`{"url":"https://empty.example.com/"}`), Reason: "test",
		Audit: &db.InterceptAudit{Targets: []db.InterceptTarget{{Host: "empty.example.com", Port: 443, Outcome: "requested"}}},
	})
	if err != nil || !created {
		t.Fatalf("open target request: id=%d created=%v err=%v", empty, created, err)
	}
	id4 := pending("echo ok")
	out = batch(fmt.Sprintf(`{"ids":[%d,%d],"decision":"allowed"}`, empty, id4))
	if out.Decided != 1 || out.Failed != 1 || out.Results[0].OK || out.Results[0].Error != db.ErrTargetPinEmpty.Error() ||
		out.Results[1] != (result{ID: id4, OK: true}) {
		t.Fatalf("empty pin batch = %+v", out)
	}
	if p, err := d.GetInterceptPending(empty); err != nil || p == nil || p.Status != "pending" {
		t.Fatalf("refused target request = %+v err=%v, want pending", p, err)
	}

	ids101 := make([]string, 101)
	for i := range ids101 {
		ids101[i] = strconv.Itoa(i + 1)
	}
	for _, body := range []string{
		`{"ids":[],"decision":"allowed"}`,
		`{"decision":"allowed"}`,
		`{"ids":[` + strings.Join(ids101, ",") + `],"decision":"allowed"}`,
		`{"ids":[0],"decision":"allowed"}`,
		`{"ids":[-3],"decision":"denied"}`,
		`{"ids":["7"],"decision":"allowed"}`,
		`{"ids":[1.5],"decision":"allowed"}`,
		fmt.Sprintf(`{"ids":[%d],"decision":"maybe"}`, id4),
		`not json`,
	} {
		if r := do(http.MethodPost, "/api/intercept/pending/batch-decide", body); r.Code != 400 {
			t.Errorf("batch %s: status %d, want 400", body, r.Code)
		}
	}
}
