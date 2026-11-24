package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/Autumn-27/artex/db"
)

// Triage through a decision model (the llama.cpp /v1/systemone contract).
//
// A decision model answers a closed-list question with probabilities and generates
// no text, so a judgement that otherwise costs a main-model turn over a six-figure
// context costs one small request instead. Measured on our own findings (15
// candidates, hand labels): picking the duplicate 8/8 on the 27B model and 7/8 on
// the flash one, against 7/15 for the constant "always distinct", at 0.66 s and
// ~1.7k input tokens per call with zero output tokens.
//
// It is ADVISORY by construction: every failure path falls back to today's
// behaviour, and only a confident answer changes an outcome.

// Порог уверенности, выше которого ответ «дубль» гасит регистрацию.
// Переменная, а не константа: уверенность падает с шириной вопроса, и один
// фиксированный 0.5 не обслуживает оба конца. Снижать не страшно — результат
// подавления велит агенту перерегистрировать находку, если она различна.
// замер: калибровка stage3_calibrate.py 2026-11-22 — recall 1.00 при FP 0.47 на 75
// жёстких негативах; на истинных дублях в живом прогоне 0.30-0.79. при превышении
// порога: находка не регистрируется, вызывающий получает finding_id.
const defaultTriageMinConfidence = 0.5

// triageDupMinConfidenceBits holds the threshold as float64 bits. It is written by the
// settings path (an HTTP goroutine) and read by the report_finding worker, so it is
// atomic: a plain float global is a data race under -race.
var triageDupMinConfidenceBits atomic.Uint64

func init() {
	triageDupMinConfidenceBits.Store(math.Float64bits(defaultTriageMinConfidence))
}

// SetTriageMinConfidence overrides the suppression threshold. v <= 0 restores the default.
func SetTriageMinConfidence(v float64) {
	if v <= 0 {
		v = defaultTriageMinConfidence
	}
	triageDupMinConfidenceBits.Store(math.Float64bits(v))
}

// triageDupThreshold returns the current suppression threshold.
func triageDupThreshold() float64 {
	return math.Float64frombits(triageDupMinConfidenceBits.Load())
}

const (
	// Потолок кандидатов в вопросе; отбор по релевантности, а не «новейшие N» —
	// при широком графе верный партнёр выпадает из новейших по возрасту (triageRelevant).
	// замер: ширина вопроса на реальном дубле, stage3_width.py 2026-11-22 — уверенность
	// 0.81-0.91 до 11 кандидатов, 0.64 на 19, 0.56 на 29; латентность 0.44->1.29 с.
	// при превышении: лишние кандидаты отбрасываются по релевантности.
	triageMaxExisting = 10
	// Обрезка ОДНОЙ сводки; обрезка по записи, а не по состоянию целиком — иначе
	// режется посреди строки и criteria остаётся с id, строки которого в состоянии нет.
	// замер: распределение длин сводок в графе 2026-11-22 — p50 189, p90 334, max 564
	// (53 находки), то есть 400 сохраняет 90% сводок целиком. при превышении: сводка
	// обрезается с «…», запись остаётся опознаваемой.
	triageMaxSummaryChars = 400
	// Страховка на собранное состояние при потолке 10 записей.
	// запас посчитан: 10*(400+60) + кандидат 480 ≈ 5.1 КБ против 6000, то есть 1.17x;
	// при поштучной обрезке срабатывает только на патологических сводках.
	// при превышении: состояние режется по границе записи.
	triageMaxStateChars = 6000
)

// TriageCandidate is a finding reduced to what a dedup question needs.
type TriageCandidate struct {
	FindingID int64
	// NodeID is the exploration node id of the same finding. The agent extends a
	// finding through update_finding_report, which addresses the NODE, while the
	// question and the suppression answer carry the findings-table id — both have
	// to come back to the caller or it passes the wrong one.
	NodeID    int64
	Name      string
	VulnClass string
	Severity  string
	Summary   string
	// RelatedTask is non-zero when the finding belongs to a directly related task
	// (read-only here); it rides into the question so the model can weigh it.
	RelatedTask int64
}

// DuplicateAnswer is the parsed verdict: DuplicateOf == 0 means "genuinely distinct".
type DuplicateAnswer struct {
	DuplicateOf int64
	// DuplicateOfNode is the exploration node id of DuplicateOf (0 when unknown).
	DuplicateOfNode int64
	Confidence      float64
}

// TriageClient answers the closed-list questions the agent asks.
type TriageClient interface {
	Duplicate(ctx context.Context, cand TriageCandidate, existing []TriageCandidate) (DuplicateAnswer, error)
}

// SystemOneClient is a TriageClient over a decision-model endpoint. BaseURL is the
// OpenAI-style base ("https://host:8088/v1"); "/systemone" is appended.
type SystemOneClient struct {
	BaseURL string
	APIKey  string
	Model   string
	HTTP    *http.Client
}

// Таймаут запроса к decider. замер: латентность 0.26-0.57 с при ширине до 11 и 1.29 с на 29
// (stage3_width.py 2026-11-22), 3.83-3.96 с на 27B-варианте (этап 0, 2026-11-21); у пула
// conc=2 и нет очереди, занятость добавляет ожидание. запас ~5x к худшему замеру.
// при превышении: ошибка -> fail open, находка регистрируется как раньше.
// Экспортирован, чтобы сервер, собирающий клиенту guarded-транспорт, брал тот же
// бюджет, а не заводил второй таймаут с другим числом.
const TriageHTTPTimeout = 20 * time.Second // замер: 0.26-3.96 с наблюдаемо; запас 5x

func (c *SystemOneClient) http() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: TriageHTTPTimeout}
}

// Duplicate asks which existing finding, if any, is the same defect as cand.
func (c *SystemOneClient) Duplicate(ctx context.Context, cand TriageCandidate, existing []TriageCandidate) (DuplicateAnswer, error) {
	if strings.TrimSpace(c.BaseURL) == "" || strings.TrimSpace(c.Model) == "" {
		return DuplicateAnswer{}, fmt.Errorf("triage: base_url and model are required")
	}
	if len(existing) == 0 || strings.TrimSpace(cand.Summary) == "" {
		return DuplicateAnswer{}, nil
	}
	body, err := json.Marshal(map[string]any{
		"model": c.Model,
		"state": buildDuplicateState(cand, existing),
		"questions": map[string]any{
			"duplicate_of": map[string]any{
				"type":         "choice",
				"instructions": duplicateInstructions,
				"criteria":     duplicateCriteria(existing),
			},
		},
	})
	if err != nil {
		return DuplicateAnswer{}, err
	}
	url := strings.TrimRight(c.BaseURL, "/") + "/systemone"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return DuplicateAnswer{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	resp, err := c.http().Do(req)
	if err != nil {
		return DuplicateAnswer{}, err
	}
	defer resp.Body.Close()
	// 1 MiB: ответ decider — это JSON вероятностей, замеренный 0.3-2 КБ (живые прогоны),
	// то есть запас ~500x; потолок страхует от чатоподобного эндпоинта вместо decision.
	// при превышении: тело читается частично, JSON может не распарситься -> fail open.
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return DuplicateAnswer{}, err
	}
	if resp.StatusCode != http.StatusOK {
		return DuplicateAnswer{}, fmt.Errorf("triage: status %d: %s", resp.StatusCode, triageFirstLine(raw))
	}
	ids := make(map[int64]bool, len(existing))
	for _, e := range existing {
		ids[e.FindingID] = true
	}
	return parseDuplicateAnswer(raw, ids)
}

const duplicateInstructions = "The CANDIDATE finding is new. Decide whether it is the SAME defect as one of " +
	"the REGISTERED findings (same endpoint, same parameter, same root cause) or a genuinely distinct finding. " +
	"Answer 'none' when the candidate is distinct even if it shares the vulnerability class with a registered one."

// buildDuplicateState renders the question's state. Deterministic: findings in the
// order given, candidate first.
func buildDuplicateState(cand TriageCandidate, existing []TriageCandidate) string {
	var b strings.Builder
	fmt.Fprintf(&b, "CANDIDATE FINDING\nclass: %s\nseverity: %s\nname: %s\nsummary: %s\n\nREGISTERED FINDINGS\n",
		cand.VulnClass, cand.Severity, cand.Name, capText(cand.Summary, triageMaxSummaryChars))
	for _, e := range existing {
		rel := ""
		if e.RelatedTask > 0 {
			rel = fmt.Sprintf(" (related task %d)", e.RelatedTask)
		}
		fmt.Fprintf(&b, "[%d]%s class=%s severity=%s name=%s | %s\n",
			e.FindingID, rel, e.VulnClass, e.Severity, e.Name, capText(e.Summary, triageMaxSummaryChars))
	}
	out := b.String()
	if len(out) > triageMaxStateChars {
		out = cutRunes(out, triageMaxStateChars)
	}
	return out
}

// duplicateCriteria builds the closed list: "none" plus one key per finding id.
func duplicateCriteria(existing []TriageCandidate) map[string]any {
	c := map[string]any{"none": "a genuinely distinct finding (different endpoint, parameter or root cause)"}
	for _, e := range existing {
		desc := strings.TrimSpace(e.Name)
		if s := strings.TrimSpace(e.Summary); s != "" {
			if desc != "" {
				desc += " | "
			}
			desc += s
		}
		if desc == "" {
			desc = "registered finding"
		}
		c[strconv.FormatInt(e.FindingID, 10)] = desc
	}
	return c
}

// triageDuplicateHit reports whether an answer should suppress registration.
// Split out so the threshold is testable without an HTTP round trip.
func triageDuplicateHit(ans DuplicateAnswer) bool {
	return ans.DuplicateOf > 0 && ans.Confidence >= triageDupThreshold()
}

// parseDuplicateAnswer reads answers.duplicate_of. A choice that is not one of the
// offered ids is treated as "none" rather than as an error: the model naming an
// unknown id must not suppress a finding.
func parseDuplicateAnswer(raw []byte, existingIDs map[int64]bool) (DuplicateAnswer, error) {
	var resp struct {
		Answers map[string]struct {
			Type          string             `json:"type"`
			Choice        string             `json:"choice"`
			Confidence    float64            `json:"confidence"`
			Probabilities map[string]float64 `json:"probabilities"`
		} `json:"answers"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return DuplicateAnswer{}, fmt.Errorf("triage: bad answer json: %w", err)
	}
	a, ok := resp.Answers["duplicate_of"]
	if !ok {
		return DuplicateAnswer{}, fmt.Errorf("triage: answer has no duplicate_of")
	}
	conf := a.Confidence
	if conf == 0 && a.Probabilities != nil {
		conf = a.Probabilities[a.Choice] // some runtimes only fill probabilities
	}
	choice := strings.TrimSpace(a.Choice)
	if choice == "" || choice == "none" {
		return DuplicateAnswer{Confidence: conf}, nil
	}
	id, err := strconv.ParseInt(choice, 10, 64)
	if err != nil || !existingIDs[id] {
		return DuplicateAnswer{Confidence: conf}, nil
	}
	return DuplicateAnswer{DuplicateOf: id, Confidence: conf}, nil
}

func capText(s string, n int) string {
	if n > 0 && len(s) > n {
		return cutRunes(s, n) + "…"
	}
	return s
}

// cutRunes truncates s to at most n BYTES without splitting a multi-byte rune.
// The caps above are byte budgets (they bound a request), but a byte-index cut
// through a CJK or Cyrillic summary leaves a broken rune — the JSON encoder then
// sends U+FFFD and the question loses the tail of the evidence.
func cutRunes(s string, n int) string {
	if n <= 0 || len(s) <= n {
		return s
	}
	cut := n
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut]
}

func triageFirstLine(b []byte) string {
	s := strings.TrimSpace(string(b))
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

// --- wiring into report_finding ---

// SetTriageClient installs (or, with nil, removes) the advisory triage client.
func (t *ToolSet) SetTriageClient(c TriageClient) { t.triage = c }

// SetTriageClient mirrors ToolSet.SetTriageClient for the worker and planner: the
// per-run ToolSet is built inside their Plan/Run, so the client has to ride on the
// agent the same way the finding recorder does.
func (w *Worker) SetTriageClient(c TriageClient)  { w.triage = c }
func (p *Planner) SetTriageClient(c TriageClient) { p.triage = c }

// triageDuplicate asks the client about the finding being registered, against the
// task's already registered findings. Ordering and truncation keep the question
// bounded: newest findings first (a duplicate of a fresh finding is the common case).
func (t *ToolSet) triageDuplicate(ctx context.Context, in db.RecordFindingInput) (DuplicateAnswer, bool) {
	if t.triage == nil || t.ts == nil {
		log.Printf("[triage] skip: client=%v store=%v", t.triage != nil, t.ts != nil)
		return DuplicateAnswer{}, false
	}
	nodes, err := t.ts.ListByKindWithSources(db.KindFinding, 500)
	if err != nil || len(nodes) == 0 {
		log.Printf("[triage] skip: nodes=%d err=%v", len(nodes), err)
		return DuplicateAnswer{}, false
	}
	// Findings from independently created tasks on the same assets are NOT in the
	// own-task pool (task_relations only links spawned tasks), yet they are exactly
	// the duplicates a human would merge. The candidate's own asset ids are the join.
	if len(in.AssetIDs) > 0 {
		if cross, err := t.ts.FindingsSharingAssets(in.AssetIDs, t.taskID, triageMaxExisting); err == nil {
			seen := make(map[int64]bool, len(nodes))
			for _, n := range nodes {
				seen[n.ID] = true
			}
			for _, n := range cross {
				if n != nil && !seen[n.ID] {
					nodes = append(nodes, n)
				}
			}
		}
	}
	// FindingID lives in the findings table, not on the node: without this the
	// candidate list is built from nodes whose FindingID is still 0 and every
	// entry is dropped (observed live: "nodes=6, no usable existing findings").
	if err := t.ts.PopulateFindingTrafficIDs(nodes); err != nil {
		log.Printf("[triage] populate finding ids failed: %v", err)
	}
	existing := triageCandidates(nodes, in)
	if len(existing) == 0 {
		log.Printf("[triage] skip: no usable existing findings (nodes=%d)", len(nodes))
		return DuplicateAnswer{}, false
	}
	log.Printf("[triage] asking: existing=%d candidate=%q", len(existing), in.Name)
	ans, err := t.triage.Duplicate(ctx, TriageCandidate{
		Name: in.Name, VulnClass: in.VulnClass, Severity: in.Severity, Summary: in.Summary,
	}, existing)
	if err != nil {
		log.Printf("[triage] client error (fail open): %v", err)
		return DuplicateAnswer{}, false
	}
	// Carry the node id of the matched finding alongside its findings-table id:
	// the agent extends a finding through update_finding_report, which takes the
	// node id, so an answer that names only the table id sends it to the wrong call.
	ans = withNodeID(ans, existing)
	log.Printf("[triage] answer: dup=%d node=%d conf=%.2f", ans.DuplicateOf, ans.DuplicateOfNode, ans.Confidence)
	return ans, true
}

// withNodeID resolves the exploration node id of the matched finding from the
// candidates the question offered. Pure, so the mapping is testable without a
// decision-model round trip.
func withNodeID(ans DuplicateAnswer, existing []TriageCandidate) DuplicateAnswer {
	if ans.DuplicateOf <= 0 {
		return ans
	}
	for _, e := range existing {
		if e.FindingID == ans.DuplicateOf {
			ans.DuplicateOfNode = e.NodeID
			break
		}
	}
	return ans
}

// triageCandidates reduces finding nodes to question candidates: nodes without a
// finding row are skipped, the rest ranked by relevance to the candidate (see
// triageRelevant) and capped. Findings inherited from a directly related task are
// kept — the agent sees them in list_findings too — and marked so the model knows
// they are not this task's own.
func triageCandidates(nodes []*db.Node, in db.RecordFindingInput) []TriageCandidate {
	usable := make([]*db.Node, 0, len(nodes))
	for _, n := range nodes {
		if n != nil && n.FindingID > 0 {
			usable = append(usable, n)
		}
	}
	sort.SliceStable(usable, func(i, j int) bool { return usable[i].ID > usable[j].ID })
	out := make([]TriageCandidate, 0, triageMaxExisting)
	for _, n := range triageRelevant(usable, in, triageMaxExisting) {
		var p map[string]any
		_ = json.Unmarshal(n.Payload, &p)
		out = append(out, TriageCandidate{
			FindingID: n.FindingID,
			NodeID:    n.ID,
			Name:      strField(p, "name"),
			VulnClass: strField(p, "vulnclass"),
			Severity:  strField(p, "severity"),
			Summary:   strField(p, "summary"),
			RelatedTask: func() int64 {
				if n.Inherited {
					return n.SourceTaskID
				}
				return 0
			}(),
		})
	}
	return out
}

// triageRelevant ranks candidate findings for the question and keeps the best cap.
//
// Ranking, strongest first: the same vulnerability class, an overlapping endpoint,
// membership in another task that shares an asset (those nodes arrive pre-filtered
// by asset, which is itself a signal), then newest. A flat "newest N" is arbitrary
// and drops the true partner on a wide graph; relevance keeps what the question is
// about. Falls back to the newest cap when nothing scores, so behaviour without
// assets (or on a first finding) is unchanged.
func triageRelevant(nodes []*db.Node, in db.RecordFindingInput, cap int) []*db.Node {
	if cap <= 0 || len(nodes) <= cap {
		return nodes
	}
	candEP := endpointTokens(in.Summary)
	type scored struct {
		n     *db.Node
		score int
	}
	ranked := make([]scored, 0, len(nodes))
	for _, n := range nodes {
		var p map[string]any
		_ = json.Unmarshal(n.Payload, &p)
		s := 0
		if in.VulnClass != "" && strField(p, "vulnclass") == in.VulnClass {
			s += 2
		}
		if len(candEP) > 0 {
			for ep := range endpointTokens(strField(p, "summary")) {
				if candEP[ep] {
					s += 2
					break
				}
			}
		}
		if n.Inherited {
			s++ // another task on a shared asset: already a signal, not noise
		}
		ranked = append(ranked, scored{n, s})
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].score != ranked[j].score {
			return ranked[i].score > ranked[j].score
		}
		return ranked[i].n.ID > ranked[j].n.ID
	})
	out := make([]*db.Node, 0, cap)
	for _, r := range ranked {
		if len(out) >= cap {
			break
		}
		out = append(out, r.n)
	}
	return out
}

var endpointTokenRe = regexp.MustCompile(`/(?:rest|api|v[0-9])/[a-z0-9_{}./-]+`)

func endpointTokens(s string) map[string]bool {
	out := map[string]bool{}
	for _, m := range endpointTokenRe.FindAllString(strings.ToLower(s), -1) {
		out[strings.TrimRight(m, ".,;")] = true
	}
	return out
}

func strField(p map[string]any, k string) string {
	if p == nil {
		return ""
	}
	if v, ok := p[k].(string); ok {
		return v
	}
	return ""
}
