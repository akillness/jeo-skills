package report

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/Autumn-27/artex/db"
	"golang.org/x/text/unicode/norm"
)

// Rendering for the findings page "Export": renders a batch of findings table rows
// into a summary Markdown, a single-finding Markdown, or CSV. JSON is serialized
// directly from DTOs at the server layer, not here.

// sortFindingsForExport sorts by severity descending, then by time descending, consistent with the summary report's grouping.
func sortFindingsForExport(fs []*db.DBFinding) {
	sort.SliceStable(fs, func(i, j int) bool {
		ri, rj := sevRank[fs[i].Severity], sevRank[fs[j].Severity]
		if ri != rj {
			return ri < rj // smaller sevRank means more severe
		}
		return fs[i].CreatedAt.After(fs[j].CreatedAt)
	})
}

// findingTitle returns the vulnerability's readable title: name → class → "Uncategorized".
func findingTitle(f *db.DBFinding) string {
	return nz(f.Name, nz(f.VulnClass, "Uncategorized"))
}

// FindingsMarkdown combines a batch of findings into a summary report (summary + grouped by severity,
// each entry with class/status/owning task/evidence/detailed report).
func FindingsMarkdown(fs []*db.DBFinding, generatedAt time.Time) string {
	items := append([]*db.DBFinding(nil), fs...)
	sortFindingsForExport(items)

	var b strings.Builder
	b.WriteString("# Vulnerability Findings Summary Report\n\n")
	fmt.Fprintf(&b, "- **Generated at**: %s\n", generatedAt.Format("2006-01-02 15:04:05"))
	fmt.Fprintf(&b, "- **Total findings**: %d\n\n", len(items))

	// Summary: counts per severity.
	counts := map[string]int{}
	for _, f := range items {
		counts[f.Severity]++
	}
	b.WriteString("## Summary\n\n")
	b.WriteString("| Severity | Count |\n| --- | --- |\n")
	for _, s := range []struct{ key, label string }{
		{"critical", "Critical"}, {"high", "High"}, {"medium", "Medium"}, {"low", "Low"},
	} {
		fmt.Fprintf(&b, "| %s | %d |\n", s.label, counts[s.key])
	}
	b.WriteString("\n")

	if len(items) == 0 {
		b.WriteString("_No matching vulnerabilities._\n")
		return b.String()
	}

	b.WriteString("## Vulnerability Details\n\n")
	for i, f := range items {
		fmt.Fprintf(&b, "### %d. [%s] %s\n\n", i+1, strings.ToUpper(nz(f.Severity, "info")), findingTitle(f))
		if f.VulnClass != "" {
			fmt.Fprintf(&b, "- **Class**: %s\n", f.VulnClass)
		}
		fmt.Fprintf(&b, "- **Status**: %s\n", nz(f.Status, "pending"))
		fmt.Fprintf(&b, "- **Report stage**: %s\n", nz(f.ReportState, "none"))
		if desc := strings.TrimSpace(f.TaskDescription); desc != "" {
			fmt.Fprintf(&b, "- **Task**: %s\n", desc)
		}
		fmt.Fprintf(&b, "- **Found at**: %s\n", f.CreatedAt.Format("2006-01-02 15:04:05"))
		q := qualityFromDBFinding(f)
		b.WriteString(qualityBullets(q, false))
		if s := strings.TrimSpace(f.Summary); s != "" {
			fmt.Fprintf(&b, "%s\n\n", s)
		}
		if e := strings.TrimSpace(f.Evidence); e != "" {
			fmt.Fprintf(&b, "**Evidence:**\n\n```\n%s\n```\n\n", e)
		}
		b.WriteString(qualityNarrative(q))
		b.WriteString(detailedReportFull(f.Report, "**Detailed report:**"))
		b.WriteString(findingTrafficMarkdown(f, false))
		b.WriteString("---\n\n")
	}
	return b.String()
}

// SingleFindingMarkdown renders a single vulnerability as a standalone Markdown (used for "one file per vulnerability" packaging).
func SingleFindingMarkdown(f *db.DBFinding, generatedAt time.Time) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# [%s] %s\n\n", strings.ToUpper(nz(f.Severity, "info")), findingTitle(f))
	if f.VulnClass != "" {
		fmt.Fprintf(&b, "- **Class**: %s\n", f.VulnClass)
	}
	fmt.Fprintf(&b, "- **Severity**: %s\n", nz(f.Severity, "info"))
	fmt.Fprintf(&b, "- **Status**: %s\n", nz(f.Status, "pending"))
	fmt.Fprintf(&b, "- **Report stage**: %s\n", nz(f.ReportState, "none"))
	if desc := strings.TrimSpace(f.TaskDescription); desc != "" {
		fmt.Fprintf(&b, "- **Task**: %s\n", desc)
	}
	fmt.Fprintf(&b, "- **Found at**: %s\n", f.CreatedAt.Format("2006-01-02 15:04:05"))
	fmt.Fprintf(&b, "- **Generated at**: %s\n", generatedAt.Format("2006-01-02 15:04:05"))
	q := qualityFromDBFinding(f)
	b.WriteString(qualityBullets(q, false))
	if s := strings.TrimSpace(f.Summary); s != "" {
		fmt.Fprintf(&b, "## Summary\n\n%s\n\n", s)
	}
	if e := strings.TrimSpace(f.Evidence); e != "" {
		fmt.Fprintf(&b, "## Evidence\n\n```\n%s\n```\n\n", e)
	}
	b.WriteString(qualityNarrative(q))
	b.WriteString(detailedReportFull(f.Report, "## Detailed Report"))
	b.WriteString(findingTrafficMarkdown(f, true))
	return b.String()
}

var unsafeFilenameChars = regexp.MustCompile(`[^\p{Han}\p{L}\p{N}._-]+`)

const maxFindingFilenameBaseBytes = 120

// stripCombiningAndFormat drops uncombined non-spacing marks (e.g. Arabic
// diacritics after NFC composition) and format controls (e.g. BiDi RLO/LRO)
// so they are omitted rather than turned into underscores between letters.
func stripCombiningAndFormat(s string) string {
	s = norm.NFC.String(s)
	return strings.Map(func(r rune) rune {
		if unicode.Is(unicode.Mn, r) || unicode.Is(unicode.Cf, r) {
			return -1
		}
		return r
	}, s)
}

func truncateUTF8Bytes(s string, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	if len(s) <= maxBytes {
		return s
	}
	n := 0
	for i := range s {
		if i > maxBytes {
			break
		}
		n = i
	}
	if n == 0 && len(s) > 0 {
		_, size := utf8.DecodeRuneInString(s)
		if size <= maxBytes {
			return s[:size]
		}
		return ""
	}
	return s[:n]
}

// FindingFilename generates a safe .md filename for "one file per vulnerability", e.g.
// `critical_SQL_injection_123.md`. Strips path separators, combining diacritics, and
// control characters to avoid illegal paths inside the zip while preserving the ID suffix.
func FindingFilename(f *db.DBFinding) string {
	sev := unsafeFilenameChars.ReplaceAllString(stripCombiningAndFormat(nz(f.Severity, "info")), "_")
	sev = strings.Trim(sev, "._")
	if sev == "" {
		sev = "info"
	}
	title := unsafeFilenameChars.ReplaceAllString(stripCombiningAndFormat(findingTitle(f)), "_")
	title = strings.Trim(title, "._")
	suffix := fmt.Sprintf("_%d", f.ID)
	prefix := sev
	if title != "" {
		prefix = sev + "_" + title
	}
	budget := maxFindingFilenameBaseBytes - len(suffix)
	if len(prefix) > budget {
		prefix = strings.TrimRight(truncateUTF8Bytes(prefix, budget), "._")
	}
	var name string
	if prefix == "" {
		name = fmt.Sprintf("finding_%d", f.ID)
	} else {
		name = prefix + suffix
	}
	// Defensive: strip one more path layer to rule out zip slip.
	name = path.Base(name)
	if name == "" || name == "." || name == ".." {
		name = fmt.Sprintf("finding_%d", f.ID)
	}
	return name + ".md"
}

// FindingsCSV renders a batch of findings as CSV (with a UTF-8 BOM so Excel detects the encoding correctly).
// It omits the long report/evidence full text and keeps only summary-level fields; use Markdown/JSON export for full text.
func FindingsCSV(fs []*db.DBFinding) []byte {
	items := append([]*db.DBFinding(nil), fs...)
	sortFindingsForExport(items)

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"ID", "Name", "Class", "Severity", "Status", "Report Stage", "Task", "Found At", "Summary", "Traffic Evidence Count", "Traffic Evidence IDs"})
	for _, f := range items {
		_ = w.Write([]string{
			fmt.Sprintf("%d", f.ID),
			csvCell(findingTitle(f)),
			csvCell(f.VulnClass),
			csvCell(nz(f.Severity, "info")),
			csvCell(nz(f.Status, "pending")),
			csvCell(nz(f.ReportState, "none")),
			csvCell(f.TaskDescription),
			csvCell(f.CreatedAt.Format("2006-01-02 15:04:05")),
			csvCell(strings.TrimSpace(f.Summary)),
			fmt.Sprint(len(f.TrafficBindings)),
			csvCell(findingTrafficIDs(f)),
		})
	}
	w.Flush()
	return buf.Bytes()
}

// csvCell prefixes cells that spreadsheet apps treat as formulas. encoding/csv
// only quotes delimiters; Excel/LibreOffice still evaluate a leading
// '=', '+', '-', '@', tab, or CR when the file is opened.
func csvCell(s string) string {
	if s == "" {
		return s
	}
	switch s[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + s
	}
	return s
}

func findingTrafficIDs(f *db.DBFinding) string {
	ids := make([]string, 0, len(f.TrafficBindings))
	for _, b := range f.TrafficBindings {
		ids = append(ids, fmt.Sprint(b.ID))
	}
	return strings.Join(ids, ",")
}

func findingTrafficMarkdown(f *db.DBFinding, attachments bool) string {
	stale := reportStale(f.Report, f.EvidenceVersion, f.ReportEvidenceVersion)
	if len(f.TrafficBindings) == 0 && !stale {
		return ""
	}
	var out strings.Builder
	out.WriteString("\n## Related Traffic Evidence\n\n")
	fmt.Fprintf(&out, "Evidence version: %d; bindings: %d.\n\n", f.EvidenceVersion, len(f.TrafficBindings))
	out.WriteString(staleReportNotice(stale))
	for i, b := range f.TrafficBindings {
		fmt.Fprintf(&out, "%d. **Evidence #%d · %s** — `%s %s`, status %d\n", i+1, b.ID, b.Role, b.Snapshot.Method, strings.ReplaceAll(b.Snapshot.URL, "`", "%60"), b.Snapshot.Status)
		if b.Note != "" {
			fmt.Fprintf(&out, "   %s\n", strings.ReplaceAll(b.Note, "\n", "\n   "))
		}
		if attachments {
			fmt.Fprintf(&out, "   [Request message](evidence/%d/%d/request.http) · [Response message](evidence/%d/%d/response.http)\n", f.ID, b.ID, f.ID, b.ID)
		}
	}
	out.WriteString("\n")
	return out.String()
}
