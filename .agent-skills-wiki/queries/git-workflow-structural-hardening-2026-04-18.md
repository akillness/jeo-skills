---
title: Git Workflow Structural Hardening
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/git-workflow-structural-hardening-20260418/context.md, .survey/git-workflow-structural-hardening-20260418/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/git-workflow/references/mode-selection-and-command-packets.md]
---

# Git Workflow Structural Hardening

## Decision
Harden `git-workflow` in place instead of adding another Git wrapper.

## Why this won
The repo has already finished the support-coverage phase. The strongest remaining win in the developer-workflow lane was not a missing folder or missing alias. It was a dense front door on a high-frequency canonical skill.

The survey and graph refresh pointed to the same bounded move:
- `git-workflow` already owned the right boundary: local history shaping, sync, push safety, and recovery
- the remaining weakness was that the front door still behaved like a compact handbook instead of the repo's newer routing-first anchor pattern
- adding another Git wrapper would blur the current split between local Git mechanics and hosted PR / repo-management work

## Accepted changes
- Shrink `git-workflow/SKILL.md` from 298 lines to 258 lines while keeping the same six workflow modes
- Add `references/mode-selection-and-command-packets.md` so command packet detail lives outside the front door
- Refresh `evals/evals.json` with a shared-branch merge-vs-rebase case
- Refresh `SKILL.toon`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery surfaces all describe the routing-first local Git boundary truthfully
- Refresh graph artifacts so the structural memory layer records the new dense-anchor state

## Rejected changes
- Adding a separate Git recovery or push-safety skill
- Letting hosted PR/repo-management language drift back into the local Git anchor
- Leaving the compact/discovery surfaces stale after the main skill rewrite

## Durable takeaway
In the mature developer-workflow cluster, the best reusable improvements come from **shrinking dense canonical skills into faster routers** and moving packet detail into references. `git-workflow` stays the one local Git skill: branch hygiene, commit shaping, sync choice, conflict handling, push safety, and recovery remain together, while hosted PR/admin work stays out of scope.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[git-workflow-modernization-2026-04-12]]
- [[task-planning-structural-hardening-2026-04-18]]
