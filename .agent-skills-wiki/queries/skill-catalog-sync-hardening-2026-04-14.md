---
title: Skill Catalog Sync Hardening
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, consolidation, skill-quality, docs]
sources: [.survey/skill-catalog-sync-hardening-20260414/triage.md, .survey/skill-catalog-sync-hardening-20260414/context.md, .survey/skill-catalog-sync-hardening-20260414/solutions.md, .agent-skills/skill-standardization/SKILL.md, .agent-skills/skill-standardization/scripts/validate_catalog_sync.py, .agent-skills/skill-query-handler.py, graphify-out/GRAPH_REPORT.md]
---

# Skill Catalog Sync Hardening

## Question
What was the highest-value bounded maintenance move after the `codebase-search` pass exposed catalog drift between live skill folders, `skills.json`, and the top-level README/setup inventory surfaces?

## Answer
The best bounded move was **catalog-sync hardening**, not another new skill. The repo already had the right skill surface area, but discovery was brittle because runtime querying trusted the manifest too early and the top-level docs/setup surfaces still hid real skills — especially the game-development specialist lane.

## Accepted changes
- `skill-query-handler.py` now builds the catalog from the live filesystem first, then overlays manifest metadata when names match.
- `skill-standardization` now explicitly covers catalog/discovery sync, not just per-skill `SKILL.md` linting.
- Added `skill-standardization/scripts/validate_catalog_sync.py` to compare live skill folders against `skills.json` and top-level discovery-count surfaces.
- Added `skill-standardization/references/catalog-sync-checklist.md` and expanded `evals/evals.json` so future maintenance runs can validate the same failure mode.
- Repaired `.agent-skills/skills.json` membership/count drift and surfaced the game-development lane in README / README.ko / setup inventory surfaces.
- Refreshed `graphify-out/` so the structural snapshot records the repaired state instead of the previous mismatch.

## Rejected changes
- Adding another broad maintenance/meta skill just for catalogs.
- Leaving runtime discovery manifest-first and only fixing counts in docs.
- Deferring specialist game-skill visibility to a later run after repairing the manifest.

## Durable insight
For this repo, **filesystem-first discovery + catalog validation** is a better maintenance ratchet than continuing to treat `skills.json` and README/setup inventories as manually synchronized truth. The live folders should define what exists; manifests and docs should be checked against that source of truth in the same PR.

## Related pages
- [[skill-support-coverage]]
- [[search-analysis-cluster]]
- [[game-development-cluster]]
- [[codebase-search-modernization-2026-04-14]]
