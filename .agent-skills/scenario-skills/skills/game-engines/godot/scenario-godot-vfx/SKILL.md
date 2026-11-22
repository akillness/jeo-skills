---
name: scenario-godot-vfx
description: "Use when making or fixing particle effects and game feel in Godot 4.7: GPUParticles3D or GPUParticles2D explosion, fireball projectile with trail, impact, sparks, smoke, shockwave, ribbon trails, sub-emitters, particle collision, color curve does nothing, particles pop out or vanish, effect too heavy on mobile, CPUParticles fallback for Compatibility or web, overdraw, hit-stop, freeze frame, screen shake, juice."
license: MIT
---

# Godot VFX

Target: Godot 4.7.2.stable, macOS Apple Silicon.

Expert level here means effects built as layers of small systems, every silent particle failure
caught by a script before anyone looks, and every claim about look or cost backed by frames captured
at exact times and by measured overdraw and GPU time per renderer. The agent builds effects in code,
renders them windowed, and looks at contact sheets. If a sibling skill named here is missing from
your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (gd_env, gd_run, gd_review, AgentKit, GD_MAX slots,
windowed vs headless).

## Stance (the expert delta)

1. **An effect is layers, and the head of a projectile is not particles.** A projectile is head,
   tail and sparks; the head is a shader mesh with scrolling noise and HDR color above 1 (Le Lu
   74XywaLGO5Q 00:00:34, 00:08:05). An explosion is flash, fire, smoke, sparks, debris, shockwave
   and light, each a small system made by duplicating a working one and changing a few values
   (Brackeys htRjt505sPg 00:02:30, 00:13:27). A one-particle system is fine for a shockwave ring
   (00:18:02).
2. **Particle settings fail silently, so audit them in code.** Color and alpha curves do nothing
   without `vertex_color_use_as_albedo`; scale curves do nothing on a particle billboard without
   `billboard_keep_scale`; trails need `trail_enabled`, a Ribbon or Tube trail mesh and
   `use_particle_trails` (Godotneers cZ5Ang_Ji8E 00:09:44, 00:32:54; Brackeys 00:23:44). A
   sub-emitter's own `amount` is a global cap (Godotneers yKoGuBGZatY 00:44:48) and its AABB is not
   inherited (cZ5Ang_Ji8E 01:06:19). [`vfx_audit.gd`](scripts/agentkit/vfx/vfx_audit.gd) flags all
   of these.
3. **`visibility_aabb` is both culling and the collision area** (Godotneers cZ5Ang_Ji8E 00:45:28).
   Measure it rather than guessing: on 4.7.2, `capture_aabb()` pads particle positions by the draw
   mesh's longest axis and ignores per-particle scale (measured: Flash quad 2 m gave a 4 m box; a
   ring scaled to 4.5 m still gave 2 m) [added]. `fit_aabb` corrects for scale and must run inside
   the level, because debris without its colliders falls 8 m through the world.
4. **Tier by renderer, never by `amount_ratio`.** `amount_ratio` hides particles and saves nothing
   (GPUParticles3D docs; Bonkahe BUa-mKHEPUM 00:01:18). Lower `amount` per tier and drop the layers
   the renderer cannot draw. Compatibility drops decals with no warning, and logs warnings for
   trails and sub-emitters (measured) [added].
5. **Particles do not touch physics.** Gameplay hits come from a ray swept every physics tick;
   particle collision needs GPUParticlesCollision nodes, and the step per tick is speed / fixed_fps,
   with fixed_fps 30 by default (Godotneers cZ5Ang_Ji8E 00:44:23, 00:47:17).
6. **Juice is code you can test.** Hit-stop lowers `Engine.time_scale` and waits on a timer that
   ignores it, then restores 1.0 (Mostly Mad Jwv9t5zFlqI 00:00:32, 00:01:37). Shake comes from
   smooth noise with decay (Mostly Mad pG4KGyxQp40 00:00:39); trauma squared and a 3D camera offset
   are [added].
7. **Judge frames, not the inspector.** Render windowed with `--fixed-fps 60`, so frame k is t =
   k/60 s, at 0.03 to 2.2 s, and look at one contact sheet per renderer. Overdraw comes from
   `DEBUG_DRAW_OVERDRAW` with a measured per-layer calibration, and GPU time from the Vulkan driver
   (Metal reports 0 on macOS) [added].
8. **A trail that follows a node is a particle shader trick.** Pin the particle to
   `EMISSION_TRANSFORM[3].xyz` in `start()` and `process()`, with no forces (Octodemy iPCzOe-S9EQ
   00:05:42).

## Establish first

| Input                            | Changes                                                             | Default                                                        |
| -------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Target renderers                 | which layers exist (trails, decals, sub-emitters)                   | Forward+ desktop, Mobile phones, Compatibility web             |
| 2D or 3D                         | node family, collision (LightOccluder2D vs GPUParticlesCollision3D) | 3D                                                             |
| Camera distance and screen share | quad sizes, overdraw budget                                         | gameplay camera 4 to 10 m                                      |
| Frame budget for VFX             | amounts per tier                                                    | under 2.5 ms GPU for six bursts at 720p on the dev Mac [added] |
| Look                             | unshaded additive vs lit smoke (Le Lu e_6ZA-xa_DQ 00:07:23)         | stylized, unshaded fire, alpha-blended smoke                   |
| Spawning model                   | free-on-done vs pooled                                              | fx_burst frees itself; `done` signal for pools                 |

## Workflow

1. **Project and kit.** Clone Base3D, `gd_vfx.install(P)` copies tooling to `addons/agentkit/vfx/`,
   and shaders and runtime scripts to `res://vfx/` (they ship with the game). Read `project.godot`.
   GATE: `3d/physics_engine="Jolt Physics"` and the intended `renderer/rendering_method` are present
   as text; `vfx_selftest.gd:compile` reports 0 errors over 10 scripts (`check_all` skips
   `addons/agentkit/`).
2. **Build per tier in code.** `gd_vfx.build(P, "high"|"mobile"|"low")` saves `explosion_`,
   `impact_`, `fireball_`, `shot_` and `burst_stage_<tier>.tscn` from
   [`vfx_recipes.gd`](scripts/agentkit/vfx/vfx_recipes.gd). Specs are dictionaries (`VB.emitter`);
   curves and ramps become CurveTexture and GradientTexture1D (HDR when a channel exceeds 1); shared
   textures live in `res://vfx/tex/*.tres` (Brackeys 00:15:04: never embed). GATE: build ok, no
   captured errors. Kit layers: **fireball** (stretched SphereMesh head with `fx_fire_head`, noise
   minus gradient, HDR; inverted-Fresnel `fx_soft_core`; world-space eroded puffs driven by
   `INSTANCE_CUSTOM.y`, onetupthree N9ilhL8JFes 00:05:38; velocity sparks; ribbon via
   `fx_trail_follow` and an OmniLight3D, both off on low); **explosion** (flash, fire, depth-sorted
   smoke, colliding sparks, Face-Y ring, debris with a 30 Hz smoke sub-emitter on high, light,
   scorch Decal except low); **fx_projectile** (ray swept every tick, impact on the hit normal,
   frees itself after its trail dies).
3. **Static audit.** `gd_vfx.audit(P, scene, tier, level)`. GATE: 0 errors for the matching tier.
   Warnings are read and either fixed or written down. Prove the audit catches problems once on
   `broken.tscn` (21 findings, 4 errors).
4. **Fit AABBs in context.**
   `gd_vfx.fit_aabb(P, "res://vfx/burst_stage_high.tscn", node="Explosion", play_method="Explosion:play", write=True, out=effect_scene)`.
   GATE: `old_encloses_live` true for every emitter, and the timeline `aabb_check` reports nothing
   outside.
5. **Look at it, per renderer.**
   `gd_vfx.timeline(P, scene, times=[0.03,0.1,0.2,0.35,0.6,1.0,1.5,2.2], renderer=..., trigger="none", extra={"play_method": "Explosion:play", "aabb_check": True})`;
   for the projectile, `extra={"hold": "Fireball"}`. Open the contact sheet. GATE: no all-black,
   all-white or uniform flags. By eye: the flash reads first, fire turns to smoke, nothing pops, the
   ring fades, sparks bounce on the floor, the scorch stays, and the head reads as fire with its
   tail behind it.
6. **Fallback.** For Compatibility, use the low tier (no ribbon, decal, light or sub-emitter), or
   `gd_vfx.to_cpu` for a CPUParticles3D twin. GATE: read the `lost` list (collision, sub-emitters,
   trails, particle shaders, alpha_curve baked into the ramp, align mode) and render the twin in
   `gl_compatibility`.
7. **Budget.** `gd_vfx.overdraw(...)` per tier, and
   `gd_run.profile_scene(stress scene, size=(1280,720), driver="vulkan")`. GATE: p99 layers and GPU
   p95 inside the numbers below, low tier lighter than high.
8. **Behavior.** Run [`vfx_selftest.gd`](scripts/agentkit/vfx/vfx_selftest.gd): `lifecycle` (node
   count back to baseline after 5 spawns), `projectile` (one hit, explosion spawned, everything
   freed) and `juice` (time_scale restored, shake bounded and back to 0). GATE: all ok.

## Expert checklist (state these in the plan)

- **Complete code in the deliverable**: paste the `vfx_recipes.gd` specs and
  [`fx_fire_head.gdshader`](scripts/agentkit/vfx/shaders/fx_fire_head.gdshader), not prose; readers
  may lack the kit.
- **Replay** with `restart()`, not `emitting = true` (docs).
- **Deterministic frames**: `use_fixed_seed`, then `speed_scale = 0`, `restart()`,
  `request_particles_process(t)`. Two seeks to 0.4 s were pixel-identical; without a fixed seed they
  differed by 0.50 (P13).
- **Fire into smoke in one system**: premultiplied blend (`BLEND_MODE_PREMULT_ALPHA`, texture
  imported with Premultiply Alpha): low alpha adds, high alpha mixes; fade with black and alpha 0
  (Brackeys 30:56 to 32:39). Measured over gray: alpha 0 brightened it, alpha 1 replaced it (P13).
- **Smoke LOD**: [`fx_smoke_lod.gdshader`](scripts/agentkit/vfx/shaders/fx_smoke_lod.gdshader) maps
  a black-to-white color ramp to mip 0 to 8 of one noise texture, so the puff diffuses almost free;
  color moves to a uniform (Le Lu e_6ZA-xa_DQ 16:40 to 24:20). Detail spread fell from 0.10 to 0.0
  over life on all three renderers (P13).
- **Duplicating a system**: Brackeys' "Make Unique Recursive, but never the texture" is
  `duplicate(true)` in 4.7.2: embedded curves become unique, external `.tres` textures stay shared
  (P13). Keep the mesh shared and the material in `material_override` (Brackeys 13:59 to 15:04).
- **Billboard plus direction**: Align Y conflicts with billboards; use `transform_align` Z
  Billboard + Y to Velocity (Brackeys 27:07).
- **Layered transparents flicker**: offset the nodes first, then `sorting_offset` (Brackeys 29:57).
- **TAA ghosting**: `DRAW_ORDER_INDEX` (the 3D default) is the only order with motion vectors; keep
  it for opaque particles (docs).
- **Preprocess** runs the shader `fixed_fps` times per preprocessed second and can stall the GPU;
  never on one-shots (docs, audit `preprocess_one_shot`).
- **Near-camera quads**: `distance_fade_mode` Pixel Alpha fades by distance without a depth read;
  proximity fade softens intersections.

## Numbers

| Value                                                                                                                                                                              | Relative to                | Source                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Head HDR color (2, 1.3, 0.6); sparks (2, 1.3, 0.5); spark lifetime 0.3 s                                                                                                           | glow threshold 1.0         | Le Lu 00:08:05, 00:28:15                                                              |
| Head render priority 2 over the core's 1; inverted Fresnel power 4 to 5                                                                                                            | nested transparent meshes  | Le Lu 00:18:25                                                                        |
| Shockwave: 1 particle, 0.4 to 0.5 s                                                                                                                                                | one-shot burst             | Brackeys 00:18:34                                                                     |
| Tunnel step = v_max / fixed_fps; fixed_fps 30 by default                                                                                                                           | thinnest collider          | Godotneers 00:47:17, docs                                                             |
| `collision_base_size` default 0.01 m                                                                                                                                               | visible particle size      | Godotneers 00:57:27                                                                   |
| Child `amount` at least parent amount x per-event count (AT_END, AT_COLLISION, AT_START); CONSTANT mode: parent amount x Hz x child lifetime                                       | sub-emitter cap            | Godotneers 00:44:48 (per event); CONSTANT derived [added], both in `link_sub_emitter` |
| `sub_emitter_frequency` is in Hz: dots 1/f m apart at 1 m/s                                                                                                                        | measured 4 and 10 Hz       | live V10                                                                              |
| Overdraw per layer: 0.070 linear luma (Forward+, Mobile); 36.6/255 raw (Compatibility, saturates past 6)                                                                           | DEBUG_DRAW_OVERDRAW PNG    | live V11 [added]                                                                      |
| Explosion p99 layers at the 0.6 s peak: high 4.9 to 5.9, low 2.3 to 3.3 (seeds vary)                                                                                               | 640x360 view at about 5 m  | live V11, 3 runs                                                                      |
| GPU p95, 1280x720, M5 Max via Vulkan, machine shared with other Godot jobs: stage alone 1.0 to 2.3 ms; six looping explosions: high 3.4 to 4.0, mobile tier 2.1 to 2.7, low 1.2 ms | the frame                  | live V12, 3 runs                                                                      |
| Particle counts, explosion / fireball: high 208 / 57, mobile 48 / 35, low 34 / 22                                                                                                  | tier scale 1.0 / 0.6 / 0.4 | kit [added]                                                                           |
| Hit-stop 0.05 time scale for 0.08 s; shake 0.30 x 0.22 m at trauma 1, decay 1.8/s                                                                                                  | the camera                 | [added], typical range in Mostly Mad note                                             |
| Smoke ramp about 0.06 linear for mid gray on Forward+; x3.6 on Compatibility                                                                                                       | the same frame             | live V5 [added]                                                                       |

## Quality gates

Measurable:

- Audit: 0 errors for the tier. Kit compile: 0 parse errors. Project file has Jolt and the chosen
  renderer.
- AABB: every emitter's live box inside `visibility_aabb` at every captured time.
- Lifecycle: node count equals the baseline after N spawns, and `done` fires N times with no safety
  timeouts.
- Projectile: one `hit` at the expected time (12 m at 14 m/s gives 0.867 s, frame 52) and nothing
  left in the tree.
- Juice: `Engine.time_scale` is 1.0 after single and overlapping stops, with no early restore; shake
  offset at most the maximum and exactly 0 at the end.
- Overdraw p99 and GPU p95 per tier against the table. Compatibility logs show the expected warnings
  and no unexpected ones.

Visual (contact sheets of at most 1600 px; rubric in
[`references/critique.md`](references/critique.md)): flash then fire then smoke, no popping,
readable silhouette at gameplay distance, ring fades, sparks bounce, the trail follows the head, the
explosion is oriented to the surface normal, and each tier holds up on its renderer.

## Common mistakes

| Mistake                                            | What it looks like                                                           | Fix                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Vertex color off                                   | white quads, curves ignored                                                  | `vertex_color_use_as_albedo`                        |
| Keep scale off on a particle billboard             | scale curve ignored                                                          | `billboard_keep_scale`                              |
| Trail without `use_particle_trails`                | chopped flat pieces                                                          | set it on the trail mesh material                   |
| Child amount under the cap                         | sub-emitter trails thin out                                                  | `link_sub_emitter` computes the cap                 |
| Default 8 m AABB                                   | effect pops out, collisions stop                                             | `fit_aabb` in the level                             |
| `collision_base_size` larger than the spawn height | debris stuck at the origin (measured: 0.5 m of travel instead of 10 to 12 m) | spawn above the collider                            |
| `amount_ratio` used as the mobile tier             | no saving                                                                    | lower `amount`                                      |
| `emitting = true` to replay                        | one-shot sometimes skipped                                                   | `restart()` (docs)                                  |
| Freeing the projectile on hit                      | world-space trail vanishes at once                                           | stop emitters, wait for the trail to die, then free |
| `convert_from_particles` on view-depth sorting     | "Index p_order = 3 is out of bounds", sorting lost                           | `VB.to_cpu` maps draw order                         |
| Same colors on every renderer                      | smoke near black on Compatibility                                            | retune the low tier on Compatibility                |
| Profiling on Metal                                 | gpu_ms 0                                                                     | `driver="vulkan"`                                   |

## Handoffs

- **Receives** hit events (point, normal, pooling) from scenario-godot-gameplay, budgets from
  scenario-godot-performance-export, glow and environment from scenario-godot-rendering-lighting.
- **Delivers** `res://vfx/*.tscn` per tier, `res://vfx/shaders` and `runtime` (fx_burst,
  fx_projectile, Juice), audit JSON, sheets, overdraw and GPU tables.
- **Asks** scenario-godot-shaders for new surface shaders (dissolve, water, distortion),
  scenario-godot-audio for impact sounds, and scenario-godot-2d for 2D effect integration.

## Godot 4.7 notes

- `capture_aabb()` pads by the draw mesh's longest axis and ignores particle scale (4.7.2,
  measured).
- `CPUParticles3D.convert_from_particles` copies `draw_order` as a raw integer, but the enums
  differ: GPU view depth is 3, CPU view depth is 2. CPUParticles3D has no `alpha_curve` (4.7.2,
  measured).
- Compatibility logs "Particle trails are only available when using the Forward+ or Mobile renderer"
  and "does not support particle sub-emitters"; decals disappear with no warning.
- Headless draws nothing, so captures need a windowed run. On macOS, Metal reports GPU time as 0;
  use `--rendering-driver vulkan`.
- Curve enforces `min_value` and `max_value` since 4.4, so widen the range for scale curves above 1.
  AgX arrived in 4.4. Glow defaults changed in 4.6 (intensity 0.8 to 0.3): retune older effects.
- Particle shaders use `start()` and `process()`; a Godot 3 `vertex()` writing `VELOCITY` fails.
- The trail sections refresh bug (Octodemy, 4.7 era) and Godotneers' 4.2 trail and SDF bugs: not yet
  run on 4.7.2.

## References

- [`references/procedures.md`](references/procedures.md) (P1 to P13, calls, code, live results),
  [`expert-notes.md`](references/expert-notes.md) (principles with timestamps), `critique.md`
  (rubric), [`gui-paths.md`](references/gui-paths.md) (editor paths),
  [`sources.md`](references/sources.md) (sources and timestamps).
- [`scripts/gd_vfx.py`](scripts/gd_vfx.py): install, build, audit, timeline, overdraw, fit_aabb,
  to_cpu, maths.
- [`scripts/agentkit/vfx/`](scripts/agentkit/vfx/): vfx_build, vfx_recipes, vfx_audit, vfx_capture,
  vfx_jobs, vfx_selftest; `shaders/` (including `fx_smoke_lod`) and `runtime/` ship with the game.
