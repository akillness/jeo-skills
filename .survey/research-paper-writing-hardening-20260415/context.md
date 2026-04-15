# Context: research-paper-writing hardening

## Workflow Context
`research-paper-writing` sits inside a larger submission-and-review workflow, not a prose-only workflow. In ML/AI/CS, authors typically move through collaborative drafting, reference management, figure/table iteration, checklist compliance, rebuttal writing, and revision loops rather than one linear manuscript pass. OpenReview’s review/discussion/rebuttal model makes this explicit, while Overleaf’s documentation emphasizes comments, tracked changes, version history, and Git/GitHub sync because multi-author churn is routine.

The strongest writing burden appears where claims, evidence, and venue requirements meet: abstracts need concrete quantitative framing, methods need reproducible detail, experiments must map back to contribution claims, and rebuttals need point-by-point evidence rather than generic persuasion.

Sources:
- OpenReview About — https://openreview.net/about
- Overleaf collaboration docs — https://docs.overleaf.com/collaborating/sharing-a-project
- Overleaf track changes — https://docs.overleaf.com/collaborating/track-changes
- Overleaf history/versioning — https://docs.overleaf.com/navigating-in-the-editor/using-the-history-feature
- Overleaf Git/GitHub sync — https://docs.overleaf.com/integrations-and-add-ons/git-integration-and-github-synchronization
- NeurIPS Paper Checklist — https://neurips.cc/public/guides/PaperChecklist

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Lead author / PhD student | Turn experiments and notes into a submission-ready paper under deadline pressure | Intermediate to advanced research, uneven writing maturity |
| Coauthoring research team | Review sections, request edits, keep references/figures/results synchronized | Mixed |
| Advisor / senior collaborator | Tighten novelty framing, contribution claims, and reviewer-facing logic | Advanced |
| Rebuttal owner | Convert reviewer comments into direct responses, text changes, and experiment follow-ups | Intermediate to advanced |
| Agent assisting the paper workflow | Draft, revise, or critique sections while preserving claim-evidence integrity | Depends on the calling agent |

## Current Workarounds
1. Draft in Google Docs or Word, then manually port into LaTeX/Overleaf once argument structure stabilizes.
2. Manage references in Zotero / Better BibTeX or Paperpile, then bridge into BibTeX manually.
3. Track reviewer comments and rebuttal items in spreadsheets or tables before copying the final text into OpenReview or response letters.
4. Iterate figures outside the manuscript (Python/R/Matlab/Illustrator/PowerPoint), then replace exported assets and update captions by hand.
5. Use venue checklists and author templates as late-stage completeness guards rather than as an integrated writing system.

## Adjacent Problems
- Reproducibility and reporting burden: compute, data, limitations, and artifact disclosure change what the paper must say.
- Code-paper drift: experiments, tables, and figures change late, but manuscript claims need to stay synchronized.
- Submission-format friction: anonymization, page limits, and template compliance consume time unrelated to scientific insight.
- Review-response compression: rebuttal windows force teams into evidence-first, high-pressure revision loops.
- Cross-tool fragmentation: notes, citations, manuscript text, figures, and reviewer matrices live in separate places.

## User Voices
- Overleaf’s collaboration product surface implies repeated demand for simultaneous editing, comments, and tracked changes rather than solo writing alone: https://docs.overleaf.com/collaborating/track-changes
- The presence of version history and Git/GitHub sync features points to persistent draft churn and rollback needs: https://docs.overleaf.com/navigating-in-the-editor/using-the-history-feature and https://docs.overleaf.com/integrations-and-add-ons/git-integration-and-github-synchronization
- NeurIPS’ checklist encodes recurring reviewer pain about omitted methodological detail, weak limitation reporting, and incomplete experiment disclosure: https://neurips.cc/public/guides/PaperChecklist
- OpenReview’s author-response workflow reflects the reality that papers need structured rebuttal support after the initial draft: https://openreview.net/faq?id=author-response
