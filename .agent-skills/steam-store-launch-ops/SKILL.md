---
name: steam-store-launch-ops
description: >
  Audit and structure Steam store-page optimization, wishlist funnel review,
  demo / Next Fest readiness, creator-outreach prep, and launch-adjacent
  operating checklists for indie games. Use when a developer, publisher helper,
  or small studio needs to review a Steam page, coming-soon page, capsule art,
  trailer, tags, demo timing, launch checklist, or fest readiness, even if they
  only say "help my Steam page", "wishlists are weak", "are we ready for Next
  Fest", "review our capsule/trailer/tags", or "give me a launch readiness
  checklist".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, briefs, or conversations that include a Steam store
  page URL, screenshots, asset lists, launch plans, demo details, or marketing
  notes. Works as an audit-and-brief workflow, not an automatic publishing or
  ad-buying system.
metadata:
  tags: steam, indie-games, game-marketing, launch-ops, next-fest, wishlists, store-page, demos
  version: "1.0"
  source: akillness/oh-my-skills
---

# Steam Store Launch Ops

Use this skill to turn scattered Steam launch questions into a prioritized operating brief.

The goal is not to write vague marketing advice. The goal is to identify the biggest Steam-page and launch-readiness gaps, explain why they matter, and give the team the next practical checklist.

Read [references/checklists.md](references/checklists.md) before classifying edge cases or building a fest-ready checklist from scratch.

## When to use this skill
- Steam coming-soon page reviews for indie games
- Wishlist funnel triage when wishlists are weak or flat
- Steam capsule, screenshots, trailer, short-description, tag, and page-structure audits
- Demo readiness reviews before Steam Next Fest, streamer outreach, or a public reveal
- Launch-adjacent operating checklists for creator outreach, storefront hygiene, and last-mile prep
- Publisher/contractor audits where the team needs a short action plan instead of a giant strategy deck

If the team already has a mixed packet of playtest notes, creator reactions, bug/perf notes, or Steam Playtest feedback and needs to decide what to fix first, route that synthesis work to `game-demo-feedback-triage` after or alongside this audit.

## Instructions

### Step 1: Identify the review scope
Start by labeling what the user actually needs.

Possible scopes:
- `store-page-audit`
- `wishlist-funnel-triage`
- `demo-fest-readiness`
- `launch-checklist`
- `mixed-review`

Record the available evidence:
- Steam page URL
- screenshots or page copy
- capsule art / trailers / thumbnails
- tags and genre positioning
- demo availability and quality notes
- launch window or Next Fest timing
- creator/press outreach notes
- wishlist or traffic signals

If evidence is thin, say so and keep confidence low. Do not pretend to have audited the page if the user gave only a sentence.

### Step 2: Score the page through five operating lenses
Use these five lenses and find the weakest one first.

1. **Positioning clarity**
   - Can a player tell what the game is within seconds?
   - Is the genre pitch specific rather than generic?
   - Does the short description say what players do, not just the theme?

2. **Visual conversion surface**
   - Capsule readability at thumbnail size
   - Screenshot order and whether gameplay shows up early
   - Trailer opening clarity and whether it proves the promise quickly

3. **Discovery fit**
   - Tag specificity and genre alignment
   - Similar-game positioning / algorithm adjacency
   - Whether the page seems discoverable by the right Steam audience

4. **Demo / festival readiness**
   - Is the demo polished enough to impress rather than merely test?
   - Does the demo support the intended event timing?
   - Are stream/broadcast/store assets ready for a festival push?

5. **Launch operations hygiene**
   - Are page assets, links, and descriptions internally consistent?
   - Is creator/press outreach blocked on missing materials?
   - Are there obvious checklist gaps that would waste a reveal, fest, or launch beat?

### Step 3: Classify the primary blocker
Map the situation to one primary blocker and optional secondary blocker.

**Primary blockers**
- `positioning-message`
- `visual-asset-conversion`
- `tag-discovery-fit`
- `demo-quality-timing`
- `launch-ops-hygiene`
- `traffic-acquisition-gap`
- `unknown-needs-more-evidence`

**Typical mappings**
- "People visit but do not wishlist" → `positioning-message` or `visual-asset-conversion`
- "We have assets but the page feels generic" → `positioning-message`
- "Our tags/capsules/trailer may be wrong" → `tag-discovery-fit` or `visual-asset-conversion`
- "We are considering Next Fest with a rough demo" → `demo-quality-timing`
- "We are close to launch but materials and outreach are messy" → `launch-ops-hygiene`
- "We barely have traffic at all" → `traffic-acquisition-gap` after checking whether the page itself is also weak

Do not collapse every problem into "marketing." Separate conversion, discoverability, demo timing, and launch ops.

### Step 4: Build the Steam ops brief
Return a concise report with this exact structure:

```markdown
# Steam Launch Ops Brief

## Scope
- Review type: ...
- Evidence provided: ...
- Confidence: high | medium | low

## Current strongest signal
- 1-2 bullets on what already looks solid

## Primary blocker
- Bucket: ...
- Why it matters: ...
- Evidence: ...

## Secondary blocker
- Bucket: ...
- Why it matters: ...

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
- Demo: ...

## Launch / fest ops checks
- Creator / press readiness: ...
- Page hygiene: ...
- Timing risks: ...

## Recommended next artifact
- Choose one: page rewrite brief | screenshot reorder brief | trailer hook brief | tag audit | demo readiness checklist | launch checklist

## What not to do yet
- 1-3 bullets that prevent wasted effort or premature spend
```

### Step 5: Tailor the advice to the request type
**For store-page audits, focus on:**
- first-impression clarity
- capsule readability at small sizes
- screenshot order showing gameplay before lore fluff
- short description specificity
- whether tags and copy describe the same game

**For weak-wishlist cases, focus on:**
- conversion blockers before recommending more promotion
- whether the page sells a specific fantasy or merely states features
- whether the visual package earns the click and the wishlist
- whether low traffic and low conversion are being confused

**For Next Fest / demo-readiness cases, focus on:**
- demo polish and representative quality
- whether the event timing fits the launch plan
- whether the page, trailer, and stream assets are already polished enough for a big burst
- whether the team has creator/press follow-through after the event

**For launch-checklist cases, focus on:**
- page completeness and consistency
- missing outreach materials, links, or reviewable assets
- avoidable timing risks
- the one or two items most likely to waste launch attention

### Step 6: Ask for the minimum missing evidence when needed
If confidence is low, request the smallest next packet that would materially improve the audit:
1. Steam page URL or screenshots of the top page sections
2. current capsule art and trailer link
3. short description and top tags
4. demo status and target event / launch window
5. any wishlist or traffic trend the team already has

Do not ask for a giant marketing dossier.

## Output format
Always return a short operations brief, not a broad essay.

Required qualities:
- prioritize the single biggest blocker first
- distinguish conversion, discovery, demo timing, and launch-ops hygiene
- stay around 300-500 words unless the user asks for more
- recommend the next artifact or checklist, not ten simultaneous strategies
- avoid pretending you can infer Steam analytics the user never supplied

## Examples

### Example 1: Weak Steam page conversion
**Input**
> Our Steam page has been live for a month and wishlists are weak. Can you review what to fix first? We have capsule art, a trailer, and screenshots but no demo.

**Output sketch**
- Scope: `wishlist-funnel-triage`
- Primary blocker: `positioning-message`
- Secondary blocker: `visual-asset-conversion`
- Priority fixes:
  1. rewrite short description around the actual player fantasy
  2. move best gameplay screenshots to the top
  3. tighten trailer opening so it proves the hook immediately
- What not to do yet: do not buy more traffic before the page sells the game clearly

### Example 2: Next Fest readiness
**Input**
> We want to join Next Fest. Our demo is playable but rough. Tell us whether that is a bad idea and what to check.

**Output sketch**
- Scope: `demo-fest-readiness`
- Primary blocker: `demo-quality-timing`
- Root view: a festival is a major impression event; a rough demo can spend your best visibility on a poor build
- Priority fixes:
  1. decide whether the demo is polished enough to impress
  2. verify trailer, screenshots, and tags are fest-ready before submission
  3. prepare creator/stream/broadcast assets before event week

### Example 3: Launch checklist request
**Input**
> Give me a Steam launch readiness checklist for an indie game. We already have a page, demo, trailer, and a small creator list.

**Output sketch**
- Scope: `launch-checklist`
- Primary blocker: `launch-ops-hygiene`
- Recommended next artifact: launch checklist
- Checks include page consistency, link verification, asset completeness, outreach readiness, and timing risks

## Best practices
1. **Audit the page before prescribing promotion** — traffic cannot save a weak conversion surface.
2. **Treat demo quality as a reputational event** — especially for Next Fest.
3. **Separate discovery fit from page conversion** — tags and traffic are not the same as page clarity.
4. **Prefer one next artifact** over dumping an entire marketing stack.
5. **Use Steam-native language** — capsule, tags, coming soon page, Next Fest, wishlist funnel, trailer hook.
6. **Keep recommendations practical** — the user usually needs a checklist, rewrite brief, or audit, not a thesis.
7. **Call out weak evidence honestly** when the review lacks page screenshots, URLs, or asset details.

## References
- [Store Page, Building and Editing (Steamworks)](https://partner.steamgames.com/doc/store/page)
- [Features And Tools, Marketing (Steamworks)](https://partner.steamgames.com/doc/marketing/tools)
- [Steam Page Optimization Guide [2026] | presskit.gg](https://presskit.gg/field-guides/steam-page-optimization-guide)
- [Steam Next Fest Complete Guide [2026] | presskit.gg](https://presskit.gg/field-guides/steam-next-fest-guide)
- [Steam Next Fest Marketing Checklist & Tools | IMPRESS](https://impress.games/steam-next-fest-game-marketing-ready)
- [How To Market Your Indie Game in 2024: A 10 Step Plan](https://howtomarketagame.com/2021/07/12/how-to-market-your-indie-game-a-10-step-plan/)
- [Steam Store Page Optimization: Above-the-Fold Best Practices](https://indiegamejoe.com/steam-store-page-optimization-above-the-fold-best-practices/)
