---
title: vibe-kanban modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/vibe-kanban-modernization-20260415/context.md, .survey/vibe-kanban-modernization-20260415/solutions.md, .survey/vibe-kanban-modernization-20260415/platform-map.md, .agent-skills/vibe-kanban/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# vibe-kanban modernization 2026-04-15

## Question
What was the best bounded orchestration / planning-review improvement after the recent browser-review and platform-anchor upgrades, and should the repo add another board/orchestration skill or modernize `vibe-kanban` itself?

## Answer
The best bounded move was to modernize `vibe-kanban` into the **coding-task board / workspace / review control-plane** skill instead of adding another overlapping agent-board wrapper.

## Why this won
- Upstream/product evidence showed a real workflow need: teams want a visible board for bounded coding tasks, isolated workspaces/worktrees, human review, retries, and PR handoff.
- Repo evidence showed `vibe-kanban` was still high-visibility in discovery docs but lacked an eval harness and still read like a setup/command catalog.
- The planning-review lane was cleaner if `vibe-kanban` owned live board/workspace/review execution while `plannotator` kept plan approval and `agentation` / `agent-browser` / `playwriter` kept browser/UI execution boundaries.
- The same survey also showed a trap: many PM, marketing/content, and game-production workflows use boards too, but they do not necessarily need coding workspaces, diffs, or PR cleanup. That made route-outs more valuable than a broader catch-all skill.

## Accepted changes
- Rewrote `vibe-kanban/SKILL.md` around board need, task shape, review surface, cleanup discipline, and route-outs.
- Added workflow-first support docs for routing, review/cleanup, and tracker/non-code boundaries.
- Added `evals/evals.json` so future ratchets can validate trigger quality and route-outs.
- Synced `SKILL.toon`, README / README.ko / setup prompt, and manifest surfaces.
- Refreshed graph outputs and support-coverage memory.

## Rejected alternatives
- Adding another orchestration or board wrapper skill.
- Letting `vibe-kanban` absorb planning-only, browser-review, or non-code PM/marketing/game workflows.
- Keeping `vibe-kanban` as a long install/MCP catalog with weak trigger language and no eval harness.

## Durable boundary
`vibe-kanban` should answer: **"Do I need a board/workspace control plane for bounded coding tasks with review and cleanup?"**

If yes, use it.
If the real need is plan approval, browser execution, or non-code coordination, route outward.

## Related pages
- [[browser-review-cluster]]
- [[plannotator-modernization-2026-04-13]]
- [[agent-browser-modernization-2026-04-15]]
- [[agentation-modernization-2026-04-15]]
- [[skill-support-coverage]]
