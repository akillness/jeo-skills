# Solution Landscape: task-planning structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Jira / Azure Boards / GitHub Projects / GitLab boards | Tracker-first backlog systems | Strong at storing work, hierarchy, sprint assignment, and board views | Weak at turning vague intent into ready slices; readiness still manual | Good system of record, not enough by itself |
| PRDs / GDDs / Notion / Confluence / specs | Context-first planning docs | Hold rationale, approvals, and upstream context | Do not enforce decomposition or operational readiness | Common upstream input layer |
| Spreadsheets / checklists / launch packets / playtest sheets | Manual glue artifacts | Flexible for cross-functional, launch, and milestone work | Drift easily; poor discoverability; easy to lose boundaries | Still heavily used in practice |
| `task-planning` | Repo-local decomposition and readiness bridge | Already spans software, product, marketing, and game work; routes to adjacent PM skills | Front door is still oversized; compact/manifest wording is stale | Best in-place hardening target |
| Adjacent oh-my-skills skills (`task-estimation`, `standup-meeting`, `sprint-retrospective`, `bmad`, `bmad-gds`) | Ceremony, sizing, ideation, or orchestration helpers | Clear lane ownership around sizing, cadence, retros, upstream framing, and game orchestration | None replace the actual decomposition/readiness lane | Good boundaries already exist |

## Categories
- Tracker-first tools: Jira, Azure Boards, GitHub Projects, GitLab boards/epics.
- Context-first docs: PRDs, GDDs, Notion, Confluence, planning specs.
- Manual fallback artifacts: spreadsheets, launch packets, checklists, playtest sheets.
- Repo-local neighboring skills: `task-estimation`, `standup-meeting`, `sprint-retrospective`, `bmad`, `bmad-gds`, `vibe-kanban`, `plannotator`.

## What People Actually Use
Teams usually combine docs + tickets + side artifacts:
- requirements and decisions in docs,
- execution tracking in tickets/boards,
- launch/playtest/approval detail in spreadsheets or packets,
- ceremonies to reconcile the mismatch.

That matches the repo's own design: `task-planning` already expects specs, issue lists, PRDs, GDDs, notes, bug lists, and chat context rather than one clean source of truth.

## Frequency Ranking
1. Jira-class ticket/backlog systems
2. Git-native trackers (GitHub Projects / GitLab)
3. Azure Boards
4. Doc-first planning in Notion/Confluence/specs
5. Manual spreadsheets/checklists/launch packets
6. Lightweight boards (Trello-style)

## Key Gaps
- Boards store work better than they shape work.
- Readiness fields (dependencies, inputs, blockers, owner clarity) are still manual.
- Discovery and implementation still get bundled into one fake-ready ticket.
- Cross-functional planning leaks into side docs because trackers are too lossy.
- The repo-local compact and manifest surfaces under-advertise `task-planning` as a cross-domain planning anchor.

## Contradictions
- Tool marketing says boards and backlogs organize work; user behavior still depends on side packets, spreadsheets, and manual decomposition when work is fuzzy or cross-functional.
- The live `task-planning` skill is already a broader planning router, but `skills.json` and `SKILL.toon` still advertise an older software-only / user-story-heavy picture.

## Key Insight
The durable gap is not “another planning tool.” It is a thin, trustworthy bridge between vague upstream context and ready downstream execution. In this repo that bridge already exists as `task-planning`; the best bounded move is to harden it in place by shrinking the front door around horizon choice, discovery-vs-delivery split, readiness, blockers, and route-outs, then syncing compact and manifest discovery surfaces so the highest-degree PM node is described truthfully.

## Curated Sources
- GitHub Projects overview: https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects
- Azure Boards backlogs: https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/?view=azure-devops
- GitLab issue boards: https://docs.gitlab.com/user/project/issue_board/
- GitLab epics: https://docs.gitlab.com/user/group/epics/
- Atlassian backlog refinement: https://www.atlassian.com/agile/scrum/backlog-refinement
