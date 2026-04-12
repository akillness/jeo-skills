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
- 90 total skills
- 27 skills with `references/`
- 25 skills with `evals/`

Recent ratchet:
- The React canonical/alias pair now both include `evals/`, which raised support coverage in a high-visibility frontend lane without adding a new skill.

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
