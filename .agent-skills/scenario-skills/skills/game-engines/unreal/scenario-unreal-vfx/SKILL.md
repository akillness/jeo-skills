---
name: scenario-unreal-vfx
description: 'Use when a UE5 task involves Niagara or Chaos destruction: a Niagara fireball, projectile trail, impact explosion, muzzle flash, spell, smoke, sparks, debris, Niagara fluids or flipbooks; "Niagara is too expensive", stat NiagaraOverview, Effect Types, pooling, Data Channels, lightweight emitters, VFX scalability; judging an effect''s readability, value, color, timing, white blowout or strobing; or a wall that shatters, geometry collection fracture, Dataflow, damage thresholds, floating chunks, debris cost, Chaos Visual Debugger.'
license: MIT
---

# Unreal VFX (Niagara, Chaos destruction, VFX critique)

Expert level means an effect that tells the player the truth (where it hurts, when it is over),
costs what its gameplay class allows across the whole world, and is proven by per-thread numbers on
the target core count plus captures scored against a written rubric. Python cannot author Niagara
emitters or modules (5.8 API): the agent works through templates with a User parameter contract,
Material Instances, Effect Types and Dataflow recipes, and escalates the few graph edits as precise
GUI requests. If a sibling skill named here is missing from your available skills, load it with
`skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-unreal-expert (channels, review loop, 5.8 traps).

**Status (2026-09-24):** Unreal is not installed. Offline checks pass
(`python3 tests/code/unreal-vfx/run_all.py --offline`); every in-editor snippet is **not yet run in
Unreal**; `job_00_vfx_probe.py` answers the `[verify]` names.

## Stance (the expert delta)

- **Gameplay truth first.** The boldest edge sits on the collision boundary (missile head, AoE rim)
  and reads the gameplay number (`User.Radius` = damage radius), never a hand-matched constant;
  lingering says "still dangerous" (Keyser #1 [00:09:44], [00:15:21]).
- **Contrast is a screen budget.** Near-white core, never pure white; saturation in the fringe; dark
  saturated halo; contrast highest at the head; a weak projectile gets a hotter core and dark wisps,
  not a brighter trail (Keyser #3 [00:08:13], [00:12:03]; #4 [00:19:55]). Unexpected white is
  usually stacked additive duplicates: count spawns before touching color, then back the additive
  core with an alpha-blended saturated layer (Shishido [00:17:42]-[00:18:14]).
- **Timing is a story.** Anticipation rides the character's cast animation (no window: put the
  interest in the falloff); build-up stops spawning exactly at the hit; the flash peaks on the hit
  frame ("intensity is not size"); consequences follow causes (flash, then debris and sparks, then
  smoke); dissipation is shorter than build-up and ends inside the gameplay window. A fast round
  head strobes: stretch it along velocity and bake motion blur into its texture (Keyser #5
  [00:08:13]-[00:09:54], [00:14:34], [00:18:07]; #2 [00:03:31]; Shishido [00:30:00], [00:37:02]).
- **Optimize the world, not the effect.** An Effect Type on every system first: Lyra went from 227
  to 103 active systems, RT 5.07 to 1.51 ms, same look (Kiraly [00:20:48]). The Effect Type is set
  per system, never per emitter; secondary emitters get Scalability Mode Self. Read GT, GT
  Concurrent and RT separately at the target core count [00:05:15], then pick a lever that saves
  that thread: distance culling stops ticking, not rendering, and the scalability manager pays for
  the check; cull proxies save the tick, not the RT [00:16:57], [00:18:02]; every GPU system pays an
  RT dispatch even unseen [00:05:47]. FX budgets only on non-critical types, with
  `fx.Budget.AdjustedUsageDecayRate` against oscillation [00:36:50]-[00:37:21].
- **Spawn architecture by class and rate** (Kiraly's table [00:45:57]): pool moderate one-shots
  (Manual Release means Release to Pool), a Data Channel listener for spam, stateless emitters with
  system state off for simple bursts (footsteps GT 1,387 to 271 us [00:39:24]); NDC and stateless
  are exclusive; small counts stay on CPU.
- **Destruction cost is active bodies and contacts.** Fix in order: rendering (Nanite on the GC,
  root proxy with the ISM renderer), body count and lifetime (clusters, Remove on Break with random
  timers and Cluster Crumbling, a per-platform removal multiplier, Tiny Geo), collision (one-way
  debris, one convex per cluster, boxes under 0.3 relative size), throttles last (Caillaud
  wPgd1J1Tf70 [00:03:47]-[00:16:18]; Xiao Yue zFiHDRREv7E [00:29:27]).
- **Weapons break walls with strain, not fields.** Apply External Strain plus Apply Breaking Linear
  Velocity scaled by projectile speed, no strain falloff; fields are "heavy and slow" (Van Allen
  [00:29:29]). Pick one damage model: Material Strength and Connectivity (tune tensile strength on
  the physical material) or per-level thresholds (tune the array); size-specific is a flag, not a
  model (Xiao Yue [00:19:54]-[00:20:27]). Heft comes from friction (combine Max) and low
  restitution; stone density is 2 g/cm3, 2000 is a unit error (Van Allen [00:26:11]).
- **Recipes, not clicks.** Templates with exposed parameters and Dataflow graphs with per-asset
  variables survive art changes and are what an agent reaches reliably (Caillaud t_jyTILDYo8
  [00:02:46]).

## Establish first

| Input                                       | Why it changes the plan                                                                            | Default when silent                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Platform, frame rate, min-spec cores        | per-thread budgets, quality tables                                                                 | PC 60 fps; cores from scenario-unreal-performance, 4 if unknown (Kiraly)                                                          |
| Gameplay numbers (scenario-unreal-gameplay) | radius, speed, damage window, fire rate, max simultaneous, cast animation timing                   | ask; never guess a radius                                                                                                         |
| Camera and environment                      | read at gameplay distance over the real ground colors                                              | the game's camera and level                                                                                                       |
| Style pillars, importance tier              | brightness budget: idle, basic, defensive, damaging, game changer, ultimate (Keyser #1 [00:13:08]) | three pillars from the art lead                                                                                                   |
| Crowd and destruction scope                 | copies on screen; walls per level, must-break objects, low-end platforms                           | worst realistic fight; real time, Nanite on                                                                                       |
| Budgets                                     | no source gives per-effect ms                                                                      | [added] all Niagara at or under about 2 ms GT + GT Concurrent and 1.5 ms RT at min spec; confirm with scenario-unreal-performance |

## Workflow

1. **Probe once per engine.** `job_00_vfx_probe.py` (headless). GATE: `probe.json` answers the
   `[verify]` items.
2. **Classify elements, group them into systems.** `classify_element` per element, then
   `system_plan`: one Effect Type per system (its most critical element); the rest get Scalability
   Mode Self, or their own system when spammy or on GPU.

   | System (examples)               | Effect Type                                 | Critical emitters  | Secondary (Scalability Mode Self)      |
   | ------------------------------- | ------------------------------------------- | ------------------ | -------------------------------------- |
   | Projectile, beam, tracer        | NET_OneShotCritical                         | head               | trail, wisps, embers                   |
   | Impact, hit, muzzle flash       | NET_OneShotCritical                         | flash, damage ring | smoke, sparks (split if spammy or GPU) |
   | Debris or impact listener (NDC) | NET_OneShot, budget only with decay damping | none               | all                                    |
   | AoE, status, pickup             | NET_PersistentCritical                      | rim                | interior flavor                        |
   | Ambient dust, leaves, rain      | NET_Ambient                                 | none               | all                                    |

   GATE: `system_plan` has no error.

3. **Timing plan before building.** Write the spawn schedule (wind-up from the cast animation,
   build-up ending at the hit, flash on the hit, debris and sparks, smoke, window end) and run
   `spawn_schedule_verdict`; `strobe_risk(speed, head length)` gives the stretch a fast head needs.
   GATE: no error; stretch in the template spec.
4. **Template and contract.** `duplicate_template`, `user_parameters`, `contract_verdict`; a missing
   control becomes one GUI request. Curves in that request pass `fade_curve_verdict` (opacity fades
   from mid-life, never shrink-only) and `flipbook_playback_verdict` (fast then slow). GATE:
   contract ok.
5. **Look: materials and textures.** Master material and instances from scenario-unreal-materials
   (erosion, gradient-map LUT, depth fade); reuse textures first (Trümpler [00:16:33]), generate
   glows, LUTs and noise in Python. Import masks with sRGB off, `TEXTUREGROUP_Effects`, big sources
   capped by Maximum Texture Size; baked flipbooks are premultiplied, so the material must divide
   RGB by A (`premultiplied_check`). Smoke and fire: baked flipbooks by default; Fluids are Beta.
   GATE: `audit_vfx_textures`, `flipbook_check` clean.
6. **System properties and scalability.** `set_system_properties`: `effect_type`, `max_pool_size` =
   the type's system cap, prime 0 for mid-play loads, warmup 0, current-frame data off for static
   effects; world-space trails need fixed bounds of speed x lifetime (`fixed_bounds_check`). Effect
   Types from `EFFECT_TYPE_PRESETS` (`create_effect_type` [verify] or GUI once). GATE: no
   `NO_EFFECT_TYPE` in `audit_niagara`; `caps_verdict`, `budget_verdict` clean.
7. **Wire to gameplay.** scenario-unreal-gameplay spawns with the pooling method, sets User
   parameters from gameplay data, spawns the wind-up from the cast animation, writes Data Channel
   payloads, applies strain on hit (`strain_plan`; collision plus strain for must-break objects). On
   hit, deactivate the trail and let its particles finish [added]. GATE: a PIE hit spawns from the
   pool (FX Outliner InUse / FreeInPool).
8. **Destructible asset.** Watertight, non-intersecting source (`mesh_watertight_check`); fixed
   seed; pattern by material (concrete noise and grout, wood shrink-fracture-stretch, glass slices
   or a crack material); two or three levels, anchored; Proximity graph with an area threshold; one
   damage model; one convex per cluster; interior material with a distance-to-surface bake (Caillaud
   t_jy [00:29:14]); Remove on Break ranges plus Cluster Crumbling; removal multiplier in the
   low-end device profile; disable settled debris that never wakes (Xiao Yue [00:28:45]). VFX on
   breaks needs Chaos data generation in Project Settings plus break notification on the component
   (`enable_break_events`, Xiao Yue [00:08:42]); switch only broken bones to a debris profile. Then
   `harden_gc`; piece count in a gym at 10, 50, 100 (Caillaud t_jy [00:35:12]). GATE:
   `gc_recipe_verdict`, `gc_verdict`, `physmat_check` clean.
9. **Review loop.** Textured review level, Manual exposure, the gameplay camera;
   `live_capture_series.py` or `capture_ages` with clean plates; `score_captures.py` (a blank frame
   voids the series); LOOK at the color, grayscale and squint sheets; repeat in PIE ("the viewport
   lies", Shishido [00:05:05]), over green and brown ground for the color-blind check, in a crowd
   grid and at `sg.EffectsQuality` 0 to 3. On white-out run `duplicate_spawn_check` on Debugger
   counts first. One change per pass. GATE: no rubric fail; judgment rows scored
   ([`references/critique.md`](references/critique.md)).
10. **Measure.** Fixed worst fight at the target core count: `stat unit`, `stat NiagaraOverview`,
    Debug HUD, Insights with `-statnamedevents` (Niagara is invisible without it, Kiraly
    [00:10:52]); `init_for_performance_baseline()`; `lever_check` before each change;
    `budget_oscillation` when budgets are on. Destruction: frame series around the break, CVD,
    `t.OverrideFPS 60` [verify]. GATE: `niagara_overview_verdict`, `before_after`,
    `destruction_run_verdict` within budget, visual parity.
11. **Deliver** the budget sheet to scenario-unreal-performance.

## Numbers

| Value                                                                                       | Relative to                   | Source                          |
| ------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------- |
| NET_OneShot: 15 per system, about 30 per type, Spawn Only, Kill and Clear, instant cull 0.0 | fire-and-forget, not critical | Kiraly [00:22:26]               |
| NET_PickupPersistent: 5 (sight lines), Continuous, Asleep, cull delay 1.0 s                 | persistent critical           | Kiraly [00:24:03]               |
| Max Pool Size 32, Prime 0 (defaults); type cap = pool size                                  | per system                    | Kiraly [00:32:18], [00:33:22]   |
| Flipbook 8 x 8 on 1024 = 128 px tiles, end frame 63, bake at 30 fps                         | baker                         | Flipbook Baker doc              |
| Thresholds 5000 / 500 / 50; strain 50000, radius 100, velocity 500                          | quickstart wall               | Chaos docs                      |
| Boxes below 0.3 relative size; 4,000 fragments in 4 levels, about 200 bodies hit            | leaf proxies; clustering      | Xiao Yue [00:25:51], [00:22:32] |
| Remove on sleep 3 s; removal 5 to 10 s, then a per-platform multiplier                      | debris                        | Caillaud [00:10:43], [00:11:24] |

## Quality gates

- **Measurable:** audits (`audit_niagara`, `audit_gc`, `audit_vfx_textures`, `caps_verdict`,
  `system_plan`, `gc_recipe_verdict`); per-thread stats at the target core count, averages and
  spikes; break spike and recovery; capture rubric (footprint vs radius, value bands, blowout,
  saturation under values, 60 / 30 / 10 with the accent at the focal point, size classes held over
  time, head contrast, color-blind contrast, intensity curve, schedule, strobing); `image_checks`
  rejects blank frames.
- **Visual:** grayscale read at gameplay distance; popcorning; story beats; crowd read; no pops
  across quality levels; the break reads as the material with thick interiors, no floating chunks,
  heavy debris, removal hidden by dust.

## Common mistakes

| Mistake                                        | What it looks like                   | Fix                                                                              |
| ---------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Hand-matched radius                            | ring larger than the damage zone     | `User.Radius` from gameplay                                                      |
| White blowout                                  | flat white blob                      | count duplicates, then an alpha-blended saturated layer behind the additive core |
| Round head at speed                            | strobing dots                        | stretch along velocity, motion blur in the texture                               |
| Build-up after the hit; smoke before the flash | muddy payoff                         | spawn schedule: stop at the hit, causes first                                    |
| Shrink-only fade                               | popcorning cards                     | opacity fade from mid-life, matched layer colors                                 |
| Effect Type per emitter                        | embers get the uncullable type       | one type per system, Scalability Mode Self                                       |
| Distance culling to cut RT                     | RT unchanged                         | `lever_check`: caps, CPU sims, stateless                                         |
| Budget without decay                           | cull, respawn, cull                  | decay rate, non-critical types only                                              |
| Fixed bounds smaller than the trail            | trail vanishes on screen             | `fixed_bounds_check`                                                             |
| Destroying the projectile on impact            | trail pops off                       | deactivate, let particles finish                                                 |
| Sleep to hold a wall                           | wakes on a bump                      | anchor or kinematic bones                                                        |
| Default connection graph                       | floating chunks, corner hinges       | Proximity or Bounds Overlap Filtered                                             |
| MSC with a tuned threshold array               | tuning does nothing                  | tensile strength on the physical material                                        |
| Field or strain falloff per bullet             | physics spike                        | strain plus breaking velocity, no falloff                                        |
| Debris profile on the whole GC                 | player walks through the intact wall | switch broken bones on the break event                                           |
| Sleeping debris that never wakes               | solver cost                          | disable                                                                          |
| `gc.removal_duration = ...`                    | refused (read-only attribute)        | `set_editor_property`                                                            |

## Handoffs

- **Receives** from scenario-unreal-materials: particle master material, instances, texture
  settings; from scenario-unreal-gameplay: numbers, cast animation timing, pooled spawns, NDC
  writes, strain calls; from scenario-unreal-world-building: destructible placements and counts.
- **Delivers** to scenario-unreal-performance: a budget sheet (system, Effect Type, caps, pool, sim
  target, per-thread cost, core count, quality; GCs with pieces, peak active bodies, break spike,
  recovery) plus the repeatable scenario; to scenario-unreal-cinematics: Chaos caches, Cinematic
  scalability; to scenario-unreal-lighting-rendering: particle lights, Heterogeneous Volumes. Cloth
  belongs to scenario-unreal-animation.

## UE 5.8 notes

- Data Channels Production Ready since 5.5 (the GDC 2025 talk still says experimental); lightweight
  emitters Beta since 5.5, compile step dropped in 5.7; Niagara Fluids Beta; "Empty" template is
  "Minimal".
- `r.HeterogeneousVolumes.Allow` (5.8); Niagara Editor Preview Actor (5.7).
- Chaos: default Dataflow template at GC creation, runtime Dataflow evaluation (5.8); destruction
  throttles in Project Settings (5.6).
- GC Python: `root_proxy_data`, `size_specific_data`, `set_dataflow_asset`; per-bone data (anchors,
  Remove on Break, one-way levels) is not on the class.

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, timestamps,
  disagreements, what the U7 grade found missing.
- [`references/procedures.md`](references/procedures.md): full code, test path and status per
  procedure.
- `references/critique.md`: the rubric (metrics, thresholds, judgment rows).
- [`references/gui-paths.md`](references/gui-paths.md): editor menus for the same work.
- [`references/sources.md`](references/sources.md): every source, credential, URL, best timestamps,
  revision history.
- [`scripts/ue_vfx.py`](scripts/ue_vfx.py): offline verdicts and metrics; in-editor helpers (not yet
  run).
