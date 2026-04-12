# Context: task-estimation modernization

## Workflow Context
Task estimation shows up in backlog refinement, sprint-planning prep, roadmap sequencing, milestone planning, and delivery-risk conversations. The modern pattern is to keep **relative sizing** separate from **date forecasting**: teams still use story points, T-shirt sizes, and reference stories to compare work, but increasingly treat calendar promises as a different layer that needs confidence language and historical throughput rather than raw point totals alone.

In product and game work, the estimation problem gets harder when discovery and delivery are mixed together. Prototype, spike, or vertical-slice work often functions as an estimation step in its own right because the team is still learning the shape of the work.

Sources:
- Atlassian — https://www.atlassian.com/agile/project-management/estimation
- Joel on Software — https://www.joelonsoftware.com/2007/10/26/evidence-based-scheduling/
- Rami Ismail — https://ltpf.ramiismail.com/prototypes-and-vertical-slice/

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Engineers / AI coding agents | Size implementation work, surface hidden complexity, and support sprint-candidate decisions | Mixed |
| Engineering managers / delivery leads | Turn team estimates into capacity and forecast language without overcommitting | Mixed |
| Product managers | Compare roadmap candidates, sequence work, and communicate uncertainty | Mixed |
| Producers / game leads | Estimate milestone work spanning code, content, QA, and release constraints | Mixed |
| Stakeholders / clients | Consume estimates as planning signals, often pressuring them into promises | Mixed |

## Current Workarounds
1. **Relative sizing internally, time externally** — teams use story points or size buckets in backlog work, then quietly translate to hours/days for stakeholder reporting.
2. **Reference stories / anchor items** — new work gets compared against known small/medium/large examples because estimating in a vacuum is noisy.
3. **Discovery spikes before real sizing** — when uncertainty dominates, teams estimate the investigation or prototype instead of pretending they can size the finished implementation.
4. **Ranges and confidence notes** — best-case / likely / worst-case or high/medium/low confidence is used when a single-point number would mislead.
5. **Tracker + spreadsheet hybrids** — issue trackers store work, while spreadsheets handle scenario planning, rollups, dependency mapping, and executive reporting.

## Adjacent Problems
- Estimates get repurposed as deadlines or performance metrics.
- Discovery work is sized like implementation work even when the unknowns dominate.
- Cross-functional burden (QA, approvals, content, migration, release tasks) gets hidden inside engineering-only numbers.
- Velocity/point systems drift over time, weakening comparisons and encouraging gaming.
- AI-assisted delivery increases variance: implementation might speed up while debugging, review, and integration remain highly variable.

## User Voices
- “Story points are not hours.” — Scrum.org, emphasizing that relative size should not be converted into false precision. https://www.scrum.org/resources/blog/story-points-and-why-they-are-not-hours
- Atlassian frames story points as a way to compare complexity and impact rather than assign exact time. https://www.atlassian.com/agile/project-management/estimation
- Joel Spolsky’s evidence-based scheduling argument reinforces the value of historical data and confidence-aware forecasting over naive promises. https://www.joelonsoftware.com/2007/10/26/evidence-based-scheduling/
- Rami Ismail’s prototype / vertical-slice framing is useful for games because teams often need to estimate the learning work first, not just the final feature. https://ltpf.ramiismail.com/prototypes-and-vertical-slice/
