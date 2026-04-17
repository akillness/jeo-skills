---
name: steam-store-launch-ops
description: >
  Diagnose Steam launch/store bottlenecks for indie games across store-page conversion,
  wishlist underperformance, demo / Steam Next Fest readiness, and launch-ops checkpoints.
  Use when a solo dev, small studio, publisher helper, or founder-marketer needs to decide
  whether the real problem is visibility, page promise, demo proof, event timing, or launch
  readiness — even if they only say "help my Steam page", "wishlists are weak", "are we
  ready for Next Fest", "review our capsule/trailer/tags", "should we launch this demo",
  or "give me a Steam launch checklist".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repos, briefs, screenshots, trailers, Steam page URLs, launch plans, demo notes,
  or lightweight KPI context. Works as a diagnosis-and-brief workflow, not an automatic
  Steam publisher, ad-buying system, or full GTM replacement.
metadata:
  tags: steam, indie-games, game-marketing, launch-ops, next-fest, wishlists, store-page, demos
  version: "1.1"
  source: akillness/oh-my-skills
---

# Steam Store Launch Ops

Use this skill to turn messy Steam launch questions into **one bottleneck diagnosis and one next artifact**.

The job is not to dump general marketing advice. The job is to decide whether the current pain is mainly about:
- **visibility** — the right players are not reaching the page
- **promise** — the page/trailer/capsule do not sell the game clearly
- **proof** — the demo or public proof is not strong enough yet
- **timing** — an event or release hook is being used at the wrong moment
- **ops** — launch steps, materials, or ownership are too fragmented

Read these first when needed:
- [references/diagnostic-model.md](references/diagnostic-model.md)
- [references/event-hooks.md](references/event-hooks.md)
- [references/checklists.md](references/checklists.md)

## When to use this skill
- Steam coming-soon or store-page review for an indie game
- Wishlist funnel triage when the team has some traffic but weak conversion
- Demo / Steam Next Fest readiness review before a public beat
- Steam launch readiness or launch-adjacent checklist work
- Creator/press/store asset coordination when the team needs the next ops artifact fast
- Game-specific store-launch requests that should **not** be absorbed by `marketing-automation`

## When not to use this skill
- Raw playtest/demo/community feedback needs weighting and fix-first prioritization → use `game-demo-feedback-triage`
- The main problem is demo UX clarity, player confusion, or onboarding quality inside the build → use `game-demo-feedback-triage`
- The user needs generic growth planning, broad campaign strategy, or non-game GTM work → use `marketing-automation`
- The user mainly needs trailer/capsule production or general content creation → route to the relevant creative/content skill after this diagnosis

## Instructions

### Step 1: Label the immediate goal and hook
Start by naming **what the team is trying to accomplish right now**.

Possible goals:
- `improve-store-conversion`
- `diagnose-weak-wishlists`
- `decide-demo-readiness`
- `prepare-for-next-fest`
- `de-risk-launch`
- `mixed-steam-review`

Capture the current hook:
- `coming-soon-page`
- `traffic-spike-or-drop`
- `demo-ship-update-decision`
- `next-fest-or-public-event`
- `launch-window`
- `unknown`

Record the smallest useful evidence packet:
- Steam page URL or screenshots
- capsule art / key art
- trailer link or trailer notes
- top screenshots and short description
- top tags / genre framing
- demo status and build confidence
- traffic/wishlist context if known
- launch or event timing
- creator / press / ops notes if relevant

If evidence is thin, say so and keep confidence low.

### Step 2: Separate the bottleneck before recommending fixes
Classify one **primary bottleneck** and optionally one secondary bottleneck.

**Primary bottleneck buckets**
- `visibility-acquisition`
- `promise-clarity`
- `proof-demo-readiness`
- `timing-hook-fit`
- `launch-ops-readiness`
- `evidence-gap`

**Typical mappings**
- "Wishlists are weak and traffic is also weak" → `visibility-acquisition`
- "People click through but do not wishlist" → `promise-clarity`
- "The page looks okay but we are unsure whether the demo is good enough for public exposure" → `proof-demo-readiness`
- "Should we do Next Fest now or wait?" → `timing-hook-fit`
- "We are near launch and materials/checklists feel scattered" → `launch-ops-readiness`
- "We only have a vague complaint and almost no evidence" → `evidence-gap`

Do **not** flatten everything into generic marketing. A weak Steam result can be a traffic problem, a conversion problem, a proof problem, a timing problem, or an ops problem.

### Step 3: Audit through five short lenses
Use these lenses to justify the bottleneck.

1. **Visibility**
   - Is the page getting qualified traffic at all?
   - Is the problem really awareness rather than conversion?

2. **Promise**
   - Can a player tell what the game is quickly?
   - Do the capsule, screenshots, trailer opening, short description, and tags describe the same game?

3. **Proof**
   - Does the demo or public build strengthen confidence, or would it damage trust right now?
   - Is there enough playable proof for the current marketing beat?

4. **Timing**
   - Does the current event/release hook fit the team’s actual readiness?
   - Is the team about to spend a visibility beat on a weak build or weak page?

5. **Ops**
   - Are assets, links, ownership, creator materials, and launch steps organized enough to execute cleanly?
   - Is the team missing one obvious checklist or runbook?

### Step 4: Build the Steam ops brief
Return a concise report with this exact structure:

```markdown
# Steam Launch Ops Brief

## Goal and hook
- Goal: ...
- Current hook: ...
- Confidence: high | medium | low

## Evidence snapshot
- What was reviewed: ...
- Missing but important: ...

## Primary bottleneck
- Bucket: ...
- Why it matters now: ...
- Evidence: ...

## Secondary bottleneck
- Bucket: ...
- Why it matters now: ...

## Recommended intervention
- Choose one: visibility push check | page promise rewrite | demo readiness pass | event timing decision | launch checklist pass
- Why this is the shortest path to validated learning or lower launch risk: ...

## Priority fixes
1. ...
2. ...
3. ...

## Asset / page checks
- Capsule: ...
- Screenshots: ...
- Trailer: ...
- Short description: ...
- Tags: ...
- Demo / proof: ...

## Event / launch ops checks
- Timing or event-fit: ...
- Creator / press readiness: ...
- Checklist / ownership gaps: ...

## Recommended next artifact
- Choose one: page rewrite brief | screenshot reorder brief | trailer hook brief | tag audit | demo readiness checklist | Next Fest runbook | launch checklist | wishlist spike log

## What not to do yet
- 1-3 bullets that prevent wasted effort or premature spend
```

### Step 5: Tailor the brief to the request type
**For store-page conversion reviews:**
- focus on promise clarity before growth tactics
- separate clickthrough traffic from wishlist conversion
- prioritize first-impression readability over exhaustive feature listing

**For weak-wishlist cases:**
- decide whether the issue is traffic, promise, or proof before changing everything
- do not invent analytics certainty that the evidence does not support
- recommend a small validation move when evidence is mixed

**For demo / Next Fest cases:**
- treat the event as a readiness hook, not just free exposure
- check whether the demo helps prove the promise or risks undermining it
- call out if the best move is to wait, polish, or narrow the event goal

**For launch-checklist cases:**
- focus on missing runbook/checklist ownership, asset consistency, and timing risks
- prefer one launch packet over a giant strategy rewrite

### Step 6: Ask for the minimum missing evidence when needed
If confidence is low, request the smallest next packet that would improve the diagnosis:
1. Steam page URL or screenshots of the top sections
2. capsule art plus trailer link/opening notes
3. short description and top tags
4. demo status and target event / launch window
5. whether traffic is low, conversion is low, or both

Do not ask for a giant marketing dossier.

## Output format
Always return a short operations brief, not a broad essay.

Required qualities:
- identify the single strongest bottleneck first
- distinguish visibility, promise, proof, timing, and ops
- stay around 300-550 words unless the user asks for more
- recommend one next artifact, not a whole GTM stack
- stay honest about evidence quality and uncertainty

## Examples

### Example 1: Low wishlists with some traffic
**Input**
> Our Steam page gets some clicks from social posts, but wishlists are still weak. Review our capsule, screenshots, trailer, and tags.

**Output sketch**
- Goal: `diagnose-weak-wishlists`
- Hook: `traffic-spike-or-drop`
- Primary bottleneck: `promise-clarity`
- Secondary bottleneck: optional `proof-demo-readiness`
- Recommended intervention: `page promise rewrite`
- Recommended next artifact: `page rewrite brief` or `screenshot reorder brief`

### Example 2: Next Fest readiness
**Input**
> We want to join Next Fest. The page is live and the trailer is decent, but I am nervous the demo is still rough.

**Output sketch**
- Goal: `prepare-for-next-fest`
- Hook: `next-fest-or-public-event`
- Primary bottleneck: `proof-demo-readiness`
- Recommended intervention: `demo readiness pass`
- Recommended next artifact: `demo readiness checklist` or `Next Fest runbook`
- What not to do yet: do not spend the event on a build that weakens trust

### Example 3: Launch checklist
**Input**
> Give me a Steam launch checklist. We have a page, trailer, demo, and a small creator list.

**Output sketch**
- Goal: `de-risk-launch`
- Hook: `launch-window`
- Primary bottleneck: `launch-ops-readiness`
- Recommended intervention: `launch checklist pass`
- Recommended next artifact: `launch checklist`

## Best practices
1. **Diagnose before prescribing** — weak results can come from traffic, promise, proof, timing, or ops.
2. **Treat the demo as proof, not just an extra asset** — sometimes the right answer is to improve or delay the demo instead of rewriting the page.
3. **Use event hooks explicitly** — Next Fest and launch windows should change the recommendation.
4. **Prefer one next artifact** over a giant marketing rewrite.
5. **Stay game-specific** — this skill is the Steam/game launch exception, not a generic growth wrapper.
6. **Be honest about weak evidence** — do not pretend to know conversion causes from one vague sentence.

## References
- [Steamworks Documentation — Store Page](https://partner.steamgames.com/doc/store/page)
- [Steamworks Documentation — Demos](https://partner.steamgames.com/doc/store/application/demos)
- [Steamworks Documentation — Steam Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)
- [Steamworks Documentation — Release Process](https://partner.steamgames.com/doc/store/releasing)
