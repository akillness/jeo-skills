# Solution Landscape: research-paper-writing hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Overleaf | Collaborative LaTeX editor | Conference-template friendly, comments, version history, coauthoring | Does not solve argument structure or rebuttal planning by itself | https://www.overleaf.com/about/features-overview |
| Git/GitHub | Version control + review workflow | Strong diffing, manuscript/code coupling, task tracking | Higher friction for non-technical coauthors | https://github.com/ |
| OpenReview | Venue review/rebuttal platform | Central to ML rebuttal/discussion workflows | Venue-bound; not a full drafting tool | https://openreview.net/about |
| Zotero + Better BibTeX | Reference management | Common CS/ML citation workflow, BibTeX stability | Still requires cleanup and bridge work | https://www.zotero.org/ and https://retorque.re/zotero-better-bibtex/ |
| Paperpile | Cloud-first reference workflow | Good Docs-centric citation flow | Less central in LaTeX-heavy labs | https://paperpile.com/ |
| Google Docs / Microsoft Word | Early drafting and comments | Low friction for outlining, review, cover letters, rebuttal drafting | Formatting/citation conversion later | https://workspace.google.com/products/docs/ and https://www.microsoft.com/microsoft-365/word |
| Authorea | Scientific writing platform | Research-native collaborative authoring | Smaller footprint than Overleaf in ML/CS | https://www.authorea.com/ |
| ResearchRabbit / Connected Papers / Semantic Scholar | Literature discovery | Strong related-work discovery and citation chasing | Not manuscript-structure tools | https://www.researchrabbit.ai/ ; https://www.connectedpapers.com/ ; https://www.semanticscholar.org/ |
| Writefull / Trinka / Paperpal | Academic language assistants | Useful for polishing and language cleanup | Often surface-level; weak on novelty framing and claim-evidence logic | https://www.writefull.com/ ; https://www.trinka.ai/ ; https://paperpal.com/ |
| Editage / AJE | Human editorial services | Helpful for final language polish or response-letter refinement | External-service cost; not reusable workflow logic | https://www.editage.com/services/english-editing and https://www.aje.com/services/editing/ |

## Categories
- Drafting & collaboration: Overleaf, Google Docs, Word, Authorea, Git/GitHub
- Review & rebuttal: OpenReview, comments / tracked changes, PR-style review
- Reference management: Zotero, Better BibTeX, Paperpile, Mendeley, EndNote
- Literature discovery feeding writing: ResearchRabbit, Connected Papers, Semantic Scholar, SciSpace
- Language / polishing layer: Writefull, Trinka, Paperpal, Grammarly, editing services

## What People Actually Use
In practice, researchers still run a fragmented stack: notes in one place, citations in another, drafting in Docs/Word or Overleaf, figures built externally, and rebuttals tracked in spreadsheets or ad hoc matrices. The real workflow is closer to “assemble a paper package” than “type into one smart document tool.”

## Frequency Ranking
1. Overleaf
2. Zotero + Better BibTeX
3. Git/GitHub
4. OpenReview
5. Google Docs / Word
6. Paperpile
7. ResearchRabbit / Connected Papers / Semantic Scholar
8. Academic-language assistants (Writefull / Trinka / Paperpal)

## Key Gaps
- Few tools connect paper claims to experiments, figures, and rebuttal items in one coherent workflow.
- Academic-language tools polish prose but rarely help with evidence packaging, contribution framing, or reviewer anticipation.
- Review/rebuttal workflows still depend on manual matrices, sidecar notes, and copy-paste across platforms.
- The strongest reusable need is structured guidance for abstract → intro → method → experiments → rebuttal, not another general writing wrapper.

## Contradictions
- Marketed claim: “collaborative writing platform.” Reality: collaboration features help editing, but authors still juggle sidecar assets, figures, citations, and reviewer spreadsheets.
- Marketed claim: “AI writing help.” Reality: most tools improve wording more than research logic, evidence sufficiency, or reviewer-facing completeness.
- Marketed claim: “all-in-one research workspace.” Reality: researchers still move among manuscript editors, citation managers, discovery tools, and venue portals.

## Key Insight
The bounded opportunity is not to expand `research-paper-writing` into generic academic tooling. The durable gap is a specialized manuscript workflow skill with stronger support artifacts: references that encode paper-structure, evidence-packaging, and rebuttal patterns, plus evals that keep those boundaries sharp over time.
