# Intake Packets and Route-outs

Use this reference when `task-estimation` needs a compact packet instead of a long explanation.

## 1. Pick the smallest truthful packet

| Situation | Primary mode | Best packet |
|---|---|---|
| Fuzzy backlog item, roadmap candidate, or intake queue | `coarse-triage` | coarse estimate packet with confidence + biggest unknowns |
| Near-term sprint or milestone candidate | `sprint-candidate` | relative estimate packet with anchors + split recommendation |
| Stakeholder asks for date/scope implications | `forecast-support` | relative estimate + assumptions + safe/unsafe use note |
| Unknowns dominate the work | `discovery-spike` | spike estimate packet naming what the spike should resolve |
| Launch, GTM, or game milestone work spans many disciplines | `milestone-cross-functional` | estimate packet that includes QA/content/release/approval burden |

## 2. Quick burden checklist
Check these before finalizing the packet:
- Is the work mostly discovery or mostly delivery?
- Are migration, rollout, or approvals hidden inside the item?
- Does QA or validation effort meaningfully change the size?
- Is there content, localization, platform-cert, or live-ops burden?
- Would this estimate be misread as a deadline unless you add a forecast note?

## 3. Safe forecast language
Good phrases:
- "This is a relative size signal, not a delivery promise."
- "Confidence is low because key dependencies are still unresolved."
- "Treat this as a discovery-spike estimate until the unknowns shrink."
- "If you need a date forecast, pair this with historical throughput and current capacity."

Avoid:
- "This will take exactly ..."
- "This should definitely fit ..."
- "The points already imply the ship date."

## 4. Common route-outs
Route to another PM skill when the job changes:
- `task-planning` — turn the estimate into execution slices, owners, acceptance criteria, and ready/not-ready packets
- `standup-meeting` — coordinate already-selected work day to day
- `sprint-retrospective` — review whether the team's estimation process or commitment language worked

## 5. Game / launch nuance
For launch or game work, estimation often fails because the item hides too many non-code tasks.

Explicitly name:
- QA / regression / compatibility testing
- content or copy updates
- release/store/certification steps
- demo-flow polish or live-ops readiness
- approvals, signoff, or publishing windows

If those dominate the item, keep the estimate cross-functional instead of pretending it is one engineering story.
