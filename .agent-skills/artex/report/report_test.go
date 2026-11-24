package report

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/Autumn-27/artex/db"
)

// The exported report carries the coverage gaps and the completeness caveat;
// nothing is added when the task's coverage feature is off (nil ledger).
func TestMarkdownCoverageGaps(t *testing.T) {
	l := db.BuildCoverageLedger([]db.CoverageEntry{{Surface: "/a", RiskArea: "xss", Outcome: db.OutcomeNeedsFollowUp}},
		[]string{"sqli"}, db.CoverageCompletenessFor("timeout", false, false, true))
	cases := []struct {
		name string
		l    *db.CoverageLedger
		want []string
	}{
		{"ledger", l, []string{"## Coverage gaps", "timeout", "Incomplete scan", "open gaps: 2", "- unrecorded_risk_class sqli", "- needs_follow_up /a xss"}},
		{"coverage off", nil, nil},
	}
	for _, c := range cases {
		md := Markdown(Input{Title: "t", Coverage: c.l})
		if c.want == nil && strings.Contains(md, "Coverage gaps") {
			t.Fatalf("%s: unexpected coverage section", c.name)
		}
		for _, w := range c.want {
			if !strings.Contains(md, w) {
				t.Errorf("%s: missing %q in\n%s", c.name, w, md)
			}
		}
	}
}

// The report lists at most reportMaxGaps gaps, then a count line.
func TestMarkdownCoverageGapsCap(t *testing.T) {
	var entries []db.CoverageEntry
	for i := 0; i < reportMaxGaps+30; i++ {
		entries = append(entries, db.CoverageEntry{Surface: "/p", RiskArea: "xss", Outcome: db.OutcomeNeedsFollowUp})
	}
	md := Markdown(Input{Title: "t", Coverage: db.BuildCoverageLedger(entries, nil, db.CoverageCompleteness{})})
	if n := strings.Count(md, "\n- needs_follow_up /p xss"); n != reportMaxGaps {
		t.Fatalf("listed %d gaps, want %d", n, reportMaxGaps)
	}
	if !strings.Contains(md, "- and 30 more (see the coverage API)") {
		t.Fatalf("missing count line in\n%s", md)
	}
}

// reportNode builds a finding node with only the exploration payload the graph
// actually stores (name/summary/evidence/severity/vulnclass).
func reportNode(id int64, severity, name string) *db.Node {
	payload := fmt.Sprintf(`{"vulnclass":"cwe-602","name":%q,"severity":%q,"summary":"s%d","evidence":{"poc":"proof-%d"}}`, name, severity, id, id)
	return &db.Node{ID: id, Kind: db.KindFinding, Payload: []byte(payload)}
}

// A finding with a populated standalone row must show its whole defensibility
// footprint: record id, poe level, verification state, bound evidence count, the
// two attestations, and the reporter-written body.
func TestMarkdownFindingQuality(t *testing.T) {
	rows := map[int64]db.FindingQuality{
		8: {
			FindingMeta:           db.FindingMeta{ID: 1, Status: db.FindingConfirmed, TrafficCount: 2},
			PoeLevel:              3,
			VerificationStatus:    db.VerificationVerified,
			ConfidenceRationale:   "the 200 carries the victim's order body",
			Counterevidence:       "PATCH on the same id returned 403",
			Report:                "## Overview\n\nclient-supplied header\n\n## Fix\n\nbind role server-side",
			EvidenceVersion:       4,
			ReportEvidenceVersion: 4,
		},
		// Row present but nothing proven: the gaps must be stated, not omitted.
		9: {FindingMeta: db.FindingMeta{ID: 2, Status: db.FindingPending}, PoeLevel: 0, VerificationStatus: db.VerificationUnverified},
	}

	md := Markdown(Input{
		Title:       "t",
		GeneratedAt: time.Unix(0, 0),
		Findings:    []*db.Node{reportNode(8, "high", "BOLA"), reportNode(9, "critical", "role header")},
		Quality:     rows,
	})

	for _, want := range []string{
		"- **Finding record**: #1",
		"- **PoE level**: 3",
		"- **Verification**: Verified",
		"- **Proof**: 2 bound traffic exchange(s)",
		"**Confidence rationale**:\n\nthe 200 carries the victim's order body",
		"**Counterevidence**:\n\nPATCH on the same id returned 403",
		"**Detailed report:**\n\n## Overview\n\nclient-supplied header",
		"- **Finding record**: #2",
		"- **PoE level**: 0",
		"- **Verification**: Unverified",
		"- **Proof**: no bound traffic evidence",
	} {
		if !strings.Contains(md, want) {
			t.Errorf("missing %q in\n%s", want, md)
		}
	}
	// Absent optional fields produce no heading at all, and the verified finding's
	// narrative must not leak onto the unverified one.
	if n := strings.Count(md, "**Counterevidence**"); n != 1 {
		t.Errorf("counterevidence rendered %d times, want 1 (empty field must stay empty)\n%s", n, md)
	}
	if n := strings.Count(md, "**Detailed report:**"); n != 1 {
		t.Errorf("detailed report rendered %d times, want 1\n%s", n, md)
	}
	// A report written against the current evidence version is not stale.
	if strings.Contains(md, "The evidence has changed") {
		t.Errorf("up-to-date report flagged stale\n%s", md)
	}
}

// A finding node without a standalone row was never assessed: say so, and do not
// print a poe level or verification verdict that nobody produced.
func TestMarkdownFindingQualityNoRow(t *testing.T) {
	md := Markdown(Input{Title: "t", Findings: []*db.Node{reportNode(3, "low", "x")}, Quality: map[int64]db.FindingQuality{}})
	if !strings.Contains(md, "- **Verification**: not assessed (no finding record") {
		t.Errorf("missing not-assessed line in\n%s", md)
	}
	if strings.Contains(md, "- **PoE level**") {
		t.Errorf("claimed a poe level with no row\n%s", md)
	}
}

// A lookup that failed is not an absence: a nil map must render "could not be
// read", never "no finding record", or a database error becomes a claim about the
// finding (and silently drops a report body that does exist).
func TestMarkdownFindingQualityUnavailable(t *testing.T) {
	md := Markdown(Input{Title: "t", Findings: []*db.Node{reportNode(3, "low", "x")}})
	if !strings.Contains(md, "- **Verification**: unknown (quality lookup failed") {
		t.Errorf("missing lookup-failed line in\n%s", md)
	}
	if strings.Contains(md, "no finding record") {
		t.Errorf("a failed lookup is rendered as an absent row\n%s", md)
	}
	if strings.Contains(md, "- **PoE level**") || strings.Contains(md, "- **Proof**") {
		t.Errorf("claimed proof strength that was never read\n%s", md)
	}
}

// The stale-evidence warning is one sentence printed from one helper, so the task
// report and the findings export cannot drift on the same finding.
func TestStaleReportWarningOnBothSurfaces(t *testing.T) {
	const warning = "The evidence has changed; the detailed report needs updating."
	row := db.FindingQuality{
		FindingMeta:           db.FindingMeta{ID: 5},
		PoeLevel:              2,
		VerificationStatus:    db.VerificationVerified,
		Report:                "## Overview\n\nstale body",
		EvidenceVersion:       7, // evidence moved after the report was written
		ReportEvidenceVersion: 6,
	}
	md := Markdown(Input{Title: "t", Findings: []*db.Node{reportNode(4, "high", "stale one")}, Quality: map[int64]db.FindingQuality{4: row}})
	f := &db.DBFinding{ID: 5, VulnClass: "cwe-602", Severity: "high", Status: db.FindingConfirmed,
		PoELevel: 2, VerificationStatus: db.VerificationVerified, Report: row.Report,
		EvidenceVersion: 7, ReportEvidenceVersion: 6}
	fresh := *f
	fresh.EvidenceVersion = 6

	if n := strings.Count(md, warning); n != 1 {
		t.Errorf("task report prints the stale warning %d times, want 1\n%s", n, md)
	}
	// It has to sit before the body it is about, not after it.
	if strings.Index(md, warning) > strings.Index(md, "**Detailed report:**") {
		t.Errorf("stale warning printed after the body it flags\n%s", md)
	}
	for name, out := range map[string]string{
		"summary export":        FindingsMarkdown([]*db.DBFinding{f}, time.Unix(0, 0)),
		"single-finding export": SingleFindingMarkdown(f, time.Unix(0, 0)),
	} {
		if n := strings.Count(out, warning); n != 1 {
			t.Errorf("%s prints the stale warning %d times, want 1\n%s", name, n, out)
		}
	}
	// An up-to-date report gets the warning on neither surface.
	if strings.Contains(SingleFindingMarkdown(&fresh, time.Unix(0, 0)), warning) {
		t.Errorf("export flags an up-to-date report stale")
	}
	if strings.Contains(FindingsMarkdown([]*db.DBFinding{&fresh}, time.Unix(0, 0)), warning) {
		t.Errorf("summary export flags an up-to-date report stale")
	}
}

// A cut inside an open fence would swallow the truncation marker and every later
// section (other findings included) into the stale code block. The cap has to land
// on a balanced fence. Third party report on the same defect:
// TestMarkdownDetailedReportFenceBalance in ChaosLabsInc/ARTEX.
func TestMarkdownDetailedReportFenceBalance(t *testing.T) {
	// An unclosed ```http fence that opens well before the 8 KiB cap and is still
	// open where the body gets cut.
	unclosed := "## Evidence\n\n```http\n" + strings.Repeat("GET /orders/7 HTTP/1.1\nHost: victim\n\n", 400)
	if !unbalancedFence(strings.TrimSpace(unclosed[:reportMaxReportBytes])) {
		t.Fatalf("fixture does not cut inside an open fence")
	}
	rows := map[int64]db.FindingQuality{
		1: {FindingMeta: db.FindingMeta{ID: 1}, PoeLevel: 3, VerificationStatus: db.VerificationVerified, Report: unclosed},
		2: {FindingMeta: db.FindingMeta{ID: 2}, PoeLevel: 1, VerificationStatus: db.VerificationUnverified},
	}
	md := Markdown(Input{Title: "t", Findings: []*db.Node{reportNode(1, "high", "first"), reportNode(2, "low", "second")}, Quality: rows})

	if n := strings.Count(md, "```"); n%2 != 0 {
		t.Fatalf("report has %d fences (odd), so a code block is left open\n%s", n, md)
	}
	// The truncated body must be closed before the note, and the next finding must
	// still render as a heading rather than as text inside a code block.
	block := md[strings.Index(md, "**Detailed report:**"):strings.Index(md, "### 2.")]
	if !strings.Contains(block, "_Detailed report truncated at 8 KiB") {
		t.Fatalf("truncation note missing from the body block\n%s", block)
	}
	if strings.Index(block, "\n```\n") > strings.Index(block, "_Detailed report truncated") {
		t.Errorf("the fence is closed after the note, so the note stays inside the block\n%s", block)
	}
	if !strings.Contains(md, "### 2. [LOW] second") || !strings.Contains(md[strings.Index(md, "### 2."):], "- **PoE level**: 1") {
		t.Errorf("the second finding did not survive the cut\n%s", md)
	}

	// A body with no fence at all must not gain one.
	plain := strings.Repeat("word ", 3000)
	if out := detailedReport(plain, "**Detailed report:**"); strings.Contains(out, "```") {
		t.Errorf("a fence-free body gained a fence\n%s", out)
	}
	// A body that ends with a closed fence stays as it is.
	closed := "## Overview\n\n```\nstill readable\n```\n" + strings.Repeat("trailer line\n", 700)
	if out := detailedReport(closed, "**Detailed report:**"); strings.Count(out, "```")%2 != 0 {
		t.Errorf("balanced body ended up unbalanced\n%s", out)
	}
}

// The inlined detail body is capped so one finding cannot dominate the report,
// and truncation never splits a multi-byte rune.
func TestDetailedReportTruncation(t *testing.T) {
	// A multi-byte rune straddling the cap must be dropped whole, never split.
	big := strings.Repeat("a", reportMaxReportBytes-2) + "€" + strings.Repeat("b", 100)
	got := detailedReport(big, "**Detailed report:**")
	if !strings.Contains(got, "_Detailed report truncated at 8 KiB") {
		t.Fatalf("missing truncation marker\n%s", got)
	}
	if !utf8.ValidString(got) {
		t.Errorf("truncation produced invalid UTF-8")
	}
	if strings.Contains(got, "€") || strings.Contains(got, "bbbb") {
		t.Errorf("truncation kept text past the cap")
	}
	// A rune fully inside the cap stays intact.
	kept := detailedReport("€"+strings.Repeat("a", 10), "**Detailed report:**")
	if !strings.Contains(kept, "€") {
		t.Errorf("truncation dropped a rune inside the cap")
	}
	if detailedReport("   ", "**Detailed report:**") != "" {
		t.Errorf("empty body must render nothing")
	}
	// The findings export is the canonical per-finding document: it must never
	// shorten the body the way the multi-finding task report does.
	if out := detailedReportFull(big, "## Detailed Report"); !strings.Contains(out, strings.Repeat("b", 100)) {
		t.Errorf("export must not truncate the detailed report")
	}
}

// One finding must read the same in the task report and in the findings exports:
// the proof-strength block comes from the same helpers.
func TestFindingsExportsCarryQuality(t *testing.T) {
	f := &db.DBFinding{
		ID: 7, VulnClass: "cwe-602", Name: "role header", Severity: "critical",
		Status: db.FindingConfirmed, Summary: "sum", Evidence: "ev",
		PoELevel: 2, VerificationStatus: db.VerificationUnverified,
		VerificationNote: "no\nverbatim\nquote", ConfidenceRationale: "reason",
		Counterevidence: "tried X", TrafficCount: 0,
		Report: "## Overview\n\nbody",
	}
	for name, md := range map[string]string{
		"summary":        FindingsMarkdown([]*db.DBFinding{f}, time.Unix(0, 0)),
		"single finding": SingleFindingMarkdown(f, time.Unix(0, 0)),
	} {
		for _, want := range []string{
			"- **Finding record**: #7",
			"- **PoE level**: 2",
			"- **Verification**: Unverified",
			"- **Verification note**: no verbatim quote",
			"**Confidence rationale**:\n\nreason",
			"**Counterevidence**:\n\ntried X",
		} {
			if !strings.Contains(md, want) {
				t.Errorf("%s: missing %q in\n%s", name, want, md)
			}
		}
		// With nothing bound the traffic section renders nothing at all, so the export
		// must still say so; with bindings present the traffic section states the count
		// and a bullet would be the same number twice (covered below).
		if n := strings.Count(md, "- **Proof**"); n != 1 {
			t.Errorf("%s: want exactly one Proof bullet when nothing is bound, got %d\n%s", name, n, md)
		}
	}
	// The detailed report keeps the document's own structure: a per-finding export is
	// a section of its own, while the summary lists many findings under one heading.
	if md := SingleFindingMarkdown(f, time.Unix(0, 0)); !strings.Contains(md, "## Detailed Report\n\n## Overview\n\nbody") {
		t.Errorf("single-finding export lost its Detailed Report section heading\n%s", md)
	}
	if md := FindingsMarkdown([]*db.DBFinding{f}, time.Unix(0, 0)); !strings.Contains(md, "**Detailed report:**\n\n## Overview\n\nbody") {
		t.Errorf("multi-finding export should label the body, not open a new section\n%s", md)
	}

	// With bindings present the export states the count once, in its traffic section.
	bound := *f
	bound.TrafficCount = 2
	bound.TrafficBindings = []db.FindingTrafficBinding{{ID: 1, Role: "proof"}}
	if md := SingleFindingMarkdown(&bound, time.Unix(0, 0)); strings.Contains(md, "- **Proof**") {
		t.Errorf("export repeats the binding count next to its traffic section\n%s", md)
	} else if !strings.Contains(md, "bindings: 1") {
		t.Errorf("export lost the binding count entirely\n%s", md)
	}
}

func TestFindingsCSVNeutralizesFormulas(t *testing.T) {
	out := FindingsCSV([]*db.DBFinding{{
		ID:              7,
		Name:            `=HYPERLINK("http://evil.example/x","x")`,
		VulnClass:       "+cmd",
		Severity:        "high",
		Status:          "pending",
		ReportState:     "none",
		TaskDescription: "@SUM(1+1)",
		CreatedAt:       time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
		Summary:         "-2+3",
	}})
	if !bytes.HasPrefix(out, []byte("\xEF\xBB\xBF")) {
		t.Fatal("CSV lost the UTF-8 BOM")
	}
	records, err := csv.NewReader(bytes.NewReader(out[3:])).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 {
		t.Fatalf("rows=%d, want header+1", len(records))
	}
	row := records[1]
	want := map[int]string{
		1: `'=HYPERLINK("http://evil.example/x","x")`,
		2: `'+cmd`,
		6: `'@SUM(1+1)`,
		8: `'-2+3`,
	}
	for i, prefix := range want {
		if row[i] != prefix {
			t.Errorf("col %d = %q, want %q", i, row[i], prefix)
		}
	}
	if strings.HasPrefix(row[3], "'") {
		t.Errorf("plain severity %q should not be prefixed", row[3])
	}
}

func TestFindingFilenameUnicodeAndIDSuffix(t *testing.T) {
	// Vocalized Arabic should strip combining diacritics cleanly rather than inserting underscores.
	arabic := FindingFilename(&db.DBFinding{
		ID:       42,
		Severity: "critical",
		Name:     "ثَغْرَة حَقْن SQL",
	})
	if arabic != "critical_ثغرة_حقن_SQL_42.md" {
		t.Fatalf("arabic filename = %q, want %q", arabic, "critical_ثغرة_حقن_SQL_42.md")
	}

	// Composed Latin/Turkish letters stay intact after NFC normalization.
	turkish := FindingFilename(&db.DBFinding{
		ID:       9,
		Severity: "medium",
		Name:     "Gu\u0308venlik Ac\u0327ıg\u0306ı",
	})
	if turkish != "medium_Güvenlik_Açığı_9.md" {
		t.Fatalf("turkish filename = %q, want %q", turkish, "medium_Güvenlik_Açığı_9.md")
	}

	// BiDi RLO control characters are stripped without breaking words.
	bidi := FindingFilename(&db.DBFinding{
		ID:       15,
		Severity: "high",
		Name:     "upload\u202Egpj.exe",
	})
	if strings.ContainsRune(bidi, '\u202E') || bidi != "high_uploadgpj.exe_15.md" {
		t.Fatalf("bidi filename = %q", bidi)
	}

	// Long multi-byte titles stay valid UTF-8, within 120 bytes before .md, and keep distinct ID suffixes.
	longPrefix := strings.Repeat("اختراق_صلاحيات_", 10)
	f1 := FindingFilename(&db.DBFinding{ID: 101, Severity: "high", Name: longPrefix + "أ"})
	f2 := FindingFilename(&db.DBFinding{ID: 102, Severity: "high", Name: longPrefix + "ب"})
	for _, name := range []string{f1, f2} {
		base := strings.TrimSuffix(name, ".md")
		if len(base) > maxFindingFilenameBaseBytes {
			t.Fatalf("filename base %q exceeds %d bytes (%d)", base, maxFindingFilenameBaseBytes, len(base))
		}
	}
	if !strings.HasSuffix(f1, "_101.md") || !strings.HasSuffix(f2, "_102.md") || f1 == f2 {
		t.Fatalf("expected preserved distinct ID suffixes: f1=%q f2=%q", f1, f2)
	}
}
