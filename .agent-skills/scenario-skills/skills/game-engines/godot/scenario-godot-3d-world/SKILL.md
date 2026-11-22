---
name: scenario-godot-3d-world
description: "Use when building 3D levels and worlds in Godot 4.7: third-person or FPS controller, player stuck on stairs, spring arm camera clipping, blockout with CSG, GridMap and MeshLibrary, terrain (heightmap, HeightMapShape3D, Terrain3D regions, textures, painting), scattering trees with MultiMesh, streaming a big world, procedural meshes with SurfaceTool, Jolt physics settings, importing GLB or glTF from Blender or AI generators (Scenario, Tripo, Meshy, Hitem3D), import scripts, name suffixes, model facing, collision generation, LODs."
license: MIT
---

# Godot 3D world (level and environment artist)

Target: Godot 4.7.2.stable, macOS Apple Silicon, Jolt Physics, Forward+.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, `gd_run`, the review loop, 4.7 traps). If
a sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**Status (2026-10-02):** all 14 live test groups in `tests/code/godot-3d-world/test_world_live.py`
passed (`live_20261002-215949.json`); L8 and L12 were extended and passed again in round 2
(`live_20261002-223935.json`). The 11 offline checks pass. Details in
[`references/procedures.md`](references/procedures.md).

Toolkit: [`scripts/gd_world.py`](scripts/gd_world.py) (runner side) and
[`scripts/agentkit/world/*.gd`](scripts/agentkit/world/) (jobs, a post-import script and two runtime
scripts), installed with `gd_world.install_world(P)`.

## Stance (the expert delta)

1. **Zero Y before normalizing the camera-relative direction.** GDQuest (JlgZtOFMdfc 00:22:00):
   otherwise looking down slows the walk. With the order right, the controller kept 6.00 m/s at -60
   degrees of pitch.
2. **CharacterBody3D needs a stairs module, and the step height must come from the tread.** Majikayo
   (Tb-R3l0SQdc 00:17:01) snaps up with `body_test_motion` and checks the tread with a ray, because
   the capsule touches the leading edge. A stock r 0.35 capsule stops at 0.18 m steps. Taking the
   height from the capsule's travel let it climb 0.6 m over a 0.45 m limit; the tread ray fixed it.
3. **Guard the snap-down with a floor-below ray.** Majikayo (00:14:58): without it, every ledge
   walk-off snaps down. The guard does not fix steep stairs: keep the rise at or under about 0.25 m
   for smooth descents.
4. **Graybox in CSG, then bake it; never animate it.** Four Games (gIK02BgCCBI) and PiCode
   (S5kRpEKIh38 00:01:51): static CSG costs about what modeled geometry costs, moving CSG is slow,
   and the cost follows the operand (a 128-segment sphere cut cost 1,000 times a box cut per move).
   CSG needs closed meshes: an open `CSGMesh3D` operand is silently ignored, with no error.
5. **Prefer simple collision for props.** Four Games (00:05:37) prefers `-colonly` hand shapes.
   Trimesh (`-col`) for static level geometry only, box or convex for props and anything dynamic,
   `-noimp` for reference geometry.
6. **Post-import scripts work outside the tree.** Allard (5fDuf2IlizU 00:11:14): set owners, use
   local transforms, use `reparent(node, false)`; set collision layers in the script so they cannot
   be forgotten (00:15:15). Reproduced: an unowned node is not saved, `global_transform` returns
   identity, default `reparent()` zeroes the position.
7. **Spring arm with a sphere and the player excluded.** Octodemy (ZCb12AHKMfE 00:07:40, 00:08:35):
   SphereShape3D r 0.3, a `top_level` pivot, `add_excluded_object(player)`. The arm stops one radius
   before a wall.
8. **AI GLBs are normalized placeholders until a manifest says otherwise.** Scenario-delivered
   Tripo, Meshy and Hitem3D files arrived unit-boxed, pivot centered, double-sided, metallic 1.0, 4K
   maps, 15k to 1M triangles. Jan (L5emNlNYVfY 00:02:00, vendor) remeshes to 6k to 8k triangles
   first. Size, pivot, facing, collision and budget come from a manifest the import script applies.
9. **Terrain3D: check the region layout, prepare the textures, save binary.** Tokisan (oV8c9alXVwU
   00:20:22): badly placed regions multiply memory. In 1.0.2 a 1,024 m terrain centered on the
   origin takes 16 regions of 256 or 4 of 512 (1.05 km² allocated), but 4 of 1,024 (4.19 km²).
   Textures seamless, square, power of two, equal sizes, channel-packed (albedo plus height, normal
   plus roughness), one compression for all (00:04:33; Four Games ejlD8cM9kk4 00:10:06). Save as
   `.res`, since `.tres` loads slowly (YtiAI2F6Xkk 00:01:30).
10. **Hand over runnable code, and label measurements.** A plan for someone without this kit gives
    the GDScript the helper runs (procedures.md has it), not only `gd_world.*` calls. Numbers
    measured here are effect sizes on an M-series Mac: say so, and re-measure on the target.

Disagreements: capsule (GDQuest) or cylinder (Juli, U5A_JArREUc): capsule for ledge tolerance,
cylinder for clean wall-run and slide normals. CharacterBody3D (GDQuest, Juli) or RigidBody3D
(Bramwell, sVsn9NqpVhg): RigidBody only when the player must be a simulated object.

## Establish first

| Input          | Why it changes the plan                    | Default                                                                                                                                            |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera         | spring arm or head pivot                   | third-person, spring 4.5 m                                                                                                                         |
| Character size | capsule sets door, step and corridor sizes | r 0.35, h 1.8, step 0.45                                                                                                                           |
| Level type     | GridMap kit, Terrain3D or stock heightmap  | blockout then kit                                                                                                                                  |
| World size     | precision and streaming                    | single precision (float32 step 0.12 mm at 1 km, 1 mm at 8 km); stream when the profiled worst view or load time misses budget, not at a fixed size |
| Asset source   | Blender suffixes or an AI GLB manifest     | AI GLB + manifest                                                                                                                                  |
| Targets        | renderer, budgets, compression             | desktop Forward+; web and mobile Compatibility (Juli 00:24:02)                                                                                     |
| Physics engine | Jolt default since 4.6, new projects only  | Jolt, checked by the gate                                                                                                                          |

## Workflow

1. **Project gate (P1).** `gd_world.physics_gate(P)` proves the engine: with Jolt, a ray on a
   concave shape returns face_index -1 (Godot Physics returns 8). A hand-written project.godot gets
   Godot Physics. Name the layers with `set_layer_names`. GATE: `engine_running` "Jolt Physics", no
   flags.
2. **Player (P2).** `build_player`, then `controller_suite` (headless, `--fixed-fps 60`). GATE:
   speed at move_speed, same speed looking down, jump apex within 0.1 m of v²/2g, stairs to
   max_step_height and a refusal above, no snap at the ledge, 40-degree ramp yes and 50 no, arm
   shorter at the wall.
3. **Blockout (P3).** `validate_layout(layout)` offline, then `build_village`, `door_test`, bake.
   GATE: every door walkable by the real capsule (0.70 m blocks, 0.72 m passes for r 0.35; the
   offline rule asks 1.00 m [added margin]), baked triangles equal CSG triangles, capture reads as
   intended.
4. **Kit (P4).** `build_kit`, `build_grid`, `stairs_walk`. Materials go on the mesh surfaces and
   each item holds one StaticBody3D and one NavigationRegion3D (docs). Set the lightmap texel size
   before building the library (GridMap auto-UV2 uses 0.1 per the docs, not re-measured; the .import
   default is 0.2) and keep navmesh cell size equal to the map's 0.25 (docs). GATE: a ray hit on
   every used cell, and the player climbs each stairs item (a 3 m story needs 8 steps; 6 blocked).
5. **Terrain (P5, P6).** Small worlds: `build_island` (chunked ArrayMesh plus one HeightMapShape3D),
   then `collision_check`. Sculpted or painted worlds: `gd_world.terrain3d`, with
   `change_region_size()` (setting `region_size` is ignored) and region-aligned placement. Painting
   is a human step: base paint on large consistent areas, then spray, never spray over autoshader
   areas (YtiAI2F6Xkk 00:05:45 to 00:07:25). GATE: collision within 0.1 m at 400 rays, region count
   and size recorded, `.res` data, capture opened.
6. **Scatter (P7).** `gd_world.scatter`, always windowed. GATE: every instance grounded, a `buffer`
   per tile in the .tscn, rejections counted, close capture checked.
7. **Props from GLB (P8).** `glb_stats` and `glb_flags` offline, then
   `ingest_glbs(P, drop, manifest)` (pre-written .import with LODs, shadow meshes and light baking,
   [`post_import_prop.gd`](scripts/agentkit/world/post_import_prop.gd), textures retuned to VRAM at
   2048), then `audit_props` and `lod_probe`. Asset front is +Z (`Vector3.MODEL_FRONT`);
   `look_at(t, up, true)` turns +Z to the target. Blender exports are triangulated, transforms
   applied, rig in rest pose (docs). GATE: manifest heights, base at y 0, cull back, budget flags
   understood, lineup capture next to a 1.8 m reference, facing checked.
8. **Streaming (P9).** `runtime/cell_streamer.gd`, `unload_radius` greater than `load_radius`,
   tested windowed with `world_stream.gd:walk`. GATE: 0 requests pacing on a border, every cell
   unloaded and the node count back to baseline at the end, worst frame within budget.
9. **Audit and profile (P10).** `audit_level(scenes)`, then
   `gd_run.profile_scene(..., driver="vulkan")`. GATE: no leftover CSG, no headless MultiMesh, no
   unnamed layers; GPU ms and draw calls recorded. Windowed frame time is capped at the display
   refresh, so judge GPU and CPU ms.

## Numbers

| Value                              | Measured or source                                                                             | Relative to                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Controller defaults                | speed 6, accel 40, air 8, jump 5.5 m/s, fall cap 30                                            | this kit [added], GDQuest shape          |
| Stairs module                      | climbs 0.45, refuses 0.6; descent airborne 0 / 8 / 49 of 120 frames at 0.10 / 0.25 / 0.45 rise | tread 0.35, 6 m/s                        |
| Floor-below ray                    | 1.5 x max step                                                                                 | Majikayo 0.75 for 0.5                    |
| HeightMapShape3D error             | max 0.058 m, mean 0.004 m                                                                      | bilinear, 1 m and 2 m spacing            |
| Scatter                            | 1,931 trees from 6,000 rays in 11.7 ms                                                         | 30-degree slope, 2 m clearance           |
| AI GLB textures                    | 19.6 MB lossless to 2.8 MB S3TC per 4K map                                                     | size limit 2048, mipmaps                 |
| LODs at 1080p                      | lighthouse 986,642 tris at 30 m, 61,616 at 300 m                                               | mesh_lod_threshold 1.0                   |
| Streaming                          | 69 loads in 240 frames without hysteresis, 0 with                                              | border pacing, 64 m cells                |
| Water z-fighting, plane 1 mm below | Compatibility: 1.7% of pixels at near 0.05, 0% at near 0.25; Forward+: 0% at both              | Tokisan near 0.25 (YtiAI2F6Xkk 00:18:00) |

## Quality gates

- The engine is proven by the probe, not read from settings. Layers are named.
- Every walkable surface has collision: ray tests on every GridMap cell, house floor and terrain
  sample.
- The controller suite passes for the project's real step and door sizes.
- No CSG in shipped scenes, no scaled collision shapes (HeightMapShape3D spacing excepted), no
  double-sided closed meshes.
- MultiMesh scenes written by windowed runs; the audit finds a buffer.
- Props at manifest size, base at y 0, simple collision, textures at 2048 or less in VRAM, LOD0
  within budget (LODs never reduce LOD0).
- Terrain3D data in `.res`, regions counted, textures to the rules in stance 9.
- Captures opened: village, kit, island close-up, Terrain3D, props lineup, stairs.

## Common mistakes

| Mistake                                                          | Symptom                              | Fix                                                        |
| ---------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| Step height from the capsule travel                              | climbs steps above the limit         | ray onto the tread                                         |
| No floor-below ray                                               | snaps down every ledge               | ray of 1.5 x step first                                    |
| Scatter run headless                                             | trees vanish after reload; no buffer | windowed run                                               |
| `update_map_data_from_image(img, -1000, 1000)`                   | 10 m becomes 19,000 m                | pixels read 0..1: use (0, 1)                               |
| `FastNoiseLite.get_image` for heights                            | terracing (8-bit)                    | float loop or an RF image                                  |
| Terrain3D before the camera                                      | "Cannot find the active camera"      | camera first or `set_camera()`                             |
| `Terrain3D.collision_mode` or `region_size` set before add_child | ignored                              | `collision.set_mode()`, `change_region_size()` in the tree |
| Region size above the terrain, origin-centered                   | 4x the memory                        | 256 or 512, or align to the region grid                    |
| One GridMap for floors and walls                                 | the wall replaces the floor          | a second GridMap                                           |
| `reparent()` in `_post_import`                                   | children jump to the origin          | `reparent(n, false)`                                       |
| Suffixed names colliding after stripping                         | `@StaticBody3D@19793`                | unique base names                                          |
| Trusting LODs for a 1M-triangle GLB                              | 986k triangles at 30 m               | decimate before import                                     |
| Coplanar water and ground                                        | flicker on Compatibility             | near 0.25, or offset the water                             |

## Handoffs

- scenario-godot-expert: toolkit, review loop, version traps.
- scenario-godot-rendering-lighting: lightmaps, occluders, GI, fog (depth fog can hide streaming
  edges [added]), shadows.
- scenario-godot-shaders: terrain splat or triplanar shaders, water.
- scenario-godot-animation: rigged characters and imported animation.
- scenario-godot-gameplay: navigation baking, AI, interaction.
- scenario-godot-pipeline-automation: batch import, CI, plugins beyond `post_import_prop.gd`.
- scenario-godot-performance-export: platform budgets, web and mobile exports, merged far-cell
  proxies (HLOD) [added].
- blender skills: Blender markers replaced on import (Allard 00:04:38), linked data refreshed only
  when the dependent file is saved (00:27:49), the "glTF Settings" node group for AO (FinePointCGI
  PIpCl6TYnC0 00:03:23).
- scenario-3d: generating the GLBs. Write "Scenario MCP" in customer-facing text.

## Godot 4.7 notes

- Jolt is the default in new 4.6+ projects; hand-written project.godot needs
  `physics/3d/physics_engine="Jolt Physics"`.
- Scene .import keys observed: `meshes/lightmap_texel_size` 0.2, `gltf/naming_version=2`, per-node
  physics in `_subresources`. A minimal pre-written .import is honored.
- Headless `--import` leaves extracted glTF textures lossless; the retune pass sets VRAM.
- `SurfaceTool.set_smooth_group(-1)` gives flat normals.
- No `LightmapGI.bake` or `OccluderInstance3D.bake` in the script API.
- Terrain3D 1.0.2 loads in 4.7.2; the first `--import` crashed (signal 11), the second ran clean.

## References

- [`references/procedures.md`](references/procedures.md): P1 to P10 with code, live results and
  numbers.
- [`references/expert-notes.md`](references/expert-notes.md): what each expert says, with
  timestamps, and where 4.7.2 disagrees.
- [`references/critique.md`](references/critique.md): what the baselines and graded answers got
  wrong, and the limits of this skill.
- [`references/gui-paths.md`](references/gui-paths.md): editor paths for viewport-only work, with
  the code substitute for each.
- [`references/sources.md`](references/sources.md): videos, docs, add-ons, versions.
