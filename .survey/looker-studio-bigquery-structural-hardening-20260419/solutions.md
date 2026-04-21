# Solution Landscape: looker-studio-bigquery structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `looker-studio-bigquery` (current repo skill) | BigQuery-backed stakeholder dashboard/reporting lane | Clear boundary against analysis, anomaly hunting, and observability; already has support docs and evals | Still long for a stable lane; front door repeats packet detail that could live in references | Best bounded target this run ([.agent-skills/looker-studio-bigquery/SKILL.md](../../.agent-skills/looker-studio-bigquery/SKILL.md)) |
| `task-planning` | Cross-domain execution-planning front door | Bigger cross-domain surface; still high-value | Already received a structural-hardening pass on 2026-04-18, so another immediate pass risks churn | Strong close second, not best untouched watchlist target ([.agent-skills-wiki/queries/task-planning-structural-hardening-2026-04-18.md](../../.agent-skills-wiki/queries/task-planning-structural-hardening-2026-04-18.md)) |
| New BI/reporting wrapper skill | Add another dashboard or reporting skill | None beyond new naming | Would duplicate `looker-studio-bigquery`, blur boundaries with `data-analysis`, and create more catalog noise | Reject |
| Merge reporting into `data-analysis` | Treat dashboard requests as analysis work | Fewer catalog entries | Loses the durable dashboard/reporting contract and route-outs established in the modernization pass | Reject |
| Full BI / semantic-platform comparison skill | Escalate to Looker/Tableau/Power BI choice first | Useful when semantic governance dominates | Too broad for ordinary BigQuery-backed dashboard requests; already routed to `survey` when needed | Keep as route-out, not the main skill |

## Categories
- **Keep and tighten existing specialist** — `looker-studio-bigquery`
- **Recently hardened cross-domain router** — `task-planning`
- **Do not add duplicate wrappers** — generic BI/reporting/dashboard helpers
- **Escalation / route-out only** — survey-first BI platform comparison

## What People Actually Use
Actual operator behavior is consistent: BigQuery does the heavy lift, Looker Studio stays thin, and the last mile often becomes an exec board, review packet, or export handoff. That means the missing improvement is not another concept or another product survey — it is a smaller routing contract that starts from the current packet (`dashboard-spec`, `slow-dashboard`, `refresh-shape`, `audience-split`, or `exec-handoff`) and pushes packet detail into support docs.

## Frequency Ranking
1. `looker-studio-bigquery`
2. `task-planning`
3. `bmad-gds`
4. `state-management`
5. `marketing-automation`

## Key Gaps
- The skill still advertises a stable lane with a dense front door instead of a smaller packet-first selector.
- Discovery surfaces do not yet emphasize packet routing (`dashboard spec`, `slow/expensive dashboard`, `refresh shape`, `audience split`, `exec handoff`) as strongly as neighboring hardened skills do.
- Eval coverage can still better protect route-outs and last-mile export/handoff cases.

## Contradictions
- The lane is already well-bounded conceptually, but the skill body still looks more encyclopedic than the repo's newer routing-first pattern.
- The repo no longer lacks support coverage here; the remaining risk is oversized instructions and stale discovery wording.

## Key Insight
The best bounded move is **not** a new BI skill and **not** another full rewrite. It is a structural-hardening pass on `looker-studio-bigquery`: keep the same durable role, shrink the front door around one packet-first decision, move packet detail into a dedicated route-out reference, extend evals for handoff cases, and sync compact/discovery surfaces so the repo advertises the lane truthfully.
