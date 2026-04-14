---
title: skill-standardization variant sync
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/skill-standardization-variant-sync-20260415/triage.md, .survey/skill-standardization-variant-sync-20260415/context.md, .survey/skill-standardization-variant-sync-20260415/solutions.md, .agent-skills/skill-standardization/SKILL.md, .agent-skills/skill-standardization/references/catalog-sync-checklist.md, .agent-skills/skill-query-handler.py]
---

# skill-standardization variant sync

## Why this was the right bounded target
The highest-value follow-up after catalog-sync hardening was not another maintenance meta-skill. It was tightening `skill-standardization` so future modernization passes stop at the right boundary: `SKILL.md` remains the source of truth, but compact runtime-discovery variants such as `SKILL.toon` and `SKILL.compact.md` are still derived artifacts that must be reviewed whenever the trigger surface changes materially.

## Accepted changes
- Expanded `skill-standardization/SKILL.md` so the reusable workflow explicitly covers compact-variant drift, not just spec compliance and `skills.json` / README/setup sync.
- Updated `skill-standardization/SKILL.toon` and the repo-level `.agent-skills/skills.toon` entry so compact discovery surfaces advertise the stronger contract instead of the older, narrower wording.
- Extended `references/catalog-sync-checklist.md` with a dedicated compact-variant section.
- Added an eval that checks whether a rewritten skill also revalidates `SKILL.toon` / `SKILL.compact.md` and keeps runtime discovery in scope.
- Updated README / README.ko and `skills.json` so top-level discovery surfaces reflect the sharper standardization role.

## Rejected changes
- Adding a separate `compact-skill-sync` or similar meta-skill.
- Treating compact variants as new source-of-truth files independent from `SKILL.md`.
- Expanding `validate_catalog_sync.py` into a brittle content-diff checker for generated compact files in the same bounded run.

## Durable boundary
- `skill-standardization` owns **spec compliance, trigger quality, duplicate canonicalization, catalog-sync checks, and compact discovery-variant review**.
- `validate_catalog_sync.py` still owns the fast manifest/README/setup verification layer.
- Runtime files such as `skill-query-handler.py` and `skill_loader.py` remain the evidence that compact variants affect real retrieval behavior.

## Key insight
Catalog drift and compact-variant drift are different failure modes. The first is about whether the repo can find the right skill at all; the second is about whether runtime discovery is still describing the skill truthfully after a rewrite. The transferable fix is to teach `skill-standardization` to guard both.

## Related pages
- [[skill-catalog-sync-hardening-2026-04-14]]
- [[skill-support-coverage]]
- [[developer-workflow-cluster]]
- [[npm-git-install-modernization-2026-04-15]]
