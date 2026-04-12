# BMAD-GDS Scope Boundaries

`bmad-gds` is the **coordinating skill** for game-production packets. It should not swallow every game problem.

## Use `bmad-gds` when
- the packet mixes design, production, QA, build, or launch context
- the team needs the next milestone-aware artifact first
- the user is unsure which game skill to use
- a specialist result needs to be stitched back into one production brief

## Route away from `bmad-gds` when

### `bmad-idea`
Use for early ideation, design-thinking, story framing, and creative expansion before production coordination matters.

### `task-planning`
Use for generic engineering decomposition once the game-specific milestone or scope decision is already made.

### `game-demo-feedback-triage`
Use when the core input is player/demo/creator feedback that needs weighted clustering and fix-first prioritization.

### `game-build-log-triage`
Use when the core input is editor/build/package/cook/compile/CI failure data.

### `game-performance-profiler`
Use when the core question is profiling, performance diagnosis, or bottleneck planning.

### `steam-store-launch-ops`
Use when the dominant problem is store-page quality, wishlist funnel, launch sequencing, or public-facing launch operations.

## Stitch-back rule
After a specialist skill runs, `bmad-gds` can be used again to merge the result back into:
- milestone priorities
- owner / risk decisions
- next public-beat readiness
- scope cuts or re-sequencing

## Anti-patterns
- treating `bmad-gds` as a replacement for detailed engine debugging
- using it for every game task just because the project is a game
- returning multiple competing next artifacts instead of one decisive coordination brief
- hiding milestone risk behind generic design prose
