# scenario-unreal-vfx expert notes

Principles and judgment by expert, each with its source id and timestamp (video `[hh:mm:ss]`, doc
section, or slide frame). Distilled notes live in `notes/niagara/`, `notes/destruction/`,
`notes/physics/`; full source list in `sources.md`. Items marked [added] are this skill's synthesis,
not the expert's words. Nothing here has been checked in an installed engine yet.

## Where a strong generalist goes wrong (from the U7 baseline)

The no-skill answer to U7 (tests/baseline/answers.md) was competent but missed or got wrong: Effect
Type specifics (Spawn Only, Kill and Clear, instant cull; cap equal to pool size; type cap about 2x
system cap); reading `stat NiagaraOverview` per thread and on the target core count;
`statnamedevents` for Insights; lightweight emitters; Data Channels for repeated impacts and debris;
the RT dispatch cost of GPU sims (it put a tiny trail on GPU); any value, color or timing rubric
beyond taste; tying the ring to the gameplay radius. On Chaos it missed Nanite on the GC and
stripping, root proxy with the ISM renderer, one-way debris, Tiny Geo, connection graph type against
floating chunks, Material Strength and Connectivity, one convex per cluster and box proxies,
physical-material heft and the density unit trap, Apply Breaking Linear Velocity, the
`set_editor_property` gotcha, the per-platform removal multiplier, and that Dataflow makes fracture
scriptable. It also stated invented specifics ("capped at 20 events per frame", "stat chaos"). This
skill carries those deltas.

## What the with-skill answer still missed (U7 blind grade, 2026-09-24)

`tests/grading/U7_grade.md` scored the v0.1 answer 14/15 and listed 17 expert points it never raised
plus two internal errors. v0.2 teaches each where the agent meets it (SKILL.md stance, workflow gate
or mistake row; the procedure named; a check in `scripts/ue_vfx.py`):

| Missed point                                                                            | Source                                                    | Now taught in                                                             |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Distance culling stops ticking, not rendering; cull proxies save the tick, not the RT   | Kiraly [00:16:57], [00:18:02]                             | stance; V3, V10 lever table; `lever_check`                                |
| Budget oscillation and its damping; budgets only on non-critical types                  | Kiraly [00:36:18]-[00:37:21]                              | stance; V3, D7; `budget_verdict`, `budget_oscillation`                    |
| Anti-strobing: stretch along velocity, motion blur in the head texture                  | Keyser #5 [00:08:13]-[00:08:47]; #2 [00:03:31]-[00:04:04] | stance; V15; `strobe_risk`                                                |
| Build-up stops at the hit; cause-ordered spawns                                         | Shishido [00:30:00], [00:37:02]                           | stance; V15; `spawn_schedule_verdict`, rubric T7                          |
| Cluster Crumbling; per-platform removal multiplier                                      | Caillaud [00:10:17], [00:11:56]                           | stance; D1, D6; `gc_recipe_verdict`, `gc_verdict` CRUMBLE                 |
| Blowout from stacked duplicates; alpha-blended saturated layer behind the additive core | Shishido [00:17:42]-[00:18:14]                            | stance; V16; `duplicate_spawn_check`                                      |
| Popcorning: opacity fade from mid-life                                                  | Shishido [00:11:24], [00:39:23]-[00:40:00]                | workflow 4; V16; `fade_curve_verdict`                                     |
| Big, medium, small held over time; 60 / 30 / 10 with the accent at the focal point      | Firsova [00:04:31]-[00:05:05], [00:14:39]-[00:15:14]      | quality gates; V16; `size_classes_series`, `accent_focal_distance`        |
| Saturation under a correct grayscale                                                    | Keyser #4 [00:15:36]-[00:16:44]; #3 [00:13:32]            | quality gates; V16; `saturation_under_values`, rubric C2                  |
| Flipbook divides RGB by A; playback fast then slow                                      | Flipbook Baker doc; Trümpler [00:13:08]                   | workflow 4 and 5; V13; `premultiplied_check`, `flipbook_playback_verdict` |
| Texture import: masks sRGB off, Effects group, size caps                                | Trümpler [00:18:14]-[00:20:05]                            | workflow 5; V5; `audit_vfx_textures`                                      |
| Interior distance-to-surface bake                                                       | Caillaud t_jy [00:29:14], [00:34:05]                      | workflow 8; D2; recipe `INTERIOR`                                         |
| Watertight, non-intersecting source mesh                                                | Chaos docs, Best practices                                | workflow 8; D0; `mesh_watertight_check`                                   |
| Chaos data generation plus component notification before Niagara reads breaks           | Xiao Yue [00:08:42]                                       | workflow 8; D7; `enable_break_events`, recipe `EVENTS_OFF`                |
| Disable, not sleep, for debris that never wakes                                         | Xiao Yue [00:27:36]-[00:28:45]; Chaos docs                | workflow 8; D8; recipe `DISABLE_NOT_SLEEP`                                |
| Color-blind value check over green environments                                         | Keyser #3 [00:10:54]-[00:12:03]                           | workflow 9; V16; rubric V6                                                |
| Anticipation tied to the cast animation                                                 | Keyser #5 [00:08:47]-[00:09:54]; Firsova [00:06:45]       | stance; V15; `WINDUP_NOT_SYNCED`                                          |

Errors fixed: the v0.1 SKILL.md plan table gave emitters of one system different Effect Types (an
Effect Type is per system, Kiraly [00:20:16]; now `system_plan` and V1b); procedure D1 tuned a
threshold array while the workflow chose Material Strength and Connectivity (now one explicit model
per asset, D1). From the no-skill answer's errors: fixed bounds smaller than a traveling trail
(`fixed_bounds_check`), strain falloff (avoid, Chaos docs), destroying the projectile under live
particles (deactivate and let them finish [added]), size-specific called a damage model (it is a
flag), a debris profile on the whole GC.

## Adam Kiraly (Senior Technical Artist, Tanglewood Games): Optimizing Niagara, Unreal Fest Orlando 2025 (71c5yv-XeY8)

- Optimize the world, not the effect: reduce system ticks and instances across the level, usually
  late on signed-off content, without changing the look [00:00:35]-[00:01:07]; Effect Types are "the
  backbone" [00:14:14].
- `stat fps` and `stat unit` always on, "if those are not enabled all the time, you're doing it
  wrong" [00:04:07]; then `stat NiagaraOverview` (GT Concurrent Total, GT Total, RT Total),
  `stat Niagara` tags (CNC: emitter and particle count, sim complexity; GT: system count,
  activations, scalability and significance manager; RT: GPU dispatch, rendering, culling) (slide
  00:05:41), `stat NiagaraSystems` with asset paths, `stat NiagaraEmitters` [00:06:18]-[00:07:24];
  `stats.MaxPerGroup` unhides truncated rows (frame 00:05:25).
- GT Concurrent is worker time; the same 4 ms is harmless on 16 cores and deadly on 4; he profiles
  with affinity limited to 4 cores [00:04:41]-[00:05:15], slide 00:01:26.
- The RT pays a dispatch for every GPU simulation, visible or not [00:05:47]; find systems ticking
  with hidden renderers in the debugger's in-world view [00:08:48]; the FX Outliner shows owner,
  pooling state, culled or uninitialized [00:08:48]-[00:10:28].
- He spends 30 to 50 % of his time in Insights; no `statnamedevents`, no Niagara in the trace
  (`trace.file default,statnamedevents`, slide 00:11:23); search `NS_` timers [00:10:52]-[00:14:14];
  Insights also catches cases where Niagara looks guilty but is not [00:11:58].
- Effect Type fields: Allow Culling for Local Players, Update Frequency (Spawn Only suits short
  effects), Cull Reaction (Kill, Kill and Clear, Asleep, Asleep and Clear, Pause), Significance
  Handler (Distance, Age), System Scalability Settings per quality (Max Distance stops ticking, not
  rendering, and the scalability manager pays for the check [00:16:57]; Max Effect Type and System
  Instances; Cull Proxy saves the tick, not the RT [00:18:02]; visibility culling), Emitter
  Scalability spawn multiplier [00:14:29]-[00:19:10].
- Result on a 4-core Lyra 5v5 with Epic's own optimizations removed: active systems 227 to 103, RT
  avg 5.07 to 1.51 ms (max 12.33 to 6.11), GT Concurrent 4.23 to 2.08 ms, GT 2.12 to 1.41 ms, "looks
  exactly the same" [00:20:48]-[00:21:54], frame 00:20:58. Spikes matter as much as averages
  [00:21:54].
- Presets: NET_OneShot (footsteps, impact concrete and glass, shell eject; not muzzle flashes; not
  player-hit sparks, which are gameplay critical): Max System Instances 15, type cap "slightly
  more", he doubles it, Spawn Only, Kill and Clear, Distance, instant visibility cull 0.0 / 0.0
  [00:22:26]-[00:23:31]. NET_PickupPersistent: 5 from sight lines, Continuous, Asleep, Distance, 1.0
  s delayed cull so wind-ups do not restart when strafing behind cover [00:24:03]-[00:25:07].
- Very high counts on one type: about 7,000 leaf systems gave a 30 ms spike on each add
  (significance refresh) [00:19:44].
- Per-emitter scalability: Emitter State > Scalability Mode Self, MaxDistance 5000 with "Sleep and
  Let Particles Finish", spawn count scale by distance; keep smoke and main flame, drop embers
  [00:26:03]-[00:27:08], frame 00:26:18. Quality tables: High+ 30 / 15; Medium 5000, 30 / 15; Low
  2000, 20 / 8 (frame 00:27:15); `fx.Niagara.QualityLevel` 0 to 4 follows `sg.EffectsQuality`
  [00:27:17]; platform overrides (never Epic on Switch, custom High for Steam Deck Linux)
  [00:28:24]; Scalability mode in the Niagara Editor previews which emitters survive [00:28:58].
- Pooling: for moderate recurrence (heal every 30 to 60 s), not spam [00:30:40]; Max Pool Size 32,
  Prime 0 by default, "hidden under a little arrow" [00:32:18]; Auto Release or Manual Release
  chosen at spawn, Manual means Release to Pool, never Destroy [00:33:53]; overflow goes to GC, so
  set the type's system limit to the pool size [00:33:22]; priming hitches if loaded mid-play
  [00:31:46].
- FX budgets: `fx.Budget.Enabled`, `fx.Budget.EnabledInEditor`, per-thread budgets, INI-only so
  rarely used [00:35:12]; oscillation trap (cull, free budget, respawn, repeat) damped by
  `fx.Budget.AdjustedUsageDecayRate` [00:36:50]-[00:37:21]; Max Global Budget Usage is the nuclear
  option for footsteps in heavy combat [00:36:18].
- Lightweight emitters: fixed module set, no scratchpads or dynamic inputs [00:38:20]; turn off
  system state for the fast path; footsteps GT 1,387 to 271 us, RT 301 to 215 us, GPU 46 to 0 us,
  memory 2.72 to 0.28 MB (editor numbers, frame 00:39:43).
- Data Channels: Global or Islands [00:41:22]; listener with Complete if Unused, NDC reader
  initialized once at System level [00:43:03]; Write To Niagara Data Channel (and Batch) with
  Visible to Blueprint / Niagara CPU / GPU flags, usable as gameplay messaging [00:44:43]; impacts:
  per-impact about 487 us GT versus one listener about 146 us GT, RT unchanged because particles
  still render [00:45:15]-[00:45:46]. NDC and lightweight are exclusive: reading needs custom
  modules [00:45:57].
- Reference table [00:45:57]: one-shot critical (muzzle flash, hit, tracer): ET + Pool + LE* +
  FXB* + SG*, or NDC + ET + SG*; one-shot not critical: ET + Pool + LE* + FXB + SG, or NDC;
  persistent critical (status, smoke grenade, AoE): ET + Pool + SG* + FXB*, LE unlikely (samples
  meshes, skeletons, sockets); persistent not critical (dust, leaves, rain): ET + FXB + SG + LE*.

## Xiao Yue (Technical Artist, Epic Games China; ex-film FX): Advanced Niagara Fluids, Unreal Fest Gold Coast 2024 (PikR41luBws)

- "There's no hidden code in Niagara fluids": every solver step is a module or stage you can open
  [00:14:16]; most gas effects only need a template and the Emitter Summary [00:13:29].
- Look comes from the source: shape noise on the source particles, not turbulence in the solver
  ("energy coming from nowhere") [00:10:40]-[00:11:14]; for dust: directional burst source (GPU),
  rename the source reader or nothing changes, temperature off, density buoyancy (points down)
  [00:11:49]-[00:12:23]; shadow casting noticeably improves fidelity [00:12:56].
- Cost knobs: Pressure Solve Iterations (6 loses swirls and water volume versus 10) and advection
  Interpolation Type (Cubic keeps detail, Linear cheaper); Vorticity Confinement restores swirl
  [00:16:32]-[00:20:33].
- Grids: Rasterization Grid for atomic min, max, add; Grid Collection reads and writes in one stage;
  half float for density and temperature [00:03:08]-[00:04:51]. Sim stages iterate data interfaces
  (Iteration Source), repeat with Num Iterations; separable blur inside a Sim Stage Loop (4 loops)
  [00:06:55], [00:28:24]-[00:29:11].
- A grid that follows the player moves in cell-size snaps so relocation copies rather than resamples
  [00:24:21].
- Collision: screen depth cheap but 2D; Global Distance Field 3D, low-res, no skeletal; Rigid Mesh
  Collision accurate, costly with many objects; her split: GDF for static world, Rigid Mesh filtered
  to characters [00:24:56]-[00:26:06].
- Wind is drag toward `Transient.AdvectionVelocity`, not force (blows up) or set velocity (flat)
  [00:29:33]-[00:31:18]; baked smoke sprites get lifetime from wind speed [00:31:54]; particle
  volume-domain rendering is what Heterogeneous Volumes fall back to on lower end [00:32:28];
  Physics Fields are a CPU to GPU messenger shared by Chaos, cloth, Niagara and materials
  [00:26:40]-[00:28:24].

## Jason Keyser (VFX Apprentice founder, League of Legends VFX): Artistic Principles of VFX (BOE8osaPzOY, Wb7r6_L9Fyk, 3DaBs-7oFhM, 8iTkIDYupu4, WLMVpcK0WvA)

Identification: end cards of #3 and #5 read "jkFX Tutorials by Jason Keyser"; #1, #2, #4 are the
same narrator.

- **#1 Gameplay.** A game developer first, an artist second [00:00:00]. Three concrete pillars per
  game instead of "stylized" or "realistic" [00:04:44]-[00:05:54]. The primary shape sits on the
  gameplay boundary (AoE rim, missile head), flavor inside [00:09:11]-[00:09:44]; a tapered visual
  over a rectangular hitbox is a bug: fix the visual (Sona) [00:11:21]-[00:11:55]. Brightness is a
  budget by importance and inverse frequency (idle, basic, defensive, damaging, game changer,
  ultimate) [00:12:03]-[00:14:47]. Get in and out; lingering says "still doing damage?" [00:15:21].
  Flair depends on how many copies share the screen: right for 200 copies is too quiet for one hero
  [00:16:25]; League lands "in the middle" (Tristana) [00:16:59].
- **#2 Shape.** Break an effect into components with simple textures; detailed cards fight in the
  cloud [00:02:01]-[00:03:06]; bake motion blur into moving textures so a still frame reads
  direction [00:03:31]-[00:04:04]; leading edge bold, trailing detail softer and quieter
  [00:06:24]-[00:07:30]; sharp first, soft after: punch then dissipation, material contrast animated
  down [00:08:10].
- **#3 Value.** Value grabs attention; contrast is a screen budget [00:00:00]-[00:01:36]; value
  bands by discipline: UI top whites, characters mid to dark, environment darker, VFX widest range
  but no 0 % or 100 % (slide 00:02:19); near white, never white, white reserved for UI [00:06:29];
  contrast highest at the missile head and the AoE rim [00:08:13], [00:10:06]; a bright contrasty
  trail reads as a damage zone [00:11:27]; fix with a hotter core and dark wisps behind the head,
  plus a little glow [00:12:03]-[00:12:35], [00:04:38]; bump value for color-blind players
  [00:10:54]; convert grayscale accurately [00:13:32].
- **#4 Color.** Color depth per element (several hues) when many elements or skins exist
  [00:01:39]-[00:04:25]; never 255 fully saturated [00:06:29]; complementary pairs: one side weaker
  or they vibrate [00:07:34]-[00:09:10]; fire ramp hot core to orange to red to smoky brown
  [00:10:35]; most saturated color in glow and fringe, near-white core [00:12:46]-[00:14:27]; dark
  saturated halo supports the core (Xerath) [00:19:55]; good values can hide bad saturation
  [00:15:36].
- **#5 Timing.** Anticipation, overload at the awaited moment, time to process
  [00:00:57]-[00:02:06]; linger only as long as gameplay, with some transparency at the peak (slide
  00:06:12); stretch along motion to avoid strobing [00:08:13]; anticipation, slow in and out,
  secondary action [00:08:47]-[00:11:38]; reduce all curves to one intensity-over-time curve
  [00:12:11]-[00:14:34]; explosions peak at the first instant, "intensity is not size" [00:14:34];
  dissipation shorter than build-up [00:18:07]; abilities with the same art differ by timing
  [00:18:40]; timing is the skipped pass: "can I push the timing harder" [00:21:45].

## Sonia Firsova (Riot Project L contractor, VFX Apprentice mentor): Composition (zPl0oVanDV0)

- Composition applies to the whole sequence: a clear focal point per stage, transitions led by
  anticipation [00:01:46]-[00:02:18].
- Symmetric balance for heavy impacts, asymmetric for movement, small trailing shapes as the lever
  that shows where a fireball came from [00:02:21]-[00:04:31].
- Few big, more medium, many small, ratio held over time [00:04:31]-[00:05:05]; line of action
  first, continuing the character's pose [00:05:36]-[00:07:51].
- Timing contrast: short fast beat against a long slow tail around the main beat
  [00:11:51]-[00:12:25]; maximum value contrast only at the point of interest [00:12:25].
- 60 / 30 / 10 color with the accent near the focal point; gradient maps give four schemes in under
  20 minutes [00:14:39]-[00:16:24]; Windows grayscale exaggerates, squint for the first-glance read
  [00:13:31]-[00:14:39].
- Closing question: "What am I as a viewer noticing the most, and is it what I wanted the viewer to
  look at at this moment?" [00:18:30].

## Simon Trümpler (Wild Sheep Studio): How to (Not) Create Textures for VFX, GDC 2022 (KaNDezgsg4M)

- The fastest texture is the one you do not make; decision tree: need a texture? third-party asset?
  simple tool? tileable (Substance) or unique (Photoshop, Krita) [00:16:33]-[00:17:07]; "good
  enough" first [00:01:29].
- Licenses: attribution requirements are impractical; ArtStation standard license: one project,
  2,000 sales [00:10:14]-[00:11:20].
- Finish stock flipbooks: frame blending (default on in Niagara since 5.4), color and size curves,
  playback fast at start and slow at the end [00:12:36]-[00:13:40].
- Author sources big, set the in-engine size down (32 x 32 ash becomes a blur near camera)
  [00:18:14]-[00:20:05].
- Channel packing is a special case; separate grayscale masks about 90 % of the time
  [00:36:40]-[00:37:44]; grayscale plus LUT beats color variants [00:38:47]; erosion masks "fake
  complexity" [00:39:52]; UV distortion adds motion [00:38:28].

## Jonathan Shishido (VFX artist, Teamfight Tactics, Riot): Crafting VFX in TFT (W8A7KgGQjrg)

Riot's engine, not Unreal: the ideas transfer, the numbers do not.

- A prompt is a suggestion bounded by tech, texture memory and time [00:01:37]; reuse existing
  assets under time pressure [00:02:14].
- Test in the game view: the viewport showed clouds fine that rendered on bodies in game (height 200
  too low, 800 blocks the bench, 400 right) [00:04:35]-[00:06:11].
- Popcorning: individual cards visible; match layer colors, fade by opacity from mid-life, not by
  shrinking [00:11:24], [00:39:23].
- Brightest value on the source of power [00:13:47]; blowout to white came from six stacked additive
  dots, one fixed it, and an alpha-blended saturated layer behind an additive core "fakes the
  saturation" [00:17:12]-[00:18:14].
- Beginning, middle, hit, end; build-up stops spawning exactly at the hit; consequences spawn after
  causes (rain at 1.8 s, floor candy at 2.2 s) [00:21:57], [00:30:00], [00:31:20], [00:37:02];
  meshes are expensive particles [00:34:47].

## Epic documentation (UE 5.8)

- **Niagara overview and Flipbook Baker:** Emitter Spawn and Update always run on the CPU, whatever
  the sim target (Emitters); prefer Dynamic Inputs and Micro Expressions over new modules; baker
  tiles are not rescaled: power-of-two texture and a dividing grid, 8 x 8 on 1024 = 128 px; baker
  fps equal to the 30 fps authoring rate; bake is premultiplied, divide RGB by A; Clear before a
  variation.
- **Scalability and best practices:** start with Effect Types on every system; system as a service
  for concentrated spawns; per-emitter overhead is fixed (VM), consolidate with spawn index and
  multiple renderers instead of Cascade-style emitter per element; GPU vs CPU: 1 GPU particle can
  cost the resources of 64, CPU for small counts or GPU-bound projects, validate by profiling; fixed
  bounds cheaper, except small effects traveling far; avoid warmup; mesh hygiene (no collision, no
  shadow, no distance field, no extra UVs); spread large bursts; Require Current Frame Data off when
  nothing moves; attribute reader over events; sorting costs.
- **Effect Types and budgets:** created at FX > Niagara Effect Type; Budget Scaling curves
  (distance, instance count, system instance count) and Max Global Budget Usage; Debug HUD console
  syntax
  (`fx.Niagara.Debug.Hud Enabled=1 OverviewEnabled=1 SystemDebugVerbosity=2 SystemFilter=*x* ShowGlobalBudgetInfo=1`),
  `fx.Niagara.Debug.PlaybackMode`, `PlaybackRate`, `fx.budget.enabled`, `fx.Budget.GameThread`,
  `GameThreadConcurrent`, `RenderThread`; FX Outliner capture with pooling state; Session Browser
  targets other devices.
- **Lightweight emitters and Data Channels:** 17 supported modules; pure stateless systems are the
  most performant; 20 x 20 stress test reading Game Thread Average, Frame and Draw; NDC listener
  needs Infinite loop plus Complete if Unused; payload types include Chaos destruction and Niagara
  collision events.
- **Fluids:** Beta, "use caution when shipping"; 2D gas for games and torches, 3D gas for hero or
  cinematic, bake otherwise; Pressure Relaxation near 1; Scale Emission by dt for
  frame-rate-independent sourcing; Render Temperature Black Body gives the physical fire ramp;
  Cinematic scalability plus MRQ game overrides.
- **Chaos destruction (Geometry Collections, Fields):** source meshes watertight and
  non-intersecting (open faces simulate worse and unpredictably, intersecting parts are pushed apart
  at start); avoid falloff with external strain for performance; disabled bodies never wake,
  sleeping ones wake on contact, Kill removes at once; quickstart thresholds 5000 / 500 / 50, strain
  50000, radius 100.
- **Python API 5.8:** `NiagaraSystem`, `NiagaraComponent`, `NiagaraFunctionLibrary` expose system
  settings, User parameters, seek and advance, sim cache, `init_for_performance_baseline`,
  `allow_scalability`, pooling method at spawn; no emitter or module editing. `GeometryCollection`
  exposes damage, clustering, connection type, size-specific data, Nanite, root proxy, custom
  renderer, removal and Dataflow; not per-bone data; several properties are read-only attributes but
  read-write editor properties.

## Cedric Caillaud [?] (Lead Physics Programmer, Chaos) and Jim Van Allen [?] (destruction TA, Epic; ex-ILM): Dynamic Destruction, GDC 2025 (wPgd1J1Tf70)

Names from garbled captions; treat spelling as unverified.

- 32 copies of a 1M-poly fractured asset ran below 30 fps before breaking [00:02:24]; fix order:
  rendering, rigid body count and lifetime, collision, throttles; cutting destruction is last
  [00:03:47].
- Nanite on the GC after fracture, no refracture; GC rendering has no LOD otherwise; strip
  non-Nanite geometry for about 95 % smaller assets [00:04:21]-[00:05:28].
- Root proxy renders until the first break, with LOD, Nanite and Lumen, also in editor; the root
  proxy ISM renderer batches every proxy; collision always comes from the GC; glass is the clearest
  case [00:05:58]-[00:08:15]; 5.5 pivot limitation said to be fixed next release [verify].
- Remove on Break: two random min/max ranges (delay, duration), Cluster Crumbling; Remove on Sleep
  is the per-asset "little sister" (3 s example); a per-platform removal multiplier cvar ships one
  asset everywhere [00:08:39]-[00:12:29].
- One-way interaction for debris levels: one-way vs one-way collide as spheres, one-way vs two-way
  sees the other as infinitely massive, one-way pieces deal no damage (no cascades)
  [00:12:59]-[00:14:37].
- Throttles cap cluster breaks per frame (10 example); a burst becomes a ripple
  [00:15:14]-[00:16:53] (Project Settings since 5.6).
- Break propagation passes leftover damage; shock propagation does nothing with level-based
  thresholds, needs size-specific [00:17:22]-[00:20:11].
- Tiny Geo: delete internal slivers, 0 / 0 removal replaced by a Niagara burst, or merge (329 to 219
  pieces, little visual change); tiny pieces keep big ones awake [00:20:47]-[00:21:52].
- Van Allen: "just don't sleep": anchor or kinematic bones (right-click in Fracture Mode); anchors
  now break under force [00:23:40]-[00:24:35]. Heft: friction up to 1 with combine Max, very low
  restitution, smaller applied forces; density does not look heavy; stone is 2, 2000 is a unit error
  [00:25:05]-[00:27:27]. A few physical materials with damage threshold multipliers tune every
  destructible (Lego Fortnite) [00:27:58]. "Your eyes will lie to you" [00:28:32].
- Projectiles: Apply External Strain plus Apply Breaking Linear Velocity instead of a master field
  ("heavy and slow"); internal strain for damage over time; collision alone can tunnel, so
  must-break objects combine collision and strain; scale with projectile speed
  [00:28:56]-[00:32:35].
- NDC debris: gather piece data in the construction script, remove the piece on break and fill its
  volume with particles; 150 destructibles never below 30 fps, usually 40 to 45 (hardware not
  stated) [00:33:43]-[00:39:17]. Animated rest transforms for self-building pieces (collision not
  updated in 5.5) [00:39:31]-[00:43:25].

## Xiao Yue: Tips and Tricks for Chaos Destruction, Unreal Fest Gold Coast 2024 (zFiHDRREv7E)

- Start from the true material [00:05:36]: concrete noise plus grout (fine debris in crush zones)
  [00:06:09]; wood shrink, fracture, stretch back for splinters [00:06:42]; glass radial or
  iterative slices when the hit point is unknown [00:07:15]; metal and glass often better as
  material effects with a Niagara render-target hit mask (glass shards cost a lot and show little)
  [00:11:38]-[00:13:53].
- Interiors: auto UV and auto bake tools for internal materials, baked thickness suggests what the
  material is made of; render-only embedded geometry (rebar, rocks) adds depth
  [00:07:15]-[00:08:24].
- Secondary detail from Chaos events through Niagara: enable Chaos data generation in Project
  Settings, then event notification (breaks, collisions) on each GC component; the data interface
  gives position, inherited velocity, normals, restitution, friction, routed by surface type
  [00:08:42]-[00:11:03]; on the same event switch only the broken bones' collision profile so debris
  does not block the player [00:09:50]-[00:10:24].
- Floating chunks and corner hinges come from the default pivot-based connection graph on concave
  shapes: Bounds Overlap Filtered (5.1) or Proximity with convex or precise contact and an area
  threshold (5.2) [00:17:14]-[00:18:56].
- Material Strength and Connectivity (5.3): threshold = contact area x tensile strength, the most
  physical option, weakens corner connections [00:20:27]; shock propagation with caution [00:21:36].
- Clusters: about 4,000 fragments in 4 levels, a first hit involves about 200 bodies; no clustering
  about 4 fps [00:22:32]-[00:23:07]; one convex per cluster instead of leaf-convex fallback
  [00:24:07]; leaf proxies sphere < capsule < box < convex, boxes below 0.3 relative size cut dips
  under 30 fps [00:25:15]-[00:25:51].
- "It's the active ones that matter" [00:29:27]; sleep field just above the ground for settled
  debris, disable if it never needs to wake [00:27:36]-[00:28:45]; recovery time after the collapse
  is a criterion [00:27:36].
- Dataflow batch per material; volume-driven site counts through per-asset overrides
  [00:30:09]-[00:33:48]; CVD records solver steps, record only needed channels
  [00:33:54]-[00:35:13].

## Cedric Caillaud [?]: Non-Destructive Workflows for Chaos Physics, Unreal Fest Orlando 2025 (t_jyTILDYo8)

- Physics setup must be a recipe: hand setup did not survive the Matrix Awakens bridge art update
  [00:02:12]-[00:02:46]; non-destructive workflows scale quality and make a late "halve the rigid
  bodies" a parameter change [00:04:16]-[00:05:24].
- Dataflow: pull-based, cached per node, variables read-only in the graph and overridable per asset
  [00:08:48]-[00:17:02]; procedural selections over painted ones [00:18:41]-[00:19:47].
- Barrier recipe: variables (mesh, material, anchor height, pieces), Uniform Fracture, interior
  faces with UVs and a distance-to-surface bake, anchoring subgraph (Set Anchor State from a bottom
  box), Proximity, explicit leaf and root convex generation, Geometry Collection Terminal
  [00:23:53]-[00:34:05]; gym at 10 vs 100 fragments, settle near 50 [00:35:12].
- The Blueprint API is exposed to Python: create Dataflow assets, set overrides, regenerate; the
  one-click converter is "three nodes basically"; "select them all, right click, let the computer
  work for you" [00:39:50]-[00:43:08].

## Alex McAdams and Jared Monson (Epic): Chaos Cloth for AAA Games (1ty5-RlBlVQ); Yellow Brick Games: Eternal Strands (EcmhjPSNemc)

Cloth and character physics belong to scenario-unreal-animation and scenario-unreal-gameplay; kept
here for handoffs and the review tools they share.

- Game cloth 200 to 600 sim vertices (about 350, 0.5 to 1 ms current gen), PBD, solver from 1 x 1
  (Ciri 2 x 2, under 1 ms on PS5) [00:02:07]-[00:12:33]; `t.OverrideFPS` 60 in PIE for accurate
  review, 5 to fast-forward [00:29:57] [verify in 5.8]; teleport, then reset, then a one-frame
  damping spike for pops [00:40:27].
- Eternal Strands: move physical characters with 6-DOF constraint drives (spring:damping about 10:1,
  a force limit as strength), not forces ("a small rocket in our back") [00:06:19]-[00:15:13]; in
  5.8 evaluate ChaosMover first [added].

## Disagreements and deciding conditions

| Choice                             | Position A                                                         | Position B                                                                | Decide by                                                                               |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Pool or Data Channel               | pool moderate recurrence (Kiraly [00:30:40])                       | NDC for high-volume, concentrated spawns ([00:40:50])                     | spawns per second in one area                                                           |
| Stateless or NDC                   | stateless for footsteps-class bursts ([00:39:24])                  | NDC for impacts with payload ([00:45:15])                                 | exclusive: NDC read needs custom modules                                                |
| Effect Type everywhere             | "use this everywhere" ([00:19:10])                                 | 7,000 systems on one type spike 30 ms ([00:19:44])                        | live system count per type; consolidate ambient first                                   |
| Instant or delayed visibility cull | instant for sub-second one-shots ([00:23:31])                      | 1 s for persistent wind-ups ([00:25:07])                                  | duration and whether a restart is visible                                               |
| FX budgets                         | core Effect Type option (docs)                                     | rarely used, INI setup, oscillation (Kiraly [00:35:12], [00:36:50])       | only non-critical effects in spiky scenes, with decay damping                           |
| GPU or CPU                         | GPU for large counts (docs)                                        | CPU/stateless saved RT and all GPU time for footsteps (Kiraly [00:39:56]) | particles per emitter and which thread bottlenecks                                      |
| Flair                              | League "in the middle" (Keyser #1 [00:16:59])                      | Shishido's 3-hex demo, explicitly non-production                          | simultaneous effects and competitive stakes                                             |
| Near-white core vs "never white"   | near-white core (Keyser #4)                                        | no blowout (Shishido [00:17:12])                                          | area: small near-white core with saturated fringe is right, large white areas are wrong |
| Channel packing                    | Spellbound packs everything                                        | separate masks 90 % (Trümpler)                                            | shared UVs, panning, resolution and one master shader                                   |
| Live fluid or baked                | live 3D gas for hero, 2D for game fire (docs)                      | bake to flipbook for background (docs; Xiao Yue [00:31:18])               | platform budget, hero status, Fluids Beta                                               |
| Sleep                              | "just don't sleep" (Van Allen [00:24:35])                          | sleep field for settled debris (Xiao Yue [00:27:36])                      | never to hold an intact structure; fine for settled debris; disable if it never wakes   |
| Breaks                             | fields for control (docs, Xiao Yue demos)                          | strain nodes for weapons (Van Allen [00:29:29])                           | hero shot: field; weapon all game: strain; must-break: collision plus strain            |
| Removal                            | Remove on Break, per piece (Caillaud's pick [00:11:15])            | Remove on Sleep, per asset                                                | artistic control vs an asset-level default settable from Python                         |
| Shock propagation                  | natural breaks with size-specific thresholds (Caillaud [00:20:11]) | use with caution (Xiao Yue [00:21:36])                                    | structural collapse art direction vs contained gameplay damage                          |
| Glass                              | GC with root proxy ([00:07:40])                                    | material crack with a hit mask (Xiao Yue [00:13:19])                      | shards that matter to the shot vs thin translucent glass on a budget                    |
| Real time or cache                 | all talks real time                                                | Chaos Cache replays set pieces, can go live on interaction (docs)         | player-chosen impact point vs scripted, repeated moment                                 |
