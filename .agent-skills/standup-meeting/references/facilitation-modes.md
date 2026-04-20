# Standup Facilitation Modes

Use this reference after cadence is justified. If the team may not need a recurring daily standup at all, start with `cadence-gates-and-exceptions.md` first.

## Quick chooser

| Signal | Best mode | Why |
|---|---|---|
| Team already works from Jira / Linear / GitHub board | `board-walk` | Keeps the sync tied to actual work movement |
| Blockers and dependencies are the main risk | `blocker-first` | Surfaces impediments fast without solving them in the room |
| Team spans time zones or deep-focus schedules | `async-check-in` | Reduces interruption and attendance-tax |
| Team wants written visibility plus short escalation | `hybrid-async-plus-live` | Keeps async history while preserving fast coordination |
| Small colocated team still gets value from brief round-robin updates | `classic-three-questions` | Acceptable when it remains high-signal and short |

## Durable heuristics

### Prefer board-walk when
- the board is maintained well enough to act as the agenda
- multiple people touch the same in-progress items
- the team keeps repeating low-signal personal updates
- the sprint goal matters more than individual busyness

### Prefer blocker-first when
- release pressure is rising
- blocked work is aging
- there are frequent cross-team dependencies
- the team needs fast routing rather than long explanation

### Prefer async when
- the team spans multiple time zones
- synchronous attendance hurts focus more than it helps coordination
- most updates are routine and only a few require discussion
- written traceability matters

## Anti-pattern ladder
1. **Manager-facing reporting** — the team reports upward instead of coordinating laterally.
2. **Deep-dive hijacking** — one blocker consumes the whole meeting.
3. **Board blindness** — nobody trusts the source of truth, so the standup becomes guesswork.
4. **Ritual inertia** — the team keeps the same format even when team shape and delivery risk changed.

## Routing boundaries
- Need ready-to-execute tasks or story breakdowns → `task-planning`
- Need sizing or confidence calibration → `task-estimation`
- Need to convert repeated ceremony pain into process changes → `sprint-retrospective`
