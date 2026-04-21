---
title: Plannotator modernization
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, skill-quality, trigger-design, docs, survey]
sources: [.survey/plannotator-modernization-20260413/triage.md, .survey/plannotator-modernization-20260413/context.md, .survey/plannotator-modernization-20260413/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Plannotator modernization

## Summary
The best bounded planning-review improvement was modernizing `plannotator` into a visual approval-gate skill instead of adding another wrapper around planning or orchestration flows.

## Why this won
- `plannotator` was already heavily indexed in `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`, so a trigger-quality upgrade had broad discovery impact.
- The legacy skill body was 600 lines and failed the standardization rubric with warnings for weak trigger phrasing, missing standard sections, and excessive length.
- Existing scripts already covered install and platform setup; the missing layer was support documentation and evals, not another new skill.

## Changes accepted
- Rewrote `plannotator/SKILL.md` as a shorter, decision-first visual approval gate for concrete plans/diffs.
- Added support references for review-mode selection, route-outs, platform setup, and note-export/troubleshooting caveats.
- Added `evals/evals.json` to freeze plan-review, diff-review, and note-export dry-run expectations.
- Updated discovery docs and `skills.json` so the positioning now emphasizes approval-gate behavior instead of generic visual review.
- Refreshed the structural graph; `plannotator` is now a degree-19 node and support coverage rose to 48 skills with `references/` and 47 with `evals/`.

## Changes rejected
- Creating another planning-review wrapper skill.
- Letting `plannotator` absorb plan creation (`task-planning`, `ralph`), orchestration state (`jeo`, `vibe-kanban`), or broad PR judgment (`code-review`).

## Durable boundary note
Keep `plannotator` focused on reviewing an already-existing plan or diff in a browser UI. If the work starts drifting into planning, orchestration, or repo-wide code-review policy, route out immediately.

## Related pages
- [[skill-support-coverage]]
- [[task-planning-modernization-2026-04-12]]
- [[code-review-modernization-2026-04-13]]
- [[workflow-automation-modernization-2026-04-13]]
