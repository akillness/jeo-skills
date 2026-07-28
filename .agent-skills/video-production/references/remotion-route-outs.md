# Remotion alias: route-outs and canonical packets

The alias should stay thin because the real workflow packaging already lives in `video-production`.

## Canonical packets to use after alias handoff
- `../video-production/references/production-modes.md`
- `../video-production/references/asset-and-qa-checklist.md`
- `../video-production/references/handoff-boundaries.md`

## Stay in Remotion when
- the user explicitly wants React-based video composition, scenes, components, or render workers
- runtime customization via `@remotion/player` or app-owned props is part of the ask
- the team wants code ownership and a reusable composition codebase

## Route back to broader video-production modes when
- the real need is spreadsheet/API/no-code bulk generation, mass personalization, or vendor-managed rendering
- the source material is long-form media and the main job is clip extraction, captioning, and packaging at scale
- the problem is final editorial polish or approval workflow rather than the render stack itself

## Practical reminder
Explicit Remotion naming should bias the primary mode toward **Code-first programmable video**, but it should not hide when the better answer is a template/API workflow, repurposing pipeline, or manual-finish handoff.

## Compact-surface rule
`SKILL.toon` and any other short-form inventory should describe this folder as a compatibility alias for `video-production`, not as the canonical media skill.
