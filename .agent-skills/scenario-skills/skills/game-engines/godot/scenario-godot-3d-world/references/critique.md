# scenario-godot-3d-world critique

## What the G2 and G9 baselines got wrong or left out

The baselines were written without the skill; see `tests/baseline/`.

- **G2 (level from a brief).**
  - It used Terrain3D without checking its API. In 1.0.2 the import call is
    `data.import_images([height, control, color], position, offset, scale)`, and the collision mode
    has to be set on `terrain.collision` after the node enters the tree.
  - It wrote a controller with no stairs handling. A stock capsule (r 0.35) is blocked by a 0.18 m
    step.
  - It did not check that Jolt was running. A hand-written project.godot runs Godot Physics.
  - It had no measured gates.
  - It was right that LightmapGI and OccluderInstance3D have no bake method in the script API.
- **G9 (AI asset import).**
  - Right: minimal `.import` files and extracted textures.
  - Missed: textures stay lossless after a headless `--import`; AI GLBs arrive unit-boxed with a
    centered pivot, double-sided and 4K; LODs never reduce LOD0.
  - Missing entirely: the post-import traps (owner, global transform, reparent), the suffix
    behavior, the `_subresources` physics format.

## What the round-1 skill got wrong (blind grading, G2 and G9)

The G2 answer written with the skill scored 13 against 14 without it (`tests/grading/G2_grade.md`,
`refactor_godot-3d-world.md`).

- "One scene up to about 512 m" came from the skill's Establish-first table and had no source.
  Removed: stream by measured budget, and single precision holds at 1 km (0.12 mm step).
- The Terrain3D snippet set `region_size` before `add_child`, which 1.0.2 ignores; it only looked
  right because 256 is the default. Now `change_region_size()`, with the region-memory table in P6.
- Kit measurements (49 airborne frames, 30 ms CSG moves, the 8.33 ms frame cap) were quoted as facts
  about the reader's machine. Stance 10 now asks to label them.
- Most steps were helper calls that a reader without the kit cannot run. Stance 10 asks for the
  GDScript.
- Expert items the skill did not carry: Terrain3D texture rules, `.res` storage, paint order, near
  plane for water, MeshLibrary and navmesh rules, axis convention, Blender export prep,
  Compatibility for web and mobile, double precision. All are now in SKILL.md or the references,
  with sources.

## Limits of this skill (honest list)

- **Stairs.** Descents are smooth up to about a 0.25 m rise at 6 m/s. At a 0.45 m rise with a 0.35 m
  tread, the body flies down the flight (49 airborne frames). The module does not smooth the camera;
  Majikayo's Y-lag smoothing is not built.
- **Door rule.** `validate_layout` asks for a 1.0 m door for a 0.35 m capsule. That is a comfort
  margin [added]: 0.72 m physically passes.
- **Budgets.** The triangle budgets in `DEFAULT_BUDGETS` are my starting points [added], not an
  expert's numbers. Set them per project.
- **CSG versus baked loads.** "Faster loads after baking" (docs) was not shown on a 5-house scene
  (n=1). Do not quote a speed-up.
- **Moving-CSG cost.** Measured on an Apple Silicon CPU with one moving operand. It scales with
  operand complexity, and other machines will differ.
- **LOD numbers.** They depend on the resolution and `mesh_lod_threshold`. Re-measure at the target
  resolution with `lod_probe`.
- **Terrain3D.** Tested from code only: import, heights, collision, save and a capture. Not tested:
  painting, texture assets, the instancer, navigation, the editor plugin UI.
- **Streaming.** Threaded loading was tested with simple cells (1.5 MB for 36 cells). Real cells
  with textures and scripts will have larger hitches; measure them windowed.
- **GLB ingest.** Tested on three Scenario-delivered GLBs only (Tripo, Meshy, Hitem3D). Other
  generators and Blender exports with suffixes were tested through the suffix probe, not through the
  manifest pipeline.
- **Visual review.** The captures were checked by eye at 1280x720: the props' facing, grounding and
  scale against a 1.8 m reference. No pixel metric was used for facing.
- **Blender.** Markers, node groups and `.blend` import are not covered; the blender skills own that
  side.
- **Navmesh cell size.** The docs rule (match the map cell size) did not reproduce with hand-built
  quads; baked GridMap navmeshes were not tested.
- **Z-fighting.** Measured on flat unshaded planes in a SubViewport; the Compatibility numbers were
  not monotonic in separation. Check the real water with a capture.
- **Streaming size.** No threshold is given for when to stream; the HLOD proxy and depth-fog ideas
  in the handoffs are [added], not measured.

## Why the stance is ordered this way

The first three rules cover what breaks a level within minutes of play: a slow walk when looking
down, being stuck on stairs, and snapping off ledges. Rules 4 to 6 cover what breaks the pipeline
later: CSG that cannot ship, heavy collision on props, and post-import scripts that silently drop
nodes. Rules 7 and 8 cover the camera and the AI assets, which every G2 or G9 brief brings.
