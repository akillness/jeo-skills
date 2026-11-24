// Package report renders a deliverable Markdown report from the exploration
// graph: confirmed findings (with severity/evidence) (docs §15 P5).
package report

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
)

// Input bundles what the report needs.
type Input struct {
	Title       string
	Goal        string
	GeneratedAt time.Time
	AssetCounts map[string]int
	Findings    []*db.Node
	Coverage    *db.CoverageLedger // nil when the task's coverage feature is off

	// Quality carries the standalone findings-row data (poe level, verification
	// state, the two attestations, both evidence versions and the reporter-written
	// body) keyed by finding node id, from the report's single quality lookup. The
	// exploration node payload has none of it; without this map every finding would
	// render as an unqualified claim.
	//
	// Three states, deliberately distinct: an empty but non-nil map means the task
	// has no standalone rows (nothing was assessed); a nil map means the lookup
	// failed, which says nothing about the findings themselves; an entry means the
	// row exists. Collapsing failure into absence would turn a database error into a
	// statement about the finding.
	Quality map[int64]db.FindingQuality
}

// reportMaxGaps caps the coverage gap list of the report; the rest is counted.
const reportMaxGaps = 200

type findingView struct {
	VulnClass string
	Name      string
	Severity  string
	Summary   string
	PoC       string
	Q         Quality // proof-strength fields grafted from the standalone row
}

func parseFinding(n *db.Node) findingView {
	var p struct {
		VulnClass string `json:"vulnclass"`
		Name      string `json:"name"`
		Severity  string `json:"severity"`
		Summary   string `json:"summary"`
		Evidence  struct {
			PoC string `json:"poc"`
		} `json:"evidence"`
	}
	_ = json.Unmarshal(n.Payload, &p)
	return findingView{VulnClass: p.VulnClass, Name: p.Name, Severity: p.Severity, Summary: p.Summary, PoC: p.Evidence.PoC}
}

var sevRank = map[string]int{"critical": 0, "high": 1, "medium": 2, "low": 3, "": 4}

// Markdown renders the report.
func Markdown(in Input) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Penetration Test Report — %s\n\n", nz(in.Title, "Unnamed task"))
	fmt.Fprintf(&b, "- **Task goal**: %s\n", nz(in.Goal, "(unspecified)"))
	fmt.Fprintf(&b, "- **Generated at**: %s\n\n", in.GeneratedAt.Format("2006-01-02 15:04:05"))

	// summary
	fmt.Fprintf(&b, "## Summary\n\n")
	fmt.Fprintf(&b, "- Confirmed findings: **%d**\n", len(in.Findings))
	fmt.Fprintf(&b, "- Assets: ")
	var types []string
	for t := range in.AssetCounts {
		types = append(types, t)
	}
	sort.Strings(types)
	for i, t := range types {
		if i > 0 {
			b.WriteString(", ")
		}
		fmt.Fprintf(&b, "%s %d", t, in.AssetCounts[t])
	}
	b.WriteString("\n\n")

	// findings
	fmt.Fprintf(&b, "## Findings\n\n")
	if len(in.Findings) == 0 {
		b.WriteString("_No vulnerabilities confirmed this time._\n\n")
	} else {
		fs := make([]findingView, 0, len(in.Findings))
		for _, n := range in.Findings {
			v := parseFinding(n)
			v.Q = qualityFromRows(n.ID, in.Quality)
			fs = append(fs, v)
		}
		sort.SliceStable(fs, func(i, j int) bool { return sevRank[fs[i].Severity] < sevRank[fs[j].Severity] })
		for i, f := range fs {
			fmt.Fprintf(&b, "### %d. [%s] %s\n\n", i+1, strings.ToUpper(nz(f.Severity, "info")), nz(f.Name, nz(f.VulnClass, "Uncategorized")))
			fmt.Fprintf(&b, "%s\n\n", nz(f.Summary, ""))
			b.WriteString(qualityBullets(f.Q, true)) // honest proof strength, including its gaps
			if f.PoC != "" {
				fmt.Fprintf(&b, "**PoC / Evidence:**\n\n```\n%s\n```\n\n", f.PoC)
			}
			b.WriteString(qualityNarrative(f.Q)) // why it holds / what failed, only when written
			// The same warning, from the same helper, that the findings export prints: a
			// report written against older evidence is stale on both surfaces or on neither.
			b.WriteString(staleReportNotice(f.Q.ReportStale()))
			b.WriteString(detailedReport(f.Q.Report, "**Detailed report:**"))
		}
	}

	if c := in.Coverage; c != nil {
		fmt.Fprintf(&b, "## Coverage gaps\n\n")
		if c.Completeness != nil {
			fmt.Fprintf(&b, "- **Completeness**: %s. %s\n", c.Completeness.State, c.Completeness.Caveat)
		}
		fmt.Fprintf(&b, "- Ledger entries: %d, open gaps: %d\n", len(c.Entries), len(c.Gaps))
		for i, g := range c.Gaps {
			if i == reportMaxGaps {
				fmt.Fprintf(&b, "- and %d more (see the coverage API)\n", len(c.Gaps)-reportMaxGaps)
				break
			}
			fmt.Fprintf(&b, "- %s\n", g)
		}
		b.WriteString("\n")
	}

	return b.String()
}

func nz(s, d string) string {
	if strings.TrimSpace(s) == "" {
		return d
	}
	return s
}
