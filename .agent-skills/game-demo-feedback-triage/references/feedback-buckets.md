# Game Demo Feedback Triage Reference

Use this reference when the feedback packet mixes player quotes, creator reactions, bug lists, and launch constraints.

## Bucket glossary

### 1. Onboarding / comprehension
Symptoms:
- players do not know the goal
- tutorial prompts fail
- players get lost in the first 5-15 minutes
- core verbs are not understood quickly

Best next artifacts:
- onboarding fix brief
- tutorial rewrite / signposting checklist
- first-session UX test plan

### 2. Core loop / fun / clarity
Symptoms:
- players understand the mechanics but lose interest
- the fantasy is weak or delayed
- sessions feel repetitive or low-stakes

Best next artifacts:
- core-loop hypothesis note
- demo polish checklist
- next playtest plan focused on retention and delight

### 3. Difficulty / balance / progression
Symptoms:
- players say the game is unfair, trivial, grindy, or pacing feels off
- resources, enemy strength, or reward timing are the real friction

Best next artifacts:
- balance-change brief
- progression tuning checklist
- targeted follow-up test plan

### 4. Controls / UI / readability
Symptoms:
- players misread HUD, menus, prompts, or controls
- creators struggle to showcase the game because information hierarchy is weak

Best next artifacts:
- readability issue list
- control-remap / prompt audit
- menu flow polish checklist

### 5. Stability / performance
Symptoms:
- crashes, hitches, stutter, Steam Deck pain, long loads, dropped frames
- players stop trusting the build even when the design is promising

Best next artifacts:
- performance follow-up brief
- bug bash list
- device-specific triage routed to `game-performance-profiler`

### 6. Content / polish / scope
Symptoms:
- rough edges make the build feel unfinished
- lack of juice, VFX, pacing glue, transitions, or moment-to-moment finish weakens the impression

Best next artifacts:
- demo polish checklist
- launch-risk checklist

### 7. Store / demo conversion message
Symptoms:
- players expected a different game from the page/trailer
- creators or testers say the hook was unclear before or during the demo
- wishlists or signups exist but conversion/confidence stays weak

Best next artifacts:
- store/demo message update
- trailer hook brief
- route supporting page work to `steam-store-launch-ops`

## Weighting model
Use four lenses before ranking:
1. **Frequency** — repeated across multiple testers or sources
2. **Severity** — blocks understanding, enjoyment, or trust
3. **Representativeness** — target-player signal beats friendly-tester noise
4. **Timing risk** — dangerous to ignore before the next public beat

Recommended action labels:
- `fix-before-next-build`
- `watch-next-test`
- `do-not-overreact-yet`

## Source notes

### Steam docs
- Steam Playtest provides the official workflow for getting a pre-release build into players' hands.
- Steam Next Fest tips emphasize why demo quality and readiness matter before a public beat.
- Store Page docs matter because some feedback packets mix player confusion with expectation-setting and page/trailer issues.

### Industry workflow notes
- Game Developer's playtesting articles frame the task as both running playtests and using feedback in development.
- GameAnalytics articles connect feedback testing to product decision-making and practical game-test structure.

## Boundary notes
- If the packet is mostly technical logs or a hard failure, route to `game-build-log-triage`.
- If the packet is mostly frame-time, bottleneck, or target-device diagnosis, route to `game-performance-profiler`.
- If the packet is mostly store-page, capsule, trailer, tags, or launch-page audit work, route to `steam-store-launch-ops`.
- If the team only needs a generic backlog breakdown after priorities are known, route to `task-planning` or `bmad-gds`.
