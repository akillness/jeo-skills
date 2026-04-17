---
title: Steam Store Launch Ops Structural Hardening 2026-04-17
created: 2026-04-17
updated: 2026-04-17
type: query
tags: [skills, survey, trigger-design, game-dev, marketing, skill-quality]
sources: [.survey/steam-store-launch-ops-structural-hardening-20260417/triage.md, .survey/steam-store-launch-ops-structural-hardening-20260417/context.md, .survey/steam-store-launch-ops-structural-hardening-20260417/solutions.md, .survey/steam-store-launch-ops-structural-hardening-20260417/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Steam Store Launch Ops Structural Hardening 2026-04-17

## Question
What is the best bounded improvement for the existing `steam-store-launch-ops` skill now that the repo already has full support coverage and no justification for another overlapping game-marketing skill?

## Answer
Harden `steam-store-launch-ops` in place as a diagnosis-first Steam launch/store router.

The highest-leverage change was **not** another game-marketing wrapper or a bigger checklist. The useful ratchet was to make the skill classify one real bottleneck first:
- `visibility-acquisition`
- `promise-clarity`
- `proof-demo-readiness`
- `timing-hook-fit`
- `launch-ops-readiness`

Then it should emit **one intervention** and **one next artifact** instead of a broad marketing sermon.

## Why this beat the alternatives
- Survey work showed that real teams experience Steam page reviews, weak wishlists, demo/Next Fest readiness, and launch checklists as one timeline, but current tools/docs remain fragmented.
- The marketing cluster already has `marketing-automation` as the canonical general router, so another broad GTM/game-marketing skill would add noise.
- The game cluster already has separate owners for demo feedback, build logs, and performance. The Steam-specific skill should stay focused on public-facing store/demo/event/launch diagnosis.
- Graphify-style structural memory showed that support coverage is already complete, so the best next win is dense-anchor cleanup and truer routing logic.

## Accepted changes
- Rewrote `steam-store-launch-ops/SKILL.md` around a visibility / promise / proof / timing / ops bottleneck model.
- Added `references/diagnostic-model.md` and `references/event-hooks.md`.
- Refreshed `evals/evals.json` to cover traffic-vs-conversion and demo/event routing cases.
- Synced `SKILL.toon` and discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`).
- Refreshed graph outputs so the structural layer now records the new lane finding.

## Rejected changes
- Creating a second Steam / wishlist / Next Fest wrapper.
- Broadening the skill into generic marketing strategy or playtest feedback synthesis.
- Treating demo/Next Fest work as just another sub-checklist instead of a distinct readiness hook.

## Durable finding
For this lane, the reusable abstraction is **bottleneck-first Steam launch diagnosis**, not “page audit plus extra checklist.” Keep `steam-store-launch-ops` as the single Steam/game-launch exception under the marketing and game-development clusters, and route everything else outward.

## Related pages
- [[game-development-cluster]]
- [[marketing-cluster]]
- [[skill-support-coverage]]
