---
title: Skill Standardization Structural Hardening
created: 2026-04-17
updated: 2026-04-17
type: query
tags: [skills, skill-quality, trigger-design, consolidation, docs]
sources: [.survey/skill-standardization-structural-hardening-20260417/context.md, .survey/skill-standardization-structural-hardening-20260417/solutions.md, .survey/skill-standardization-structural-hardening-20260417/platform-map.md, .agent-skills/skill-standardization/SKILL.md, .agent-skills/skill-standardization/references/working-modes.md, .agent-skills/skills.json, graphify-out/GRAPH_REPORT.md]
---

# Skill Standardization Structural Hardening

## Question
What is the best bounded improvement for `skill-standardization` now that support coverage is already complete across the live skill set?

## Answer
Harden `skill-standardization` in place instead of creating another meta-skill. The most transferable win is to make the canonical skill truthful about repo-root execution, shrink the front door into a routing-first maintenance anchor, and sync derived discovery artifacts (`skills.json`, README/setup, `SKILL.toon`) in the same pass.

## Why this won
- The graph layer had already moved from missing-support problems to dense-anchor cleanup, and `skill-standardization` was still on the oversized watchlist.
- The current repo actually uses nested repo-root validator commands, but the skill still advertised bare `scripts/...` examples that fail from the repo root.
- `skills.json` still carried stale legacy `skill-standardization` commands/source paths, so the drift was not only conceptual; it was shipping in discovery metadata.
- This fix transfers across future modernization runs because `skill-standardization` is part of the fixed evaluation harness for many maintenance loops.

## Accepted change shape
- Shrink `skill-standardization/SKILL.md` from 315 lines to 201 lines.
- Add `references/working-modes.md` for execution modes, repo-root vs skill-local command forms, template reuse, and validator-coverage boundaries.
- Refresh `SKILL.toon`, `skills.json`, `.agent-skills/skills.toon`, README / README.ko / setup prompt discovery wording.
- Expand eval coverage with a repo-root command-truthfulness case.
- Preserve the boundary with [[skill-autoresearch-hardening-2026-04-16]]: `skill-standardization` owns spec/canonicalization/discovery sync, while `skill-autoresearch` owns frozen-evaluator keep/revert loops.

## Rejected alternatives
- Creating another validation-adjacent meta-skill for repo-root execution or derived-surface sync
- Rewriting the validator scripts first instead of fixing the canonical skill and manifest truthfulness
- Leaving discovery/docs/manifests untouched after a material trigger-surface rewrite

## Durable note
With repo-wide `references/`, `evals/`, and compact variants already complete, future maintenance value is more likely to come from truthful high-degree routers and stale-discovery cleanup than from adding new support folders. See [[skill-support-coverage]] and [[skill-standardization-variant-sync-2026-04-15]].
