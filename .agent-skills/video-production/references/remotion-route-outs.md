# Remotion requests: mode lock and route-outs

Explicit Remotion naming (Remotion, React-based composition, scenes, compositions,
render workers, `@remotion/player`) is handled here directly. The former
`remotion-video-production` compatibility alias was merged into this skill on
2026-09-19; the name is recorded in `skills.json` `retired_skills` and resolves to
`video-production` at install time.

## Stay in code-first programmable video when
- the user explicitly wants React-based video composition, scenes, components, or render workers
- runtime customization via `@remotion/player` or app-owned props is part of the ask
- the team wants code ownership and a reusable composition codebase

## Route to a broader `video-production` mode when
- the real need is spreadsheet/API/no-code bulk generation, mass personalization, or vendor-managed rendering
- the source material is long-form media and the main job is clip extraction, captioning, and packaging at scale
- the problem is final editorial polish or approval workflow rather than the render stack itself

## Canonical packets
- [production-modes.md](production-modes.md)
- [asset-and-qa-checklist.md](asset-and-qa-checklist.md)
- [handoff-boundaries.md](handoff-boundaries.md)

## Practical reminder
Explicit Remotion naming should bias the primary mode toward **Code-first programmable
video**, but it must not hide when the better answer is a template/API workflow, a
repurposing pipeline, or a manual-finish handoff. Say so explicitly instead of
over-committing to a Remotion codebase.
