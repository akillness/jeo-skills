# Context: standup cadence gate ratchet

## Workflow Context
`standup-meeting` already does mode selection well, but current practice across delivery teams is less about picking one meeting format and more about deciding whether a daily ritual is justified at all.

Primary evidence from this run:
- **Scrum Guide** states the Daily Scrum exists to inspect progress toward the Sprint Goal and adapt the Sprint Backlog; it is a 15-minute event for developers, not a general status recital. Source: https://scrumguides.org/scrum-guide.html (`direct page retrieval (unverified SSL context)` with keyword confirmation for `daily scrum`, `sprint goal`, `inspect progress`).
- **Atlassian standups** still frames standups as short daily check-ins focused on progress, plans, and blockers. Source: https://www.atlassian.com/agile/scrum/standups (`direct page retrieval (unverified SSL context)`).
- **GitLab async guidance** emphasizes asynchronous communication, written context, and using the best format instead of default meetings. Source: https://handbook.gitlab.com/handbook/company/culture/all-remote/asynchronous/ (`direct page retrieval (unverified SSL context)`).
- **Shape Up** keeps status in written artifacts such as hill-chart progress rather than relying on daily verbal status loops. Source: https://basecamp.com/shapeup (`direct page retrieval (unverified SSL context)` for `status`, `shaping`, and `cycles`).
- **Agile Marketing Manifesto** centers customer value, business outcomes, and learning over output theater, which weakens the case for permanent daily status rituals in marketing unless launch pressure is real. Source: https://www.agilemarketingmanifesto.org/ (`direct page retrieval (unverified SSL context)`).
- **HacknPlan** positions game delivery around discipline boards, dependencies, milestones, and real-time updates, suggesting that studios often coordinate through shared production surfaces rather than one generic daily round-robin. Source: https://www.hacknplan.com/ (`browser-rendered primary page evidence`).

Indexed-snippet recovery during this run also exposed recurring practitioner language:
- Yahoo Japan indexed snippet for Scrum.org: weak transparency turns Daily Scrum into `status theatre`. Source query: `"daily scrum" status theater` (`Yahoo Japan indexed snippet`, high confidence because URL + snippet were visible in the same run).
- Yahoo Japan indexed snippet for a Reddit PPC thread: daily standups in marketing agencies are useful when teams are firefighting, but otherwise unnecessary. Source query: `marketing team daily standup launch` (`Yahoo Japan indexed snippet`, medium confidence).
- Yahoo Japan indexed snippet for Slack/standup-bot tooling: async standups are sold explicitly as timezone-friendly and meeting-reducing. Source query: `async standup time zones slack` (`Yahoo Japan indexed snippet`, medium confidence).
- Yahoo Japan indexed snippet for Game Developer: game-development standups exist, but the visible framing still emphasizes common mistakes and how to lead them, not blind daily ritual. Source query: `game development daily standup scrum` (`Yahoo Japan indexed snippet`, medium confidence).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Software developers / tech leads | Surface blockers, adapt day-to-day execution, keep sprint-goal work moving | Mixed |
| Product / design / ops leads | Coordinate cross-functional work without duplicating roadmap or status docs | Mixed |
| Marketing / GTM operators | Handle launch-week dependencies, approvals, and campaign handoffs | Mixed |
| Producers / game-delivery leads | Coordinate programming, art, design, QA, and milestone risk | Mixed |
| Managers / facilitators | Keep standups lateral and useful instead of turning them into reporting theater | Mixed |

## Current Workarounds
1. Replace live daily standups with async written check-ins in Slack/Teams/bots when timezone spread or focus-time cost dominates.
2. Keep a live sync only during launch, milestone, incident, or other high-dependency windows, then relax cadence later.
3. Use board-first visibility (Jira, Linear, HacknPlan, shared docs) and escalate blockers ad hoc instead of waiting for tomorrow's meeting.
4. Reduce cadence to 2–3x/week or weekly when work is loosely coupled but a recurring checkpoint still helps.
5. Split blockers into follow-up huddles or dedicated channels because the daily sync cannot solve them in-room without bloating.

## Adjacent Problems
- Meeting sprawl: the same status appears in tickets, docs, and standups.
- Manager-facing reporting: the ritual drifts upward instead of lateral coordination.
- Timezone inequity: live daily meetings punish remote and hybrid teams.
- Ritual inertia: teams keep daily meetings after the original delivery pressure disappears.
- Hidden source-of-truth failure: stale boards or weak update hygiene force the standup to do too much.

## User Voices
- “When transparency is weak, the Daily Scrum turns into one of two sad little corporate art forms. The first is status theatre.” — visible Yahoo Japan snippet for Scrum.org blog `Your Daily Scrum is not the problem. Your Transparency is.` (`Yahoo Japan indexed snippet`, high confidence) https://www.scrum.org/resources/blog/your-daily-scrum-not-problem-your-transparency
- “Most standups end up as status theater, not unblocking.” — visible Yahoo Japan snippet for Reddit /r/ExperiencedDevs thread `Are daily standups ever actually about unblocking?` (`Yahoo Japan indexed snippet`, medium confidence) https://www.reddit.com/r/ExperiencedDevs/comments/1nbfh94/are_daily_standups_ever_actually_about_unblocking/
- “I've found daily stand-ups (10 minutes) to be useful when we're firefighting, but otherwise are unnecessary.” — visible Yahoo Japan snippet for Reddit /r/PPC thread on marketing agencies (`Yahoo Japan indexed snippet`, medium confidence) https://www.reddit.com/r/PPC/comments/wx7ibx/are_daily_standups_really_necessary_at_marketing/
