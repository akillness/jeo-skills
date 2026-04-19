# Context: task-planning next ratchet

## Workflow Context
Planning is a translation step between messy upstream context and downstream tracking systems. Atlassian, GitHub Projects/milestones, and HacknPlan all reinforce that the planning surface should prepare work for commitment or milestones rather than become the board itself. Repo-local graph evidence still places `task-planning` on the oversized front-door watchlist, so one more bounded hardening pass is justified.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Engineer / tech lead | Slice features or bug clusters into ready work | Intermediate to advanced |
| Product / ops owner | Turn roadmap or launch goals into execution packets | Intermediate |
| Marketing / GTM operator | Separate asset, approval, distribution, and reporting work | Intermediate |
| Game producer / lead | Coordinate milestone packets across disciplines | Intermediate to advanced |

## Current Workarounds
1. Use the board as the plan and restate missing readiness details in chat or meetings.
2. Keep a sidecar doc/spreadsheet for dependencies, blockers, and not-ready items.
3. Split roadmap intent and execution tracking across different tools, then bridge them manually.
4. Let estimation, board setup, or review workflows absorb planning ambiguity they do not own.

## Adjacent Problems
- Planning vs estimation confusion.
- Planning vs board-control confusion.
- Discovery hidden inside implementation slices.
- Launch and milestone packets bloated by unrelated ceremony/admin work.

## User Voices
- Indexed-snippet fallback produced zero useful Reddit results for the targeted narrow workflow queries in this run, so direct social proof is thin and should not be overstated.
- The stronger evidence came from official planning/tracking docs plus repo-local repeated boundary work around `task-planning`.
