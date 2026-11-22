---
name: scenario-blender-export
description: "Use when exporting a model, character or animation from Blender to a game engine, the web or a 3D printer: FBX, glTF/GLB, USD/USDZ or STL for Unity, Unreal Engine, Godot, Roblox, three.js or Apple AR Quick Look. Also when an export arrives at the wrong scale (100x, 0.01), rotated 90 degrees, facing backwards, with extra leaf bones, without its animation, blend shapes or textures; when an FBX loses its metallic or roughness map; when a generated model needs its real size and its pivot on the floor; when making LODs or collision meshes (UCX_, -colonly) for an engine; when converting a folder of models in batch; or when checking an exported file by re-importing it."
license: MIT
---

# Blender export (engine-ready files)

An export is done when the file has been re-imported and measured, not when the exporter returned
`FINISHED`. Gate the asset first, export with a preset, then round-trip the file. This skill builds
on `scenario-blender-expert` (execution channels, the delivery gate) and imports its scripts, so
install the two side by side. If a sibling skill named here is missing from your available skills,
load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

Toolkit: [`scripts/bx_export.py`](scripts/bx_export.py). Per-engine facts with their sources:
[`references/engines.md`](references/engines.md).

## Quick reference

| Target                   | Preset            | File                | Engine side                                |
| ------------------------ | ----------------- | ------------------- | ------------------------------------------ |
| Unity, static mesh       | `unity`           | FBX                 | import defaults                            |
| Unity, character         | `unity_skeletal`  | FBX                 | leave Bake Axis Conversion off             |
| Unreal Engine            | `unreal`          | FBX                 | Convert Scene Unit (to centimeters)        |
| Unreal Engine, character | `unreal_skeletal` | FBX                 | one root bone                              |
| Godot 4                  | `godot`           | GLB                 | import defaults; Generate LODs in the dock |
| Roblox                   | `roblox`          | FBX                 | 20,000 triangles per mesh                  |
| three.js and the web     | `web`             | GLB, meshopt, WebP  | `MeshoptDecoder`; not for Godot            |
| any glTF reader          | `gltf`            | GLB                 |                                            |
| USD pipelines            | `usd`             | USDC                |                                            |
| Apple AR Quick Look      | `usdz`            | USDZ, 2048 textures |                                            |
| 3D printing              | `print`           | STL in millimeters  | slicer reads millimeters                   |

The Unity and Godot presets were imported into Unity 6000.3 and Godot 4.7.2 and measured; `unreal`,
`unreal_skeletal` and `roblox` follow Epic's and Roblox's documentation and pass the Blender round
trip only. The measurements live in [`references/engines.md`](references/engines.md).

## Procedure

1. **Gate.** Run `bx_audit.deliverable(parts, profile)` from `scenario-blender-expert` and fix every
   error. Scale left on an object travels into the engine as the node's transform.
   - Open borders and edges shared by three or more faces have no automatic fix. On a generated
     chest, hole filling closed 4 of 24 borders and added a back-to-back face.
   - Rebuild the surface with `scenario-blender-retopology`, bake the original's maps onto it, then
     gate again.
   - Without a rebuild, report the file as blocked for that profile (`roblox` requires watertight
     meshes). Never deliver it as ready.
2. **Size and pivot.** A generated mesh arrives at an arbitrary size with its origin at its center,
   so it sinks into the floor. `bxe.ground(parts, width=0.9)` (or `height=`, in meters) bakes the
   transforms, puts the center of the base at the origin and scales to the real size. Ask for the
   size when the brief does not give it; unattended, pick a plausible one and state it as an
   assumption. Static meshes only.
3. **Pick the preset** from the table. Pass every object the file needs: a skinned mesh AND its
   armature, LOD meshes and their group, collision meshes beside their render mesh.
4. **Export:** `bxe.export(path, preset, objects, **overrides)`. Any exporter keyword overrides the
   preset, such as `bake_anim=True` on `roblox` for an animated file. The result records the
   settings used.
   - Before Blender 5.2 the glTF exporter has no meshopt. `web` then writes an uncompressed GLB,
     which loads without `MeshoptDecoder`, and lists the option in `skipped_settings`. Report it to
     the user. Any other setting the exporter lacks raises.
5. **Round-trip:** `bxe.round_trip(path, objects, preset=...)` re-imports the file in a background
   Blender, leaving the open scene alone. It compares size (1 mm), triangles, deforming bones, root
   bones (one expected), armature scale, shape keys, every action stored for the objects, and the
   image maps on each material (base color, metallic, roughness, normal, emission). Then it lists
   every difference. Fix each one, or say why it is expected.
6. **glTF contents:** `bxe.glb_summary(path)` lists `extensions_required`, morph targets, skins,
   clips and image types without Blender. A loader refuses a file that requires an extension it
   lacks.
7. **Engine check:** import into the engine and look. For Godot, the
   [headless check](references/engines.md#headless-check) prints each node's rotation and scale,
   each mesh's size and floor height, and the maps each material received. Full flows:
   `scenario-unity-pipeline-automation`, `scenario-unreal-pipeline-automation`,
   `scenario-godot-pipeline-automation`.

## Scale, axes and units

- Blender works in meters, Z-up, with the asset's front facing -Y. glTF is meters, Y-up
  (`export_yup`). FBX stores its axes as metadata; the presets write -Z forward, Y up.
- Keep `scene.unit_settings.scale_length` at 1.0. Any other value rescales every export.
- Apply object scale before export: `obj.data.transform(Matrix.Diagonal(obj.scale).to_4x4())`, then
  `obj.scale = (1, 1, 1)`, so the engine node imports at scale 1. `bxe.ground()` does it for every
  mesh at once.
- Engines read 1 unit as 1 meter and place an object by its origin. A prop's origin belongs at the
  center of its base, so it stands on the floor where it is placed (step 2).
- FBX scale: `unity` writes `FBX_SCALE_ALL` (Unity reads file scale 1). `unreal` keeps
  `FBX_SCALE_NONE` (Unity reads it as file scale 0.01, a centimeter file). `roblox` uses
  `FBX_SCALE_UNITS`, as Roblox's export requirements ask.
- STL has no unit and slicers read millimeters, so `print` multiplies by 1000.

## Characters

- Export the armature with its meshes. `use_armature_deform_only` leaves control bones out, so keep
  every deforming bone in one hierarchy under one root bone. Unreal's importer reports "Found
  multiple roots. The importer only supports one root per mesh."
- `add_leaf_bones` is off in every preset. Left on, each chain gains an extra end bone that breaks
  retargeting.
- `unity_skeletal` and `unreal_skeletal` bake every action (`bake_anim_use_all_actions`), one clip
  per action. Unity names each clip `Armature|Action` (measured: `Rig|Wave`), so name actions as the
  clips should read. glTF exports each action as an animation under its own name.
- `roblox` exports no animation. For an animated file, pass `bake_anim=True` to `export()` and to
  `round_trip()`, which then compares the actions too.
- Shape keys travel in FBX (blend shapes), glTF (morph targets, names in `extras.targetNames`) and
  USD. Building ARKit or viseme sets is `scenario-blender-rigging`'s work.
- Roblox: at most 4 influences per vertex, bones frozen (scale 1, rotation 0), root at the origin
  with no influences, one animation track per mesh. Check influences with
  `max(len(v.groups) for v in obj.data.vertices)`.

## LODs and collision

- `bxe.lods(obj, ratios=(0.5, 0.25))` renames the mesh `Name_LOD0` and adds decimated `Name_LOD1..n`
  under an empty called `Name`, which takes the mesh's place under its parent. Static meshes only:
  it refuses a skinned mesh. Unity builds the LOD Group from those names. Godot generates LODs at
  import (Generate LODs). Unreal documents "Import LODs", all LODs sharing one pivot. The group
  exports as a plain FBX Null, and Unreal's import of it is unmeasured. It welds the vertices a glTF
  import splits at UV seams before decimating; without the weld, the LODs open into cracks.
- `bxe.collision(obj, engine, shape, max_verts=64)` adds a collision mesh named for the importer:
  - Unreal: `UCX_Name_00` (convex hull) or `UBX_Name_00` (box), exported in the same FBX. Unreal
    skips Auto Generate Collision when the file carries one.
  - Godot: `Name-convcolonly` for `convex` (one hull) and `box` (the bounds, a box collider), or
    `Name-colonly` for `mesh` (the mesh as a trimesh, static bodies only).
  - Unity and Roblox: returns None. Colliders are set in the editor.
  - A convex hull keeps at most `max_verts` vertices, spread over the shape. A generated mesh's full
    hull runs to thousands of faces. 64 is this toolkit's budget, not an engine limit. `None` keeps
    every vertex, and a dense full hull can come out with open edges.
- Decimation can wreck UV seams and silhouettes. Review every LOD with `bx_review` before export.

## Batch conversion

```bash
blender -b --factory-startup --python-exit-code 1 -P bx_export.py -- \
        --batch /abs/in /abs/out --preset godot --profile game
```

For every model in the folder (GLB, glTF, FBX, OBJ, USD, STL, PLY): import into an empty scene, run
the delivery gate, export with the preset, re-import and compare. It writes `/abs/out/report.json`
with each file's gate errors, size, skipped settings and round-trip differences. One failing file
never stops the folder: it gets a `failed` entry. Two inputs sharing a name keep their format in the
output name (`hero_fbx.glb`, `hero_glb.glb`). Open the report before calling the batch done.

## Worked example: a generated GLB to Unity and Godot

```python
import sys
sys.path.append("/abs/skills/scenario-blender-expert/scripts")
sys.path.append("/abs/skills/scenario-blender-export/scripts")
import bpy, bx_audit, bx_export as bxe

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="/abs/in/robot.glb")
parts = [o.name for o in bpy.context.scene.objects if o.type == "MESH"]
gate = bx_audit.deliverable(parts, profile="game")
print(gate["errors"])            # fix each one, then gate again until "pass" is True
bxe.ground(parts, height=1.2)    # the robot's real height in meters, base center at the origin

bxe.export("/abs/out/robot.fbx", "unity", parts)
print(bxe.round_trip("/abs/out/robot.fbx", parts, preset="unity")["diffs"])
# ["Robot: material Body lost its Metallic, Roughness maps"]: write them for the engine
print(bxe.extra_maps(parts, "/abs/out", "unity")["written"])
bxe.export("/abs/out/robot.glb", "godot", parts)
print(bxe.glb_summary("/abs/out/robot.glb")["extensions_required"])            # []
```

A generated GLB often holds one object per part, all sharing the asset's pivot. Keep them as
separate objects when the engine should animate or swap parts. Join them (`bpy.ops.object.join` with
the parts selected) for a single static prop, then gate again.

## Common mistakes

- Calling an export done on `FINISHED`. The exporter succeeds on files the engine imports at 100x
  scale or without the skin.
- Exporting a skinned mesh without its armature, or the armature without its mesh.
- Setting Bake Axis Conversion or Apply Transform to remove the armature node's rotation: neither
  removes it, and the first turns the character around.
- The `web` preset for Godot, or any compressed GLB for a loader without its decoder. Check
  `extensions_required` first.
- FBX textures left as external paths: the presets copy and embed them (`path_mode="COPY"`,
  `embed_textures=True`), so the file travels alone. `export()` gives packed images without an
  extension (as a GLB import leaves them) a `.jpg` or `.png` name first. An image never saved (a new
  bake target) or edited since travels as a packed copy of its pixels (`packed_unsaved_images`).
- A textured FBX that shows untextured in Unity: the default import keeps embedded textures inside
  the file. Extract Textures (Materials tab) into the model's folder assigns them.
- Trusting an FBX made from a glTF import for metal and roughness. The glTF importer routes one
  packed image through Separate Color, and the FBX exporter drops both maps: the file re-imports
  with Metallic 0 and Roughness 0.5. Base color, normal and emission travel. `round_trip()` reports
  the loss. `bxe.extra_maps(parts, out_dir, engine)` writes the two maps as files to assign:
  - Unity: `<material>_MetallicSmoothness.png` in the Metallic Map slot (Standard or URP Lit),
    Smoothness Source on Metallic Alpha, sRGB unchecked. Unity's FBX import assigned only the base
    color, even from a file carrying both maps (measured).
  - Roblox and Unreal: `<material>_Metallic.png` and `<material>_Roughness.png`, 8-bit grayscale. On
    Roblox, set them as MetalnessMap and RoughnessMap of a SurfaceAppearance. In Unreal, uncheck
    sRGB on both.
  - Godot: deliver the `godot` GLB, which keeps every map.
- An STL at Blender scale: a 10 cm part prints at 0.1 mm.
- LODs exported without a look: decimation can collapse thin parts.
