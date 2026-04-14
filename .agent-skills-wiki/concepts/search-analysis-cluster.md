---
title: Search Analysis Cluster
created: 2026-04-14
updated: 2026-04-14
type: concept
tags: [skills, search-analysis, trigger-design, skill-quality, graphify]
sources: [.survey/codebase-search-modernization-20260414/context.md, .survey/codebase-search-modernization-20260414/solutions.md, .agent-skills/codebase-search/SKILL.md]
---

# Search Analysis Cluster

## Durable finding
The search-analysis lane works best when each skill owns a different stage of the discovery loop:
- `codebase-search` = repo navigation, call-site tracing, entry-point/config hunting, and impact mapping before edits
- `log-analysis` = signal extraction and root-cause-oriented triage from logs
- `data-analysis` = dataset/statistical analysis rather than source-code navigation
- `pattern-detection` = repeated pattern/anomaly detection across code or data, not routine repo wayfinding

## Boundary that matters
`codebase-search` should stay discovery-first.
It becomes weak when it tries to absorb:
- root-cause diagnosis (`debugging`)
- log triage (`log-analysis`)
- structural cleanup (`code-refactoring`)
- persistent architecture graphing (`graphify`)

## Structural note
`codebase-search` is README-visible and referenced by `code-refactoring`, so weak trigger wording in this skill creates spillover across the code-quality and search-analysis clusters.

## Recommended maintenance direction
- Keep `codebase-search` as the repo-navigation anchor.
- Prefer support bundles that teach search-mode choice and evidence-map output, not giant command catalogs.
- Re-check discovery wording in README/setup surfaces whenever `codebase-search` is materially repositioned.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[code-refactoring-modernization-2026-04-14]]
- [[log-analysis-modernization-2026-04-13]]
- [[codebase-search-modernization-2026-04-14]]
