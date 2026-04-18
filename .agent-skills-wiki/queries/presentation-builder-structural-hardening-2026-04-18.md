---
title: Presentation Builder Structural Hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/presentation-builder-structural-hardening-20260418/context.md, .survey/presentation-builder-structural-hardening-20260418/solutions.md, .agent-skills/presentation-builder/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Presentation Builder Structural Hardening — 2026-04-18

## Decision
The best bounded documentation-cluster improvement was shrinking `presentation-builder` into a packet-first deck artifact anchor instead of adding another pitch/deck wrapper or leaving the mode, packet, and handoff decisions buried inside a long inline workflow.

## Why this beat other options
- `presentation-builder` was still on the oversized front-door watchlist even after the earlier modernization pass.
- Cross-domain survey evidence showed the same durable workflow shape across developer demos, PM/ops reviews, launch decks, investor decks, and game pitch decks: upstream docs/spreadsheets/assets, browser review in the middle, and explicit last-mile office/design-tool cleanup at the end.
- The strongest reusable improvement was not another deck template catalog; it was making the skill choose one deck mode, one smallest useful artifact packet, and one honest handoff surface early.

## Durable findings
- “Make slides” often hides a packet choice problem more than a layout problem. The next truthful deliverable may be an outline, storyboard, browser-reviewable HTML deck, export-handoff brief, or sync packet rather than a finished PPTX.
- Real deck workflows still depend on destination surfaces such as PowerPoint, Google Slides, Figma Slides, or PDF; pretending the last-mile surface does not matter makes the skill less honest.
- Upstream docs, links, screenshots, and spreadsheets remain normal inputs even for AI-assisted deck tooling, so the deck skill should keep evidence and source-of-truth handling explicit.
- The documentation lane stays cleaner when `presentation-builder` owns deck artifacts and routes docs/tutorials/research/manuscript/GTM planning outward.

## Accepted changes
- Rewrote `presentation-builder` around deck mode + artifact packet + handoff surface selection.
- Added `references/artifact-packets-and-last-mile-handoffs.md` for packet choice and destination-surface rules.
- Expanded `evals/evals.json` with Google Slides handoff coverage and a marketing-planning route-out case.
- Synced `SKILL.toon`, `skills.json`, `skills.toon`, README / README.ko, and setup prompt wording with the packet-first handoff boundary.

## Rejected changes
- Creating another generic pitch-deck, slide-export, or office-handoff wrapper.
- Letting `presentation-builder` absorb launch planning, technical documents, tutorials, or research manuscripts.
- Pretending browser-authored slides are always the final review surface.

## Related pages
- [[documentation-cluster]]
- [[marketing-cluster]]
- [[presentation-builder-modernization-2026-04-15]]
- [[technical-writing-modernization-2026-04-13]]
- [[user-guide-writing-modernization-2026-04-13]]
