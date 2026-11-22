# Critique rubric: judge your own effect before you hand it over

Score each line pass, fix or n/a. Anything marked fix blocks delivery unless the reason is written
down. Look at contact sheets of at most 1600 px (`gd_review.contact_sheet`, 4 columns of 400 px).
Open a single frame at full size only to check a detail.

## A. Numbers (no eyes needed)

| #   | Check                 | Pass when                                                                                                                                  |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Kit and scenes parse  | `vfx_selftest.gd:compile` ok, 0 parse errors; build job has no captured errors                                                             |
| A2  | Project settings      | `project.godot` has Jolt and the intended renderer, read as text                                                                           |
| A3  | Static audit per tier | 0 errors; every warning fixed or justified in the handoff                                                                                  |
| A4  | AABB                  | `fit_aabb` in the level: every `old_encloses_live` true; timeline `aabb_check` reports nothing outside                                     |
| A5  | Lifecycle             | node count back to baseline after N spawns; `done` count = N; no "safety timeout" in the log                                               |
| A6  | Projectile            | one `hit` per shot, at distance / speed (within one tick); nothing left in the tree                                                        |
| A7  | Juice                 | `Engine.time_scale` is 1.0 after single and overlapping stops; shake is bounded and exactly 0 at the end                                   |
| A8  | Overdraw              | p99 layers per tier, from calibrated frames (`gd_vfx.OVERDRAW_CAL`); low tier lighter than high                                            |
| A9  | GPU                   | p95 with `driver="vulkan"`; budget agreed with scenario-godot-performance-export; effect cost = stress minus baseline on the same renderer |
| A10 | Renderer logs         | Compatibility shows only the warnings you expect; no `SHADER ERROR` anywhere                                                               |

## B. Frames (look at them)

Capture each tier on its own renderer at 0.03, 0.1, 0.2, 0.35, 0.6, 1.0, 1.5 and 2.2 s with
`--fixed-fps 60`. Capture the projectile mid-flight and at impact.

| #   | Look for                                                                             | Bad sign                                                                                                    |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| B1  | Read order: flash, then fire, then smoke and sparks, then aftermath (scorch, debris) | everything peaks together; the smoke covers the fire at 0.2 s                                               |
| B2  | Silhouette at gameplay distance                                                      | a white blob (additive HDR stacking) or a flat card                                                         |
| B3  | No popping                                                                           | particles appear or vanish at full alpha; the ring stops before fading; a trail tail jumps                  |
| B4  | Variation                                                                            | repeated identical puffs; every particle the same size and rotation                                         |
| B5  | Contact with the world                                                               | flash or fire cut by the floor; sparks through the floor; debris stuck or floating                          |
| B6  | Orientation                                                                          | an impact on a wall still points up the world Y; the ring is not on the surface                             |
| B7  | Projectile                                                                           | the head reads as fire, the trail stays attached and fades, and there is a glow on nearby surfaces (if lit) |
| B8  | Smoke value                                                                          | smoke near black or near white compared with the scene (check every renderer)                               |
| B9  | Tier parity                                                                          | the low tier keeps the read order and timing, with fewer layers                                             |
| B10 | Overdraw sheet                                                                       | big layered quads covering much of the screen at the peak; quads much larger than their visible texture     |

## C. Honesty

- Mark what was not run (phone GPU, SDF bake, 2D) and say why.
- Give numbers with their context: resolution, renderer, driver, camera distance and machine.
- Effects tuned by eye on one renderer are retuned on the others. Do not claim parity without the
  frames.
