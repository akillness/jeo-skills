# scenario-godot-3d-world expert notes

Each note gives what the expert says (video ID and timestamp), then the 4.7.2 result when this skill
tested it ("measured"). Sources are listed in `sources.md`. My own additions are marked [added].

## Characters and cameras

- **GDQuest, smooth 3D controller (JlgZtOFMdfc).**
  - Camera-relative input: forward = camera `basis.z` times input y, right = `basis.x` times input
    x. Zero Y before normalizing (00:22:00).
  - `move_toward` for acceleration, gravity on a separate vertical component, `lerp_angle` to turn
    the skin. The skin's front is +Z (`Vector3.BACK` and `signed_angle_to`).
  - Mouse deltas use `screen_relative`, are stored in `_unhandled_input` and consumed in physics.
  - Measured: 6.00 m/s at -15 and at -60 degrees of pitch. Without zeroing Y, the speed depends on
    pitch.
- **Majikayo, stairs (Tb-R3l0SQdc).**
  - CharacterBody3D has no stair support (00:00:00). The SeparationRayShape3D hack is jerky, flings
    you off descents and ignores `floor_max_angle` (00:00:45).
  - Snap down right after `move_and_slide`, guarded by a floor-below ray of 0.75 for a 0.5 step
    (00:02:22, 00:14:58).
  - Snap up with `body_test_motion` forward plus headroom, then down. Accept static colliders only.
    Take the normal from a second ray because the capsule hits the leading edge (00:17:01-00:22:19).
  - Hide the jitter with camera smoothing on Y, never in physics (00:24:08).
  - Measured: the structure works under Jolt and under Godot Physics. The step height must also come
    from the tread ray (the travel overestimates what is allowed). Smooth descent holds up to about
    0.25 m rise at 6 m/s.
- **Octodemy, third-person camera (ZCb12AHKMfE).**
  - SpringArm3D with a sphere shape to stop ground clipping (00:07:40); the player out of the arm's
    mask; a `top_level` pivot when the body rotates (00:08:35).
  - Measured: the arm stops 0.30 m before a wall (the sphere radius).
- **Juli 26, movement mechanics (U5A_JArREUc).**
  - Cap the fall speed, not the total speed (00:07:28). Do not scale a CharacterBody3D non-uniformly
    (00:06:21).
  - Raise `floor_max_angle` (80 degrees) for wall-running (00:01:38).
  - A cylinder collider keeps clean normals for slides.
  - Ships web on Compatibility because Forward+ looked wrong in the browser (00:24:02). The skill's
    default for web and mobile targets.
  - Measured: the near-plane fix for water z-fighting (Tokisan, below) matters on Compatibility, not
    on Forward+.
- **Bramwell, first 3D platformer (sVsn9NqpVhg).** Teaches a RigidBody3D player with locked rotation
  (Godot 4.1). The 4.7 practice is `_physics_process` and no delta on forces [added].
- **Majikayo, pushing RigidBodies (Uh9PSOORMmA).** Push before `move_and_slide`, along -normal,
  scaled by player mass (80) / body mass capped at 1, never faster than the player
  (00:02:40-00:11:16). Not built here.

## Blockout and kits

- **Four Games, prototyping to final (gIK02BgCCBI).**
  - CSG and primitives for graybox, real meshes from Blender later.
  - Hand-built `-colonly` collision over `-col` trimesh, and `-noimp` for reference geometry
    (00:05:37-00:06:39).
- **PiCode, should you use CSG (S5kRpEKIh38).** Static CSG costs about what modeled geometry costs;
  moving CSG is slow (00:01:51).
  - Docs: CSGMesh3D needs a manifold mesh (closed, every edge shared by two faces). Measured: an
    open PlaneMesh operand was ignored with no error (12 triangles, the untouched box).
  - Measured: 0.03 ms per move for a 7-node house, 30 ms when one operand is a 128-segment sphere.
    The cost follows the operand complexity.
- **Coding Quests, GridMap in 4.4 (sw0F2J4gNw0).** The bottom-panel GridMap editor and MeshLibrary
  from a scene. Painting is GUI work; this kit uses `set_cell_item`.
- **Docs (CSG, GridMap).**
  - A CSGCombiner3D ends the boolean chain. Baking gives lightmaps, occlusion baking and "faster
    loads".
  - MeshLibrary materials belong on the mesh surfaces. One item holds one body and one navmesh.
  - GridMap auto-UV2 for lightmaps uses a texel size of 0.1; set the texel size before converting to
    a MeshLibrary, since later changes do not apply.
  - The navmesh cell size must match the navigation map cell size or per-cell navmeshes will not
    merge.
  - Measured:
    - The bake API works in code (`bake_static_mesh`, `bake_collision_shape`).
    - The load times of a small village did not favor the baked version: 12.7 ms against 10.3 ms for
      CSG (n=1).
    - Each cell holds one item, so walls need a second GridMap.
    - Map, project and NavigationMesh cell sizes all default to 0.25. Hand-built aligned quads at
      0.1 and 0.3 still connected to each other (round 2); baked navmeshes not tested.
- **Maltbie, procedural stairs (-5L0RK-9Wd4).**
  - Front faces are clockwise and the wrong winding leaves holes; call `generate_normals`
    (00:07:00-00:13:26).
  - World-space UVs keep the texel density when stretched.
  - Measured: BoxMesh and SphereMesh both follow (c - a) x (b - a) along the normal; the stairs mesh
    has 0 disagreements.

## Terrain

- **Tokisan Games, Terrain3D tutorials 1 and 2 (oV8c9alXVwU, YtiAI2F6Xkk).**
  - Read the docs and run the console build. Textures should be seamless, square, power of two, the
    same size and channel-packed (albedo plus height, normal plus roughness), with DXT5 and mipmaps
    (00:04:33).
  - Sculpt inside one region rather than around the origin, which allocates four: 4x the memory
    (oV8c9alXVwU 00:20:22). Save storage as binary `.res`; text `.tres` loads slowly (YtiAI2F6Xkk
    00:01:30).
  - Paint the base texture on a large consistent area, then spray the overlay; never spray over
    autoshader areas (YtiAI2F6Xkk 00:05:45 to 00:07:25).
  - Raise the camera near plane to about 0.25 against water z-fighting (YtiAI2F6Xkk 00:18:00).
  - The YtiAI2F6Xkk frames show Godot 4.1.3 in the status bar (the note says 4.2).
  - Measured with 1.0.2 in 4.7.2:
    - the data API works from code, with exact heights;
    - region files are `.res`;
    - the collision mode must be set on `terrain.collision` once the node is in the tree;
    - the camera must exist first;
    - `set("region_size")` is ignored; `change_region_size()` works once regions exist (round 2);
    - the 4x warning still holds: a 1,024 m terrain centered on the origin allocates 1.05 km² at
      region size 256 or 512, and 4.19 km² at 1,024 (round 2);
    - near 0.25 against z-fighting: on Compatibility a plane 1 mm under the water showed through on
      1.66% of pixels at near 0.05 and 0% at 0.25; Forward+ showed none (round 2).
- **Four Games, Terrain3D for beginners (ejlD8cM9kk4).** Use the same compression for every terrain
  texture (00:10:06).
- **Docs (HeightMapShape3D).**
  - `update_map_data_from_image` reads the pixels as 0..1 and remaps them to [min, max].
  - Measured: with (0, 1), meters stored in an RF image come through unchanged; the collision
    matches the mesh within 0.058 m.

## Import pipeline

- **Allard, Blender to Godot pipeline, GodotCon (5fDuf2IlizU).**
  - Gameplay markers placed in Blender and replaced on import (00:04:38).
  - Set the collision layers in the import script so they cannot be forgotten (00:15:15).
  - In `_post_import`: set owners, use local transforms (the scene is not in a tree) and
    `reparent(..., false)` (00:11:14-00:13:56).
  - Linked Blender data refreshes only when the dependent file is saved again (00:27:49).
  - Measured: all three traps reproduce. Default `reparent()` zeroes the position, and
    `reparent(..., false)` keeps it.
- **Michael Jared, Blender to Godot 4.5 (3C6uyn8GhNs).** Every body and shape combination from
  suffixes. Measured: the suffix table in procedures P8; `-rigid` keeps its suffix in the node name.
- **FinePointCGI, glTF materials (PIpCl6TYnC0).**
  - AO needs a node group named exactly "glTF Settings" with an "Occlusion" input (00:03:23).
    Non-Color for data maps.
  - Blend mode and backface culling transfer (00:05:44). Blender 3.x era: the socket names changed
    in 4.0 [added].
- **Jan, AI 3D models to engine (L5emNlNYVfY, vendor, low weight).** Generate from a front view and
  remesh to 6k to 8k faces for a character before import (00:02:00). Measured on Scenario files: 15k
  to 1M triangles as delivered.
- **Docs (import configuration, node type suffixes, Jolt).**
  - Asset front is +Z and the camera looks along -Z; use `look_at(..., use_model_front = true)` and
    `Vector3.MODEL_*` (doc-import-node-types-export). Measured: `look_at(t, UP, true)` points +Z at
    the target.
  - Triangulate, apply transforms and use the rest pose before export
    (doc-import-node-types-export).
  - Extracted materials survive reimport, but renaming the source material breaks the link
    (doc-import-config). Not re-tested.
  - Mesh files are saved as `.res`.
  - Jolt returns face_index -1 unless the setting is on (+25% memory for concave shapes).
  - Measured: face_index -1 under Jolt and 8 under Godot Physics on the same ray.

## Where experts disagree, and the deciding condition

| Topic                  | Positions                                                     | Decide by                                                                         |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Collider shape         | capsule (GDQuest) vs cylinder (Juli)                          | ledge tolerance (capsule) or clean normals for wall-run and slide (cylinder)      |
| Player body            | CharacterBody3D (GDQuest, Juli) vs RigidBody3D (Bramwell)     | the player must be simulated, for example pushed by explosions: RigidBody         |
| Camera smoothing       | lerp follower (Octodemy) vs Y-only lag (Majikayo)             | third-person orbit vs stairs jitter in FPS                                        |
| Collision from Blender | `-col` trimesh (convenient) vs `-colonly` simple (Four Games) | static level geometry (trimesh is fine) vs props and dynamic bodies (simple)      |
| Terrain                | stock HeightMapShape3D (this kit) vs Terrain3D                | sculpting, painting, regions over about 1 km and foliage tools: Terrain3D [added] |
