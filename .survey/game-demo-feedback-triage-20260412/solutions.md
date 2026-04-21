# Solution Landscape: game-demo-feedback-triage

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Steam Playtest docs | Official demo access + feedback context | Primary Steam workflow source | Not a triage system | Useful for source-aware prompts |
| Steam Next Fest tips | Official event-readiness guidance | Strong signal for demo-quality stakes | Not a backlog/prioritization tool | Supports launch-risk framing |
| Game Developer playtesting articles | Workflow guidance for running and interpreting tests | Useful language for playtest process and feedback usage | Not reusable agent instructions | Good reference material |
| GameAnalytics playtesting articles | Feedback + game-test framing | Connects qualitative feedback to product decisions | More advisory than procedural | Helpful for weighting and next-step logic |
| Existing repo skills (`steam-store-launch-ops`, `game-performance-profiler`, `game-build-log-triage`, `task-planning`) | Partial internal substitutes | Strong adjacent coverage already exists | No mixed-feedback synthesis layer | Indicates a bridge skill will transfer well |

## Categories
- Official platform docs: Steam Playtest, Steam Store Page, Steam Next Fest tips
- Industry workflow guidance: Game Developer playtesting articles
- Analytics/product-decision guidance: GameAnalytics playtesting articles
- Internal substitutes: existing oh-my-skills launch, perf, log, and planning skills

## What People Actually Use
In practice teams mix playtest notes, creator reactions, bugs, and performance observations in one document or issue tracker, then decide manually what matters. The existing repo supports the edges of this workflow, but not the ranking pass that turns mixed evidence into one short fix brief.

## Frequency Ranking
1. Manual backlog / spreadsheet / issue tracker synthesis
2. Steam/store/demo audit checklists
3. Performance or log triage when a technical issue dominates
4. Generic PM/planning templates
5. Dedicated feedback synthesis workflow (currently missing in the repo)

## Key Gaps
- No reusable skill for prioritizing mixed demo/playtest feedback.
- No stable weighting model that separates loud anecdotes from representative blockers.
- No bridge from feedback packet → next artifact (onboarding brief, demo polish checklist, store-page messaging update, perf follow-up, bug bash list).
- No explicit handoff between launch-ops/perf/log triage and player-facing prioritization.

## Contradictions
- Teams say they need "feedback" but the practical question is usually priority ordering before an external beat.
- Many docs explain how to run playtests, but few provide a concise triage structure for mixed qualitative + technical evidence.
- Existing repo skills are strong in narrow lanes, yet the real workflow remains multi-skill and manual.

## Key Insight
The highest-leverage addition is not another narrow Unity/Unreal or marketing skill. It is a bridge skill that converts mixed demo and playtest evidence into a short, weighted, launch-aware priority brief. That improves game dev coverage while also touching PM/UX, GTM, and operations — exactly where the current collection is thinnest.

## Sources
- https://partner.steamgames.com/doc/features/playtest
- https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/tips
- https://partner.steamgames.com/doc/store/page
- https://www.gamedeveloper.com/design/best-practices-five-tips-for-better-playtesting
- https://www.gamedeveloper.com/programming/6-steps-to-a-successful-playtesting-process-for-an-indie-developer
- https://www.gameanalytics.com/blog/making-better-game-decisions-with-feedback-testing-pickfu
- https://www.gameanalytics.com/blog/how-to-do-a-game-test
- Internal adjacent skills under `.agent-skills/`
