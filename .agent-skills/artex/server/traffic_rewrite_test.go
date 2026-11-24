package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic"
	"github.com/Autumn-27/artex/traffic/rewrite"
)

const rewriteAPI = "/api/traffic/rewrite-rules"

// cleanRewriteRules removes the rules of these tests, now and at the end, and
// skips when the table holds other rules: the limit test counts rows.
func cleanRewriteRules(t *testing.T, pg *db.DB) {
	t.Helper()
	clean := func() { pg.Exec(`DELETE FROM traffic_rewrite_rules WHERE name LIKE 't-rwapi-%'`) }
	clean()
	t.Cleanup(clean)
	var others int
	if err := pg.QueryRow(`SELECT count(*) FROM traffic_rewrite_rules`).Scan(&others); err != nil {
		t.Fatal(err)
	}
	if others > 0 {
		t.Skipf("traffic_rewrite_rules holds %d rule(s) that are not test fixtures — skipping", others)
	}
}

// rewriteServer is a server with an open traffic store whose proxy does not
// listen. request sends an authenticated call when auth is true.
func rewriteServer(t *testing.T) (*Server, func(auth bool, method, path, body string) *httptest.ResponseRecorder) {
	t.Helper()
	skipWithoutDSN(t)
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	cleanRewriteRules(t, m.pg)
	if m.traffic, err = traffic.Open(filepath.Join(m.dir, "traffic"), ":0"); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	s.archiveWG.Wait()
	<-s.side.done
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	return s, func(auth bool, method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if auth {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		return w
	}
}

type rewriteRuleJSON struct {
	ID       int64
	Name     string
	Enabled  bool
	Phase    string
	Priority int
	Matchers rewrite.Matchers
	Actions  []struct {
		Type, Name, Regex string
		Value             *string
		Sensitive         bool
		ValueSet          bool `json:"value_set"`
	}
	Note      string
	LoadError string `json:"load_error"`
}

func decodeRewriteRuleJSON(t *testing.T, resp *httptest.ResponseRecorder) rewriteRuleJSON {
	t.Helper()
	var r rewriteRuleJSON
	if resp.Code != 200 {
		t.Fatalf("HTTP %d %s", resp.Code, resp.Body.String())
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func listRewriteRules(t *testing.T, request func(bool, string, string, string) *httptest.ResponseRecorder) (rules []rewriteRuleJSON, raw string) {
	t.Helper()
	resp := request(true, "GET", rewriteAPI, "")
	var out struct{ Rules []rewriteRuleJSON }
	if resp.Code != 200 || json.Unmarshal(resp.Body.Bytes(), &out) != nil || out.Rules == nil {
		t.Fatalf("list: HTTP %d %s", resp.Code, resp.Body.String())
	}
	return out.Rules, resp.Body.String()
}

// sentToTarget applies the request phase of the proxy's snapshot to a request:
// what the stored rules would do, read from the snapshot itself.
func sentToTarget(s *Server) rewrite.Request {
	u, _ := url.Parse("http://api.example/v1")
	return s.m.traffic.RewriteRules().Apply(rewrite.PhaseRequest, rewrite.Input{Request: rewrite.Request{Method: "GET", URL: u, Header: http.Header{}}}).Request
}

func TestRewriteRulesRequireAuth(t *testing.T) {
	_, request := rewriteServer(t)
	for _, c := range [][2]string{{"GET", rewriteAPI}, {"POST", rewriteAPI}, {"PUT", rewriteAPI + "/1"}, {"DELETE", rewriteAPI + "/1"}, {"POST", rewriteAPI + "/1/toggle"}} {
		if resp := request(false, c[0], c[1], `{}`); resp.Code != 401 {
			t.Errorf("%s %s without a token: HTTP %d, want 401", c[0], c[1], resp.Code)
		}
	}
	if rules, _ := listRewriteRules(t, request); len(rules) != 0 {
		t.Fatalf("an unauthenticated call created a rule: %+v", rules)
	}
}

func TestRewriteRulesCRUD(t *testing.T) {
	s, request := rewriteServer(t)
	pg := s.m.pg
	const secret, secret2 = "Bearer rwapi-plain-0001", "Bearer rwapi-plain-0002"
	body := func(name, auth string) string {
		return `{"name":"` + name + `","enabled":true,"phase":"request","priority":3,"note":"n",
"matchers":{"host":"*.example","methods":["GET"]},
"actions":[{"type":"set_header","name":"Authorization",` + auth + `"sensitive":true},{"type":"set_header","name":"X-Plain","value":"visible"}]}`
	}
	if s.m.traffic.RewriteRules() != nil {
		t.Fatal("a snapshot exists before any rule change on this fixture")
	}

	created := request(true, "POST", rewriteAPI, body("t-rwapi-crud", `"value":"`+secret+`",`))
	r := decodeRewriteRuleJSON(t, created)
	if r.ID == 0 || r.Name != "t-rwapi-crud" || r.Phase != "request" || r.Priority != 3 || r.Note != "n" || r.Matchers.Host != "*.example" {
		t.Fatalf("created rule = %+v", r)
	}
	if r.Enabled {
		t.Fatal("a rule must be created disabled, whatever the request says")
	}
	if a := r.Actions; len(a) != 2 || a[0].Value != nil || !a[0].ValueSet || !a[0].Sensitive || a[1].Value == nil || *a[1].Value != "visible" || a[1].ValueSet {
		t.Fatalf("actions = %+v", a)
	}
	_, listed := listRewriteRules(t, request)
	if strings.Contains(created.Body.String()+listed, "rwapi-plain") {
		t.Fatal("the sensitive value was returned")
	}
	path := fmt.Sprintf("%s/%d", rewriteAPI, r.ID)

	// Both columns are sealed at rest.
	var matchers, actions string
	if err := pg.QueryRow(`SELECT matchers::text, actions::text FROM traffic_rewrite_rules WHERE id=$1`, r.ID).Scan(&matchers, &actions); err != nil {
		t.Fatal(err)
	}
	for _, col := range []string{matchers, actions} {
		if !strings.Contains(col, `"__artex_enc"`) || strings.Contains(col, "rwapi-plain") || strings.Contains(col, "example") {
			t.Fatalf("column not sealed at rest: %s", col)
		}
	}

	// Every change republishes the snapshot. A disabled rule is not in it.
	set := s.m.traffic.RewriteRules()
	if set == nil || set.Len(rewrite.PhaseRequest) != 0 {
		t.Fatalf("after create: the snapshot must exist and hold no rule")
	}
	if resp := request(true, "POST", path+"/toggle", `{"enabled":true}`); resp.Code != 200 {
		t.Fatalf("toggle: HTTP %d %s", resp.Code, resp.Body.String())
	}
	if s.m.traffic.RewriteRules() == set || s.m.traffic.RewriteRules().Len(rewrite.PhaseRequest) != 1 {
		t.Fatal("after toggle: the snapshot must be replaced and hold the rule")
	}
	if got := sentToTarget(s).Header.Get("Authorization"); got != secret {
		t.Fatalf("the snapshot holds Authorization=%q, want the stored value", got)
	}

	// Update without the sensitive value: the stored one is kept.
	updated := request(true, "PUT", path, body("t-rwapi-crud2", ""))
	if r2 := decodeRewriteRuleJSON(t, updated); r2.Name != "t-rwapi-crud2" || !r2.Enabled || !r2.Actions[0].ValueSet || r2.Actions[0].Value != nil {
		t.Fatalf("updated rule = %+v", r2)
	}
	if strings.Contains(updated.Body.String(), "rwapi-plain") {
		t.Fatal("the sensitive value was returned by the update")
	}
	if got := sentToTarget(s).Header.Get("Authorization"); got != secret {
		t.Fatalf("after an update without value: Authorization=%q, want the stored value kept", got)
	}
	// Update with a value: replaced. An explicit empty value is a value.
	decodeRewriteRuleJSON(t, request(true, "PUT", path, body("t-rwapi-crud2", `"value":"`+secret2+`",`)))
	if got := sentToTarget(s).Header.Get("Authorization"); got != secret2 {
		t.Fatalf("after an update with a value: Authorization=%q", got)
	}
	decodeRewriteRuleJSON(t, request(true, "PUT", path, body("t-rwapi-crud2", `"value":"",`)))
	if h := sentToTarget(s).Header; h.Get("Authorization") != "" || len(h.Values("Authorization")) != 1 {
		t.Fatalf("after an update with an empty value: %v", h)
	}
	decodeRewriteRuleJSON(t, request(true, "PUT", path, body("t-rwapi-crud2", `"value":"`+secret2+`",`)))

	// A kept value never moves to another action, and never comes back in clear.
	for name, bad := range map[string]string{
		"other type":   `[{"type":"set_body","sensitive":true}]`,
		"other header": `[{"type":"set_header","name":"X-Other","sensitive":true}]`,
	} {
		resp := request(true, "PUT", path, `{"name":"t-rwapi-crud2","phase":"request","actions":`+bad+`}`)
		if resp.Code != 400 || strings.Contains(resp.Body.String(), "rwapi-plain") {
			t.Fatalf("%s: HTTP %d %s, want 400", name, resp.Code, resp.Body.String())
		}
	}
	unmasked := request(true, "PUT", path, `{"name":"t-rwapi-crud2","enabled":true,"phase":"request","actions":[{"type":"set_header","name":"Authorization"}]}`)
	if r3 := decodeRewriteRuleJSON(t, unmasked); r3.Actions[0].Value == nil || *r3.Actions[0].Value != "" || strings.Contains(unmasked.Body.String(), "rwapi-plain") {
		t.Fatalf("dropping the sensitive flag must not reveal the stored value: %s", unmasked.Body.String())
	}
	if stored, err := pg.GetTrafficRewriteRule(r.ID); err != nil || strings.Contains(string(stored.Actions), "rwapi-plain") {
		t.Fatalf("the stored value must be gone once the action is saved in clear: %s (%v)", stored.Actions, err)
	}

	// Unknown rule: 404. Bad id: 400.
	for _, c := range [][3]string{{"PUT", rewriteAPI + "/999999999", body("t-rwapi-x", `"value":"v",`)},
		{"POST", rewriteAPI + "/999999999/toggle", `{"enabled":true}`}, {"POST", rewriteAPI + "/999999999/toggle", `{"enabled":false}`},
		{"DELETE", rewriteAPI + "/999999999", ""}} {
		if resp := request(true, c[0], c[1], c[2]); resp.Code != 404 {
			t.Errorf("%s %s: HTTP %d, want 404", c[0], c[1], resp.Code)
		}
	}
	if resp := request(true, "DELETE", rewriteAPI+"/abc", ""); resp.Code != 400 {
		t.Errorf("bad id: HTTP %d, want 400", resp.Code)
	}

	if resp := request(true, "DELETE", path, ""); resp.Code != 200 {
		t.Fatalf("delete: HTTP %d %s", resp.Code, resp.Body.String())
	}
	if rules, _ := listRewriteRules(t, request); len(rules) != 0 || s.m.traffic.RewriteRules().Len(rewrite.PhaseRequest) != 0 {
		t.Fatalf("after delete: %d rule(s) listed, %d in the snapshot", len(rules), s.m.traffic.RewriteRules().Len(rewrite.PhaseRequest))
	}
}

// An update that keeps a stored sensitive value cannot change the host matcher:
// the value is not written to a new destination.
func TestRewriteRulesKeptValueHostChange400(t *testing.T) {
	s, request := rewriteServer(t)
	const secret = "Bearer rwapi-plain-host"
	body := func(host, value string) string {
		return `{"name":"t-rwapi-host","enabled":true,"phase":"request","matchers":{"host":"` + host + `"},
"actions":[{"type":"set_header","name":"Authorization",` + value + `"sensitive":true}]}`
	}
	r := decodeRewriteRuleJSON(t, request(true, "POST", rewriteAPI, body("api.example", `"value":"`+secret+`",`)))
	path := fmt.Sprintf("%s/%d", rewriteAPI, r.ID)
	if resp := request(true, "POST", path+"/toggle", `{"enabled":true}`); resp.Code != 200 {
		t.Fatalf("toggle: HTTP %d %s", resp.Code, resp.Body.String())
	}

	for _, host := range []string{"evil.example", "*.example", ""} {
		resp := request(true, "PUT", path, body(host, ""))
		if resp.Code != 400 || !strings.Contains(resp.Body.String(), "destination changed (host matcher)") || strings.Contains(resp.Body.String(), "rwapi-plain") {
			t.Fatalf("host %q with the stored value kept: HTTP %d %s, want 400", host, resp.Code, resp.Body.String())
		}
	}
	if stored, _ := listRewriteRules(t, request); len(stored) != 1 || stored[0].Matchers.Host != "api.example" {
		t.Fatalf("a refused update changed the rule: %+v", stored)
	}
	if got := sentToTarget(s).Header.Get("Authorization"); got != secret {
		t.Fatalf("after the refused updates: Authorization=%q, want the stored value", got)
	}

	// Same host in another case: kept. A new host with the value sent again: accepted.
	decodeRewriteRuleJSON(t, request(true, "PUT", path, body("API.Example", "")))
	if got := sentToTarget(s).Header.Get("Authorization"); got != secret {
		t.Fatalf("host in another case: Authorization=%q, want the stored value kept", got)
	}
	if r2 := decodeRewriteRuleJSON(t, request(true, "PUT", path, body("evil.example", `"value":"other",`))); r2.Matchers.Host != "evil.example" {
		t.Fatalf("new host with the value sent again: %+v", r2)
	}
}

// A kept value is matched on the action's type, header name and regex, not on
// its position: reordering two sensitive actions keeps each value on its own
// action.
func TestRewriteRulesKeptValuesFollowReorder(t *testing.T) {
	s, request := rewriteServer(t)
	const auth, key = "Bearer rwapi-plain-auth", "rwapi-plain-key"
	r := decodeRewriteRuleJSON(t, request(true, "POST", rewriteAPI, `{"name":"t-rwapi-order","phase":"request","matchers":{"host":"api.example"},
"actions":[{"type":"set_header","name":"Authorization","value":"`+auth+`","sensitive":true},{"type":"set_header","name":"X-Api-Key","value":"`+key+`","sensitive":true}]}`))
	path := fmt.Sprintf("%s/%d", rewriteAPI, r.ID)

	reordered := request(true, "PUT", path, `{"name":"t-rwapi-order","enabled":true,"phase":"request","matchers":{"host":"api.example"},
"actions":[{"type":"set_header","name":"x-api-key","sensitive":true},{"type":"set_header","name":"Authorization","sensitive":true}]}`)
	r2 := decodeRewriteRuleJSON(t, reordered)
	if len(r2.Actions) != 2 || r2.Actions[0].Name != "x-api-key" || r2.Actions[1].Name != "Authorization" || !r2.Actions[0].ValueSet || !r2.Actions[1].ValueSet {
		t.Fatalf("reordered rule = %+v", r2)
	}
	if strings.Contains(reordered.Body.String(), "rwapi-plain") {
		t.Fatal("the sensitive values were returned by the update")
	}
	if h := sentToTarget(s).Header; h.Get("Authorization") != auth || h.Get("X-Api-Key") != key {
		t.Fatalf("after the reorder: Authorization=%q X-Api-Key=%q, want each value on its own action", h.Get("Authorization"), h.Get("X-Api-Key"))
	}
}

// Two stored sensitive actions of the same type, header name and regex: an
// action sent without its value cannot be told apart, the update is refused.
func TestRewriteRulesKeptValueAmbiguous400(t *testing.T) {
	s, request := rewriteServer(t)
	action := func(value string) string {
		return `{"type":"replace_header","name":"Authorization","regex":"^Bearer (.*)$",` + value + `"sensitive":true}`
	}
	r := decodeRewriteRuleJSON(t, request(true, "POST", rewriteAPI, `{"name":"t-rwapi-ambiguous","phase":"request","matchers":{"host":"api.example"},
"actions":[`+action(`"value":"rwapi-plain-a",`)+`,`+action(`"value":"rwapi-plain-b",`)+`]}`))
	path := fmt.Sprintf("%s/%d", rewriteAPI, r.ID)

	for name, actions := range map[string]string{
		"both omitted":    action("") + `,` + action(""),
		"one omitted":     action(`"value":"rwapi-new",`) + `,` + action(""),
		"single, omitted": action(""),
	} {
		resp := request(true, "PUT", path, `{"name":"t-rwapi-ambiguous","phase":"request","matchers":{"host":"api.example"},"actions":[`+actions+`]}`)
		if resp.Code != 400 || !strings.Contains(resp.Body.String(), "send the value") || strings.Contains(resp.Body.String(), "rwapi-plain") {
			t.Fatalf("%s: HTTP %d %s, want 400", name, resp.Code, resp.Body.String())
		}
	}
	stored, err := s.m.pg.GetTrafficRewriteRule(r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if a := string(stored.Actions); !strings.Contains(a, "rwapi-plain-a") || !strings.Contains(a, "rwapi-plain-b") || strings.Contains(a, "rwapi-new") {
		t.Fatalf("a refused update changed the stored actions: %s", a)
	}
}

// The validation refuses a rule with HTTP 400 on create and on update, and
// stores nothing.
func TestRewriteRulesValidation400(t *testing.T) {
	s, request := rewriteServer(t)
	valid := `{"name":"t-rwapi-valid","phase":"request","actions":[{"type":"set_header","name":"X-A","value":"v"}]}`
	r := decodeRewriteRuleJSON(t, request(true, "POST", rewriteAPI, valid))
	path := fmt.Sprintf("%s/%d", rewriteAPI, r.ID)
	rule := func(phase, matchers, actions string) string {
		return `{"name":"t-rwapi-bad","phase":"` + phase + `","matchers":` + matchers + `,"actions":` + actions + `}`
	}
	cases := map[string]string{
		"malformed JSON":       `{"name":`,
		"empty name":           `{"phase":"request","actions":[{"type":"set_header","name":"X-A","value":"v"}]}`,
		"bad phase":            rule("both", `{}`, `[{"type":"set_header","name":"X-A","value":"v"}]`),
		"no action":            rule("request", `{}`, `[]`),
		"unknown action":       rule("request", `{}`, `[{"type":"set_host","value":"evil.example"}]`),
		"Host header":          rule("request", `{}`, `[{"type":"set_header","name":"Host","value":"evil.example"}]`),
		"Content-Length":       rule("response", `{}`, `[{"type":"delete_header","name":"content-length"}]`),
		"Proxy- header":        rule("request", `{}`, `[{"type":"set_header","name":"Proxy-Authorization","value":"v"}]`),
		"hop-by-hop header":    rule("request", `{}`, `[{"type":"set_header","name":"Connection","value":"close"}]`),
		"header line break":    rule("request", `{}`, `[{"type":"set_header","name":"X-A","value":"a\r\nX-B: b"}]`),
		"header name":          rule("request", `{}`, `[{"type":"set_header","name":"X A","value":"v"}]`),
		"absolute URL":         rule("request", `{}`, `[{"type":"set_path_query","value":"http://evil.example/x"}]`),
		"method CONNECT":       rule("request", `{}`, `[{"type":"set_method","value":"CONNECT"}]`),
		"status 204":           rule("response", `{}`, `[{"type":"set_status","value":"204"}]`),
		"status 600":           rule("response", `{}`, `[{"type":"set_status","value":"600"}]`),
		"status in request":    rule("request", `{}`, `[{"type":"set_status","value":"200"}]`),
		"host glob":            rule("request", `{"host":"a.*.b"}`, `[{"type":"set_header","name":"X-A","value":"v"}]`),
		"bad regex":            rule("request", `{"url_regex":"("}`, `[{"type":"set_header","name":"X-A","value":"v"}]`),
		"regex over 1 KiB":     rule("request", `{"url_regex":"`+strings.Repeat("a", rewrite.MaxPatternSize+1)+`"}`, `[{"type":"set_header","name":"X-A","value":"v"}]`),
		"value over 1 MiB":     rule("request", `{}`, `[{"type":"set_body","value":"`+strings.Repeat("a", rewrite.MaxValueSize+1)+`"}]`),
		"sensitive, no value":  rule("request", `{}`, `[{"type":"set_body","sensitive":true}]`),
		"response matcher":     rule("request", `{"status":["200"]}`, `[{"type":"set_header","name":"X-A","value":"v"}]`),
		"replace without expr": rule("request", `{}`, `[{"type":"replace_body","value":"v"}]`),
	}
	for name, body := range cases {
		for _, c := range [][2]string{{"POST", rewriteAPI}, {"PUT", path}} {
			if resp := request(true, c[0], c[1], body); resp.Code != 400 {
				t.Errorf("%s: %s answered HTTP %d, want 400", name, c[0], resp.Code)
			}
		}
	}
	rules, _ := listRewriteRules(t, request)
	if len(rules) != 1 || rules[0].Name != "t-rwapi-valid" || rules[0].Actions[0].Name != "X-A" {
		t.Fatalf("a refused request changed the table: %+v", rules)
	}
	if resp := request(true, "POST", path+"/toggle", `{"enabled":`); resp.Code != 400 {
		t.Errorf("toggle with malformed JSON: HTTP %d, want 400", resp.Code)
	}

	// A stored rule the validation no longer accepts: reported by load_error,
	// kept out of the snapshot, and refused by the toggle.
	old, err := s.m.pg.CreateTrafficRewriteRule(db.TrafficRewriteRule{Name: "t-rwapi-old", Enabled: true, Phase: "request",
		Matchers: json.RawMessage(`{}`), Actions: json.RawMessage(`[{"type":"set_header","name":"Host","value":"evil.example"}]`)})
	if err != nil {
		t.Fatal(err)
	}
	s.m.reloadRewriteRules()
	if set := s.m.traffic.RewriteRules(); set.Len(rewrite.PhaseRequest) != 0 || !strings.Contains(set.LoadErrors()[old.ID], "Host") {
		t.Fatalf("snapshot: %d rule(s), load errors %v", set.Len(rewrite.PhaseRequest), set.LoadErrors())
	}
	rules, _ = listRewriteRules(t, request)
	for _, r := range rules {
		if (r.ID == old.ID) != (r.LoadError != "") {
			t.Errorf("rule %s: load_error=%q", r.Name, r.LoadError)
		}
	}
	oldPath := fmt.Sprintf("%s/%d/toggle", rewriteAPI, old.ID)
	if resp := request(true, "POST", oldPath, `{"enabled":true}`); resp.Code != 400 {
		t.Errorf("enabling an invalid stored rule: HTTP %d, want 400", resp.Code)
	}
	if resp := request(true, "POST", oldPath, `{"enabled":false}`); resp.Code != 200 {
		t.Errorf("disabling an invalid stored rule: HTTP %d, want 200", resp.Code)
	}
}

// 100 rules at most, 50 of them enabled.
func TestRewriteRulesLimits(t *testing.T) {
	s, request := rewriteServer(t)
	body := func(i int) string {
		return fmt.Sprintf(`{"name":"t-rwapi-limit-%03d","phase":"response","actions":[{"type":"set_header","name":"X-A","value":"v"}]}`, i)
	}
	var ids []int64
	for i := 0; i < db.MaxTrafficRewriteRules; i++ {
		ids = append(ids, decodeRewriteRuleJSON(t, request(true, "POST", rewriteAPI, body(i))).ID)
	}
	if resp := request(true, "POST", rewriteAPI, body(100)); resp.Code != 400 || !strings.Contains(resp.Body.String(), "100") {
		t.Fatalf("101st rule: HTTP %d %s, want 400", resp.Code, resp.Body.String())
	}
	toggle := func(id int64) *httptest.ResponseRecorder {
		return request(true, "POST", fmt.Sprintf("%s/%d/toggle", rewriteAPI, id), `{"enabled":true}`)
	}
	for _, id := range ids[:db.MaxEnabledTrafficRewriteRules] {
		if resp := toggle(id); resp.Code != 200 {
			t.Fatalf("toggle: HTTP %d %s", resp.Code, resp.Body.String())
		}
	}
	over := ids[db.MaxEnabledTrafficRewriteRules]
	if resp := toggle(over); resp.Code != 400 || !strings.Contains(resp.Body.String(), "50") {
		t.Fatalf("51st enabled rule by toggle: HTTP %d %s, want 400", resp.Code, resp.Body.String())
	}
	update := `{"name":"t-rwapi-limit-upd","enabled":true,"phase":"response","actions":[{"type":"set_header","name":"X-A","value":"v"}]}`
	if resp := request(true, "PUT", fmt.Sprintf("%s/%d", rewriteAPI, over), update); resp.Code != 400 {
		t.Fatalf("51st enabled rule by update: HTTP %d %s, want 400", resp.Code, resp.Body.String())
	}
	if n := s.m.traffic.RewriteRules().Len(rewrite.PhaseResponse); n != db.MaxEnabledTrafficRewriteRules {
		t.Fatalf("the snapshot holds %d rules, want %d", n, db.MaxEnabledTrafficRewriteRules)
	}
	rules, _ := listRewriteRules(t, request)
	if len(rules) != db.MaxTrafficRewriteRules {
		t.Fatalf("%d rules listed, want %d", len(rules), db.MaxTrafficRewriteRules)
	}
}

// NewManager loads the rules once the traffic store is open, and refuses to
// start under a key other than the one that sealed them.
func TestRewriteRulesLoadedAtStartup(t *testing.T) {
	_, request := rewriteServer(t)
	r := decodeRewriteRuleJSON(t, request(true, "POST", rewriteAPI,
		`{"name":"t-rwapi-startup","phase":"request","actions":[{"type":"set_header","name":"X-Startup","value":"1"}]}`))
	if resp := request(true, "POST", fmt.Sprintf("%s/%d/toggle", rewriteAPI, r.ID), `{"enabled":true}`); resp.Code != 200 {
		t.Fatalf("toggle: HTTP %d", resp.Code)
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	proxyAddr := ln.Addr().String()
	ln.Close()
	m, err := NewManager(t.TempDir(), proxyAddr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Close() })
	if m.traffic == nil {
		t.Fatal("NewManager did not open the traffic store")
	}
	set := m.traffic.RewriteRules()
	if set == nil || set.Len(rewrite.PhaseRequest) != 1 || set.Len(rewrite.PhaseResponse) != 0 || len(set.LoadErrors()) != 0 {
		t.Fatalf("snapshot at startup = %+v", set)
	}

	// Not the key that sealed the rule.
	t.Setenv("ARTEX_SECRET_KEY", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("f", 32))))
	if m2, err := NewManager(t.TempDir(), ""); err == nil {
		m2.Close()
		t.Fatal("NewManager started under a key that cannot open the stored rules")
	} else if !strings.Contains(err.Error(), "secrets at rest") || !strings.Contains(err.Error(), "secret key check") {
		t.Fatalf("startup error = %v", err)
	}
}
