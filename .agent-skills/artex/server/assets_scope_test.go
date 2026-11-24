package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

func TestCompanyScopeInputsAcceptStructuredAndLegacyRules(t *testing.T) {
	var inputs companyScopeInputs
	if err := json.Unmarshal([]byte(`[
		"example.com",
		{"kind":"icp","value":"Beijing ICP No. 123"},
		{"kind":"keyword","value":"Acme Security"}
	]`), &inputs); err != nil {
		t.Fatal(err)
	}
	if len(inputs) != 3 {
		t.Fatalf("input count=%d want 3", len(inputs))
	}
	if inputs[0].Kind != "" || inputs[0].Value != "example.com" {
		t.Fatalf("legacy rule changed: %+v", inputs[0])
	}
	if inputs[1].Kind != "icp" || inputs[2].Kind != "keyword" {
		t.Fatalf("structured rules changed: %+v", inputs)
	}
}

func TestCreateCompanyRejectsNormalizedDuplicateWithoutChangingScope(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()

	stamp := time.Now().UnixNano()
	name := fmt.Sprintf("HTTP Strict Company %d", stamp)
	companyID, _, _, _, _, err := m.pg.Companies().CreateCompanyWithScope(name, "", []db.ScopeInput{
		{Kind: "domain", Value: fmt.Sprintf("existing-%d.example", stamp)},
	}, "test")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = m.pg.Companies().DeleteCompany(companyID) }()

	s := &Server{m: m}
	body, err := json.Marshal(map[string]any{
		"name":  "  " + name + "  ",
		"scope": []map[string]string{{"kind": "domain", "value": fmt.Sprintf("new-%d.example", stamp)}},
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/companies", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	s.createCompany(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate create status=%d body=%s", rec.Code, rec.Body.String())
	}
	scope, err := m.pg.Companies().GetScope(companyID)
	if err != nil {
		t.Fatal(err)
	}
	if len(scope) != 1 || scope[0].Domain != fmt.Sprintf("existing-%d.example", stamp) {
		t.Fatalf("duplicate HTTP create changed existing scope: %+v", scope)
	}
}

func TestDeleteCompanyRefreshesLiveTaskCompanyIDs(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()

	companyID, _, err := m.pg.Companies().UpsertCompany(
		fmt.Sprintf("Delete Company DTO %d", time.Now().UnixNano()), "",
	)
	if err != nil {
		t.Fatal(err)
	}
	task, err := m.CreateTaskWithOptions("company deletion dto", "goal", db.TaskCreateOptions{
		CompanyIDs: []int64{companyID},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()

	s := &Server{m: m}
	req := httptest.NewRequest(http.MethodDelete, "/api/companies/1", bytes.NewBufferString(`{}`))
	req.SetPathValue("id", i64s(companyID))
	rec := httptest.NewRecorder()
	s.deleteCompany(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete company status=%d body=%s", rec.Code, rec.Body.String())
	}
	if dto := taskDTO(task, "created"); len(dto.CompanyIDs) != 0 {
		t.Fatalf("live task DTO retained deleted company: %+v", dto.CompanyIDs)
	}
	persisted, err := m.pg.GetTask(mustTaskID(t, task.ID))
	if err != nil {
		t.Fatal(err)
	}
	if persisted == nil || len(persisted.CompanyIDs) != 0 {
		t.Fatalf("persisted task retained deleted company: %+v", persisted)
	}
}

func TestCompanyScopeHTTPErrorClassificationAndBounds(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	s := &Server{m: m}

	t.Run("missing company is 404", func(t *testing.T) {
		body := bytes.NewBufferString(`{"scope":[]}`)
		req := httptest.NewRequest(http.MethodPost, "/api/companies/999999999/scope", body)
		req.SetPathValue("id", "999999999")
		rec := httptest.NewRecorder()
		s.addCompanyScope(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
	})

	t.Run("oversized Unicode scope is 400", func(t *testing.T) {
		body, err := json.Marshal(map[string]any{
			"name": "Oversized Scope",
			"scope": []map[string]string{{
				"kind": "keyword", "value": strings.Repeat("x", db.MaxCompanyScopeRawRunes+1),
			}},
		})
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, "/api/companies", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		s.createCompany(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
	})

	t.Run("scope rule count is unbounded", func(t *testing.T) {
		scope := make([]map[string]string, 300)
		for i := range scope {
			scope[i] = map[string]string{"kind": "keyword", "value": fmt.Sprintf("unbounded-%d-%d", time.Now().UnixNano(), i)}
		}
		body, err := json.Marshal(map[string]any{"name": fmt.Sprintf("Unbounded Scope %d", time.Now().UnixNano()), "scope": scope})
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, "/api/companies", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		s.createCompany(rec, req)
		var created struct {
			ID    int64 `json:"id"`
			Added int   `json:"scope_added"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &created)
		defer func() { _ = m.pg.Companies().DeleteCompany(created.ID) }()
		if rec.Code != http.StatusCreated {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
		if created.Added != len(scope) {
			t.Fatalf("scope_added=%d want=%d", created.Added, len(scope))
		}
	})

	t.Run("oversized request body is 413", func(t *testing.T) {
		body := `{"name":"` + strings.Repeat("x", maxCompanyMutationBodyBytes+1) + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/companies", strings.NewReader(body))
		rec := httptest.NewRecorder()
		s.createCompany(rec, req)
		if rec.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
	})
}

func TestListAssetsClassifiesValidationAndDatabaseErrors(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	s := &Server{m: m}

	req := httptest.NewRequest(http.MethodGet, "/api/assets?dsl=(", nil)
	rec := httptest.NewRecorder()
	s.listAssets(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid DSL status=%d body=%s", rec.Code, rec.Body.String())
	}

	if err := m.pg.Close(); err != nil {
		t.Fatal(err)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/assets?type=root_domain", nil)
	rec = httptest.NewRecorder()
	s.listAssets(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("database failure status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestDeleteCompanyRejectsBadJSONAndReportsMissing(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	s := &Server{m: m}

	companyID, _, err := m.pg.Companies().UpsertCompany(
		fmt.Sprintf("Delete JSON Company %d", time.Now().UnixNano()), "",
	)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = m.pg.Companies().DeleteCompany(companyID) }()

	for _, body := range []string{`{"delete_assets":`, `{}` + `{}`} {
		req := httptest.NewRequest(http.MethodDelete, "/api/companies/1", strings.NewReader(body))
		req.SetPathValue("id", i64s(companyID))
		rec := httptest.NewRecorder()
		s.deleteCompany(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("body=%q status=%d response=%s", body, rec.Code, rec.Body.String())
		}
		company, err := m.pg.Companies().GetCompany(companyID)
		if err != nil || company == nil {
			t.Fatalf("bad JSON deleted company: company=%v err=%v", company, err)
		}
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/companies/999999999", nil)
	req.SetPathValue("id", "999999999")
	rec := httptest.NewRecorder()
	s.deleteCompany(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("missing delete status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestCompanyScopeSystemFailureIsHTTP500(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	s := &Server{m: m}
	if err := m.pg.Close(); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/companies/1/scope", bytes.NewBufferString(`{"scope":[]}`))
	req.SetPathValue("id", "1")
	rec := httptest.NewRecorder()
	s.addCompanyScope(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

// TestListAssetsCompanyFilterSurvivesDSLOr pins that company_id is applied
// outside the DSL text: a DSL that closes a group and ORs in another company,
// or a plain top-level OR, never returns an asset of that other company.
func TestListAssetsCompanyFilterSurvivesDSLOr(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	s := &Server{m: m}

	stamp := time.Now().UnixNano()
	var companyA, companyB, assetA, assetB int64
	for _, c := range []struct {
		name string
		id   *int64
	}{{"or-escape-a", &companyA}, {"or-escape-b", &companyB}} {
		key := fmt.Sprintf("%s-%d", c.name, stamp)
		if err := m.pg.QueryRow(`INSERT INTO companies(name, nkey) VALUES ($1, $1) RETURNING id`, key).Scan(c.id); err != nil {
			t.Fatal(err)
		}
	}
	defer m.pg.Exec(`DELETE FROM companies WHERE id = ANY($1::bigint[])`, []int64{companyA, companyB}) //nolint:errcheck
	for _, a := range []struct {
		company int64
		id      *int64
	}{{companyA, &assetA}, {companyB, &assetB}} {
		domain := fmt.Sprintf("or-escape-%d-%d.example", a.company, stamp)
		if err := m.pg.QueryRow(`INSERT INTO assets(type, domain, root_domain, company_id, last_seen)
			VALUES ('root_domain', $1, $1, $2, now()) RETURNING id`, domain, a.company).Scan(a.id); err != nil {
			t.Fatal(err)
		}
	}
	defer m.pg.Exec(`DELETE FROM assets WHERE id = ANY($1::bigint[])`, []int64{assetA, assetB}) //nolint:errcheck

	cases := []struct {
		name string
		dsl  string
	}{
		{"closing paren then OR", fmt.Sprintf("company_id=%d) OR (company_id=%d", companyA, companyB)},
		{"top-level OR", fmt.Sprintf("company_id=%d OR company_id=%d", companyA, companyB)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			target := fmt.Sprintf("/api/assets?company_id=%d&dsl=%s", companyA, url.QueryEscape(tc.dsl))
			rec := httptest.NewRecorder()
			s.listAssets(rec, httptest.NewRequest(http.MethodGet, target, nil))
			if rec.Code == http.StatusBadRequest {
				return // rejected outright: nothing escaped
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
			}
			var resp struct {
				Total  int         `json:"total"`
				Assets []*db.Asset `json:"assets"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatal(err)
			}
			for _, a := range resp.Assets {
				if a.ID == assetB {
					t.Fatalf("dsl %q under company %d returned company %d's asset %d", tc.dsl, companyA, companyB, assetB)
				}
			}
			if resp.Total != 1 || len(resp.Assets) != 1 || resp.Assets[0].ID != assetA {
				t.Fatalf("dsl %q: want only asset %d, got total=%d assets=%+v", tc.dsl, assetA, resp.Total, resp.Assets)
			}
		})
	}
}

// TestListTasksFiltersByCompany pins the server-side task filter behind the
// sidebar switcher: company=<id> keeps only the tasks scoped to that company,
// and a non-numeric id returns none.
func TestListTasksFiltersByCompany(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()

	stamp := time.Now().UnixNano()
	var companies []int64
	for _, name := range []string{"List Tasks A", "List Tasks B"} {
		id, _, err := m.pg.Companies().UpsertCompany(fmt.Sprintf("%s %d", name, stamp), "")
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = m.pg.Companies().DeleteCompany(id) }()
		companies = append(companies, id)
	}
	var taskIDs []string
	for i, company := range companies {
		task, err := m.CreateTaskWithOptions(fmt.Sprintf("list tasks company %d", i), "goal", db.TaskCreateOptions{
			CompanyIDs: []int64{company},
		})
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
		taskIDs = append(taskIDs, task.ID)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := &Server{m: m, engine: NewEngine(m), ctx: ctx}
	list := func(query string) []string {
		t.Helper()
		rec := httptest.NewRecorder()
		s.listTasks(rec, httptest.NewRequest(http.MethodGet, "/api/tasks"+query, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: status=%d body=%s", query, rec.Code, rec.Body.String())
		}
		var resp struct {
			Tasks []TaskDTO `json:"tasks"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		ids := []string{}
		for _, task := range resp.Tasks {
			ids = append(ids, task.ID)
		}
		return ids
	}

	if got := list(fmt.Sprintf("?company=%d", companies[0])); len(got) != 1 || got[0] != taskIDs[0] {
		t.Fatalf("company A: want only task %s, got %v", taskIDs[0], got)
	}
	if got := list(fmt.Sprintf("?company=%d", companies[1])); len(got) != 1 || got[0] != taskIDs[1] {
		t.Fatalf("company B: want only task %s, got %v", taskIDs[1], got)
	}
	if got := list("?company=abc"); len(got) != 0 {
		t.Fatalf("non-numeric company: want no task, got %v", got)
	}
	all := list("")
	for _, id := range taskIDs {
		if !slices.Contains(all, id) {
			t.Fatalf("all companies: task %s missing from %v", id, all)
		}
	}
}
