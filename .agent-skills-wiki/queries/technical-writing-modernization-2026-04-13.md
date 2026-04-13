---
title: Technical-writing modernization
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, skill-quality, trigger-design, docs, survey]
sources: [.survey/technical-writing-modernization-20260413/triage.md, .survey/technical-writing-modernization-20260413/context.md, .survey/technical-writing-modernization-20260413/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Technical-writing modernization

## Summary
The best bounded documentation-cluster improvement was modernizing `technical-writing` into the internal technical-docs anchor instead of adding another documentation wrapper or merging it into neighboring skills.

## Why this won
- `technical-writing` was still a high-visibility legacy anchor in the discovery docs and `skills.json`.
- The old skill body was 581 lines, failed the standardization length guideline, and mixed specs, runbooks, API docs, user guides, and changelogs into one catch-all lane.
- Graphify already recorded duplicate pressure between `technical-writing`, `user-guide-writing`, `api-documentation`, and `changelog-maintenance`, so a boundary-focused modernization was more transferable than a new skill.

## Changes accepted
- Rewrote `technical-writing/SKILL.md` as a mode-selecting internal-docs skill covering specs, architecture docs, ADRs, runbooks, migration guides, and internal developer guides.
- Added support references for document modes/boundaries, quality checklists, and docs-as-code maintenance notes.
- Added `evals/evals.json` to freeze spec, ADR, runbook, and route-out behavior.
- Updated `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `skills.json` so discovery surfaces reflect the sharper role.
- Refreshed the structural graph; support coverage rose to 49 skills with `references/` and 48 with `evals/`.

## Changes rejected
- Creating another generic documentation wrapper.
- Merging `technical-writing` into `api-documentation`, `user-guide-writing`, or `changelog-maintenance`.
- Leaving the legacy skill as a giant template dump with weak routing.

## Durable boundary note
Keep `technical-writing` focused on internal technical docs that explain decisions, structure, operations, migrations, and implementation reality. If the work becomes portal publishing, end-user education, or release-note upkeep, route out immediately.

## Related pages
- [[documentation-cluster]]
- [[skill-support-coverage]]
- [[backend-api-cluster]]
