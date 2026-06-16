---
name: steam-store-launch-ops
description: >
  Turn Steam store-page, wishlist, demo, Next Fest, and launch-window ambiguity into
  one packet-first Steam launch brief. Use when an indie dev, small studio,
  founder-marketer, or publisher helper needs to decide whether the next move is a
  page-promise audit, wishlist-signal check, demo-readiness gate, event-timing
  workback, or launch-ops runbook — especially when they say "help my Steam page",
  "wishlists are weak", "is our demo ready", "should we do Next Fest", or "give me
  a Steam launch checklist". Route broad non-game GTM work to `marketing-automation`
  and player-feedback/build-performance issues to the game specialist skills.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for Steam page URLs or screenshots, trailer and tag packets, demo status,
  wishlist/traffic context, event timing notes, creator/outreach prep, and launch
  checklists. Works as a Steam-specific diagnosis and packet-selection workflow,
  not as a generic marketing strategist, PR CRM, or build-debugging system.
metadata:
  tags: steam, indie-games, game-marketing, launch-ops, next-fest, wishlists, store-page, demos
  version: "1.2"
  source: akillness/jeo-skills
---

# Steam Store Launch Ops

Use this skill as a **packet-first Steam launch router**.

The job is not to dump generic marketing advice. The job is to:
1. identify the current Steam hook,
2. choose the single best packet,
3. separate visibility, promise, proof, timing, and ops honestly,
4. make one-shot Steam constraints explicit,
5. route broader marketing, player-feedback, build, or performance work outward when those are the real problems.

Read these when needed:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/diagnostic-model.md](references/diagnostic-model.md)
- [references/event-hooks.md](references/event-hooks.md)
- [references/checklists.md](references/checklists.md)

## When to use this skill
- Review a Steam Coming Soon or live store page before a meaningful public beat
- Diagnose weak wishlist complaints without confusing traffic, conversion, proof, and timing
- Decide whether a demo is ready for public exposure or likely to weaken trust
- Decide whether a Steam Next Fest or similar public beat fits actual readiness
- Turn late-stage Steam launch stress into one checklist/runbook packet instead of a giant marketing rewrite
- Triage Steam-facing creator/outreach readiness only far enough to choose the right next packet

## When not to use this skill
- The main job is broad non-game launch/GTM/lifecycle/acquisition work → `marketing-automation`
- The main job is prioritizing player/demo feedback, confusion, bugs, or playtest notes → `game-demo-feedback-triage`
- The main job is a red build, packaging failure, or CI/editor log → `game-build-log-triage`
- The main job is runtime profiling, frame-time diagnosis, Steam Deck perf, or platform bottlenecks → `game-performance-profiler`
- The main job is milestone coordination across the whole game project rather than Steam-facing launch/store work → `bmad-gds`

## Instructions

### Step 1: Classify the request into one packet
Choose the single best packet before giving advice.

**Packets**
- `page-promise-audit` — the main risk is page conversion: capsule, screenshots, trailer, short description, tags
- `wishlist-signal-check` — the user says wishlists are weak and you must separate traffic weakness from conversion weakness
- `demo-readiness-gate` — the key question is whether the demo helps or hurts the current public beat
- `event-timing-workback` — the team needs a Next Fest / showcase / timing decision with readiness tradeoffs
- `launch-ops-runbook` — the page is mostly set, but release timing, creator readiness, review/release controls, or ownership are scattered

If the request mixes several concerns, still choose one **primary packet** and name one secondary concern.

### Step 2: Capture the smallest credible Steam packet
Pull only the minimum evidence that supports a real decision:
- current hook: Coming Soon, weak wishlists, demo publish/update, Next Fest, launch window, or unknown
- page evidence: URL or screenshots, capsule, first screenshots, short description, tags
- proof evidence: trailer link/opening notes, demo status, public-build confidence
- signal context: traffic weak, conversion weak, both unclear, or unknown
- timing context: festival deadline, launch target, demo timing, review/release constraints
- ops context: creator/press materials, keys/outreach, ownership gaps, launch checklist gaps

If the evidence is thin, keep confidence low and choose the smallest safe packet.

### Step 3: Name the primary bottleneck
Use the existing diagnostic model, but keep one primary bottleneck.

**Primary bottlenecks**
- `visibility-acquisition`
- `promise-clarity`
- `proof-demo-readiness`
- `timing-hook-fit`
- `launch-ops-readiness`
- `evidence-gap`

Typical mappings:
- "Wishlists are weak and traffic is weak too" → `visibility-acquisition`
- "Some people click through but do not wishlist" → `promise-clarity`
- "The page is okay but the demo may be rough" → `proof-demo-readiness`
- "Should we do Next Fest now or wait?" → `timing-hook-fit`
- "We are near launch and materials/checklists feel scattered" → `launch-ops-readiness`
- "We barely have evidence" → `evidence-gap`

### Step 4: Apply the one-shot Steam rules
Before recommending anything, check the constraints that are easy to miss:
- a pre-release public demo depends on the base game page already being visible as Coming Soon
- the first public demo release gets a limited one-shot notify window to wishlisters/followers
- Next Fest requires a public page, a publicly playable demo by the event start, and current store assets
- Steam review and release still carry manual timing/risk; do not assume everything is automatic

If the recommendation would spend one of these beats on a weak package, say so directly.

### Step 5: Choose the packet-specific intervention
Use one packet and one intervention.

#### `page-promise-audit`
Use when the page package is the likely bottleneck.

Focus on:
- capsule readability
- screenshot ordering and gameplay proof
- trailer opening
- short-description specificity
- tag coherence

Good next artifacts:
- `page rewrite brief`
- `screenshot reorder brief`
- `trailer hook brief`
- `tag audit`

#### `wishlist-signal-check`
Use when the team is overfitting to weak wishlist results.

Focus on:
- low traffic vs weak conversion
- whether the page package actually matches the audience promise
- whether the demo/proof is missing or weak
- whether a timing/event problem is hiding inside the wishlist complaint

Good next artifacts:
- `wishlist signal memo`
- `page rewrite brief`
- `visibility push check`
- `demo readiness checklist`

#### `demo-readiness-gate`
Use when the demo is the public proof question.

Focus on:
- whether the demo strengthens trust
- whether first-session quality matches the current page promise
- whether the notify/event timing is being spent too early
- whether the better move is polish, delay, narrow the beat, or proceed

Good next artifacts:
- `demo readiness checklist`
- `proof-gap notes`
- `event timing memo`

#### `event-timing-workback`
Use when the main decision is whether a public beat fits actual readiness.

Focus on:
- Next Fest or showcase fit
- page/trailer/tag/demo readiness as a set
- whether the event is being treated as a readiness gate or wishful discovery play
- immediate workback tasks before the deadline

Good next artifacts:
- `Next Fest runbook`
- `event timing decision memo`
- `asset lock checklist`

#### `launch-ops-runbook`
Use when the core page/demo are mostly acceptable, but launch execution is fragmented.

Focus on:
- review/release timing
- creator/press readiness and key/outreach packet hygiene
- ownership gaps
- launch-day checklist and contingency points

Good next artifacts:
- `launch checklist`
- `launch-day runbook`
- `creator/outreach prep packet`

### Step 6: Add route-outs before scope drifts
Route out instead of absorbing adjacent work when:
- the user needs broad acquisition/content/lifecycle/measurement strategy beyond Steam-facing launch/store work → `marketing-automation`
- the evidence is mostly playtest quotes, user confusion, or mixed demo feedback → `game-demo-feedback-triage`
- the issue is one broken build, packaging failure, or CI/editor log → `game-build-log-triage`
- the real blocker is runtime perf, Steam Deck, frame-time, or platform bottlenecks → `game-performance-profiler`
- the work is broader milestone coordination, milestone risk, or producer-style sequencing → `bmad-gds`

A trustworthy front door narrows the next move. It does not claim every neighboring game-marketing job.

### Step 7: Return one Steam launch packet
Return one concise packet, not a giant essay.

```markdown
# Steam Launch Packet

## Packet choice
- Primary packet: page-promise-audit | wishlist-signal-check | demo-readiness-gate | event-timing-workback | launch-ops-runbook
- Secondary concern: optional
- Current hook: ...
- Confidence: high | medium | low

## Evidence used
- Page / asset evidence: ...
- Demo / proof evidence: ...
- Signal context: ...
- Timing / ops context: ...
- Missing but important: ...

## Primary bottleneck
- Bucket: visibility-acquisition | promise-clarity | proof-demo-readiness | timing-hook-fit | launch-ops-readiness | evidence-gap
- Why it matters now: ...
- Evidence: ...

## Recommended intervention
- One intervention: ...
- Why this is the shortest credible move: ...

## Priority checks
1. ...
2. ...
3. ...

## Recommended next artifact
- Choose one: page rewrite brief | screenshot reorder brief | trailer hook brief | tag audit | wishlist signal memo | visibility push check | demo readiness checklist | event timing decision memo | Next Fest runbook | asset lock checklist | launch checklist | launch-day runbook | creator/outreach prep packet

## Route-outs
- Skill: ...
- Why: ...
- Packet to pass: ...

## What not to do yet
- 1-3 bullets that prevent folklore, wasted spend, or premature scope drift
```

### Step 8: Verify the boundary before finalizing
Check:
- did you pick one packet instead of mixing page audit, demo QA, outreach CRM, and broad GTM strategy together?
- did you separate traffic weakness from conversion weakness before prescribing page changes?
- did you treat demos and Next Fest as readiness gates rather than generic visibility freebies?
- did you make one-shot timing/review constraints visible when they matter?
- did you route feedback/build/perf work outward instead of stretching this skill?

## Output format
Always return a **short Steam Launch Packet**.

Required qualities:
- one primary packet
- one primary bottleneck
- one next artifact
- explicit uncertainty when evidence is thin
- route-outs when the real job belongs elsewhere
- no giant generic marketing sermon

## Examples

### Example 1: weak wishlists with some traffic
**Input**
> Our Steam page gets clicks from social posts, but wishlists are still weak. Review our capsule, screenshots, short description, and tags.

**Good response direction**
- packet: `wishlist-signal-check`
- bottleneck: likely `promise-clarity`
- next artifact: `page rewrite brief` or `screenshot reorder brief`
- avoids pretending traffic is the only issue

### Example 2: Next Fest decision
**Input**
> We want to do Next Fest. The page is up and the trailer is decent, but I am nervous the demo is still rough.

**Good response direction**
- packet: `event-timing-workback` or `demo-readiness-gate`
- bottleneck: `proof-demo-readiness`
- calls out that Next Fest is a readiness gate
- next artifact: `demo readiness checklist` or `Next Fest runbook`

### Example 3: launch checklist ask
**Input**
> Give me a Steam launch checklist. We have a page, trailer, demo, and a small creator list.

**Good response direction**
- packet: `launch-ops-runbook`
- bottleneck: `launch-ops-readiness`
- next artifact: `launch checklist` or `launch-day runbook`
- keeps page conversion and creator prep in scope only as launch ops, not a full GTM rewrite

## Best practices
1. **Choose the packet first** — the front door should narrow the task immediately.
2. **Separate signal from folklore** — wishlists, demos, and Next Fest all attract bad default advice.
3. **Treat the demo as public proof** — not just another asset.
4. **Treat Steam timing as a constraint system** — Coming Soon, demo notify timing, review/release, and Next Fest all matter.
5. **Prefer one next artifact** over a giant launch theory dump.
6. **Stay Steam-specific** — this is the repo’s game-launch exception, not a generic marketing wrapper.

## References
- [Steamworks Documentation — Visibility on Steam](https://partner.steamgames.com/doc/marketing/visibility)
- [Steamworks Documentation — Coming Soon](https://partner.steamgames.com/doc/store/coming_soon)
- [Steamworks Documentation — Demos](https://partner.steamgames.com/doc/store/application/demos)
- [Steamworks Documentation — Steam Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)
- [Steamworks Documentation — Release Process](https://partner.steamgames.com/doc/store/releasing)
