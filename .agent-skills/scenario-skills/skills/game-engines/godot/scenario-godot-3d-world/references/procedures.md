# scenario-godot-3d-world procedures (Godot 4.7.2)

Every procedure below ran in Godot 4.7.2 on this Mac through the scenario-godot-expert toolkit
(`gd_run.run_script`, GD_MAX slots, per-project lock, 160x90 windows). The projects are Base3D
clones (Forward+, Jolt): `tests/projects/godot-3d-world/World` for exploration, `GodotPhysics` (the
same project on Godot Physics), `Probe` (import experiments), `Terrain` (Terrain3D add-on), and
`runs/<stamp>/G2` for each suite run.

The test runner is `python3 tests/code/godot-3d-world/test_world_live.py`, with 14 groups (L1 to
L14), plus `test_world_offline.py` (11 checks). Evidence goes to
`tests/live_evidence/godot-3d-world/` (`live_<stamp>.json`, `captures/`, contact sheets, logs). Last
full suite run: `live_20261002-215949.json`, 14 of 14 groups passing, with the contact sheet
`captures_20261002-215949.png`. Round 2 (after blind grading) extended L8 (soak) and L12 (region
size) and re-ran L1, L8 and L12: `live_20261002-223935.json`, 3 of 3 passing. The round-2 probes
that are not suite groups are in `tests/code/godot-3d-world/round2_probes/` and listed under P11.

Setup for any project:

```python
import sys; sys.path[:0] = ["skills/scenario-godot-expert/scripts", "skills/scenario-godot-3d-world/scripts"]
import gd_run, gd_world
gd_world.install_world(P)            # copies scripts/agentkit/world/** to res://addons/agentkit/world/
r = gd_world.compile_world(P)        # compiles every kit script (agent_audit skips agentkit)
r = gd_world._job(P, "world_player.gd:controller_suite", {...})  # r["ok"], r["result"] = AGENT_RESULT
```

`gd_world._job` adds `--fixed-fps 60` to headless runs. Physics then steps at a fixed 1/60 s without
waiting for wall-clock time. The controller suite took 34.1 s without it and 1.5 s with it, with
identical numbers. Jobs that need real time or rendering pass `headless=False` (scatter, LOD probe,
streaming, captures).

---

## P1. Project and physics gate

```python
gd_world.set_layer_names(P, {1: "world", 2: "player", 3: "props", 4: "triggers"})
g = gd_world.physics_gate(P)["result"]   # engine_setting, engine_running, probe, layers, jolt_settings, flags
```

`world_project.gd:gate` reads `physics/3d/physics_engine`, the ticks, the gravity, the layer names
and every `physics/jolt_physics_3d/*` key. It then proves which engine is running. A StaticBody3D
with a ConcavePolygonShape3D built from `BoxMesh.get_faces()` is hit by a ray from (0.1, 5, 0.2)
going down. Jolt returns `face_index` -1 unless
`physics/jolt_physics_3d/queries/enable_ray_cast_face_index` is on; Godot Physics returns the
triangle index. `PhysicsServer3D.get_class()` cannot tell the two apart.

**Live test** L1 and L2.

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- Jolt project: face_index -1, `engine_running` "Jolt Physics", 32 Jolt keys listed (for example
  `queries/enable_ray_cast_face_index=false`, `simulation/velocity_steps=10`,
  `limits/max_bodies=10240`).
- Clone switched to `"GodotPhysics3D"`: face_index 8, and the gate flags the engine.
- Without layer names the gate flags "no 3D physics layer names". After `set_layer_names` there are
  no flags.
- Checked in project.godot: `3d/physics_engine="Jolt Physics"` under `[physics]`, and
  `renderer/rendering_method="forward_plus"`.

## P2. Third-person controller with stairs

`gd_world.build_player(P)` writes `res://world/player/player.tscn`:

- Player (CharacterBody3D with `runtime/third_person_controller.gd`, layer 2, mask 1,
  floor_snap_length 0.2)
- Collision: CapsuleShape3D, r 0.35, h 1.8, centered at y 0.9
- Skin: a capsule plus a yellow marker on +Z (the model front, `Vector3.MODEL_FRONT`)
- CameraPivot (top_level at runtime) > SpringArm3D (SphereShape3D r 0.3, length 4.5, mask 1) >
  Camera3D (near 0.1)

It also writes the InputMap actions that are missing: move_left/right/forward/back on WASD and the
left stick, look_* on the right stick, jump on Space and the A button.

The controller (GDQuest movement, Majikayo stairs, Octodemy camera):

```gdscript
var dir := camera.global_basis.z * move_input.y + camera.global_basis.x * move_input.x
dir.y = 0.0                                   # BEFORE normalising (GDQuest 00:22:00)
dir = dir.normalized() * minf(move_input.length(), 1.0)
var y_vel := velocity.y
velocity.y = 0.0
velocity = velocity.move_toward(dir * move_speed, (acceleration if grounded else air_acceleration) * delta)
velocity.y = maxf(y_vel + get_gravity().y * delta, -max_fall_speed)   # cap the fall only (Juli)
var did_step_up := step_enabled and _snap_up_stairs(delta)
if not did_step_up:
    move_and_slide()
    if step_enabled: _snap_down_stairs()
```

Snap up: `body_test_motion` from `global_transform.translated(horiz + up * 2 * max_step)` down by
`2 * max_step`. Accept only a non-moving collider. Then cast a ray onto the tread, 0.05 m past the
contact point, and take **the step height from that ray**, not from the travel. Teleport there, call
`apply_floor_snap()`, and skip `move_and_slide` for that frame.

Snap down: runs right after `move_and_slide`, only when the body left the floor this frame or
snapped last frame. A floor-below ray of 1.5 x max step must hit a walkable normal; then
`body_test_motion` down by max step, and `apply_floor_snap()`. A body driven by an AI or a test sets
`use_player_input = false` and writes `move_input` and `jump_pressed` (the body and brain split,
Godotneers).

`gd_world.controller_suite(P, step_heights=[...])` builds a gym in memory and drives the player on
each lane:

- floor;
- 8-step stair lanes, tread 0.35, with end walls on the landings;
- a 1 m ledge;
- 40 and 50 degree ramps;
- a wall 2 m behind a spawn.

**Live test** L3 (Jolt) and L2 (Godot Physics), plus the exploratory runs.

- Run in Godot 4.7.2 on 2026-10-02: **pass**.

| Check                           | Jolt                                           | Godot Physics  |
| ------------------------------- | ---------------------------------------------- | -------------- |
| Flat run, 90 frames             | speed 6.000, max 6.000, floor 100%             | same           |
| Look down -60 degrees           | 6.000 m/s                                      | same           |
| Jump apex                       | 1.590 m vs 1.543 analytic                      | 1.590          |
| Module climbs                   | 0.10, 0.18, 0.25, 0.45                         | same           |
| Module refuses                  | 0.60                                           | 0.60           |
| Stock capsule (module off)      | climbs 0.10, blocked at 0.18, 0.25, 0.45       | same           |
| Descent, airborne frames of 120 | 0 / 4 / 8 / 49 at 0.10 / 0.18 / 0.25 / 0.45    | 0 / 8 / 8 / 49 |
| 1 m ledge                       | falls, 0 snaps, largest drop 0.068 m/frame     | same           |
| Ramps                           | 40 degrees climbs (y 3.94), 50 degrees refused | same           |
| Spring arm, wall 2.0 m behind   | hit length 1.700                               | 1.6875         |

Correction found live: the first version took the step height from `(from + travel).y`. The
capsule's round bottom rests on the nosing of a step that is too high, so the travel gives a partial
height under the limit. It then "climbed" 0.6 m steps with 42 snaps. Measuring the tread with the
ray fixed it.

Limit found live: at 0.45 m rise and 0.35 m tread (52 degrees), at 6 m/s, the descent is a ballistic
flight (49 airborne frames). The capsule rolls over the nosing for 3 frames, by which time it is
already past the next tread. A 1.5 x ray (Majikayo's ratio) did not change this. Keep stairs at or
under about 0.25 m rise for smooth descents, or hide the motion with camera smoothing (Majikayo
00:24:08).

## P3. CSG blockout, doors and bake

```python
probs = gd_world.validate_layout(layout)   # offline: door width >= 2r + 0.3, door height, storey, overlaps, streets
gd_world.build_village(P, layout)          # village_csg.tscn + village_baked.tscn, timings
gd_world.door_test(P, layout)              # walks the player from 3 m outside each door to inside
```

Each house is a CSGCombiner3D (`use_collision = true`):

- a CSGBox3D shell;
- a subtracted inner box (open floor);
- a subtracted door box on the chosen side;
- a CSGPolygon3D gable roof (triangle polygon, `MODE_DEPTH`).

`world_blockout.gd:bake_all` replaces each combiner with a MeshInstance3D (`bake_static_mesh()`)
that has a StaticBody3D child holding `bake_collision_shape()`. The CSG meshes exist only once the
nodes are in the tree and a frame has passed.

**Live test** L4.

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- 5 houses, 280 triangles as CSG and 280 baked; the bake took 0.23 ms.
- Doors: all 5 walkable, including the 0.8 m door that the offline rule flags (the rule's 1.0 m
  includes a comfort margin, marked [added]). A width sweep with the real capsule (r 0.35): 0.66 and
  0.70 m block, 0.72, 0.75 and 0.80 m pass.
- Loading the saved scenes: CSG 10.3 ms (8 KB file) and baked 12.7 ms (53 KB). The docs say baking
  gives "faster loads", which this small scene (n=1) does not show.
- Moving CSG (`csg_cost`, one door move per frame, frame time minus idle frame time): 0.03 ms per
  move for a box house, 0.07 ms with a 32-segment sphere cut, 30.0 ms with a 128-segment sphere cut
  (4,168 triangles).
- Capture `village.png` opened: 5 houses with red roofs, door holes visible.
- Non-manifold operand (round 2, `r2_world.gd:csg_manifold`, headless): a 2 m CSGBox3D minus a
  closed BoxMesh in a CSGMesh3D gave 28 triangles; the same minus an open PlaneMesh gave 12, the
  untouched box, with 0 errors logged. CSG (Manifold library since 4.4) needs closed meshes, and an
  open one fails silently. Count triangles after every boolean you add.

## P4. MeshLibrary and GridMap in code

The editor route is Scene > Export As > MeshLibrary. It has no script API; `world_kit.gd:build_kit`
builds the same resource:

```gdscript
lib.create_item(id); lib.set_item_name(id, "floor")
lib.set_item_mesh(id, mesh_with_material_on_the_surface)    # no MeshInstance3D to hold an override
lib.set_item_shapes(id, [shape, Transform3D(Basis(), offset)])   # flat array: shape, transform, ...
```

`build_grid` reads an ASCII plan:

- GridMap cell (4, 3, 4), `cell_center_y = false` so that floor tiles sit on y 0;
- floors and stairs on one GridMap, walls and pillars on a second GridMap that shares the library (a
  GridMap holds one item per cell);
- a ray down at every used cell.

**Live test** L5.

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- 4 items (floor, wall, pillar, stairs); 20 cells, 20 ray hits; `map_to_local((0,0,0))` = (2, 0, 2).
- Stairs item: the rise is derived from `max_rise` 0.4, giving 8 steps of 0.375 m. The player climbs
  to y 3.0 (16 snaps).
- With 6 steps (0.5 m rise) the player stays at y 0.
- Capture `dungeon.png` opened.

Docs rules for kits (doc-csg-gridmap), and what round 2 checked:

- Materials on the mesh surface slots, not on a MeshInstance3D override; one StaticBody3D and one
  NavigationRegion3D per item. `build_kit` already does this.
- GridMap auto-generates UV2 at a texel size of 0.1 (docs, not re-measured). Set Light Baking and
  the texel size in the Import dock before building the library; changing them later does not touch
  the library. The scene `.import` default is `meshes/lightmap_texel_size=0.2` (observed on the
  three ingested GLBs).
- The navmesh cell size must match the navigation map's (docs). Measured (`r2_world.gd:navcell`,
  headless): `navigation/3d/default_cell_size`, the map and a new NavigationMesh all read 0.25. Two
  adjacent 4 m regions with hand-built, vertex-aligned quads connected (a 3-point path from x 1 to
  x 7) at cell sizes 0.25, 0.1 and 0.3 alike, with no warning. So the mismatch did not break this
  simple case; baked navmeshes, whose vertices snap to the cell grid, were not tested. Keep the
  sizes equal.

## P5. Stock terrain: noise heightmap, chunked mesh, HeightMapShape3D

```python
gd_world.build_island(P, size=257, cell=1.0, chunk=64, height=32.0)   # + heights.exr
gd_world._job(P, "world_terrain.gd:collision_check")                 # 400 rays vs bilinear heights
```

- Heights: fBm `FastNoiseLite` times a radial falloff, written into a `FORMAT_RF` image in meters.
- Chunks: an ArrayMesh with central-difference normals, vertex colors by height and slope, and
  clockwise triangles (a, b, d), (b, e, d).
- Collision: one HeightMapShape3D from `update_map_data_from_image(img, 0.0, 1.0)`. Pixels are read
  as 0..1 and remapped to [min, max], even for RF images. For other spacings, scale the
  CollisionShape3D in X and Z.

**Live test** L6.

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- 257 x 257 heights in 10 ms. 16 chunks, 131,072 triangles, built in 60 ms. Collision built in 0.8
  ms. Scene file 4.6 MB.
- Collision against the bilinear heights: max error 0.058 m, mean 0.004 m, 0 misses. At 2 m spacing
  (scaled shape) the error is the same.
- `FastNoiseLite.get_image(513, 513)`: 15 ms, but `FORMAT_L8` (256 levels). A GDScript
  `get_noise_2d` loop takes 21 ms and keeps floats.
- Correction found live: `update_map_data_from_image(img, -1000, 1000)` turned 10 m into 19,000 m
  (390 of 400 rays missed).
- The first triangle's geometric normal is up (y 1.0). Capture `island.png` opened.

## P6. Terrain3D 1.0.2 from code

Install: unzip `Terrain3D_v1.0.2-stable.zip` (sha256
a071850250ec5e596aa54da61c01d75768774eb379ee997584d426a45f4884a2), keep only `addons/terrain_3d`,
then run `gd_run.import_project`. `world_terrain3d.gd` uses only ClassDB and `call`, so it also
compiles in projects without the add-on.

```gdscript
var cam := Camera3D.new(); root.add_child(cam); cam.current = true   # camera BEFORE the terrain
var t: Node3D = ClassDB.instantiate("Terrain3D")
root.add_child(t, true)
t.set("data_directory", "res://world/terrain3d/data")
t.get("data").call("import_images", [height_rf, null, null], Vector3(-256, 0, -256), 0.0, 1.0)
t.call("change_region_size", 512)   # only if not 256; set("region_size") is ignored, see below
t.get("collision").call("set_mode", ClassDB.class_get_integer_constant("Terrain3DCollision", "FULL_GAME"))
var h: float = t.get("data").call("get_height", Vector3(x, 0, z))
t.get("data").call("save_directory", "res://world/terrain3d/data")
```

The API names come from the add-on's own `demo/src/CodeGenerated.gd` and the probe job.

**Live test** L12.

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- `version` reads "1.0.2". All 9 classes are present. Data methods include `import_images`,
  `get_height`, `save_directory`, `export_image`, `get_normal`.
- 512 x 512 import in 5.1 ms. `get_height` matched the image exactly (max error 0.0 over 200
  points).
- `save_directory` wrote 4 region files (768 KB) in 8.6 ms.
- Collision: `FULL_GAME` hits at the origin (19.351 m, image 19.351 m). `DYNAMIC_GAME` misses there,
  because the camera is about 450 m away.
- Corrections found live: setting `Terrain3D.collision_mode` before `add_child` left the mode at
  DYNAMIC_GAME; `terrain.collision.set_mode()` once in the tree works. Adding the terrain before any
  camera logs "Cannot find the active camera ... Stopping _physics_process()".
- The first `--import` of the project crashed (signal 11, after "loading_editor_layout"); the second
  was clean.
- Capture `terrain3d.png` opened (gray auto-shader, no texture assets).
- Round 2, region size and layout (`r2_terrain3d.gd:regions` and `api`, then L12
  `region_size_512_applied`, headless):
  - `t.set("region_size", 1024)` reads back 256, before and after `add_child` (the round-1 code set
    256, the default, so it looked fine). `change_region_size(n)` works once regions exist; on an
    empty terrain it did nothing.
  - Allowed sizes: 64, 128, 256, 512, 1024, 2048.
  - Region count and allocated area for a wavy RF image, `import_images` then `change_region_size`:

| Terrain, placement            | Region size | Regions | Allocated     |
| ----------------------------- | ----------- | ------- | ------------- |
| 512 m, centered on the origin | 256         | 4       | 0.26 km²      |
| 512 m, centered               | 512         | 4       | 1.05 km² (4x) |
| 512 m, corner at the origin   | 512         | 1       | 0.26 km²      |
| 1,024 m, centered             | 256         | 16      | 1.05 km²      |
| 1,024 m, centered             | 512         | 4       | 1.05 km²      |
| 1,024 m, centered             | 1,024       | 4       | 4.19 km² (4x) |
| 1,024 m, corner at the origin | 1,024       | 1       | 1.05 km²      |

- This is Tokisan's 0.9-era warning (oV8c9alXVwU 00:20:22, "4 regions = 4x memory"), still true in
  1.0.2: memory follows allocated area, so a region larger than half the terrain must be aligned to
  the region grid. 16 regions of 256 for a 1 km island waste nothing.
- Every saved region file is `.res` (binary), as Tokisan asks (YtiAI2F6Xkk 00:01:30). Disk size
  follows content: about 3.8 MB for a wavy 1,024 m terrain, 93 KB when flat.
- Painting and textures (sources, not run here): texture rules in stance 9 of SKILL.md; base paint
  on a large consistent area, then spray, never spray over autoshader areas (YtiAI2F6Xkk 00:05:45 to
  00:07:25).
- Not run: texture assets, painting, the instancer, navigation baking.

## P7. MultiMesh scatter

```python
gd_world.scatter(P, scene="res://world/terrain/island.tscn", candidates=6000, max_slope_deg=30,
                 min_height=1.5, max_height=14, clearance=2.0, tile=60, visibility_end=150)
```

The job:

- casts a ray down per candidate;
- rejects by normal, height and a clearance hash grid;
- writes one MultiMeshInstance3D per 60 m tile, with the transforms local to the tile
  (`visibility_range_end` 150, fade self);
- checks every instance base against a fresh ray.

**Live test** L7.

- Run in Godot 4.7.2 on 2026-10-02: **pass** (windowed).
- 6,000 rays placed 1,931 trees in 11.7 ms. Rejected: 2,413 low, 1,200 crowded, 389 slope, 67 high,
  0 miss. 16 tiles; 71 triangles per tree, 137,101 in total.
- Grounding error windowed: 0.0000004 m. 16 `buffer = PackedFloat32Array` entries in the saved file.
- Headless (forced with `allow_headless`): every transform reads back as identity (error 10.5 m),
  and the saved .tscn has `instance_count` but no buffer. The dummy renderer stores no MultiMesh
  data. The job now refuses to run headless.
- Captures opened: `island_close.png` (trees on the ground) and `island.png` (the default camera at
  260 m, outside the 150 m range, so no trees, as intended).

## P8. AI-generated GLB (and Blender GLB) import pipeline

Offline first: `gd_world.glb_stats(path)` and `glb_flags(stats, budget)` read the GLB JSON and
binary chunks: triangles, scene-space AABB, images with their pixel sizes, materials, doubleSided,
metallic.

```python
manifest = {"defaults": {"collision": "box", "layer": 3, "mask": 0, "single_sided": True},
            "props": {"robot": {"category": "character", "height_m": 1.8, "collision": "box"},
                      "lighthouse": {"category": "building", "height_m": 12.0, "collision": "convex"}}}
rep = gd_world.ingest_glbs(P, "drop/", manifest)   # clone copy, pre-written .import, --import, texture retune, --import
gd_world.audit_props(P, scenes) ; gd_world.lod_probe(P, "res://props/building/lighthouse.glb")
```

The pre-written `.import` sets:

- `nodes/root_type="Node3D"`, `meshes/generate_lods=true`, `meshes/create_shadow_meshes=true`,
  `meshes/light_baking=1`;
- `gltf/embedded_image_handling=1` (extract);
- `import_script/path` pointing to `post_import_prop.gd`.

Godot keeps these and fills in the rest.

`post_import_prop.gd` (`EditorScenePostImport`) reads the manifest and:

- merges the AABB from local transforms;
- scales to `height_m` or `longest_m`;
- applies the yaw;
- puts the pivot at the base center by moving the children under a "Visual" Node3D (owner unset
  before the move, set after);
- adds a StaticBody3D with a box, convex or trimesh shape and the layer and mask;
- sets cull back on single-sided materials;
- names the root `prop_<name>`;
- stores the `prop` meta.

**Live test** L11.

- Run in Godot 4.7.2 on 2026-10-02: **pass**, in the exploratory run (World project,
  `ingest_report_World_20261002-2142.json`) and in the suite (`live_20261002-215949.json`).
- Two suite runs in between failed while the disk was full machine-wide (ENOSPC on the GLB copy, and
  "rename_error" while extracting meshy_hero textures). They passed once space was back. The test
  now clones the GLBs with `cp -c`, which uses no extra space.
- Inputs: Tripo P2 robot 53,076 tris; Meshy T2 hero 15,092; Hitem3D lighthouse 986,642, no material.
  All are unit-boxed with a centered pivot.
- Import: 26.3 s for the scenes (22.1 s in the suite run), then 1.7 s (1.5 s) to retune 6 textures.
- Per 4K map: 19.6 MB lossless to 2.8 MB `s3tc.ctex` at 2048 (the normal map 5.6 MB). The old
  lossless `.ctex` stays in `.godot/imported`.
- Audit: heights 1.80 / 1.75 / 12.00 m; base y 0.000; cull back (was disabled); robot and lighthouse
  over budget (40k character, 60k building); no scaled shapes.
- LOD probe at 1920x1080 in a SubViewport, primitives drawn (threshold 1.0, then 0.0):
  - lighthouse: 986,642 at 3 to 30 m, 246,552 at 100 m, 61,616 at 300 m; always 986,642 with LODs
    off;
  - Meshy hero: 15,092 at 3 m, 7,546 at 10 m, 3,773 at 30 m, 1,886 at 100 m;
  - robot: 53,076 at 3 to 10 m, then 26,124 (only one LOD level).
  - At 160x90 the robot drew 26,124 even at 5 m: LOD selection is screen-space.
- Captures opened: `chars.png`. Robot and hero face the camera (+Z), stand on the ground, are
  textured, and are as tall as the 1.8 m reference. `props.png` shows the lighthouse untextured
  (white), as the flags said.
- Facing (round 2, `r2_world.gd:model_front`, headless): `Vector3.MODEL_FRONT` is (0, 0, 1) and
  `Vector3.FORWARD` (0, 0, -1). For a target at (0, 0, -5), `look_at(target, Vector3.UP)` points -Z
  at it, and `look_at(target, Vector3.UP, true)` points +Z at it. Use the `true` form for props and
  characters exported front +Z (glTF convention, docs).
- Blender side (docs, doc-import-node-types-export): triangulate (modifier plus Apply Modifiers),
  apply transforms, and export rigs in rest pose; Godot's own n-gon triangulation can be wrong. Not
  run here (blender skills).

Earlier import facts, measured in `Probe` on 2026-10-02:

- **Name suffixes.** The separators `-`, `_` and `$` all work, and case does not matter. A GLB made
  with `GLTFDocument.append_from_scene` gave:
  - `-col`: StaticBody3D child with ConcavePolygonShape3D
  - `-convcol`: convex
  - `-colonly`: concave, mesh removed
  - `-convcolonly`: convex, mesh removed
  - `-noimp`: removed
  - `-navmesh`: NavigationRegion3D
  - `-occ` and `-occonly`: one OccluderInstance3D merged at the root
  - `-rigid`: RigidBody3D that keeps "-rigid" in its name
  - Stripping can collide with a sibling's name ("Crate$colonly" next to "Crate-col" gave
    `@StaticBody3D@19793`).
- **Advanced Import Settings physics in `_subresources`.**
  `{"nodes": {"PATH:Plain": {"generate/physics": true, "physics/body_type": 0|1|2, "physics/shape_type": 3}}}`
  gave:
  - Static: a StaticBody3D child of the MeshInstance3D;
  - Rigid: a RigidBody3D parent with mesh and shape siblings;
  - Area: an Area3D that replaced the node and dropped the visual mesh.
- **Re-import and timing.**
  - Editing `[params]` and running `--import` re-imports.
  - The Tripo GLB imported in 12.3 s with 3 extracted 4K textures. They stayed lossless
    (`compress/mode=0`, `vram_texture` false): 19.6 / 14.4 / 4.9 MB `.ctex`.

## P9. Cell streaming with hysteresis

`runtime/cell_streamer.gd`:

- requests the cells within `load_radius` of the target with `ResourceLoader.load_threaded_request`;
- polls `load_threaded_get_status`;
- instantiates at most 1 per frame;
- frees cells beyond `unload_radius`.

`world_stream.gd:make_cells` writes 6 x 6 cells of 64 m (a 64 x 64 plane, a box body, 200 box props,
1.5 MB in total). `walk` crosses the grid diagonally at 20 m/s, then paces 2 m across a cell border
for 240 frames.

**Live test** L8.

- Run in Godot 4.7.2 on 2026-10-02: **pass** (windowed, real time).
- Load radius 1, unload radius 2: 24 requests on the walk, at most 14 cells loaded, 0 requests and 0
  unloads while pacing.
- Unload radius 1 (no hysteresis): 69 loads and 69 unloads in the same 240 frames.
- Worst frame while streaming: about 25 ms windowed (instantiating a 200-prop cell).
- Soak end (round 2, L8 `soak_nodes_back_to_baseline`): after the pacing, the target jumps 100 cells
  away. All cells unload (0 left) and `Performance.OBJECT_NODE_COUNT` returns to the baseline plus
  the streamer and the target (4 against 2 + 2). A leak shows as extra nodes here.
- Headless real-time runs logged "Attempting to initialize the wrong RID" and "unimplemented base
  type encountered in renderer scene cull" in 2 of 5 runs; the windowed runs were clean in 4 of 4.
  Under `--fixed-fps` the threaded loads land after the target has moved on, so streaming is tested
  at real time.

## P10. Procedural meshes, traps, audit, profile

**Winding** (`world_mesh.gd:winding`). For every triangle (a, b, c) of Godot's BoxMesh, (c -
a).cross(b - a) points along the stored normal (12 of 12). The same holds for SphereMesh (4,096 of
4,224; the other 128 are degenerate pole triangles). Front faces are clockwise.

**Stairs mesh** (`world_mesh.gd:stairs`, after Maltbie -5L0RK-9Wd4). Quads go into a SurfaceTool
with `set_smooth_group(-1)`, then `index()`, `generate_normals()` and `generate_tangents()`;
collision comes from `create_trimesh_shape()`.

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- 82 triangles, 184 vertices, 0 winding disagreements, tangents present, built in 0.7 ms; the player
  climbs to y 2.00 (10 steps of 0.2 m).
- Capture `stairs.png` opened: every face lit, none missing.

**Post-import traps** (`world_import.gd:traps`).

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- A node without an owner is not packed.
- `global_transform` outside the tree logs `Condition "!is_inside_tree()"` and returns identity (the
  local chain was (6, 0, 0)).
- `reparent(a)` outside the tree logs the same error and leaves the node at (0, 0, 0).
- `reparent(a, false)` keeps (0, 2, 0) with no error.
- `remove_child` + `add_child` keeps the owner but warns "will make owner inconsistent", unless the
  owner is unset first.

**Level audit** (`gd_world.audit_level`).

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- Flags 25 CSG nodes in the CSG village and none in the baked village.
- Flags the headless scatter ("saved without a buffer") and passes the windowed one.
- Flags the scaled HeightMapShape3D on the 2 m island (the known exception).

**Profile** (`gd_run.profile_scene`, windowed, 1920x1080 SubViewport, Vulkan).

- Run in Godot 4.7.2 on 2026-10-02: **pass**.
- Island from its far camera: GPU max 3.66 ms, 18 draw calls.
- Baked village: GPU max 1.22 ms, 39 draw calls.
- Frame time is capped at the display refresh (8.33 ms) on macOS.

## P11. Round-2 probes: precision, water z-fighting

Scripts: `tests/code/godot-3d-world/round2_probes/r2_world.gd` (copied to `World/probe_r2/r2.gd` and
run there) and `r2_terrain3d.gd` (in `Terrain/probe_r2/`). Run with
`gd_run.run_script(P, "res://probe_r2/r2.gd:<method>", out_dir=<scratch>)`, on 2026-10-02.

**Single precision** (`precision`, headless). `OS.has_feature("double")` is false. The smallest step
that changes `Vector3.x`:

| Distance from origin | Step     |
| -------------------- | -------- |
| 256 m                | 0.031 mm |
| 1,024 m              | 0.12 mm  |
| 4,096 m              | 0.49 mm  |
| 8,192 m              | 0.98 mm  |
| 16,384 m             | 1.95 mm  |

A 1 km island needs no double-precision build. Size alone is not a reason to stream either: stream
when the profiled worst view or the load time misses budget.

**Water plane z-fighting** (`zfight`, windowed, 640x360 SubViewport). Two unshaded 4 km planes, blue
water at y 0 and green ground below it, camera far 4,000. Percentage of below-horizon pixels where
the ground shows through the water:

| Ground below water | Camera    | Near            | Forward+ | Compatibility |
| ------------------ | --------- | --------------- | -------- | ------------- |
| 0 (coplanar)       | 2 m high  | 0.05 to 0.25    | 100%     | 100%          |
| 20 mm, 5 mm, 1 mm  | 2 m high  | 0.05, 0.1, 0.25 | 0%       | 0%            |
| 1 mm               | 30 m high | 0.05            | 0%       | 1.66%         |
| 1 mm               | 30 m high | 0.25            | 0%       | 0%            |
| 0.05 mm            | 30 m high | 0.05            | 0%       | 99.99%        |
| 0.05 mm            | 30 m high | 0.25            | 0%       | 0%            |

Tokisan's fix (raise near to about 0.25 on the editor and game cameras, YtiAI2F6Xkk 00:18:00, Godot
4.1 era) still works on Compatibility, the web and mobile renderer. Forward+ showed no z-fighting at
any near plane down to 0.05 mm. The 0.2 mm row at 30 m on Compatibility read 0% at both near planes,
so the effect is not monotonic in this test: check the real scene with a capture.

## Not yet run

- The Blender-side pipeline (Allard markers, the "glTF Settings" AO node group, `.blend` direct
  import): Blender work belongs to the blender skills.
- Navigation mesh baking on these levels (scenario-godot-gameplay).
- Lightmap baking for the kit and the village: handed to scenario-godot-rendering-lighting, which
  bakes through an editor job.
- Raycast vehicle (Octodemy 9MqmFSn1Rlw) and pushing RigidBodies (Majikayo Uh9PSOORMmA): in the
  notes, not built.
- Camera smoothing for stairs (Majikayo 00:24:08): not built. The camera follows the pivot directly.
- Web and mobile runs of these scenes.
