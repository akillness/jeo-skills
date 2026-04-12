---
title: Git Workflow Modernization
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/git-workflow-modernization-20260412/context.md, .survey/git-workflow-modernization-20260412/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Git Workflow Modernization

## Decision
Upgrade `git-workflow` instead of adding another Git-adjacent skill.

## Why this won
The survey showed that the highest-leverage Git workflow problem in the repo is not missing command coverage. It is a **boundary-and-safety problem**:
- modern teams still fall back to local Git CLI for rebases, conflict resolution, lease-safe pushes, and reflog recovery even when review happens in a hosted PR tool
- the old skill blurred local Git mechanics with PR collaboration language, which weakened trigger precision
- repo-local graph findings already favored modernizing older generic anchors instead of adding more overlap

That made `git-workflow` a better modernization target than creating another Git utility or pretending PR lifecycle work belongs in the same skill.

## Accepted changes
- Rewrite `git-workflow/SKILL.md` around six explicit modes: branch/stage hygiene, commit shaping, sync-with-base, conflict resolution, push safety, and undo/recovery
- Add `references/collaboration-boundaries.md`
- Add `references/recovery-patterns.md`
- Add `evals/evals.json`
- Update discovery wording in `README.md`, `README.ko.md`, and `.agent-skills/skills.json`
- Refresh graph outputs so support coverage and utilities-cluster structure reflect the upgrade

## Rejected changes
- Adding a separate Git recovery skill in this run
- Pretending hosted PR review and repo administration are part of the same local Git workflow
- Leaving the skill as a giant command catalog with no routing logic

## Durable takeaway
For developer-workflow skills, the strongest reusable upgrade is often **safer decision framing**, not more command volume. `git-workflow` is now positioned as the local Git collaboration and recovery anchor: it owns branch hygiene, commit shaping, rebase/merge choice, safe pushes, and rescue patterns while routing review quality, debugging, planning, and hosted PR work outward.

## Related pages
- [[skill-support-coverage]]
- [[survey-evidence-recovery-2026-04-12]]
- [[task-planning-modernization-2026-04-12]]
