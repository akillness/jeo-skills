# Solution Landscape: standup cadence gate ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Classic Daily Scrum | Live-daily standup | Strong when work is tightly coupled and blockers must surface every day | Easily decays into status theater or manager reporting | Canonical Scrum pattern; still needs strict purpose control |
| Board-walk standup | Live-daily board-driven sync | Keeps the meeting tied to work movement instead of personal diaries | Fails when the board is stale or overloaded | Strong default when the board is trusted |
| Blocker-first standup | Live-daily risk-first sync | Surfaces impediments quickly and keeps focus on what is stuck | Can still bloat if teams try to solve blockers in the room | Best during delivery pressure |
| Async written standup | Async-daily check-in | Better for distributed teams and focus time; leaves written trace | Silent blockers and low-engagement replies are common | Common Slack / Teams / bot pattern |
| Hybrid async + live exceptions | Async updates plus short escalation huddle | Preserves written visibility while allowing fast coordination on true exceptions | Easy to duplicate work if teams re-read async updates live | Strong fallback for hybrid teams |
| Less-frequent checkpoint | 2–3x/week or weekly sync | Reduces interruption tax when work is mostly independent | Risks slower blocker discovery without explicit escalation | Good fit for product, marketing, and stable execution windows |
| Board-first / no recurring standup | Shared artifacts + ad hoc unblock flow | Avoids ritual inertia and duplicate reporting | Depends on disciplined artifact hygiene and clear escalation rules | Strong fit for mature teams with strong source-of-truth habits |
| Launch / incident temporary daily | Time-boxed increase in cadence during high risk | Matches real operational spikes without making daily permanent | Teams often forget to turn cadence back down | Good for launches, campaign weeks, milestones, incidents |

## Categories
- **Live-daily:** Classic Daily Scrum, board-walk, blocker-first.
- **Async-daily:** Written async standups, standup bots, channel-based check-ins.
- **Hybrid-daily:** Async-first with a short exception-only live huddle.
- **Less frequent / no recurring meeting:** 2–3x/week syncs, weekly checkpoint, board-first visibility, ad hoc unblock channels.
- **Temporary high-risk cadence:** Launch-week, milestone-week, or incident-only daily syncs.

## What People Actually Use
The most stable real-world pattern is not “one permanent daily standup mode.” Teams mix:
- board or doc as the primary source of truth,
- async updates for routine status,
- direct blocker escalation in chat or a short huddle,
- temporary live-daily cadence during high-risk windows,
- less-frequent checkpoints once the team stabilizes.

That behavior shows a missing front-door decision in the current skill: **is a daily recurring standup actually justified right now?**

## Frequency Ranking
1. **Live-daily standups remain the canonical published model** — Scrum Guide and Atlassian still describe the daily standup / Daily Scrum as a short sync for progress and blockers.
2. **Async-daily tooling is a strong market signal** — Slack marketplace bots, Geekbot-style async standups, and GitLab-style async guidance all exist because teams routinely avoid live daily meetings.
3. **Hybrid escalation models appear repeatedly** — written updates plus short live exception handling is the practical compromise for remote/hybrid teams.
4. **Less-frequent cadence is common in practice but under-specified in formal standup guides** — practitioner snippets and async-first operating models keep surfacing weekly / 2–3x-week / launch-only usage.

## Key Gaps
- Most standup guidance jumps straight into meeting format before asking whether a recurring daily ritual is still justified.
- Async guidance often names the tool but under-specifies escalation rules and cadence review.
- Cross-domain teams need a sharper distinction between **temporary high-risk cadence** and **permanent daily ritual**.
- Game and marketing workflows often coordinate through milestone or launch surfaces, but generic standup advice still assumes software Scrum cadence.

## Contradictions
- **Marketed claim:** standups are a universal daily alignment habit.
  **Observed reality:** teams often reduce cadence, move status into writing, or only go daily during high-risk periods.
- **Marketed claim:** async standups solve meeting pain.
  **Observed reality:** async without an escalation rule can simply add another reporting layer.
- **Marketed claim:** daily syncs surface blockers.
  **Observed reality:** healthy teams escalate blockers immediately rather than waiting for the next scheduled ritual.

## Key Insight
The best bounded improvement is not another standup subtype. It is an earlier truth gate: before choosing board-walk, blocker-first, async, or hybrid, `standup-meeting` should first decide whether the team actually needs a daily recurring standup, a temporary high-risk cadence, a lighter weekly checkpoint, or no recurring ritual at all.

## Curated Sources
- Scrum Guide — https://scrumguides.org/scrum-guide.html (`direct page retrieval (unverified SSL context)`)
- Atlassian standups — https://www.atlassian.com/agile/scrum/standups (`direct page retrieval (unverified SSL context)`)
- GitLab async communication — https://handbook.gitlab.com/handbook/company/culture/all-remote/asynchronous/ (`direct page retrieval (unverified SSL context)`)
- Shape Up — https://basecamp.com/shapeup (`direct page retrieval (unverified SSL context)`)
- Agile Marketing Manifesto — https://www.agilemarketingmanifesto.org/ (`direct page retrieval (unverified SSL context)`)
- HacknPlan homepage — https://www.hacknplan.com/ (`browser-rendered primary page evidence`)
- Yahoo Japan indexed snippet results used for user-voice and real-world practice recovery:
  - https://www.scrum.org/resources/blog/your-daily-scrum-not-problem-your-transparency
  - https://www.reddit.com/r/ExperiencedDevs/comments/1nbfh94/are_daily_standups_ever_actually_about_unblocking/
  - https://www.reddit.com/r/PPC/comments/wx7ibx/are_daily_standups_really_necessary_at_marketing/
  - https://slack.com/marketplace/ADZMCGNJ0-standup-and-prosper
  - https://geekbot.com/standups/
  - https://www.gamedeveloper.com/business/the-stand-up-meeting-in-game-development
