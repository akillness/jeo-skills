package agent

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func triageCandidate() TriageCandidate {
	return TriageCandidate{VulnClass: "sqli", Severity: "high", Name: "SQLi in search",
		Summary: "GET /rest/products/search?q= is concatenated into SQL; UNION SELECT dumps Users."}
}

func triageExisting() []TriageCandidate {
	return []TriageCandidate{
		{FindingID: 98, VulnClass: "sqli", Severity: "high", Name: "SQL injection in search", Summary: "UNION SELECT dumps the Users table."},
		{FindingID: 102, VulnClass: "xss", Severity: "medium", Name: "DOM XSS", Summary: "q is bound via innerHTML."},
	}
}

// newTriageServer returns a test server that captures the request body and replies
// with the given answers payload.
func newTriageServer(t *testing.T, answers map[string]any, status int) (*httptest.Server, *map[string]any) {
	t.Helper()
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/systemone") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if h := r.Header.Get("Authorization"); h != "Bearer testkey" {
			t.Errorf("authorization header = %q", h)
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		if status != http.StatusOK {
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"error":{"message":"boom"}}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"answers": answers})
	}))
	t.Cleanup(srv.Close)
	return srv, &got
}

func TestSystemOneClient_DuplicateNamesExistingFinding(t *testing.T) {
	srv, got := newTriageServer(t, map[string]any{
		"duplicate_of": map[string]any{"type": "choice", "choice": "98", "confidence": 0.91},
	}, http.StatusOK)
	c := &SystemOneClient{BaseURL: srv.URL + "/v1", APIKey: "testkey", Model: "decider"}

	ans, err := c.Duplicate(context.Background(), triageCandidate(), triageExisting())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ans.DuplicateOf != 98 || ans.Confidence != 0.91 {
		t.Fatalf("answer = %+v, want duplicate 98 @0.91", ans)
	}
	// The question must offer every existing finding plus "none", and carry the
	// candidate so the model can compare.
	if (*got)["model"] != "decider" {
		t.Fatalf("model not sent: %v", (*got)["model"])
	}
	state, _ := (*got)["state"].(string)
	if !strings.Contains(state, "CANDIDATE FINDING") || !strings.Contains(state, "[98]") {
		t.Fatalf("state does not carry candidate and existing findings:\n%s", state)
	}
	q := (*got)["questions"].(map[string]any)["duplicate_of"].(map[string]any)
	if q["type"] != "choice" {
		t.Fatalf("question type = %v", q["type"])
	}
	crit := q["criteria"].(map[string]any)
	for _, k := range []string{"none", "98", "102"} {
		if _, ok := crit[k]; !ok {
			t.Fatalf("criteria misses %q: %v", k, crit)
		}
	}
}

func TestSystemOneClient_DistinctFinding(t *testing.T) {
	srv, _ := newTriageServer(t, map[string]any{
		"duplicate_of": map[string]any{"type": "choice", "choice": "none", "confidence": 0.88},
	}, http.StatusOK)
	c := &SystemOneClient{BaseURL: srv.URL + "/v1", APIKey: "testkey", Model: "decider"}

	ans, err := c.Duplicate(context.Background(), triageCandidate(), triageExisting())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ans.DuplicateOf != 0 {
		t.Fatalf("want no duplicate, got %d", ans.DuplicateOf)
	}
}

// An id the question never offered must not suppress a finding.
func TestSystemOneClient_UnknownChoiceIsNotADuplicate(t *testing.T) {
	srv, _ := newTriageServer(t, map[string]any{
		"duplicate_of": map[string]any{"choice": "777", "confidence": 0.99},
	}, http.StatusOK)
	c := &SystemOneClient{BaseURL: srv.URL + "/v1", APIKey: "testkey", Model: "decider"}

	ans, err := c.Duplicate(context.Background(), triageCandidate(), triageExisting())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ans.DuplicateOf != 0 {
		t.Fatalf("unknown id must read as distinct, got %d", ans.DuplicateOf)
	}
}

// Runtimes that fill only probabilities still yield a usable confidence.
func TestParseDuplicateAnswer_FallsBackToProbability(t *testing.T) {
	raw := []byte(`{"answers":{"duplicate_of":{"type":"choice","choice":"98","probabilities":{"none":0.1,"98":0.8,"102":0.1}}}}`)
	ans, err := parseDuplicateAnswer(raw, map[int64]bool{98: true, 102: true})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ans.DuplicateOf != 98 || ans.Confidence != 0.8 {
		t.Fatalf("answer = %+v, want 98 @0.8", ans)
	}
}

func TestSystemOneClient_ErrorOnBadStatus(t *testing.T) {
	srv, _ := newTriageServer(t, nil, http.StatusInternalServerError)
	c := &SystemOneClient{BaseURL: srv.URL + "/v1", APIKey: "testkey", Model: "decider"}
	if _, err := c.Duplicate(context.Background(), triageCandidate(), triageExisting()); err == nil {
		t.Fatal("want an error on 500 so the caller can fail open")
	}
}

// Nothing to judge: no existing findings or an empty summary must not cost a call.
func TestSystemOneClient_NoCallWithoutInput(t *testing.T) {
	called := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called++
		_ = json.NewEncoder(w).Encode(map[string]any{})
	}))
	defer srv.Close()
	c := &SystemOneClient{BaseURL: srv.URL + "/v1", Model: "decider"}

	if _, err := c.Duplicate(context.Background(), triageCandidate(), nil); err != nil {
		t.Fatalf("no existing findings: %v", err)
	}
	empty := triageCandidate()
	empty.Summary = ""
	if _, err := c.Duplicate(context.Background(), empty, triageExisting()); err != nil {
		t.Fatalf("empty summary: %v", err)
	}
	if called != 0 {
		t.Fatalf("expected no HTTP call, got %d", called)
	}
}

// Regression: FindingID lives in the findings table, not on the node. Building
// candidates from nodes as they come out of the store dropped every entry
// ("nodes=6, no usable existing findings" on a live run) and triage never fired.
func TestTriageCandidates_SkipsNodesWithoutFindingRow(t *testing.T) {
	payload := func(name string) []byte {
		b, _ := json.Marshal(map[string]any{"name": name, "vulnclass": "sqli", "severity": "high", "summary": name + " summary"})
		return b
	}
	nodes := []*db.Node{
		{ID: 10, Kind: db.KindFinding, Payload: payload("no finding row"), FindingID: 0},
		{ID: 9, Kind: db.KindFinding, Payload: payload("own finding"), FindingID: 98},
		{ID: 11, Kind: db.KindFinding, Payload: payload("inherited finding"), FindingID: 55, Inherited: true, SourceTaskID: 7},
	}
	got := triageCandidates(nodes, db.RecordFindingInput{})
	if len(got) != 2 {
		t.Fatalf("want 2 candidates (the row-less node skipped), got %d: %+v", len(got), got)
	}
	if got[0].FindingID != 55 || got[0].RelatedTask != 7 {
		t.Fatalf("newest first with its related task: %+v", got[0])
	}
	if got[1].FindingID != 98 || got[1].RelatedTask != 0 {
		t.Fatalf("own finding must carry no related task: %+v", got[1])
	}
	st := buildDuplicateState(TriageCandidate{Summary: "cand"}, got)
	if !strings.Contains(st, "(related task 7)") {
		t.Fatalf("state must mark an inherited finding:\n%s", st)
	}
}

// The cap must be a SELECTION: with more candidates than fit, the ones matching the
// candidate's class or endpoint come first, newest only breaking ties.
func TestTriageRelevant_PrefersRelevanceOverRecency(t *testing.T) {
	mk := func(id, findingID int64, class, summary string) *db.Node {
		b, _ := json.Marshal(map[string]any{"vulnclass": class, "summary": summary})
		return &db.Node{ID: id, Kind: db.KindFinding, Payload: b, FindingID: findingID}
	}
	// The relevant finding is OLDER than the noise, so a newest-first cap would drop
	// it — that is exactly the live defect this ranking fixes.
	nodes := []*db.Node{mk(50, 50, "sqli", "GET /rest/user/login is injectable")}
	for i := int64(100); i < 115; i++ {
		nodes = append(nodes, mk(i, i, "xss", "GET /other/thing"+strconv.FormatInt(i, 10)))
	}
	got := triageCandidates(nodes, db.RecordFindingInput{VulnClass: "sqli", Summary: "POST /rest/user/login injectable"})
	if len(got) != triageMaxExisting {
		t.Fatalf("cap = %d, want %d", len(got), triageMaxExisting)
	}
	if got[0].FindingID != 50 {
		t.Fatalf("the relevant OLD finding must rank first, got %d (%+v)", got[0].FindingID, got[0])
	}
}

func TestBuildDuplicateState_CapsPerEntry(t *testing.T) {
	long := strings.Repeat("y", 500)
	st := buildDuplicateState(
		TriageCandidate{Summary: long},
		[]TriageCandidate{{FindingID: 1, Summary: long}, {FindingID: 2, Summary: long}})
	// every offered finding stays present and its line is capped, not the whole state
	for _, id := range []string{"[1]", "[2]"} {
		if !strings.Contains(st, id) {
			t.Fatalf("entry %s was cut out of the state:\n%s", id, st)
		}
	}
	if strings.Count(st, "…") < 3 {
		t.Fatalf("expected every summary to be capped, got %d caps", strings.Count(st, "…"))
	}
	if len(st) > triageMaxStateChars {
		t.Fatalf("state over the safety cap: %d", len(st))
	}
}

func TestBuildDuplicateState_Caps(t *testing.T) {
	var many []TriageCandidate
	for i := 0; i < 200; i++ {
		many = append(many, TriageCandidate{FindingID: int64(i), Summary: strings.Repeat("x", 200)})
	}
	st := buildDuplicateState(triageCandidate(), many)
	if len(st) > triageMaxStateChars {
		t.Fatalf("state not capped: %d", len(st))
	}
	if !strings.Contains(st, "CANDIDATE FINDING") {
		t.Fatal("state lost the candidate")
	}
}

func TestTriageDuplicateHit_Threshold(t *testing.T) {
	defer SetTriageMinConfidence(defaultTriageMinConfidence) // restore the default for other tests
	SetTriageMinConfidence(defaultTriageMinConfidence)
	cases := []struct {
		in   DuplicateAnswer
		want bool
	}{
		{DuplicateAnswer{DuplicateOf: 5, Confidence: 0.9}, true},
		{DuplicateAnswer{DuplicateOf: 5, Confidence: defaultTriageMinConfidence}, true},
		{DuplicateAnswer{DuplicateOf: 5, Confidence: 0.4}, false}, // below the threshold: register as before
		{DuplicateAnswer{DuplicateOf: 0, Confidence: 0.99}, false},
	}
	for _, c := range cases {
		if got := triageDuplicateHit(c.in); got != c.want {
			t.Fatalf("hit(%+v) = %v, want %v", c.in, got, c.want)
		}
	}
	// The live run produced true duplicates at 0.30 with the right partner named, so
	// a lowered threshold must flip them to a hit — that is the point of the knob.
	SetTriageMinConfidence(0.25)
	if !triageDuplicateHit(DuplicateAnswer{DuplicateOf: 5, Confidence: 0.30}) {
		t.Fatal("0.30 must hit at threshold 0.25")
	}
	SetTriageMinConfidence(0.9)
	if triageDuplicateHit(DuplicateAnswer{DuplicateOf: 5, Confidence: 0.30}) {
		t.Fatal("0.30 must miss at threshold 0.9")
	}
}

// The settings path writes the threshold from an HTTP goroutine while report_finding
// reads it on a worker. Run under -race: a plain float global fails here.
func TestTriageThresholdConcurrentSetAndRead(t *testing.T) {
	defer SetTriageMinConfidence(0.5)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		for i := 0; i < 2000; i++ {
			SetTriageMinConfidence(0.3 + 0.4*float64(i%2))
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 2000; i++ {
			_ = triageDuplicateHit(DuplicateAnswer{DuplicateOf: 5, Confidence: 0.6})
		}
	}()
	wg.Wait()
}

func TestSetTriageMinConfidenceZeroRestoresDefault(t *testing.T) {
	defer SetTriageMinConfidence(defaultTriageMinConfidence)
	SetTriageMinConfidence(0.9)
	SetTriageMinConfidence(0)
	if got := triageDupThreshold(); got != defaultTriageMinConfidence {
		t.Fatalf("threshold after Set(0) = %v, want %v", got, defaultTriageMinConfidence)
	}
	SetTriageMinConfidence(-1)
	if got := triageDupThreshold(); got != defaultTriageMinConfidence {
		t.Fatalf("threshold after Set(-1) = %v, want %v", got, defaultTriageMinConfidence)
	}
	if !triageDuplicateHit(DuplicateAnswer{DuplicateOf: 5, Confidence: 0.5}) {
		t.Fatal("0.5 must hit at the restored default")
	}
}
