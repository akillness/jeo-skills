---
title: Steam Store Launch Ops Packet-First Hardening 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, game-dev, marketing, skill-quality, graphify]
sources: [.survey/steam-store-launch-ops-structural-hardening-20260420/triage.md, .survey/steam-store-launch-ops-structural-hardening-20260420/context.md, .survey/steam-store-launch-ops-structural-hardening-20260420/solutions.md, .survey/steam-store-launch-ops-structural-hardening-20260420/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Steam Store Launch Ops Packet-First Hardening 2026-04-20

## Question
What is the best bounded next improvement for `steam-store-launch-ops` after the earlier bottleneck-router rewrite already proved the skill should remain the single Steam/game-launch exception?

## Answer
Tighten `steam-store-launch-ops` into a **packet-first Steam launch router**.

The durable gap was no longer category coverage. The gap was front-door shape. Research showed that teams still use many fragmented substitutes — page analyzers, wishlist dashboards, festival calendars, launch checklists, and creator/press tooling — but those tools do not choose the right next move. The strongest bounded ratchet was therefore to make the skill choose one packet first:
- `page-promise-audit`
- `wishlist-signal-check`
- `demo-readiness-gate`
- `event-timing-workback`
- `launch-ops-runbook`

## Why this beat the alternatives
- Survey evidence still pointed to one connected Steam operator timeline, not a missing new skill category.
- Steam’s docs and adjacent market tools repeatedly expose the same ambiguity: weak wishlists, demo timing, Next Fest timing, and launch readiness get conflated when no packet is chosen first.
- The repo already had the correct neighboring owners: `marketing-automation`, `game-demo-feedback-triage`, `game-build-log-triage`, `game-performance-profiler`, and `bmad-gds`.
- Graphify-style structural memory showed the skill remained oversized enough to justify another bounded hardening pass, while the cluster still did not justify another wrapper.

## Accepted changes
- Rewrote `steam-store-launch-ops/SKILL.md` around packet choice before intervention details.
- Added `references/intake-packets-and-route-outs.md` for packet selection, route-outs, one-shot Steam warnings, and anti-folklore reminders.
- Expanded `evals/evals.json` with route-out coverage for demo-feedback and broad-GTM cases.
- Refreshed `SKILL.toon`, `skills.json`, README / README.ko, and `setup-all-skills-prompt.md` so discovery surfaces describe the packet-first shape truthfully.
- Refreshed `graphify-out/` so the structural layer records the new packet-first finding.

## Rejected changes
- Creating another Steam marketing / creator-outreach / Next Fest wrapper.
- Pulling broad GTM strategy back into this skill instead of routing to `marketing-automation`.
- Pulling player-feedback prioritization, build triage, or performance diagnosis back into the Steam lane.
- Treating wishlist tools or page analyzers as the main answer rather than evidence aids.

## Durable finding
For this lane, the reusable abstraction is **packet-first Steam launch routing** layered on top of the existing bottleneck model. Keep `steam-store-launch-ops` as the Steam-facing exception in the game and marketing clusters, but make it choose the next packet before it starts talking about fixes.

## Related pages
- [[game-development-cluster]]
- [[marketing-cluster]]
- [[skill-support-coverage]]
- [[steam-store-launch-ops-structural-hardening-2026-04-17]]
