# Cadence Gates and Exceptions

Use this reference before choosing a standup mode. The first question is not “which standup format?” It is **“does this team still need a recurring daily standup right now?”**

## Quick cadence chooser

| Signal | Best cadence | Why |
|---|---|---|
| Dense dependencies, fast blocker churn, launch / milestone / incident pressure | `live-daily` | Frequent same-day coordination still has clear value |
| Daily visibility matters but time zones or maker-time cost make live attendance expensive | `async-daily` | Keeps daily signal while reducing meeting tax |
| Written updates help, but true exceptions still need a short huddle | `hybrid-daily` | Preserves history while letting teams swarm only on meaningful risk |
| Work is mostly independent, multi-day, and already visible in strong boards/docs | `less-frequent-sync` | Daily ritual adds more interruption than coordination value |
| Board/doc/channel hygiene is strong and blockers should trigger immediate escalation instead of waiting for a ritual | `no-recurring-standup` | Replaces meeting habit with artifact truth plus explicit unblock rules |

## Use daily only when the pressure is real
A recurring live daily standup is strongest when several of these are true:
- blockers appear often enough that waiting a day harms execution
- several people touch the same active work or handoff chain
- launch / campaign / milestone / incident risk is currently elevated
- the board is trusted enough that a short sync can move work instead of re-explaining it

If those conditions fade, say so. The right answer is often to ratchet back down.

## Cross-domain examples

### Software / product delivery
- Tight sprint execution with shared ownership and same-day review queues can justify `live-daily` or `hybrid-daily`.
- Stable product discovery or loosely coupled roadmap work often fits `less-frequent-sync` plus strong docs.

### Marketing / GTM
- Launch week, campaign cutover, or event execution may justify a temporary daily rhythm.
- Outside those windows, weekly planning plus async updates is usually more truthful than permanent daily status ritual.

### Game delivery
- Milestone crunch, cross-discipline dependencies, or build / QA pressure may justify a temporary `live-daily` or `hybrid-daily` cadence.
- When programming, art, design, and QA already have strong board visibility, producers should avoid keeping a daily ritual alive by inertia alone.

## Temporary cadence is a real answer
Do not present cadence as binary forever / never.

Say explicitly when the recommendation is:
- **temporary live-daily** until launch week ends
- **temporary hybrid-daily** while blocker density is high
- **return to less-frequent or no recurring standup** once the risky window closes

## Replacement path when the answer is `no-recurring-standup`
Name the replacement clearly:
- source of truth: board, shared doc, or production tool
- blocker escalation path: chat thread, dedicated channel, or ad hoc huddle
- response expectation: same day / within a few hours / next checkpoint
- cadence review trigger: launch starts, blockers rise, board trust falls, or coordination stalls

## Anti-patterns
1. **Daily by habit** — nobody can explain why the cadence still exists.
2. **Temporary crunch rhythm that never ends** — teams forget to ratchet back down.
3. **Async without escalation** — written updates exist, but urgent blockers have no live path.
4. **No-meeting fantasy with weak artifacts** — killing the standup without reliable boards/docs just hides risk.
