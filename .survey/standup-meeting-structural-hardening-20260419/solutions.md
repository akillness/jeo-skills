# Solution Landscape: standup-meeting structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Scrum Guide / Scrum.org | Canonical daily-scrum guidance | Clear event boundary, 15-minute limit, inspect-and-adapt framing | Thin on modern async/hybrid routing and adjacent-skill handoffs | Best primary-source boundary anchor |
| Atlassian / Asana standup guides | PM-tool facilitation guidance | Clear anti-pattern language, simple formats, remote adaptations | Mostly meeting hygiene; weak on route-outs to planning / retro / incident work | Good trigger-language source |
| Geekbot / Dailybot / Standuply / Range / Steady | Async standup tools and bots | Async visibility, reminders, summaries, Slack/Teams integration | Strong on collecting updates, weaker on choosing the right mode or escalation boundary | Common market packaging |
| Notion / template-based standup pages | Template-first documentation workflow | Fast reuse, easy adoption, lightweight docs | Templates do not solve stale boards, blocker routing, or status theater | Useful but shallow |
| GitLab async communication guidance | Remote-first operating model | Strong argument for async visibility and selective synchronous escalation | Broad operating principle, not a narrow daily-sync decision tree | Good support for async/hybrid route |
| Kanban / board-walk workflows | Work-movement-first coordination | Keeps sync tied to real work and bottlenecks | Breaks when the board is stale or incomplete | Strong substitute pattern |
| Issue comments / tracker updates | Artifact-attached async coordination | Traceable and close to the work | Weak at team-level synthesis and cross-ticket prioritization | Good indirect competitor |

## Categories
- **Official guidance:** Scrum Guide, Scrum.org
- **PM-tool guidance:** Atlassian, Asana
- **Async standup vendors:** Geekbot, Dailybot, Standuply, Range, Steady
- **Template/document workflows:** Notion and standup page templates
- **Alternatives/substitutes:** Kanban board reviews, issue comments, async docs, incident huddles, ad hoc manager check-ins

## What People Actually Use
In practice, teams keep converging on a small set of manual behaviors despite vendor variety:
- board-first review of in-progress / blocked work
- short blocker-first loops during crunch periods
- async thread/doc updates for distributed teams
- a follow-up huddle for exceptions instead of solving everything in the core sync
- issue-board or ticket comments as the durable status history

That makes the real problem less about inventing another format and more about choosing the right **daily coordination mode** and defining the **escalation boundary**.

## Frequency Ranking
1. Short time-boxed daily ritual (5–15 minutes)
2. Three-question / update-template scaffolds
3. Blocker surfacing and impediment triage
4. Async written check-ins for distributed teams
5. Slack / Teams / Jira integration
6. Templates / notes / reusable prompt pages
7. Automated summaries / AI rollups
8. Board-based standup variants
9. Hybrid async + live escalation
10. Explicit route-outs to planning / estimation / retrospective work

## Key Gaps
- Most solutions optimize **format** and **status collection**, not **route boundaries**.
- Very few solutions clearly answer when the real job has changed into:
  - backlog decomposition
  - estimation / capacity disagreement
  - recurring process repair / retrospective work
  - incident / release command work
  - manager-facing reporting rather than peer coordination
- Alternatives like board walks, issue comments, or async docs all assume a healthy source of truth; when the board is stale, the ritual is forced to compensate.

## Contradictions
- Marketed async standup tools imply visibility is the main problem, but practitioner evidence keeps showing that **stale boards, unclear blockers, and no escalation path** remain the real friction.
- Official guidance says the Daily Scrum is not a status meeting, yet many teams still use it that way because managers want visibility and the board/docs are not trusted.
- Templates promise reuse, but repeated team pain usually comes from **mode mismatch** and **unclear follow-up ownership**, not from missing template text.

## Key Insight
The best bounded improvement is not a new PM ceremony skill and not a bigger standup tutorial. It is to harden `standup-meeting` into a **routing-first daily coordination anchor**: pick one mode (`board-walk`, `blocker-first`, `async-check-in`, `hybrid-async-plus-live`, or `classic-three-questions` only when still justified), ask for one small packet of work-state evidence, keep deep dives in a follow-up huddle, and route planning / estimation / retrospective work outward. That is the structural gap the market leaves open, and it matches the repo’s current PM-cluster direction.
