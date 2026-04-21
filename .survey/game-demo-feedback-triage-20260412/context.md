# Context: game-demo-feedback-triage

## Workflow Context
This gap appears after a playable build exists and feedback starts arriving from multiple channels at once: internal playtests, Steam Playtest access, creator captures, Next Fest demos, Discord notes, surveys, and bug/performance findings. The repository already covers adjacent slices — `steam-store-launch-ops` for page/demo readiness, `game-performance-profiler` for profiling hypotheses, and `game-build-log-triage` for technical failures — but not the mixed-feedback synthesis step that decides what deserves priority before the next external beat.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo indie dev | Decide what to fix before next demo/build push | Mixed: design + engineering + marketing |
| Small studio producer / PM | Turn scattered feedback into a ranked backlog | Intermediate |
| QA / playtest lead | Separate representative signals from noisy anecdotes | Intermediate |
| Publisher helper / contractor | Audit a demo and recommend the next operating brief | Intermediate |
| Agent-assisted game team | Route feedback into actionable artifacts for engineering, UX, and launch ops | Advanced |

## Current Workarounds
1. Manually combine outputs from `steam-store-launch-ops`, `game-performance-profiler`, `game-build-log-triage`, and generic planning skills.
2. Track feedback in ad-hoc spreadsheets, Discord threads, Notion pages, or issue lists without a stable weighting model.
3. Overreact to loud anecdotal feedback instead of separating frequency, severity, audience fit, and launch risk.
4. Treat all demo feedback as "marketing" or "bugs" instead of distinguishing onboarding, fun, progression, stability, and conversion signals.

## Adjacent Problems
- Teams confuse traffic problems with demo/store conversion problems.
- Rough demos consume launch visibility before teams know whether the blocker is onboarding, performance, or messaging.
- Technical findings from performance/log triage do not naturally roll into a player-facing priority list.
- Generic PM skills help plan work but do not classify game-specific player feedback.

## User Voices
- "Our Steam page has been live for a month and wishlists are weak. Can you review what to fix first?" — existing repo example in `.agent-skills/steam-store-launch-ops/SKILL.md`
- "We want to join Next Fest. Our demo is playable but rough." — existing repo example in `.agent-skills/steam-store-launch-ops/SKILL.md`
- "We need a Steam Deck performance review plan before our demo release." — existing repo example in `.agent-skills/game-performance-profiler/SKILL.md`
- Indexed snippet evidence shows recurring workflow needs beyond pure bugs: Game Developer's "Best Practices: Five Tips for Better Playtesting" explicitly frames the task as how to run a playtest and use feedback in development; Game Developer's "6 steps to a successful playtesting process for an indie developer" frames playtesting as an indie workflow, not a one-off activity; Steam's official Playtest and Next Fest docs show why demo feedback affects shipping decisions and event readiness.

## Sources
- Repo inventory and adjacent skills:
  - `.agent-skills/steam-store-launch-ops/SKILL.md`
  - `.agent-skills/game-performance-profiler/SKILL.md`
  - `.agent-skills/game-build-log-triage/SKILL.md`
  - `.agent-skills/bmad-gds/SKILL.md`
- Primary docs/pages:
  - https://partner.steamgames.com/doc/features/playtest
  - https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/tips
  - https://partner.steamgames.com/doc/store/page
- Browser/direct retrieval notes:
  - https://www.gamedeveloper.com/design/best-practices-five-tips-for-better-playtesting
  - https://www.gamedeveloper.com/programming/6-steps-to-a-successful-playtesting-process-for-an-indie-developer
  - https://www.gameanalytics.com/blog/making-better-game-decisions-with-feedback-testing-pickfu
  - https://www.gameanalytics.com/blog/how-to-do-a-game-test
