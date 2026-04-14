# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 61
- Skills with evals/: 60
- Skills with scripts/: 23
- Graph nodes: 283
- Graph edges: 937

## Strongest structural findings
1. The search-analysis lane is now cleaner: `pattern-detection` can act as the repeatable rule/anomaly-hunting anchor while `data-analysis` owns stakeholder explanation and `log-analysis` owns root-cause forensics.
2. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so wording changes there still materially affect activation.
3. Support coverage keeps improving through modernization passes; `pattern-detection` now joins the set of search-analysis anchors with references + evals.
4. The repo still benefits more from tightening existing anchors and route-outs than from adding overlapping wrapper skills in already-covered clusters.
5. Search-analysis remains a bridge cluster touching code-quality, analytics, and game telemetry use cases, so boundary wording matters more here than in narrower specialist lanes.

## Community map
- code-quality
- documentation
- frontend
- game-development
- infrastructure
- marketing
- project-management
- search-analysis
- uncategorized

## Highest-degree nodes
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- survey: degree 59
- debugging: degree 41
- wiki:concepts/skill-support-coverage.md: degree 33
- code-review: degree 27
- testing-strategies: degree 26
- performance-optimization: degree 26
- api-documentation: degree 25

## Duplicate / consolidation notes
- `pattern-detection` now separates cleanly from `data-analysis` (decision-ready explanation) and `log-analysis` (incident/root-cause triage) instead of acting as another generic analytics wrapper.
- `video-production` / `remotion-video-production`, `design-system` / `frontend-design-system`, and `marketing-automation` / `marketing-skills-collection` still fit the canonical-skill + compatibility-alias pattern.
- No new overlapping search-analysis wrapper was added in this pass; the bounded improvement stayed inside the existing `pattern-detection` anchor.

## Recommended maintenance direction
- Keep modernizing search-analysis anchors by strengthening route-outs and support bundles rather than adding duplicate analysis skills.
- Continue validating README / README.ko / setup prompt wording whenever a high-degree anchor changes role or trigger shape.
- Prefer mode-selection language for cross-domain skills that touch code, logs, metrics, and telemetry, because the main failure mode is job-boundary confusion.
