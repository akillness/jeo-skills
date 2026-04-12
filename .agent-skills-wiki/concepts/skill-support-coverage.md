---
title: Skill Support Coverage
created: 2026-04-12
updated: 2026-04-12
type: concept
tags: [skills, skill-quality, graphify]
sources: [graphify-out/GRAPH_REPORT.md]
---

# Skill Support Coverage

## Durable finding
Support coverage is uneven across the `.agent-skills` corpus.

Current structural snapshot from the graph-style scan:
- 89 total skills
- 25 skills with `references/`
- 21 skills with `evals/`

## Why it matters
- Missing references weaken reuse and make trigger boundaries harder to maintain.
- Missing evals make ratcheting and regression checks harder for future improvement loops.
- Generic legacy skills should usually be upgraded with support files before adding new overlapping skills.

## Operational rule
When a legacy skill is materially upgraded, prefer adding at least one of:
- `references/` for durable heuristics
- `evals/evals.json` for dry-run validation

## Related pages
- [[project-management-cluster]]
- [[task-planning-modernization-2026-04-12]]
