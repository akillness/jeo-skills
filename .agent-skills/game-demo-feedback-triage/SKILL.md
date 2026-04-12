---
name: game-demo-feedback-triage
description: >
  Triage mixed game demo and playtest feedback into a prioritized fix brief, weighted evidence summary,
  and next artifact recommendation. Use when a team has playtest notes, Steam Playtest responses,
  creator or streamer demo reactions, survey comments, wishlist/context signals, bug lists, or
  performance findings and needs to decide what to fix first before the next build, festival, or launch beat,
  even if they only say "sort our playtest feedback", "what should we fix before Next Fest", "players are confused",
  "streamers bounced off the demo", or "turn these demo notes into priorities".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, bug trackers, survey exports, Discord notes, creator feedback docs,
  Steam Playtest notes, or mixed demo review packets. Works as a triage and prioritization workflow,
  not as a substitute for full telemetry dashboards or automatic balance tuning.
metadata:
  tags: game-development, playtesting, demo-feedback, steam-playtest, next-fest, prioritization, ux, qa, launch-ops
  version: "1.0"
  source: akillness/oh-my-skills
---

# Game Demo Feedback Triage

Use this skill to turn a messy feedback packet into a short, weighted game-feedback brief.

The goal is not to summarize every note. The goal is to identify the **highest-confidence player-facing blockers**, separate representative signals from noisy anecdotes, and recommend the **single next artifact** that the team should produce before the next build, playtest, festival, or launch beat.

Read [references/feedback-buckets.md](references/feedback-buckets.md) before classifying edge cases or when store/demo, UX, stability, and performance signals are mixed together.

## When to use this skill
- Internal playtest notes, survey responses, bug lists, and feedback docs need prioritization
- Steam Playtest, Next Fest, creator, or streamer demo reactions need to be converted into a ranked fix brief
- Teams have mixed qualitative and technical evidence and need to decide what matters before the next build
- Feedback touches onboarding, clarity, difficulty, controls, performance, stability, or conversion and the team needs one cross-functional view
- Small studios need a short go / no-go or fix-first recommendation instead of a giant product report

## When not to use this skill
- The main problem is a raw build/log failure with no broader feedback packet → prefer `game-build-log-triage`
- The main problem is clearly performance capture and bottleneck diagnosis → prefer `game-performance-profiler`
- The team needs a store-page or launch-page audit before player feedback exists → prefer `steam-store-launch-ops`
- The user wants a generic sprint plan with no game-specific feedback evidence → prefer `task-planning` or `bmad-gds`

## Instructions

### Step 1: Label the feedback packet
Record the minimum facts before prioritizing.

Capture:
- source mix: internal playtest | Steam Playtest | creator/streamer | QA pass | survey/form | Discord/community | mixed
- build stage: prototype | vertical slice | demo | coming-soon | festival demo | launch candidate | post-launch
- audience fit: target players | friendly testers | broad audience | unknown
- evidence types: quotes, issue list, video/clip, survey counts, wishlist/context notes, perf/log findings
- target constraint: next playtest | Next Fest | creator beat | release date | unknown
- known severity signals: hard blockers, churn/bounce, confusion, low conversion, crashes, hitches, negative sentiment

If the packet is thin or heavily anecdotal, keep confidence low and say so.

### Step 2: Cluster the feedback into one primary bucket set
Use these buckets and keep the list tight.

**Primary buckets**
- `onboarding-comprehension`
- `core-loop-fun-clarity`
- `difficulty-balance-progression`
- `controls-ui-readability`
- `stability-performance`
- `content-polish-scope`
- `store-demo-conversion-message`
- `unknown-needs-better-evidence`

**Typical mappings**
- "Players do not know what to do" → `onboarding-comprehension`
- "They get the controls but stop caring after 10 minutes" → `core-loop-fun-clarity`
- "The demo feels unfair / pacing is off / resource economy feels broken" → `difficulty-balance-progression`
- "Menu, HUD, tutorial prompts, or controller feel are frustrating" → `controls-ui-readability`
- "People mention crashes, hitches, Steam Deck issues, or stutter" → `stability-performance`
- "The build is mostly fine but rough edges or missing juice weaken the impression" → `content-polish-scope`
- "Players/viewers are not sold on the fantasy or demo/store pitch" → `store-demo-conversion-message`

Do not flatten every issue into "bugs" or "feedback." Separate player comprehension, fun, polish, stability, and conversion.

### Step 3: Weight the signals before ranking
For each bucket, score the evidence using four lenses:
1. **Frequency** — how often did it appear across testers or sources?
2. **Severity** — does it block understanding, retention, or launch trust?
3. **Representativeness** — is it coming from target players or a skewed audience?
4. **Timing risk** — will ignoring it damage the next event, demo beat, or release?

Then mark each item as one of:
- `fix-before-next-build`
- `watch-next-test`
- `do-not-overreact-yet`

A loud single comment is not automatically a top priority.

### Step 4: Build the feedback brief
Return a concise report with this exact structure:

```markdown
# Game Demo Feedback Brief

## Scope
- Source mix: ...
- Build stage: ...
- Audience fit: ...
- Target constraint: ...
- Confidence: high | medium | low

## Highest-confidence signals
- 2-4 bullets on what the evidence most strongly suggests

## Priority buckets
| Bucket | Why it matters now | Evidence weight | Action |
|--------|---------------------|-----------------|--------|
| ... | ... | high / medium / low | fix-before-next-build / watch-next-test / do-not-overreact-yet |

## Top 3 fixes before the next beat
1. ...
2. ...
3. ...

## Issues to watch, not overreact to
- ...
- ...

## Evidence gaps
- ...
- ...

## Recommended next artifact
- Choose one: onboarding fix brief | demo polish checklist | creator-feedback summary | store/demo message update | performance follow-up brief | bug bash list | next playtest plan

## What not to do yet
- 1-3 bullets that prevent noisy backlog churn or premature redesigns
```

### Step 5: Tailor the brief to the request type
**For internal playtests:**
- prioritize comprehension, fun, and progression before long-tail polish
- separate team-known issues from genuinely new player confusion

**For Steam Playtest / Next Fest / public demo feedback:**
- weigh reputational risk more heavily
- distinguish demo-quality blockers from store-page or traffic issues
- call out whether the next best move is a demo fix, a message fix, or a timing decision

**For creator / streamer feedback:**
- focus on first-session clarity, readability, showcase moments, and where the run becomes unwatchable or unshareable
- separate viewer-facing messaging issues from deep-system balance complaints

**For mixed bug + perf + UX packets:**
- use `stability-performance` as a bucket, not the whole conclusion
- if detailed profiling is needed, recommend `game-performance-profiler` as the next artifact, then fold the result back into the brief

### Step 6: Ask for the minimum missing evidence when needed
If confidence is low, request the smallest next packet that would materially improve the triage:
1. 5-10 representative feedback quotes or issue bullets
2. whether the testers are target players or friendly/internal testers
3. the current build stage and next external milestone
4. any crash/perf pattern or device-specific complaint
5. one short summary of where players bounced, got confused, or lost interest

Do not ask for a giant postmortem.

## Output format
Always return a short triage brief, not a long design essay.

Required qualities:
- prioritize the single strongest player-facing blocker first
- separate representative patterns from anecdotal outliers
- keep the report under roughly 350-550 words unless the user asks for more
- recommend one next artifact, not ten parallel workstreams
- keep launch/festival timing risk explicit when public-facing beats are involved

## Examples

### Example 1: Next Fest demo confusion
**Input**
> We ran a small playtest on our Next Fest demo. Most people said the controls felt okay, but a lot of testers got lost in the first ten minutes and some streamers said they were not sure what the real hook was. A few people also mentioned hitches on Steam Deck.

**Output sketch**
- Primary bucket: `onboarding-comprehension`
- Secondary bucket: `store-demo-conversion-message` and `stability-performance`
- Top 3 fixes focus on early clarity, first-session signposting, and a targeted Steam Deck follow-up rather than a full redesign
- Recommended next artifact: `onboarding fix brief`

### Example 2: Mixed internal notes before creator outreach
**Input**
> Turn these playtest notes into priorities before we send the demo to creators. The bug list is long, but the real pattern seems to be that people love the combat and then bounce in the menus.

**Output sketch**
- Highest-confidence signal: core loop is landing but menu/control/readability is hurting continuation
- Priority action: fix high-friction menu/HUD readability issues before polishing low-frequency bugs
- Recommended next artifact: `demo polish checklist` or `creator-feedback summary`

### Example 3: Hard feedback packet with store/demo confusion
**Input**
> Our Steam Playtest signups are decent, but players either churn after the tutorial or say they expected a different kind of game from the page and trailer. What should we fix first?

**Output sketch**
- Buckets: `onboarding-comprehension` and `store-demo-conversion-message`
- Brief distinguishes expectation-setting from gameplay onboarding
- Recommended next artifact: `store/demo message update` or `onboarding fix brief`
- What not to do yet: do not bury the issue under broad scope expansion

## Best practices
1. **Treat feedback as evidence, not votes** — prioritize representative blockers over loud anecdotes.
2. **Separate comprehension from fun from stability** — those produce different next artifacts.
3. **Keep the next external beat visible** — Next Fest, creator outreach, and launch windows change the weighting.
4. **Use one short priority brief** instead of flooding the team with every issue at once.
5. **Route technical deep dives out when necessary** — detailed profiling and raw log triage belong in their specialized skills.
6. **Protect the backlog from churn** — mark some issues as watch-next-test rather than immediate fixes.

## References
- [Steam Playtest](https://partner.steamgames.com/doc/features/playtest)
- [Steam Next Fest - Tips](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/tips)
- [Store Page, Building and Editing](https://partner.steamgames.com/doc/store/page)
- [Best Practices: Five Tips for Better Playtesting](https://www.gamedeveloper.com/design/best-practices-five-tips-for-better-playtesting)
- [6 steps to a successful playtesting process for an indie developer](https://www.gamedeveloper.com/programming/6-steps-to-a-successful-playtesting-process-for-an-indie-developer)
- [Making Better Game Decisions with Feedback Testing](https://www.gameanalytics.com/blog/making-better-game-decisions-with-feedback-testing-pickfu)
- [How To Do An Efficient Game Test](https://www.gameanalytics.com/blog/how-to-do-a-game-test)
