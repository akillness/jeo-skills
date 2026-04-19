# Solution Landscape: task-planning next ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Atlassian planning guidance | Backlog refinement + sprint planning | Strong readiness framing | Can sprawl into process overhead | Good planning canon |
| GitHub Projects + milestones | Execution board linked to repo work | Developer-native | Needs narrative sidecars for readiness nuance | System of record, not enough by itself |
| HacknPlan | Game-aware milestones and disciplines | Best discipline-aware game reference | Still requires human packet quality | Strong game lane reference |
| Productboard-style roadmap tooling | Strategy-to-delivery handoff | Useful for prioritization and direction | Needs downstream slicing elsewhere | Good contrast case |
| Docs / spreadsheets / Notion | Manual planning artifacts | Flexible | Drift and duplicate truth | Most common fallback |

## Categories
- Board/system-of-record tools
- Roadmap/priority translation tools
- Manual artifact workarounds

## What People Actually Use
People still pair one narrative planning surface with one tracking surface. The board stores tasks; docs/spreadsheets/meeting notes store readiness, blockers, and sequencing.

## Frequency Ranking
1. Board-centric tools
2. Manual planning sidecars
3. Roadmap surfaces that still require downstream decomposition

## Key Gaps
- Few solutions act like a compact, domain-flexible planning packet generator with clear route-outs.
- Boards tempt users to over-absorb planning, estimation, execution, and review into one artifact.
- Cross-functional launch/game milestone planning still needs explicit sequencing and blocker visibility.

## Contradictions
- Vendor surfaces imply one tool can hold everything; actual behavior still leans on sidecar docs and human translation.
- Boards promise visibility, but users still need separate ready/not-ready and dependency language outside the card list.

## Key Insight
`task-planning` should not compete with Jira, GitHub Projects, Productboard-style roadmaps, or HacknPlan as the system of record. Its durable value is being the compact packet front door that prepares work for those systems while staying small enough to route estimation, board control, review, daily cadence, and retrospective work outward.
