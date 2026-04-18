---
title: vibe-kanban structural hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/vibe-kanban-structural-hardening-20260418/context.md, .survey/vibe-kanban-structural-hardening-20260418/solutions.md, .survey/vibe-kanban-structural-hardening-20260418/platform-map.md, .survey/vibe-kanban-structural-hardening-20260418/loop-charter.md, .survey/vibe-kanban-structural-hardening-20260418/loop-results.md, .agent-skills/vibe-kanban/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# vibe-kanban structural hardening 2026-04-18

## Question
After the 2026-04-15 modernization, was the next best bounded orchestration follow-up to add another AI coding board/helper skill, or to shrink `vibe-kanban` itself into a smaller front door with clearer tracker-sync and route-out guidance?

## Answer
The best bounded move was to **shrink `vibe-kanban` in place** and make it more explicit that it is a **coding-board / workspace / review control plane** layered on top of generic trackers and normal PR review — not a replacement for PM boards and not another broad orchestration wrapper.

## Why this won
- Graph memory still showed `vibe-kanban` as one of the highest-degree skills, so a smaller front door had leverage across many discovery and routing surfaces.
- Support coverage was already complete; the repo needed denser route precision, not another adjacent wrapper.
- Primary-source evidence still pointed to the same real-world shape: Git worktrees, generic trackers, and PR review remain the underlying workflow, while `vibe-kanban` is valuable only when a visible coding-board/workspace loop adds review and cleanup discipline.
- The strongest new nuance was **tracker-linked coding execution**: many teams want GitHub Projects / Linear / Jira to stay canonical while a separate coding board manages workspaces, retries, and PR handoff.

## Accepted changes
- Shrunk `vibe-kanban/SKILL.md` from 277 lines to 195 lines.
- Added `references/board-packets-and-surface-selection.md` to externalize packet choice and tracker-sync guidance.
- Expanded `evals/evals.json` with a tracker-linked coding-board case.
- Synced compact/discovery surfaces: `SKILL.toon`, `skills.json`, `skills.toon`, README, README.ko, and `setup-all-skills-prompt.md`.
- Recorded the bounded survey plus the keep/revert decision in `.survey/vibe-kanban-structural-hardening-20260418/`.

## Rejected alternatives
- Adding another AI coding board wrapper.
- Letting `vibe-kanban` sprawl back into PM-board, browser-review, or non-code coordination territory.
- Treating GitHub Projects / Linear / Jira as direct substitutes for the coding-board layer when the real workflow still needs isolated workspaces, retries, and explicit cleanup.

## Durable boundary
`vibe-kanban` should answer:

**"Do we need a coding-board control plane for bounded cards, isolated workspaces, review queues, and PR handoff — while possibly keeping another tracker canonical?"**

If yes, use it.
If not, route to planning, browser-review, PM, marketing, or game workflow skills instead of opening a board prematurely.

## Related pages
- [[browser-review-cluster]]
- [[developer-workflow-cluster]]
- [[vibe-kanban-modernization-2026-04-15]]
- [[plannotator-modernization-2026-04-13]]
- [[skill-support-coverage]]
