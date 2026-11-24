package report

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/Autumn-27/artex/db"
)

// Quality is the proof-strength descriptor of one finding: how far exploitation
// actually reached (PoE), whether the claim was machine-verified, what was tried
// and did not work, why the conclusion still holds, and how many traffic
// exchanges are bound to it as evidence.
//
// The task report and the findings exports render it through the same helpers so
// one finding never says two different things in two deliverables. Deliberate
// design rule: an honest gap (unverified, zero bound traffic, unreported) is
// printed, never silently dropped — a report that hides its own weakness is
// worth less than one that states it.
type Quality struct {
	PoE                   int
	Verification          string
	VerificationNote      string
	ConfidenceRationale   string
	Counterevidence       string
	TrafficCount          int
	RecordID              int64  // standalone findings-table id; 0 = no row
	Report                string // reporter-written detailed report body (Markdown)
	EvidenceVersion       int64  // version of the evidence bound to the row
	ReportEvidenceVersion int64  // evidence version the stored report was written against

	// Missing marks a finding node with no standalone findings row at all: no
	// PoE level, no verification state and no traffic binding was ever recorded.
	// It is distinct from a row that exists and says unverified.
	Missing bool

	// Unavailable marks a lookup that could not be read at all (the row map is
	// nil, i.e. the query failed). It is deliberately a third state: a failed
	// lookup is not evidence about the finding, so it must never be rendered as
	// "no finding record" and never as "unverified".
	Unavailable bool
}

// ReportStale reports whether the stored report predates the evidence it
// describes. Both surfaces ask this one function, so the task report and the
// findings export cannot disagree about the same report.
func (q Quality) ReportStale() bool {
	return reportStale(q.Report, q.EvidenceVersion, q.ReportEvidenceVersion)
}

// reportStale is the predicate behind ReportStale, taking the raw row fields so
// callers holding a db.DBFinding (the export path) ask the same question.
func reportStale(report string, evidenceVersion, reportEvidenceVersion int64) bool {
	return report != "" && evidenceVersion != reportEvidenceVersion
}

// qualityFromRows builds a Quality from the report's single quality lookup,
// keyed by finding node id. A nil map means the lookup itself failed
// (unavailable); an empty map means the task genuinely has no standalone rows.
func qualityFromRows(nodeID int64, rows map[int64]db.FindingQuality) Quality {
	if rows == nil {
		return Quality{Unavailable: true}
	}
	q, ok := rows[nodeID]
	if !ok {
		return Quality{Missing: true}
	}
	return Quality{
		PoE:                   q.PoeLevel,
		Verification:          q.VerificationStatus,
		VerificationNote:      q.VerificationNote,
		ConfidenceRationale:   q.ConfidenceRationale,
		Counterevidence:       q.Counterevidence,
		TrafficCount:          q.TrafficCount,
		RecordID:              q.ID,
		Report:                q.Report,
		EvidenceVersion:       q.EvidenceVersion,
		ReportEvidenceVersion: q.ReportEvidenceVersion,
	}
}

// qualityFromDBFinding builds a Quality from a standalone findings row.
func qualityFromDBFinding(f *db.DBFinding) Quality {
	return Quality{
		PoE:                   f.PoELevel,
		Verification:          f.VerificationStatus,
		VerificationNote:      f.VerificationNote,
		ConfidenceRationale:   f.ConfidenceRationale,
		Counterevidence:       f.Counterevidence,
		TrafficCount:          f.TrafficCount,
		RecordID:              f.ID,
		Report:                f.Report,
		EvidenceVersion:       f.EvidenceVersion,
		ReportEvidenceVersion: f.ReportEvidenceVersion,
	}
}

// qualityBullets renders the proof-strength bullets (record id, PoE level,
// verification state, bound evidence count, verification note). It always emits
// a verification line and always accounts for bound traffic, including the
// honest "nothing bound" case, and ends with a blank line when non-empty.
func qualityBullets(q Quality, alwaysProof bool) string {
	var b strings.Builder
	// A failed lookup is not an absence: say the fields could not be read, and say
	// nothing else. A DB error must never turn into a claim about the finding.
	if q.Unavailable {
		b.WriteString("- **Verification**: unknown (quality lookup failed — proof strength unavailable)\n\n")
		return b.String()
	}
	if q.Missing {
		b.WriteString("- **Verification**: not assessed (no finding record — quality fields unavailable)\n\n")
		return b.String()
	}
	if q.RecordID > 0 {
		fmt.Fprintf(&b, "- **Finding record**: #%d\n", q.RecordID)
	}
	fmt.Fprintf(&b, "- **PoE level**: %d\n", q.PoE)
	fmt.Fprintf(&b, "- **Verification**: %s\n", verificationLabel(q.Verification))
	// alwaysProof is true for the task report, which has no traffic section of its own.
	// The findings export passes false: when anything is bound its traffic section
	// already states the count ("bindings: N"), so a bullet would be the same number
	// twice in one document. The empty case is kept either way — that section renders
	// nothing when nothing is bound, and "no evidence was bound" is a finding about
	// the finding, not a duplicate of a count.
	if alwaysProof || q.TrafficCount == 0 {
		if q.TrafficCount > 0 {
			fmt.Fprintf(&b, "- **Proof**: %d bound traffic exchange(s)\n", q.TrafficCount)
		} else {
			b.WriteString("- **Proof**: no bound traffic evidence\n")
		}
	}
	if note := oneLine(q.VerificationNote); note != "" {
		fmt.Fprintf(&b, "- **Verification note**: %s\n", note)
	}
	b.WriteString("\n")
	return b.String()
}

// qualityNarrative renders the two prose attestations, each only when it was
// actually written — an absent one produces no heading at all, so a reader can
// never mistake an empty field for an empty claim.
func qualityNarrative(q Quality) string {
	if q.Missing || q.Unavailable {
		return ""
	}
	var b strings.Builder
	if s := strings.TrimSpace(q.ConfidenceRationale); s != "" {
		fmt.Fprintf(&b, "**Confidence rationale**:\n\n%s\n\n", s)
	}
	if s := strings.TrimSpace(q.Counterevidence); s != "" {
		fmt.Fprintf(&b, "**Counterevidence**:\n\n%s\n\n", s)
	}
	return b.String()
}

// staleReportNotice is the one warning both surfaces print when the evidence moved
// after the report was written. The task report and the findings export both call
// it, so the two deliverables can never drift on the same claim. It sits next to
// Quality.ReportStale so the predicate and its wording stay together.
func staleReportNotice(stale bool) string {
	if !stale {
		return ""
	}
	return "The evidence has changed; the detailed report needs updating.\n\n"
}

// reportMaxReportBytes caps the detailed report inlined into the task report, so
// one finding cannot dominate a document that also has to list every other one.
const reportMaxReportBytes = 8 << 10

// detailedReport renders the reporter-written body (overview / impact /
// reproduction / evidence / fix), capped, for the task report. heading lets the
// caller keep the document's own structure: the task report uses a bold label
// (it is one block among many findings), the single-finding export uses an H2 so
// the body stays a section like its siblings. Nothing is rendered when the body
// was never written.
func detailedReport(body, heading string) string {
	return detailedReportLimit(body, heading, reportMaxReportBytes)
}

// detailedReportFull renders the same body uncapped. The findings export is the
// canonical per-finding document, so it must never silently shorten the report.
func detailedReportFull(body, heading string) string {
	return detailedReportLimit(body, heading, 0)
}

func detailedReportLimit(body, heading string, limit int) string {
	s := strings.TrimSpace(body)
	if s == "" {
		return ""
	}
	if limit > 0 && len(s) > limit {
		cut := s[:limit]
		for len(cut) > 0 && !utf8.ValidString(cut) {
			cut = cut[:len(cut)-1] // never split a rune
		}
		cut = strings.TrimSpace(cut)
		// Rune safety is not enough: a cut inside an open ``` fence would swallow the
		// truncation note — and every section after it, other findings included — into
		// the stale code block. Close the fence before the note so the rest of the
		// document still parses as the document.
		if unbalancedFence(cut) {
			cut += "\n```"
		}
		return heading + "\n\n" + cut +
			fmt.Sprintf("\n\n_Detailed report truncated at %d KiB; read the full text from the finding record._\n\n", limit>>10)
	}
	return heading + "\n\n" + s + "\n\n"
}

// unbalancedFence reports whether s ends inside an open fenced code block, i.e.
// whether it holds an odd number of fence delimiters. A delimiter is a line whose
// first non-space content is ``` — an opening fence with an info string and a bare
// closing fence both count, which is exactly what a Markdown renderer pairs up.
func unbalancedFence(s string) bool {
	fences := 0
	for _, line := range strings.Split(s, "\n") {
		if strings.HasPrefix(strings.TrimLeft(line, " \t"), "```") {
			fences++
		}
	}
	return fences%2 == 1
}

// verificationLabel renders a verification state for a human-readable document.
// The five labels match the ones the web UI already shows for the same values; an
// unrecognised value is printed verbatim instead of hidden, so a new state can
// never silently disappear from a report.
func verificationLabel(s string) string {
	switch s {
	case "", db.VerificationUnverified:
		return "Unverified"
	case db.VerificationVerified:
		return "Verified"
	case db.VerificationBlocked:
		return "Blocked"
	case db.VerificationNotAssessed:
		return "Not assessed"
	case db.VerificationFalsePositive:
		return "False positive"
	}
	return s
}

// oneLine collapses a note onto a single line so it can sit inside a bullet.
func oneLine(s string) string {
	return strings.Join(strings.Fields(s), " ")
}
