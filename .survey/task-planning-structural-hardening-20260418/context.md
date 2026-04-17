# Context: task-planning structural hardening

## Workflow Context
`task-planning` is the repo's execution-readiness anchor: it turns vague features, bugs, roadmap items, launch beats, or playtest findings into ready slices with dependencies, acceptance criteria, and blockers across web, backend, product/ops, marketing, and game work.

The repo's top-level workflow is Plan → Execute → Verify → Cleanup across Claude Code, Gemini CLI, Codex CLI, and OpenCode, so weak planning packets create downstream noise in boards, Git work, review loops, and launch coordination.

Repo-local structural evidence says this is still a live maintenance target:
1. `graphify-out/GRAPH_REPORT.md` flags `task-planning` as a high-degree node (21) and on the oversized front-door watchlist at 300 lines.
2. The skill itself already owns broad cross-domain planning, but `skills.json` and `SKILL.toon` still present an older software-only / user-story-heavy framing.
3. Neighboring skills (`bmad`, `bmad-gds`, `vibe-kanban`, `plannotator`, `task-estimation`, `standup-meeting`, `sprint-retrospective`) already assume `task-planning` exists as the decomposition and readiness bridge.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| CLI / developer-workflow operator | Turn vague repo work into slices before Git, boards, or agent execution | Intermediate to advanced |
| Web / fullstack builder | Split product asks into frontend, backend, data, rollout, analytics, QA, and docs work | Intermediate |
| Product / PM / operations lead | Clean up backlog items, separate discovery from delivery, and identify blockers/approvals | Intermediate |
| Marketing / GTM operator | Turn campaigns, launch windows, and asset/review/distribution work into ready packets | Intermediate |
| Game producer / gameplay lead | Separate systems/code, content/polish, playtest, build, and milestone-readiness work | Intermediate |

## Current Workarounds
1. Upstream idea and phase shaping is routed to `bmad` / `bmad-idea`, then handed to `task-planning` later.
2. Approval and rendered-plan review are routed to `plannotator`, because `task-planning` is plan creation rather than review.
3. Execution-board control is routed to `vibe-kanban`, because boards/worktrees/PR handoff are downstream of task slicing.
4. Sizing-only work is routed to `task-estimation`; daily cadence to `standup-meeting`; learning loops to `sprint-retrospective`.
5. Outside the repo, teams still rely on doc-first specs, backlog tools, spreadsheets, playtest sheets, and launch checklists because a single board rarely captures discovery, dependencies, approvals, and cross-discipline handoffs cleanly.

## Adjacent Problems
- Oversized stories hide multiple systems or owners.
- Discovery leakage puts unknowns inside implementation tickets.
- Readiness theater makes tickets look commit-ready when critical inputs are still missing.
- Silent blockers and external approvals disappear inside generic task lists.
- The one-board illusion persists: the official tracker exists, but the real plan lives in side docs, spreadsheets, or chat.

## User Voices
- “Should I separate the frontend and backend tasks … into different User Stories?” — direct developer planning pain around slice boundaries. Source: https://stackoverflow.com/questions/18204453/should-i-split-user-stories-on-frontend-vs-backend-tasks
- “19 of the 21 devs just opened their laptops and started coding again.” — backlog-refinement structure collapsed under multi-team scale. Source: https://pm.stackexchange.com/questions/22666/single-backlog-multiple-teams-how-to-handle-backlog-refinement
- “We are unsure … if it would make more sense to modify the acceptance criteria or create a new PBI…” — direct acceptance-boundary ambiguity in sprint work. Source: https://stackoverflow.com/questions/14858959/in-scrum-is-changing-acceptance-criteria-during-a-sprint-ok
- “Can I add some analytics code … to see if the user that clicked through my UTM campaign ended up creating the user profile?” — GTM work still depends on instrumentation slices, not just asset tasks. Source: https://webmasters.stackexchange.com/questions/38232/can-i-register-track-convertions-from-my-utm-campaigns
- “I AM looking for … real EXAMPLES of things like; Initial user stories … Acceptance criteria … Task list … Sprint backlogs…” — game teams still need concrete planning packets, not ceremony talk. Source: https://gamedev.stackexchange.com/questions/38264/real-life-example-of-an-agile-game-development-process-outputs
