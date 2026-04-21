# Context: standup-meeting modernization

## Workflow Context
Modern daily standups are increasingly framed as short delivery-coordination checkpoints, not round-robin status reports. Canonical Scrum guidance keeps the Daily Scrum focused on developers inspecting progress toward the Sprint Goal and adapting the plan. In practice, strong teams now favor board-walking, blocker triage, and async-first updates for distributed work instead of repeating yesterday/today/blockers around the room.

Sources:
- Scrum Guide — https://scrumguides.org/scrum-guide.html
- Scrum.org, *What is a Daily Scrum?* — https://www.scrum.org/resources/what-is-a-daily-scrum
- Atlassian, *Standups for agile teams* — https://www.atlassian.com/agile/scrum/standups
- GitLab Handbook, *Asynchronous communication* — https://handbook.gitlab.com/handbook/company/culture/all-remote/asynchronous/

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Engineering manager / tech lead | Keep delivery flow visible without turning the ritual into reporting theater | Intermediate–advanced |
| Scrum master / delivery lead | Facilitate a short, useful standup and route deep dives elsewhere | Intermediate–advanced |
| Product manager / design lead | Surface cross-functional blockers and handoffs without bloating the meeting | Intermediate |
| Distributed developers | Share progress and blockers across time zones with low interruption cost | Mixed |
| Hybrid teams | Balance async updates with synchronous risk escalation | Mixed |

## Current Workarounds
1. **Walk the board, not the people** — review in-flight work items and blocked tickets instead of asking each person the same three questions.
2. **Async standups in chat tools** — use Slack/Teams prompts or written updates, then reserve live time for exceptions.
3. **Blocker triage only in the meeting** — mention impediments briefly and spin off a smaller follow-up with relevant people.
4. **Dual tracking** — keep Jira/GitHub as the source of truth but still maintain a lightweight check-in summary for leadership visibility.
5. **Conditional syncs** — keep daily cadence only when risk, dependencies, or active sprint work justify it.

## Adjacent Problems
- Meeting fatigue from stacking standups with planning, refinement, incidents, and 1:1s.
- Tool fragmentation across Jira, GitHub, Slack, docs, and spreadsheets.
- Weak board hygiene that forces standups to reconstruct ownership manually.
- Remote-surveillance tension when the ritual feels like attendance policing.
- Loss of sprint-goal focus when updates center on individual busyness instead of work movement.

## User Voices
> “The Daily Scrum is a 15-minute event for the Developers of the Scrum Team.”
>
> “The Daily Scrum is not the only time Developers are allowed to adjust their plan.”
>
> — Scrum Guide, https://scrumguides.org/scrum-guide.html

These lines capture the main modernization signal: the meeting should stay short, team-directed, and planning-oriented rather than being the single manager-facing status checkpoint.
