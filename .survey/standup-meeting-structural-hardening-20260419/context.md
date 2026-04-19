# Context: standup-meeting structural hardening

## Workflow Context
Daily standup pain keeps showing up as a coordination problem, not a missing template problem. Official Scrum guidance keeps the Daily Scrum to a 15-minute developer coordination event focused on inspecting progress toward the Sprint Goal and adapting the near-term plan, while Scrum.org and Atlassian both explicitly warn against turning it into a status meeting or planning session.

Across modern remote and hybrid teams, the real choice is usually between a small set of modes:
- board-walk over live work items
- blocker-first triage
- async written check-in
- hybrid async + short live escalation
- classic three-question loop only when it still carries signal

The repo’s current `standup-meeting` skill already owns this boundary, but survey evidence shows the higher-value refinement is to tighten it into a routing-first / packet-first front door: pick one mode, ask for one small evidence packet, keep deep dives in follow-up huddles, and route planning / sizing / retro work outward.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Developers on Scrum/product teams | Coordinate around current work, blockers, and near-term delivery risk | Mixed |
| Scrum masters / delivery leads / team leads | Repair overlong or low-signal daily sync rituals | Intermediate |
| Remote / hybrid teams | Balance visibility against timezone and maker-time costs | Mixed |
| Managers seeking team visibility | Often trigger status-theater failure modes when visibility is not available elsewhere | Mixed |
| Large multi-team organizations | Suffer when one “daily scrum” becomes a giant reporting ritual instead of a small coordination loop | Intermediate |

## Current Workarounds
1. **Walk the board instead of round-robin updates** — common when personal recitals stop helping and teams want work movement to drive the sync.
2. **Publish status asynchronously** in a board, wiki, thread, or issue comments — then use the live sync only for blockers, dependencies, and exceptions.
3. **Spin off follow-up huddles** for deeper problem-solving instead of solving everything in the room.
4. **Use remote-first async check-ins** for distributed teams, with selective live escalation when risk is high.
5. **Coach brevity and timebox harder** when one person turns standup into a monologue.

## Adjacent Problems
- **Status theater / upward reporting** — the sync becomes manager-facing instead of team-facing.
- **Planning leakage** — backlog shaping and decomposition drift into the daily sync instead of staying in planning.
- **Retro leakage** — repeated standup pain is discussed every day instead of being converted into process changes in retrospective work.
- **Oversized audience** — large-team or department-wide “standups” become hour-long status rollups.
- **Stale source-of-truth hygiene** — boards, issues, or notes are out of date, so the meeting compensates for missing visibility.
- **Remote communication overload** — teams mix async and sync poorly, producing both too many messages and too many meetings.

## User Voices
- “It can also quickly degrade into a **status session** and doesn't bring real clarity to the progress of the sprint backlog.” — PM StackExchange practitioner on replacing the classic three questions with a board walk. <https://pm.stackexchange.com/questions/15964/daily-stand-up-three-question-format-a-sign-of-team-immaturity>
- “The board is so detailed that meetings have turned into **walking the board status updates that are simply read right off the board**.” — PM StackExchange practitioner describing a low-value ritual despite visible work. <https://pm.stackexchange.com/questions/18081/where-is-the-value-in-walking-the-board-with-a-detailed-task-board>
- “We are more than **70 people** in the team… in daily scrum meeting it takes **more than 1 hour** to just give and take updates.” — PM StackExchange example of the ritual collapsing into scaled reporting. <https://pm.stackexchange.com/questions/22524/what-are-the-ways-for-daily-status-reporting-to-make-process-more-easy>
- “This sounds more like **roll call in the army** than a daily scrum meeting.” — practitioner response on the same thread. <https://pm.stackexchange.com/questions/22524/what-are-the-ways-for-daily-status-reporting-to-make-process-more-easy>
- Atlassian’s plain-language warning is unusually direct: standups “aren’t about inflating egos or justifying job descriptions,” “aren’t a time to plan,” and “aren’t the only time to mention blockers.” <https://www.atlassian.com/agile/scrum/standups>
