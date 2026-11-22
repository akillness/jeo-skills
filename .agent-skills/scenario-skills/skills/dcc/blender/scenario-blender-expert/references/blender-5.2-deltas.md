# Blender version deltas: what makes 2.8x to 4.x tutorials misleading in 5.2.1 LTS

Reference for condensing expert Blender tutorials (recorded on 2.80 to 4.2) into agent skills that
drive **Blender 5.2.1 LTS** headless through `bpy`. Organized by domain. Each point reads "old
tutorial says X -> in 5.2 do Y (bpy: ...)".

## Legend and provenance

- **[verified in 5.2.1]**: checked empirically on 2026-09-24 in `/opt/homebrew/bin/blender` =
  Blender 5.2.1 LTS (build 2026-08-25), Python 3.13.13, run as
  `blender --background --factory-startup --python ...`. Probe scripts:
  `archive/tests/version-deltas/probe1.py` to `probe9b.py`, `probe5_keymap.py`,
  `probe6_keymapdata.py`, `probe7_defaults.py`, `probe8_bake.py`.
- **[release notes]**: stated in the official release notes (link given), not re-tested.
- **[inferred]**: my reading of an API or UI detail, not confirmed. Treat with care.
- Release-note Markdown for 2.80 to 5.3 was pulled from the `blender-developer-docs` repo and cached
  in `archive/tests/version-deltas/rn/` for grepping. All links below point to the public pages
  `https://developer.blender.org/docs/release_notes/<version>/<page>/` (URL pattern checked, HTTP
  200).
- Scripting gotcha found while verifying: `hasattr(bpy.types.Mesh, "color_attributes")` returns
  False for RNA _properties_ (it only sees functions). Test with
  `"prop" in bpy.types.X.bl_rna.properties` or on an instance. [verified in 5.2.1]
- Keymaps are **empty in `--background`** (`keyconfigs.default.keymaps[...].keymap_items` has 0
  items). Shortcut facts below were read from the bundled keymap data
  (`scripts/presets/keyconfig/keymap_data/blender_default.py`) through `generate_keymaps()`.
  [verified in 5.2.1]

---

## 1. Version timeline (what each release broke for old tutorials)

| Version               | Headline changes that make older tutorials wrong                                                                                                                                                                                                                                                                                                         | Main source                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.81 to 2.83          | Voxel and QuadriFlow remesh, Pose/Elastic/Draw Sharp brushes, mask expand (2.81); Face Sets, Cloth and Clay Thumb brushes, brush hardness (2.83)                                                                                                                                                                                                         | [2.81/sculpt](https://developer.blender.org/docs/release_notes/2.81/sculpt/), [2.83/sculpt](https://developer.blender.org/docs/release_notes/2.83/sculpt/)                                                                                                                                                                                                                                                             |
| 2.90 to 2.93          | Multires rebuild/unsubdivide (2.90); per-mesh XYZ symmetry, trim/line gestures, cloth sculpting (2.91); first attribute-based Geometry Nodes (2.92/2.93, obsolete since 3.0)                                                                                                                                                                             | [2.90/sculpt](https://developer.blender.org/docs/release_notes/2.90/sculpt/), [2.91/sculpt](https://developer.blender.org/docs/release_notes/2.91/sculpt/)                                                                                                                                                                                                                                                             |
| 3.0 to 3.6            | Cycles X (tiles, branched path and OpenCL gone) and Geometry Nodes fields (3.0); vertex colors become Color Attributes + painting in Sculpt Mode (3.2); new Curves hair object (3.3); path guiding, UV sculpt/packing work, face sets opt-in (3.4); light tree default, VDM brushes (3.5); simulation zone, Retopology overlay, UV packing options (3.6) | [3.0/cycles](https://developer.blender.org/docs/release_notes/3.0/cycles/), [3.0/nodes_physics](https://developer.blender.org/docs/release_notes/3.0/nodes_physics/), [3.2/sculpt](https://developer.blender.org/docs/release_notes/3.2/sculpt/), [3.5/cycles](https://developer.blender.org/docs/release_notes/3.5/cycles/), [3.6/nodes_physics](https://developer.blender.org/docs/release_notes/3.6/nodes_physics/) |
| 4.0                   | Principled BSDF v2 (socket renames), AgX default, bone collections replace layers/bone groups, node group `interface` API, sculpt/paint keymap overhaul, repeat zone, node tools, bevel weights/creases as attributes, `bpy.ops` context dict removed                                                                                                    | [4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/), [4.0/keymap](https://developer.blender.org/docs/release_notes/4.0/keymap/)                                                                                                                                                                                                                                                         |
| 4.1                   | Auto Smooth removed (modifier/operator), I/K keying change, light probe type renames, Musgrave merged into Noise, hierarchical bone collections, sculpt mask as attribute                                                                                                                                                                                | [4.1/python_api](https://developer.blender.org/docs/release_notes/4.1/python_api/), [4.1/modeling](https://developer.blender.org/docs/release_notes/4.1/modeling/)                                                                                                                                                                                                                                                     |
| 4.2 LTS (16 Jul 2024) | EEVEE Next rewrite (Blend Mode -> Render Method, bloom removed, SSR/GTAO toggles gone), most bundled add-ons moved to the Extensions platform, GPU/CPU compositor rewrite, Line/Polyline sculpt tools                                                                                                                                                    | [4.2/eevee_migration](https://developer.blender.org/docs/release_notes/4.2/eevee_migration/), [4.2 index](https://developer.blender.org/docs/release_notes/4.2/)                                                                                                                                                                                                                                                       |
| 4.3                   | Brush assets + asset shelf (brush toolbar gone), Grease Pencil v3 rewrite, For Each Element zone, Minimum Stretch (SLIM) unwrap, Metallic BSDF, sculpt performance rewrite                                                                                                                                                                               | [4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/), [4.3/grease_pencil_migration](https://developer.blender.org/docs/release_notes/4.3/grease_pencil_migration/)                                                                                                                                                                                                                               |
| 4.4                   | Slotted Actions, `Sequence` -> `Strip`, Plane brush (Flatten/Fill/Scrape merged), CPU compositor rewrite, `paint.brush` read-only                                                                                                                                                                                                                        | [4.4/python_api](https://developer.blender.org/docs/release_notes/4.4/python_api/), [4.4/upgrading/slotted_actions](https://developer.blender.org/docs/release_notes/4.4/upgrading/slotted_actions/)                                                                                                                                                                                                                   |
| 4.5 LTS               | Manifold boolean solver, compositor node options become inputs (many nodes deprecated), GN import nodes, free custom normals, bump distance default 1 mm                                                                                                                                                                                                 | [4.5/compositor](https://developer.blender.org/docs/release_notes/4.5/compositor/), [4.5/modeling](https://developer.blender.org/docs/release_notes/4.5/modeling/)                                                                                                                                                                                                                                                     |
| 5.0                   | EEVEE id back to `BLENDER_EEVEE`; legacy Action API removed; `use_nodes` deprecated; compositor tree becomes a node group; `media_type` before `file_format`; working color space; bundles/closures/volume grids; brush property renames; Collada removed; bone select/hide on pose bones                                                                | [5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/), [5.0/migration/compositor_migration](https://developer.blender.org/docs/release_notes/5.0/migration/compositor_migration/)                                                                                                                                                                                                         |
| 5.1                   | Python 3.13, `brush.stroke_method` enum, Grease Pencil fill workflow (`fill_id`), `sculpt.sample_color` removed, strip time property renames                                                                                                                                                                                                             | [5.1/python_api](https://developer.blender.org/docs/release_notes/5.1/python_api/)                                                                                                                                                                                                                                                                                                                                     |
| 5.2 LTS (14 Jul 2026) | GN modifier `properties.inputs` API, automasking struct, GN lists/geometry bundles/Mesh Bevel node, experimental XPBD physics, Principled Thin Wall, Scene Project brush, Online Essentials assets                                                                                                                                                       | [5.2/python_api](https://developer.blender.org/docs/release_notes/5.2/python_api/), [5.2/geometry_nodes](https://developer.blender.org/docs/release_notes/5.2/geometry_nodes/)                                                                                                                                                                                                                                         |

---

## 2. Headless scripting basics (read first)

- **Old:** `bpy.ops.object.delete({"selected_objects": objs})` -> **5.2:**
  `with bpy.context.temp_override(selected_objects=objs): bpy.ops.object.delete()`. Positional
  context dicts raise `ValueError: 1-2 args execution context is supported`. [verified in 5.2.1]
  ([4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/)). 5.0 adds
  `override.logging_set(True)` to log which context members an operator reads
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/)).
- Engine identifiers: `'BLENDER_EEVEE'`, `'CYCLES'`, `'BLENDER_WORKBENCH'`. Setting
  `'BLENDER_EEVEE_NEXT'` fails in 5.2.1. Note
  `RenderSettings.bl_rna.properties["engine"].enum_items` statically lists only `BLENDER_EEVEE`, so
  do not validate engines from that list. [verified in 5.2.1]
- Factory defaults: engine `BLENDER_EEVEE`, 1920x1080 at 24 fps, view transform `AgX`, look `None`,
  display `sRGB`, EEVEE `taa_render_samples=64`, `use_raytracing=False`; Cycles `samples=4096`,
  denoising on (`OPENIMAGEDENOISE`), light tree on, device `CPU`. [verified in 5.2.1]
- Python is 3.13 (5.1); the user site-packages directory is no longer loaded by default, pass
  `--python-use-user-env` to restore it. [verified 3.13.13 in 5.2.1]
  ([5.1/python_api](https://developer.blender.org/docs/release_notes/5.1/python_api/),
  [5.1/core](https://developer.blender.org/docs/release_notes/5.1/core/))
- `import bgl` fails (module removed in 5.0); `Image.bindcode` removed, use
  `gpu.texture.from_image()`. [verified in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))
- 5.2 adds `gpu.init()` to initialize the GPU backend in `--background`, `bpy.data.all_ids`,
  `Window.screenshot`, and expanded `bpy.data.file_path_foreach` options. [release notes]
  ([5.2/python_api](https://developer.blender.org/docs/release_notes/5.2/python_api/))
- `--background` disables audio by default (4.2). Log output format changed in 5.0: `--debug-cycles`
  -> `--log cycles`, `--debug-ffmpeg` -> `--log video`, `--verbose` ->
  `--log-level info|debug|trace`; render-farm log parsers need updating. [release notes]
  ([4.2/core](https://developer.blender.org/docs/release_notes/4.2/core/),
  [5.0/core](https://developer.blender.org/docs/release_notes/5.0/core/))
- `bpy.props`-defined properties are no longer reachable as dict items (`scene["cycles"]` no longer
  gives Cycles settings); use the RNA attributes. Blend-file compression is on by default.
  Data-block names can be 255 bytes. [release notes]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/),
  [5.0/core](https://developer.blender.org/docs/release_notes/5.0/core/))
- `mathutils` types now expose float32 buffers (numpy conversions change). Python subclasses of
  Blender types that define `__init__` must call `super().__init__(*args, **kwargs)` (4.4).
  IDProperties behind `bpy.props` and GN modifier inputs are statically typed (4.2). [release notes]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/),
  [4.4/python_api](https://developer.blender.org/docs/release_notes/4.4/python_api/),
  [4.2/python_api](https://developer.blender.org/docs/release_notes/4.2/python_api/))
- `bpy.ops.render.render()` accepts `frame_start`/`frame_end` (5.0). [release notes]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))

---

## 3. Sculpting

### 3.1 Brush selection and the brush asset system (4.3)

- **Old:** pick brushes from the toolbar (one tool per brush), or `bpy.ops.paint.brush_select(...)`
  / `paint.brush_set` -> **5.2:** brushes are **assets** in the _Essentials_ library, picked from
  the asset shelf at the bottom of the viewport or the popup (`Shift+Space` with the default
  spacebar action "Play", plain `Space` if the keymap uses "Tools"). `paint.brush_set` does not
  exist. [verified in 5.2.1]
  ([4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/))
- bpy (works headless once the object is in Sculpt Mode; 4.5 made it a blocking load in background):
  ```python
  bpy.ops.object.mode_set(mode='SCULPT')
  bpy.ops.brush.asset_activate(asset_library_type='ESSENTIALS', asset_library_identifier="",
      relative_asset_identifier="brushes/essentials_brushes-mesh_sculpt.blend/Brush/Clay Strips")
  b = bpy.context.scene.tool_settings.sculpt.brush   # 'Clay Strips', CLAY_STRIPS, size 70, strength 0.5
  ```
  [verified in 5.2.1] ([4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/),
  [4.5/python_api](https://developer.blender.org/docs/release_notes/4.5/python_api/)). Assigning
  `tool_settings.sculpt.brush = ...` is not the way: `paint.brush` is read-only since 4.4
  ([4.4/python_api](https://developer.blender.org/docs/release_notes/4.4/python_api/)).
- Essentials brush files live in
  `/Applications/Blender.app/Contents/Resources/5.2/datafiles/assets/brushes/`:
  `essentials_brushes-mesh_sculpt.blend` (64 brushes), `-mesh_texture` (15), `-mesh_vertex` (8),
  `-mesh_weight` (4), `-curve_sculpt` (11), `-gp_draw` (13), `-gp_sculpt` (9), `-gp_vertex` (5),
  `-gp_weight` (4). [verified in 5.2.1]
- Custom brushes: duplicate an essentials brush, then _Save As Asset_
  (`bpy.ops.brush.asset_save_as`) into a user library; each brush is its own `.asset.blend`. Old
  files' local brushes need _Mark as Asset_ then _Save As Asset_. [verified op exists in 5.2.1]
  ([4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/))
- Brush thumbnails, custom icons: `brush.use_custom_icon` / `icon_filepath` removed (5.0), use the
  asset preview. [verified absent in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))

### 3.2 Brush names and merges (tutorial name -> 5.2 asset name -> `sculpt_brush_type`)

All mapped by loading every brush in `essentials_brushes-mesh_sculpt.blend`. [verified in 5.2.1]

| Tutorial (2.8x to 4.2) says                                        | 5.2 Essentials asset                                                                                                                                                                                               | `sculpt_brush_type`                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Draw / Draw Sharp / Clay / Clay Strips / Clay Thumb / Layer / Blob | same names                                                                                                                                                                                                         | `DRAW`, `DRAW_SHARP`, `CLAY`, `CLAY_STRIPS`, `CLAY_THUMB`, `LAYER`, `BLOB`                                              |
| Inflate                                                            | **Inflate/Deflate**                                                                                                                                                                                                | `INFLATE`                                                                                                               |
| Crease                                                             | **Crease Polish** (renamed 4.3) + new **Crease Sharp**                                                                                                                                                             | `CREASE`                                                                                                                |
| Pinch                                                              | **Pinch/Magnify**                                                                                                                                                                                                  | `PINCH`                                                                                                                 |
| Flatten, Fill, Scrape (separate tools)                             | **Flatten/Contrast**, **Fill/Deepen**, **Scrape/Fill**, plus **Plateau**, **Trim**                                                                                                                                 | all `PLANE` (4.4 merged Flatten/Fill/Scrape into the Plane type; `FLATTEN`/`FILL`/`SCRAPE` no longer exist in the enum) |
| Multi-plane Scrape                                                 | **Scrape Multiplane**                                                                                                                                                                                              | `MULTIPLANE_SCRAPE`                                                                                                     |
| Elastic Deform                                                     | **Elastic Grab** (+ **Elastic Snake Hook**)                                                                                                                                                                        | `ELASTIC_DEFORM`, `SNAKE_HOOK`                                                                                          |
| Grab / Snake Hook / Thumb / Nudge / Pose / Boundary                | same, plus **Grab 2D**, **Grab Silhouette**, **Pull**                                                                                                                                                              | `GRAB`, `SNAKE_HOOK`, `THUMB`, `NUDGE`, `POSE`, `BOUNDARY`                                                              |
| Rotate                                                             | **Twist**                                                                                                                                                                                                          | `ROTATE`                                                                                                                |
| Slide Relax                                                        | **Relax Slide**, **Relax Pinch**                                                                                                                                                                                   | `TOPOLOGY`                                                                                                              |
| Simplify (dyntopo brush)                                           | **Density**                                                                                                                                                                                                        | `SIMPLIFY`                                                                                                              |
| Draw Face Sets                                                     | **Face Set Paint**                                                                                                                                                                                                 | `DRAW_FACE_SETS`                                                                                                        |
| Multires Displacement Eraser / Smear                               | **Erase Multires Displacement**, **Smear Multires Displacement**                                                                                                                                                   | `DISPLACEMENT_ERASER`, `DISPLACEMENT_SMEAR`                                                                             |
| Cloth (one brush with modes)                                       | 9 dedicated cloth brushes (Drag, Push, Grab, Grab Planar, Grab Random, Inflate, Expand/Contract, Pinch Folds, Pinch Point Cloth) + Bend/Twist, Stretch/Move Cloth (`POSE`), Bend/Twist Boundary Cloth (`BOUNDARY`) | `CLOTH` etc.                                                                                                            |
| Paint / Smear (3.2 sculpt painting)                                | Paint Hard/Soft/Square/Blend (+Pressure variants), Airbrush, Blend Hard/Soft/Square; Smear, **Sharpen**                                                                                                            | `PAINT`, `SMEAR`                                                                                                        |
| (new)                                                              | **Blur** (5.1), **Scene Project** (5.2, shrinkwrap-like projection onto other objects)                                                                                                                             | `BLUR`, `SCENE_PROJECT`                                                                                                 |

Sources: brush list and renames
[4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/), Plane brush
[4.4/sculpt](https://developer.blender.org/docs/release_notes/4.4/sculpt/), Blur
[5.1/sculpt](https://developer.blender.org/docs/release_notes/5.1/sculpt/), Scene Project
[5.2/sculpt](https://developer.blender.org/docs/release_notes/5.2/sculpt/).

### 3.3 Brush settings and API renames

- **Brush size is now a diameter** (5.0). A tutorial's "Radius 50 px" is `size = 100` in 5.x. RNA
  description of `Brush.size`: "Diameter of the brush in pixels". [verified in 5.2.1]
  ([5.0/sculpt](https://developer.blender.org/docs/release_notes/5.0/sculpt/))
- `brush.sculpt_tool` -> `brush.sculpt_brush_type`; likewise `image_brush_type`,
  `vertex_brush_type`, `weight_brush_type`, `gpencil_brush_type`, `curves_sculpt_brush_type` (5.0).
  [verified in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))
- `brush.curve` / `curve_preset` -> `curve_distance_falloff` / `curve_distance_falloff_preset`
  (5.0); pen-pressure curves for size/strength/jitter (5.0). [verified rename in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/),
  [5.0/sculpt](https://developer.blender.org/docs/release_notes/5.0/sculpt/))
- `use_airbrush`, `use_anchor`, `use_space`, `use_line`, `use_curve`, `use_restore_mesh` -> one enum
  `brush.stroke_method` in `{'DOTS','DRAG_DOT','SPACE','AIRBRUSH','ANCHORED','LINE','CURVE'}` (5.1).
  [verified in 5.2.1]
  ([5.1/python_api](https://developer.blender.org/docs/release_notes/5.1/python_api/))
- Unified size/strength/color are per mode: `scene.tool_settings.unified_paint_settings` ->
  `scene.tool_settings.sculpt.unified_paint_settings` (5.0). [verified in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))
- Radial symmetry moved from tool settings to the mesh: `mesh.radial_symmetry` (5.0). XYZ mirror has
  been per mesh since 2.91: `mesh.use_mirror_x/y/z`. [verified in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/),
  [2.91/sculpt](https://developer.blender.org/docs/release_notes/2.91/sculpt/))
- Automasking moved into a struct (5.2): `sculpt.use_automasking_topology` ->
  `tool_settings.sculpt.mesh_automasking_settings.use_automasking_topology` (same on
  `brush.mesh_automasking_settings`); `automasking_cavity_factor` ->
  `mesh_automasking_settings.cavity_factor`, etc. [verified in 5.2.1]
  ([5.2/python_api](https://developer.blender.org/docs/release_notes/5.2/python_api/))
- Brush and palette colors are stored in scene linear (5.0); sRGB hex values from tutorials need
  conversion or use the color picker's Perceptual sliders. [release notes]
  ([5.0/sculpt](https://developer.blender.org/docs/release_notes/5.0/sculpt/),
  [5.0/color_management](https://developer.blender.org/docs/release_notes/5.0/color_management/))
- Grab, Snake Hook, Elastic, Pose, Boundary, Thumb, Rotate no longer show pressure toggles (5.0).
  Tilt support for Draw, Draw Sharp, Plane, Clay Strips (4.5). [release notes]
  ([5.0/sculpt](https://developer.blender.org/docs/release_notes/5.0/sculpt/),
  [4.5/sculpt](https://developer.blender.org/docs/release_notes/4.5/sculpt/))
- Clay Strips was "overhauled" in 4.3, cloth brushes default _Persistent_ off (4.4): old strength
  values may not transfer. [release notes]
  ([4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/),
  [4.4/sculpt](https://developer.blender.org/docs/release_notes/4.4/sculpt/))

### 3.4 Dyntopo, remesh, multires

- **Dyntopo.** Old: `Ctrl+D` toggles, "Smooth Shading" option in the Dyntopo panel -> 5.2: no
  default shortcut (removed 4.0), "Smooth Shading" removed (4.0), no confirmation dialog when
  enabling (5.2). bpy: `bpy.ops.sculpt.dynamic_topology_toggle()` works headless;
  `object.use_dynamic_topology_sculpting` reports state; defaults `detail_type_method='RELATIVE'`,
  `detail_size=12`, `detail_refine_method='SUBDIVIDE_COLLAPSE'`. `R` = detail size edit and `Ctrl+R`
  = detail flood fill when dyntopo is on. [verified in 5.2.1]
  ([4.0/keymap](https://developer.blender.org/docs/release_notes/4.0/keymap/),
  [4.0/sculpt](https://developer.blender.org/docs/release_notes/4.0/sculpt/),
  [5.2/sculpt](https://developer.blender.org/docs/release_notes/5.2/sculpt/))
- **Voxel remesh.** `mesh.remesh_voxel_size = 0.02; bpy.ops.object.voxel_remesh()` (Object or Sculpt
  Mode). Keys: `R` voxel size edit, `Ctrl+R` remesh. Voxel Size edit works in relative mode by
  default (4.3). Remesh propagates all attributes (4.1) and interpolates vertex/corner attributes
  such as colors instead of nearest sampling (5.2). [verified op and keys in 5.2.1]
  ([4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/),
  [4.1/sculpt](https://developer.blender.org/docs/release_notes/4.1/sculpt/),
  [5.2/sculpt](https://developer.blender.org/docs/release_notes/5.2/sculpt/))
- **Quad remesh.** QuadriFlow is still built in:
  `bpy.ops.object.quadriflow_remesh(target_faces=500)` ran headless (523 faces). Its `Ctrl+Alt+R`
  shortcut was removed in 4.0. "Quad Remesher" in tutorials is the paid third-party add-on, not
  bundled. [verified in 5.2.1]
  ([4.0/keymap](https://developer.blender.org/docs/release_notes/4.0/keymap/))
- **Multires.** `object.multires_subdivide`, `multires_unsubdivide`, `multires_rebuild_subdiv`
  (2.90), `multires_base_apply` exist. In Sculpt Mode `Ctrl+0..5` runs
  `object.subdivision_set(level=N, ensure_modifier=True)` which adds a Multiresolution modifier;
  `Alt+1`/`Alt+2` step levels down/up (`Page Up/Down` now grow/shrink visibility). 5.0 added
  "Conform Base" beside "Apply Base": there is no separate operator in 5.2.1; `multires_base_apply`
  has a bool `apply_heuristic` (default True, "slightly alter base positions for a new subdivision
  modifier"), so Conform Base is presumably `apply_heuristic=False` [inferred]. [verified ops/keys
  in 5.2.1] ([2.90/sculpt](https://developer.blender.org/docs/release_notes/2.90/sculpt/),
  [4.0/keymap](https://developer.blender.org/docs/release_notes/4.0/keymap/),
  [5.0/sculpt](https://developer.blender.org/docs/release_notes/5.0/sculpt/))
- Bake from Multires supports n-gons, matches Subdivision Surface interpolation, and vector
  displacement (5.0). [release notes]
  ([5.0/rendering](https://developer.blender.org/docs/release_notes/5.0/rendering/))

### 3.5 Face sets, masks, hiding, trimming

- Face sets are opt-in since 3.4 (primitives start without them). Ops: `sculpt.face_sets_create`,
  `sculpt.face_set_edit`, `sculpt.face_set_change_visibility` (5.1 adds `active_face_set` param for
  scripts). Keys: `H` hide active face set, `Shift+H` toggle, `Alt+H` show all,
  `Ctrl+W`/`Ctrl+Alt+W` grow/shrink, `Shift+W` expand face set, `Alt+W` face set pie, `Page Up/Down`
  grow/shrink visibility. [verified keys/ops in 5.2.1]
  ([3.4/sculpt](https://developer.blender.org/docs/release_notes/3.4/sculpt/),
  [5.1/sculpt](https://developer.blender.org/docs/release_notes/5.1/sculpt/))
- Mask is a generic float attribute `.sculpt_mask` (4.1); `mesh.vertex_paint_mask` returns the
  attribute, `vertex_paint_mask_ensure()` creates it. Keys: `M` Mask brush (toggle), `A` mask pie,
  `Alt+M` clear, `Ctrl+I` invert, `B` box mask, `Shift+A` expand mask, `Shift+Alt+A` expand by
  normals, `Ctrl+Shift+LMB` lasso mask. 5.1: `Alt+LMB` temporarily switches to Mask, `Ctrl+Alt+LMB`
  erases mask. Mask from Boundary (4.3), Mask by Color in the Mask menu (4.5). [verified keys in
  5.2.1] ([4.1/python_api](https://developer.blender.org/docs/release_notes/4.1/python_api/),
  [5.1/sculpt](https://developer.blender.org/docs/release_notes/5.1/sculpt/),
  [4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/))
- Hide/Trim/Mask/Face Set tools gained Line and Polyline variants (4.2); trim solvers are now
  **Float** (old "Fast"), Exact, **Manifold** (4.5, needs a manifold mesh). Op example:
  `sculpt.trim_polyline_gesture`. [verified ops in 5.2.1]
  ([4.2/sculpt](https://developer.blender.org/docs/release_notes/4.2/sculpt/),
  [4.5/sculpt](https://developer.blender.org/docs/release_notes/4.5/sculpt/))
- 5.2 adds Add Primitive tools inside Sculpt Mode. [release notes]
  ([5.2/sculpt](https://developer.blender.org/docs/release_notes/5.2/sculpt/))

### 3.6 Sculpt-mode painting and color attributes

- Painting in Sculpt Mode writes **Color Attributes** (3.2), not images. Color sampling:
  `sculpt.sample_color` removed in 5.1 -> `paint.sample_color` (`Shift+X`, `Ctrl+Shift+X` merged).
  `X` flips colors; `Ctrl+X` fills the current color with any tool (5.2,
  `sculpt.color_filter(type='FILL')`). [verified in 5.2.1]
  ([3.2/sculpt](https://developer.blender.org/docs/release_notes/3.2/sculpt/),
  [5.1/python_api](https://developer.blender.org/docs/release_notes/5.1/python_api/),
  [5.2/sculpt](https://developer.blender.org/docs/release_notes/5.2/sculpt/))
- HSV color jitter per stroke (4.5). [release notes]
  ([4.5/sculpt](https://developer.blender.org/docs/release_notes/4.5/sculpt/))

### 3.7 Current Sculpt Mode shortcuts (5.2.1 default keymap)

`V` Draw, `S` Smooth, `P` Pinch/Magnify, `I` Inflate/Deflate, `G` Grab, `Shift+T` Scrape/Fill, `C`
Clay Strips, `Shift+C` Crease Polish, `K` Snake Hook, `M` Mask (toggle); `F`/`Shift+F`
size/strength, `[`/`]` scale size, `Shift+RMB` set pivot, `Alt+E` stroke method menu, `Shift+S`
toggle smooth stroke, `Alt+A` automasking pie. Removed by 4.0: `X` Draw (now `V`), `Shift+S` Smooth
(now `S`), `L` Layer, `Ctrl+M` mask overlay, `Ctrl+D` dyntopo, `Ctrl+Alt+R` QuadriFlow. [verified in
5.2.1] ([4.0/keymap](https://developer.blender.org/docs/release_notes/4.0/keymap/))

---

## 4. Texture painting, vertex and weight paint

- **Brushes** are assets here too (4.3). Texture set (`essentials_brushes-mesh_texture.blend`):
  Paint Hard/Soft (+Pressure), Paint Pixel Art, Erase Hard/Soft (+Pressure), Erase Pixel Art,
  Airbrush, Blur (`SOFTEN`), Smear, Clone (`CLONE`), Fill (`FILL`), Mask (`MASK`). Activate with
  `relative_asset_identifier="brushes/essentials_brushes-mesh_texture.blend/Brush/Paint Hard"`. Type
  prop is `brush.image_brush_type` (was `image_tool`). Old "TexDraw"/"Draw" brush names are gone;
  "Soften" is "Blur". [verified in 5.2.1]
  ([4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/),
  [5.0/sculpt](https://developer.blender.org/docs/release_notes/5.0/sculpt/))
- **Image vs color attributes.** Texture Paint mode paints **images** through
  `tool_settings.image_paint.mode` (`'MATERIAL'` slots or `'IMAGE'` with `image_paint.canvas`);
  create slots with `bpy.ops.paint.add_texture_paint_slot`. Sculpt and Vertex Paint paint **color
  attributes**. [verified props/ops in 5.2.1]
  ([3.2/sculpt](https://developer.blender.org/docs/release_notes/3.2/sculpt/))
- **Vertex colors -> Color Attributes** (3.2). Old: Object Data > Vertex Colors,
  `mesh.vertex_colors.new()`, `bpy.ops.mesh.vertex_color_add()` -> 5.2:
  `mesh.color_attributes.new(name, type='FLOAT_COLOR'|'BYTE_COLOR', domain='POINT'|'CORNER')` or
  `bpy.ops.geometry.color_attribute_add()`. `mesh.vertex_colors` still exists as a legacy accessor;
  `mesh.vertex_color_add` is gone; `sculpt_vertex_colors` removed (4.0). [verified in 5.2.1]
  ([3.2/sculpt](https://developer.blender.org/docs/release_notes/3.2/sculpt/),
  [4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/))
- Clone settings left the brush: `brush.clone_image/clone_alpha/clone_offset` removed (4.4).
  Painting operator strokes no longer take per-element `pen_flip` (4.4). [release notes]
  ([4.4/python_api](https://developer.blender.org/docs/release_notes/4.4/python_api/))
- 5.1: `Esc` cancels a texture paint stroke, property changes create undo steps; stroke-type toggles
  SMOOTH/ERASE/MASK moved from the operator `mode` to `brush_toggle`. 5.2: autosave covers texture
  paint, saving a blend now asks to save modified images. [release notes]
  ([5.1/sculpt](https://developer.blender.org/docs/release_notes/5.1/sculpt/),
  [5.1/python_api](https://developer.blender.org/docs/release_notes/5.1/python_api/),
  [5.2/sculpt](https://developer.blender.org/docs/release_notes/5.2/sculpt/),
  [5.2/user_interface](https://developer.blender.org/docs/release_notes/5.2/user_interface/))
- Keys (texture/vertex/weight): `X` flip colors, `Shift+X` sample, `Ctrl+Shift+X` sample merged
  (4.4), `Ctrl+X` set vertex color / set weight, `F`/`Shift+F` size/strength, `Ctrl+F` weight radial
  control, `Shift+A`/`Shift+Alt+A` weight gradients, `K` vertex-group lock pie, `1`/`2`/`3`
  face/vertex/bone selection mask (bone selection made explicit in 4.1). `Alt+LMB` selects
  faces/verts while a brush is active with left-click select (4.0). [verified in 5.2.1]
  ([4.0/keymap](https://developer.blender.org/docs/release_notes/4.0/keymap/),
  [4.1/animation_rigging](https://developer.blender.org/docs/release_notes/4.1/animation_rigging/),
  [4.4/sculpt](https://developer.blender.org/docs/release_notes/4.4/sculpt/))
- Weight paint: weights below 0.0001 round to 0; Zero Weights overlay defaults to Active (5.0).
  [release notes] ([5.0/sculpt](https://developer.blender.org/docs/release_notes/5.0/sculpt/))

---

## 5. UV editing

- Unwrap methods: `'ANGLE_BASED'`, `'CONFORMAL'`, `'MINIMUM_STRETCH'` (SLIM, 4.3, also in Live
  Unwrap). The RNA default of `bpy.ops.uv.unwrap(method=...)` is `'CONFORMAL'` in 5.2.1 although the
  4.3 notes called Angle Based the default, so **always pass `method=` explicitly**. Other params:
  `margin_method`, `no_flip`, `iterations`, `use_original_bounds` (5.2 "Original bounding box").
  [verified in 5.2.1]
  ([4.3/modeling](https://developer.blender.org/docs/release_notes/4.3/modeling/),
  [5.2/modeling](https://developer.blender.org/docs/release_notes/5.2/modeling/))
- **UV Sync Selection is on by default** (5.0) and can now select individual UVs; selection is
  shared across all UV maps; undo stores UV select settings. Old tutorials that start with "enable
  sync select" or assume per-UV-map selection behave differently. [verified
  `use_uv_select_sync=True` in 5.2.1]
  ([5.0/modeling](https://developer.blender.org/docs/release_notes/5.0/modeling/))
- UV selection API (5.0): `MeshUVLoopLayer.vertex_selection/edge_selection` and
  `BMLoopUV.select/select_edge` removed -> `BMLoop.uv_select_vert`, `BMLoop.uv_select_edge`,
  `BMFace.uv_select`, `BMesh.uv_select_sync_*`; attributes
  `.uv_select_vert/.uv_select_edge/.uv_select_face`; pin attribute needs its `_ensure()` function.
  [release notes]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))
- Packing:
  `uv.pack_islands(shape_method=..., merge_overlap=..., margin_method=..., pin=..., rotate_method=..., udim_source=...)`
  (options from 3.4/3.6; pack to custom region 5.0). New ops: `uv.arrange_islands` (5.0),
  `uv.copy`/`uv.paste` (`Ctrl+C/V`, 4.4), Select Tile (5.1), select linked delimiters, Select by
  Winding, snap points (5.2). Edge/Vert Slide and snap base `B` in the UV editor (4.2). [verified
  ops/props in 5.2.1]
  ([3.6/modeling](https://developer.blender.org/docs/release_notes/3.6/modeling/),
  [5.0/modeling](https://developer.blender.org/docs/release_notes/5.0/modeling/),
  [4.4/user_interface](https://developer.blender.org/docs/release_notes/4.4/user_interface/),
  [4.2/modeling](https://developer.blender.org/docs/release_notes/4.2/modeling/))
- "UV Snap To Pixels" was renamed "UV Round To Pixels" (3.4); UV Sculpt `strength_curve` ->
  `curve_distance_falloff` (5.0). [release notes]
  ([3.4/modeling](https://developer.blender.org/docs/release_notes/3.4/modeling/),
  [5.0/modeling](https://developer.blender.org/docs/release_notes/5.0/modeling/))
- Seams unchanged: `MeshEdge.use_seam` still exists. Export UV Layout add-on still ships enabled.
  [verified in 5.2.1]

---

## 6. Modeling

- **Auto Smooth (removed 4.1).** Old: Object Data > Normals > Auto Smooth 30 deg,
  `mesh.use_auto_smooth = True; mesh.auto_smooth_angle = ...` -> 5.2: _Object > Shade Auto Smooth_
  adds a **"Smooth by Angle"** geometry-nodes modifier pinned last, or _Shade Smooth by Angle_
  writes the `sharp_edge` attribute once.
  ```python
  bpy.ops.object.shade_auto_smooth(angle=math.radians(30))   # modifier 'Smooth by Angle', type NODES, use_pin_to_last=True
  bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30), keep_sharp_edges=True)  # writes 'sharp_edge'
  bpy.ops.object.shade_smooth()          # keep_sharp_edges defaults to True
  bpy.ops.mesh.set_sharpness_by_angle()  # edit mode
  ```
  `use_auto_smooth`, `auto_smooth_angle`, `calc_normals_split`, `create/free_normals_split` are
  gone; read normals from `mesh.corner_normals`; `mesh.normals_domain` tells which domain Blender
  uses; custom normals are always used when present (so Weighted Normal/Normal Edit no longer need
  Auto Smooth). [verified in 5.2.1]
  ([4.1/modeling](https://developer.blender.org/docs/release_notes/4.1/modeling/),
  [4.1/python_api](https://developer.blender.org/docs/release_notes/4.1/python_api/),
  [4.2/modeling](https://developer.blender.org/docs/release_notes/4.2/modeling/))
- **Bevel weights and creases are attributes** (4.0): `bevel_weight_edge`, `bevel_weight_vert`,
  `crease_edge`, `crease_vert`; `MeshEdge.bevel_weight`/`crease` removed;
  `mesh.edge_creases_ensure()`. Face Maps removed (converted to an int attribute). Freestyle marks
  became attributes `freestyle_edge`/`freestyle_face` (5.0). [verified absences in 5.2.1]
  ([4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/),
  [5.0/modeling](https://developer.blender.org/docs/release_notes/5.0/modeling/))
- **Boolean solver** enum is `'FLOAT'` (old `'FAST'`, renamed 5.0), `'EXACT'`, `'MANIFOLD'` (4.5,
  fast and robust but needs manifold input). [verified in 5.2.1]
  ([5.0/modeling](https://developer.blender.org/docs/release_notes/5.0/modeling/),
  [4.5/modeling](https://developer.blender.org/docs/release_notes/4.5/modeling/))
- **Add Modifier menu** is a categorized standard menu that also lists node-group assets; `Shift+A`
  over the modifier stack opens it (4.0); modifiers can be pinned to the bottom (4.2); Normal
  Edit/Weighted Normal sit in a Normals submenu (4.2). 5.0 adds GN-based **Array** (the legacy
  `ARRAY` modifier still exists), **Scatter on Surface**, **Instance on Elements**, **Randomize
  Instances**, **Curve to Tube**, **Geometry Input** from `geometry_nodes_essentials.blend`.
  [verified keymap/assets in 5.2.1]
  ([4.0/modeling](https://developer.blender.org/docs/release_notes/4.0/modeling/),
  [4.2/modeling](https://developer.blender.org/docs/release_notes/4.2/modeling/),
  [5.0/modeling](https://developer.blender.org/docs/release_notes/5.0/modeling/))
- **Snapping**: press `B` during a transform to set the snap base, hold `Alt` to navigate
  mid-transform (4.0); "Absolute Grid Snap" -> snap element `'GRID'` (4.2; `use_snap_grid_absolute`
  still in RNA); "Project Individual Elements" -> `'FACE_PROJECT'` (4.0); face-center snapping
  `'FACE_MIDPOINT'` (5.1). Full `snap_elements` enum:
  `INCREMENT, GRID, VERTEX, EDGE, FACE, VOLUME, EDGE_MIDPOINT, EDGE_PERPENDICULAR, FACE_MIDPOINT, FACE_PROJECT, FACE_NEAREST`.
  [verified in 5.2.1]
  ([4.0/modeling](https://developer.blender.org/docs/release_notes/4.0/modeling/),
  [4.2/modeling](https://developer.blender.org/docs/release_notes/4.2/modeling/),
  [5.1/modeling](https://developer.blender.org/docs/release_notes/5.1/modeling/))
- **LoopTools** is no longer bundled (4.2 Extensions move) but 5.2 builds in three of its tools:
  Circle -> `bpy.ops.mesh.circularize` ("To Circle"), Space ->
  `bpy.ops.mesh.space_edge_loops_evenly`, Flatten -> `bpy.ops.mesh.flatten`. [verified op ids in
  5.2.1] ([5.2/modeling](https://developer.blender.org/docs/release_notes/5.2/modeling/))
- Other tool changes: Select Poles via Select by Trait, Join Triangles topology influence, safer
  dissolve (4.4); Grid Fill can re-grid existing faces, Dissolve Edges angle threshold (4.5); Merge
  by Distance deterministic + Centroid option on by default, Auto Merge in Symmetrize/Bevel, Lattice
  Deform Selected (`object.lattice_add_to_selected`) (5.0); loop/ring select delimiters, bevel
  snapping, Apply Scale flips normals for negative scale (5.1); selection through back-face-culled
  faces (5.2). [release notes; lattice op verified]
  ([4.4/modeling](https://developer.blender.org/docs/release_notes/4.4/modeling/),
  [4.5/modeling](https://developer.blender.org/docs/release_notes/4.5/modeling/),
  [5.0/modeling](https://developer.blender.org/docs/release_notes/5.0/modeling/),
  [5.1/modeling](https://developer.blender.org/docs/release_notes/5.1/modeling/),
  [5.2/modeling](https://developer.blender.org/docs/release_notes/5.2/modeling/))
- Import/export: `import_scene.obj`/`export_scene.obj` and Python PLY removed (4.0) ->
  `wm.obj_import`, `wm.ply_import`; C++ FBX importer is default (5.0) -> `wm.fbx_import` (legacy
  `import_scene.fbx` still present); **Collada removed** (5.0); "Import Images as Planes" is built
  in as `image.import_as_mesh_planes` (old `import_image.to_plane` gone). [verified in 5.2.1]
  ([4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/),
  [5.0/pipeline_io](https://developer.blender.org/docs/release_notes/5.0/pipeline_io/))
- **Add-ons**: most former bundled add-ons (LoopTools, Bool Tool, F2, Extra Objects, etc.) moved to
  extensions.blender.org in 4.2. Bundled in 5.2.1: `cycles`, `io_scene_fbx`, `io_scene_gltf2`,
  `io_anim_bvh`, `io_curve_svg`, `io_mesh_uv_layout`, `pose_library`, `node_wrangler`, `rigify`,
  `hydra_storm`, `viewport_vr_preview`, `ui_translate`, `bl_pkg`. Enabled on factory settings:
  bl_pkg, cycles, io_anim_bvh, io_curve_svg, io_mesh_uv_layout, io_scene_fbx, io_scene_gltf2,
  pose_library. **Node Wrangler and Rigify must be enabled**
  (`bpy.ops.preferences.addon_enable(module="node_wrangler")`). [verified in 5.2.1]
  ([4.2 index](https://developer.blender.org/docs/release_notes/4.2/))

---

## 7. Retopology helpers

- **Old:** "enable Hidden Wire / X-ray and In Front" -> **5.2:** the **Retopology** overlay (3.6,
  replaced Hidden Wire): `overlay.show_retopology = True`, `overlay.retopology_offset` (default 0.01
  m since 4.5, was 0.2 m). [verified in 5.2.1]
  ([3.6/eevee](https://developer.blender.org/docs/release_notes/3.6/eevee/),
  [4.5/modeling](https://developer.blender.org/docs/release_notes/4.5/modeling/))
- **Old:** Snap to Face + "Project Individual Elements" -> **5.2:**
  `tool_settings.snap_elements = {'FACE_PROJECT'}` (or `'FACE_NEAREST'`), with `use_snap_self`,
  `use_snap_backface_culling`, `snap_target`, `snap_elements_individual`, `use_snap_align_rotation`.
  [verified props in 5.2.1]
  ([4.0/modeling](https://developer.blender.org/docs/release_notes/4.0/modeling/))
- Poly Build tool (2.81) is unchanged; Shrinkwrap modifier unchanged. QuadriFlow remesh is the only
  built-in quad remesher (see 3.4). Select Poles (4.4) and selection through culled faces (5.2) help
  topology checks. [release notes]
  ([2.81/sculpt](https://developer.blender.org/docs/release_notes/2.81/sculpt/),
  [4.4/modeling](https://developer.blender.org/docs/release_notes/4.4/modeling/))

---

## 8. Baking

- Texture baking is **Cycles only**: under EEVEE `bpy.ops.object.bake()` fails with "Current render
  engine does not support baking". Headless bake works: set `scene.render.engine='CYCLES'`, make the
  target Image Texture node the active node, `bpy.ops.object.bake(type='DIFFUSE')`. [verified in
  5.2.1]
- Settings: `scene.render.bake` (BakeSettings: `use_pass_direct/indirect/color`,
  `use_selected_to_active`, `cage_extrusion`, `max_ray_distance`, `margin`, `margin_type`, `target`
  IMAGE_TEXTURES/VERTEX_COLORS, `use_multires`, `normal_space`); bake type also on
  `scene.cycles.bake_type`. Types:
  `COMBINED, AO, SHADOW, POSITION, NORMAL, UV, ROUGHNESS, EMIT, ENVIRONMENT, DIFFUSE, GLOSSY, TRANSMISSION`.
  [verified in 5.2.1]
- 5.0: bakes go only to **selected (and active)** image nodes instead of every active image;
  multires bake supports n-gons and vector displacement. 4.4: faster Selected to Active. [release
  notes] ([5.0/rendering](https://developer.blender.org/docs/release_notes/5.0/rendering/),
  [4.4/cycles](https://developer.blender.org/docs/release_notes/4.4/cycles/))
- EEVEE "Bake Indirect Lighting" (legacy irradiance cache) is gone: 4.2 bakes Volume light probes
  per object (Scene > Light Probes > Bake All Light Probe Volumes). [release notes]
  ([4.2/eevee_migration](https://developer.blender.org/docs/release_notes/4.2/eevee_migration/))
- Geometry-node bakes: Bake node (4.1), packed into the .blend by default (4.3). [release notes]
  ([4.1/nodes_physics](https://developer.blender.org/docs/release_notes/4.1/nodes_physics/),
  [4.3/geometry_nodes](https://developer.blender.org/docs/release_notes/4.3/geometry_nodes/))

---

## 9. Materials and shading

### 9.1 Principled BSDF v2 (4.0)

| 3.x tutorial socket                                                             | 5.2 socket                                                                                | Note                                                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Subsurface                                                                      | **Subsurface Weight**                                                                     |                                                                                                  |
| Subsurface Color                                                                | removed                                                                                   | uses Base Color; new **Subsurface Scale** (5.2.1 default 0.005), Subsurface Radius (1, 0.2, 0.1) |
| Specular                                                                        | **Specular IOR Level**                                                                    | default 0.5; reflection mainly driven by **IOR** (default 1.5)                                   |
| Specular Tint (float)                                                           | **Specular Tint** (color)                                                                 | also tints metal edges (F82)                                                                     |
| Transmission                                                                    | **Transmission Weight**                                                                   |                                                                                                  |
| Clearcoat / Clearcoat Roughness / Clearcoat Normal                              | **Coat Weight / Coat Roughness / Coat Normal**                                            | plus Coat IOR, Coat Tint                                                                         |
| Sheen                                                                           | **Sheen Weight**                                                                          | new microfiber model, plus Sheen Roughness                                                       |
| Emission (color; 3.x default black with Strength 1 [inferred, not re-verified]) | **Emission Color** default **white**, **Emission Strength default 0** [verified in 5.2.1] | an old "set emission color" step does nothing until Strength > 0                                 |

Current inputs in order: Base Color, Metallic, Roughness, IOR, Alpha, Thin Wall (5.2), Normal,
Weight, Diffuse Roughness (4.3), Subsurface Weight/Radius/Scale/IOR/Anisotropy, Specular IOR Level,
Specular Tint, Anisotropic, Anisotropic Rotation, Tangent, Transmission Weight, Coat
Weight/Roughness/IOR/Tint/Normal, Sheen Weight/Roughness/Tint, Emission Color, Emission Strength,
Thin Film Thickness, Thin Film IOR (4.2). `distribution` default `MULTI_GGX`; `subsurface_method` in
`BURLEY, RANDOM_WALK, RANDOM_WALK_SKIN, RANDOM_WALK_LEGACY` (5.2 converts old files to Legacy).
**Access sockets by name, never by index** (indices shifted). [verified in 5.2.1]
([4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/),
[4.0/shading](https://developer.blender.org/docs/release_notes/4.0/shading/),
[5.2/rendering](https://developer.blender.org/docs/release_notes/5.2/rendering/))

### 9.2 Node and material API

- **`material.use_nodes` is deprecated** (5.0): always True, setting False has no effect;
  `bpy.data.materials.new()` already contains Principled BSDF + Material Output. Same for
  `world.use_nodes` (new worlds come with Background + World Output) and lights (5.1). Old
  `mat.use_nodes = True` lines are harmless no-ops. [verified in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/),
  [5.1/user_interface](https://developer.blender.org/docs/release_notes/5.1/user_interface/))
- Removed/merged nodes: Glossy + Anisotropic merged, `ShaderNodeBsdfGlossy` is an alias that creates
  `ShaderNodeBsdfAnisotropic` (4.0); Velvet -> **Sheen BSDF** (`ShaderNodeBsdfVelvet` fails) (4.0);
  **Musgrave Texture removed**, use Noise Texture's fractal types
  (`Roughness = Lacunarity^-Dimension`, Detail minus 1) (4.1); **Point Density removed** (5.0);
  **Separate/Combine RGB and HSV removed**, use Separate/Combine Color (5.0). Legacy
  `ShaderNodeMixRGB` still creatable but the Add menu uses `ShaderNodeMix` (3.4). [verified in
  5.2.1] ([4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/),
  [4.1/rendering](https://developer.blender.org/docs/release_notes/4.1/rendering/),
  [5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))
- New nodes: Metallic BSDF, Gabor Texture (4.3); Volume Coefficients (4.5); Radial Tiling, repeat
  zones, closures and bundles in shader trees (5.0); Raycast (5.1); Time (5.2). In shader trees
  these use shared ids: repeat zone `GeometryNodeRepeatInput/Output`, Time
  `GeometryNodeInputSceneTime`, Menu Switch `GeometryNodeMenuSwitch`, closures
  `NodeClosureInput/Output`, `NodeEvaluateClosure`, bundles `NodeCombineBundle` (there is no
  `ShaderNodeTime`). [verified in 5.2.1]
  ([4.3/rendering](https://developer.blender.org/docs/release_notes/4.3/rendering/),
  [5.0/rendering](https://developer.blender.org/docs/release_notes/5.0/rendering/),
  [5.1/rendering](https://developer.blender.org/docs/release_notes/5.1/rendering/),
  [5.2/rendering](https://developer.blender.org/docs/release_notes/5.2/rendering/))
- Sky Texture: `sun_direction`, `turbidity`, `ground_albedo` inputs removed (5.0); `sky_type` is
  `SINGLE_SCATTERING, MULTIPLE_SCATTERING, PREETHAM, HOSEK_WILKIE` (old `'NISHITA'` is not in the
  enum). [verified enum in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/),
  [5.0/rendering](https://developer.blender.org/docs/release_notes/5.0/rendering/))
- Bump node `Distance` default 0.001 (was 1.0) and new `Filter Width` 0.1 (4.5): importers/tutorial
  values may need `Distance=1.0`. Normal Map node gained `convention` (OpenGL/DirectX, 5.1) and
  `base`. Voronoi hashing changed (5.0) so patterns differ from old renders. [verified
  defaults/props in 5.2.1]
  ([4.5/rendering](https://developer.blender.org/docs/release_notes/4.5/rendering/),
  [5.1/rendering](https://developer.blender.org/docs/release_notes/5.1/rendering/),
  [5.0/rendering](https://developer.blender.org/docs/release_notes/5.0/rendering/))
- Material output nodes inside a group no longer take priority (5.0). `displacement_method` moved
  from `material.cycles` to `material` (4.1). [release notes]
  ([5.0/rendering](https://developer.blender.org/docs/release_notes/5.0/rendering/),
  [4.1/python_api](https://developer.blender.org/docs/release_notes/4.1/python_api/))
- Lights: point/spot became sphere lights (4.0), `use_soft_falloff` (4.1, on for new lights)
  restores the pre-4.0 look; `exposure`, `use_temperature`/`temperature`, `normalize` (4.5); W unit
  dropped from the UI (4.5); cast shadow unified as `light.use_shadow` (4.2, was
  `light.cycles.cast_shadow`). Legacy EEVEE light props (contact shadows, falloff, shadow buffer)
  removed. [verified props in 5.2.1]
  ([4.0/shading](https://developer.blender.org/docs/release_notes/4.0/shading/),
  [4.1/rendering](https://developer.blender.org/docs/release_notes/4.1/rendering/),
  [4.5/rendering](https://developer.blender.org/docs/release_notes/4.5/rendering/),
  [4.2/python_api](https://developer.blender.org/docs/release_notes/4.2/python_api/))

---

## 10. EEVEE (legacy 2.8 to 4.1) vs EEVEE Next (4.2+)

- **Engine id history:** `BLENDER_EEVEE` (up to 4.1, legacy) -> `BLENDER_EEVEE_NEXT` (4.2 to 4.5) ->
  `BLENDER_EEVEE` (5.0+). Scripts written for 4.2 to 4.5 break on 5.2. [verified in 5.2.1]
  ([4.2/python_api](https://developer.blender.org/docs/release_notes/4.2/python_api/),
  [5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))
- **Material settings.** Old: Blend Mode Opaque/Alpha Clip/Alpha Hashed/Alpha Blend, Shadow Mode,
  Screen Space Refraction -> 5.2: `material.surface_render_method` in `{'DITHERED','BLENDED'}`
  (Dithered = old Hashed; Alpha Clip = add Math _Greater Than_ on alpha); shadows via **object** ray
  visibility `obj.visible_shadow` and `material.use_transparent_shadow`; `use_raytrace_refraction`
  (old `use_screen_refraction`), `use_transparency_overlap` (old `show_transparent_back`),
  `thickness_mode`, `use_thickness_from_shadow`. `blend_method` still exists as a deprecated alias;
  `shadow_method` removed (4.3). [verified in 5.2.1]
  ([4.2/eevee](https://developer.blender.org/docs/release_notes/4.2/eevee/),
  [4.2/eevee_migration](https://developer.blender.org/docs/release_notes/4.2/eevee_migration/),
  [4.3/python_api](https://developer.blender.org/docs/release_notes/4.3/python_api/))
- **Render settings.** Old toggles: Ambient Occlusion, Bloom, Screen Space Reflections, Soft
  Shadows, Shadow cube/cascade size, Motion Blur on `scene.eevee` -> 5.2:
  `scene.eevee.use_raytracing`, `ray_tracing_method`, `ray_tracing_options`,
  `use_fast_gi`/`fast_gi_method` (AO-like fallback), `use_shadows`, `shadow_pool_size`,
  `shadow_ray_count`, `shadow_step_count`, per-light `use_shadow_jitter` and
  `shadow_maximum_resolution` (Resolution Limit),
  `scene.render.use_motion_blur`/`motion_blur_shutter`/`motion_blur_position`;
  `view_layer.eevee.ambient_occlusion_distance` (old `scene.eevee.gtao_distance`, 5.0). `use_bloom`,
  `use_ssr`, `use_gtao`, `use_soft_shadows`, `shadow_cube_size`, `bloom_*` do not exist. [verified
  in 5.2.1] ([4.2/python_api](https://developer.blender.org/docs/release_notes/4.2/python_api/),
  [4.3/python_api](https://developer.blender.org/docs/release_notes/4.3/python_api/),
  [5.0/eevee](https://developer.blender.org/docs/release_notes/5.0/eevee/))
- **Bloom** -> compositor **Glare** node, type Bloom (4.2), which also previews in the viewport
  compositor. Contact shadows removed (virtual shadow maps). World volume now blocks sun/world light
  (conversion operator in Help menu); sun is extracted from HDRIs automatically. [release notes]
  ([4.2/eevee_migration](https://developer.blender.org/docs/release_notes/4.2/eevee_migration/))
- **Light probes** renamed: Reflection Cubemap -> **Sphere**, Reflection Plane -> **Plane**,
  Irradiance Grid -> **Volume**; ids `CUBEMAP/PLANAR/GRID` -> `SPHERE/PLANE/VOLUME` in
  `LightProbe.type` and `object.lightprobe_add(type=...)` (4.1). Volume probes bake per object
  (4.2). [verified in 5.2.1]
  ([4.1/python_api](https://developer.blender.org/docs/release_notes/4.1/python_api/),
  [4.2/eevee_migration](https://developer.blender.org/docs/release_notes/4.2/eevee_migration/))
- Later changes: light and shadow linking in EEVEE (4.3); shadow terminator offsets on objects
  (4.5); curves render with their resolution attribute (5.0, heavy hair can explode in cost);
  `direct_light_intensity`/`indirect_light_intensity` and the Raycast node (5.1); 5.2 screen-space
  ray tracing overhaul (some scenes darker), Fast GI "Far Thickness" removed, light camera-ray
  visibility, 1.5/2 GB shadow pools. [intensity props verified; rest release notes]
  ([4.3/eevee](https://developer.blender.org/docs/release_notes/4.3/eevee/),
  [4.5/eevee](https://developer.blender.org/docs/release_notes/4.5/eevee/),
  [5.0/eevee](https://developer.blender.org/docs/release_notes/5.0/eevee/),
  [5.1/eevee](https://developer.blender.org/docs/release_notes/5.1/eevee/),
  [5.2/eevee](https://developer.blender.org/docs/release_notes/5.2/eevee/))
- **Render pass names** (5.0): `Z` -> `Depth`, `DiffCol` -> `Diffuse Color`, `IndexMA` ->
  `Material Index`, etc. The view-layer toggles keep their names (`use_pass_z`) but Render Layers
  node sockets are `Depth`, `Normal`, `Diffuse Color`. [verified sockets in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))

---

## 11. Cycles

- 3.0 Cycles X: tile size panel, Branched Path Tracing and OpenCL are gone; 5.0 removed the "Use
  Tiling" option too (`cycles.use_auto_tile`, `tile_size` remain). [release notes]
  ([3.0/cycles](https://developer.blender.org/docs/release_notes/3.0/cycles/),
  [5.0/cycles](https://developer.blender.org/docs/release_notes/5.0/cycles/))
- Defaults a 2.8x tutorial does not have: light tree on (3.5), adaptive sampling with 4096 max
  samples, OpenImageDenoise with GPU support (4.1), blue-noise sampling for new files (4.2), path
  guiding (CPU, 3.4), shadow pass removed (3.5). [defaults verified in 5.2.1]
  ([3.5/cycles](https://developer.blender.org/docs/release_notes/3.5/cycles/),
  [4.1/cycles](https://developer.blender.org/docs/release_notes/4.1/cycles/),
  [4.2/cycles](https://developer.blender.org/docs/release_notes/4.2/cycles/),
  [3.4/cycles](https://developer.blender.org/docs/release_notes/3.4/cycles/))
- Motion blur settings shared with EEVEE on `scene.render` (4.2). Light/shadow linking (4.0). Ray
  portals, thin film (4.2). Bump mapping changes (4.4 sub-pixel, 4.5 correction) alter old looks.
  [release notes] ([4.2/cycles](https://developer.blender.org/docs/release_notes/4.2/cycles/),
  [4.0/cycles](https://developer.blender.org/docs/release_notes/4.0/cycles/),
  [4.4/cycles](https://developer.blender.org/docs/release_notes/4.4/cycles/),
  [4.5/cycles](https://developer.blender.org/docs/release_notes/4.5/cycles/))
- 5.0: NanoVDB volumes, Normal Map uses undisplaced normals under displacement, object-space
  adaptive subdivision; 5.2: texture cache (`render.use_texture_cache`), Random Walk SSS rescaled
  (old files auto-set to Legacy), world Cast Shadows. [texture cache prop verified]
  ([5.0/cycles](https://developer.blender.org/docs/release_notes/5.0/cycles/),
  [5.2/cycles](https://developer.blender.org/docs/release_notes/5.2/cycles/))

---

## 12. Color management

- **Filmic -> AgX default** for new files (4.0); Filmic is still selectable. [verified in 5.2.1]
  ([4.0/color_management](https://developer.blender.org/docs/release_notes/4.0/color_management/))
- View transforms on the sRGB display: `Standard`, `ACES 1.3`, `ACES 2.0` (5.0),
  `Khronos PBR Neutral` (4.2), `AgX`, `Filmic`, `Filmic Log`, `False Color`, `Raw`. HDR variants
  (`AgX - HDR 1000 nits`, `ACES 2.0 - HDR ...`) appear only on HDR displays (checked on
  `Rec.2100-PQ`); `Display P3` offers Standard, ACES 1.3/2.0, AgX, False Color, Raw. Displays:
  `sRGB`, `Display P3`, `Rec.1886`, `Rec.2020`, `Rec.2100-PQ`, `Rec.2100-HLG` (`XYZ` and `None`
  gone). [verified in 5.2.1]
  ([4.2/rendering](https://developer.blender.org/docs/release_notes/4.2/rendering/),
  [5.0/color_management](https://developer.blender.org/docs/release_notes/5.0/color_management/))
- **Looks are prefixed per view:** with AgX use `'AgX - Punchy'`, `'AgX - High Contrast'`,
  `'AgX - Base Contrast'`, `'AgX - Greyscale'`, etc.; `'Medium High Contrast'` style names are only
  valid under Filmic/Standard. [verified in 5.2.1]
- **Color space names:** `'Linear'` -> `'Linear Rec.709'` (4.0 rename); `'Raw'` is not an image
  color space any more, use `'Non-Color'` for data maps; `'ACEScg'`, `'Linear Rec.2020'`, camera log
  spaces (5.2), `'AgX Base sRGB'`, `'Filmic sRGB'` exist. Hard-coded old names raise on assignment.
  [verified in 5.2.1]
  ([4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/),
  [5.2/rendering](https://developer.blender.org/docs/release_notes/5.2/rendering/))
- **Working space** per blend file (5.0): `bpy.data.colorspace.working_space` default
  `'Linear Rec.709'` (interop id `lin_rec709_scene`), options Rec.2020 and ACEScg. White balance in
  the view transform (4.3: `view_settings.use_white_balance`, temperature, tint). [verified in
  5.2.1]
  ([5.0/color_management](https://developer.blender.org/docs/release_notes/5.0/color_management/),
  [4.3/rendering](https://developer.blender.org/docs/release_notes/4.3/rendering/))
- HDR/wide-gamut export: set display Rec.2100-PQ/HLG, codec H.265 or AV1, 10/12-bit (5.0). [release
  notes] ([5.0/pipeline_io](https://developer.blender.org/docs/release_notes/5.0/pipeline_io/))

---

## 13. Compositor

- **Tree is a node group data-block (5.0).** Old: tick _Use Nodes_ in the Compositor,
  `scene.use_nodes = True` then `scene.node_tree.nodes["Render Layers"]` -> 5.2: `scene.node_tree`
  does not exist, `scene.use_nodes` is always True (no-op), factory scenes have
  `scene.compositing_node_group = None`; to disable compositing set
  `scene.render.use_compositing = False`. [verified in 5.2.1]
  ([5.0/migration/compositor_migration](https://developer.blender.org/docs/release_notes/5.0/migration/compositor_migration/))
  ```python
  tree = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
  scene.compositing_node_group = tree
  rl  = tree.nodes.new("CompositorNodeRLayers")
  out = tree.nodes.new("NodeGroupOutput")          # replaces the Composite node
  tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
  tree.links.new(out.inputs["Image"], rl.outputs["Image"])
  ```
- **Composite node removed** -> Group Output whose first input is a Color socket (5.0).
  `CompositorNodeComposite`, `CompositorNodeMath`, `CompositorNodeGamma`, `CompositorNodeMixRGB`,
  `CompositorNodeMapValue`, `CompositorNodeValToRGB`, `CompositorNodeSunBeams`,
  `CompositorNodeTexture`, `CompositorNodeSplitViewer` all fail; use `ShaderNodeMath`,
  `ShaderNodeGamma`, `ShaderNodeMix`, `ShaderNodeValToRGB`, Map Range + Clamp, Glare type Sun Beams,
  procedural texture nodes, `CompositorNodeSplit`. Z Combine is labeled Depth Combine but keeps
  `CompositorNodeZcombine`. [verified in 5.2.1]
  ([5.0/compositor](https://developer.blender.org/docs/release_notes/5.0/compositor/),
  [4.5/compositor](https://developer.blender.org/docs/release_notes/4.5/compositor/),
  [4.1/compositor](https://developer.blender.org/docs/release_notes/4.1/compositor/))
- **Node options are inputs** (4.5/5.0): `node.variation = 'CLASSIC'` ->
  `node.inputs['Variation'].default_value = 'CLASSIC'`. Glare inputs now: Image, Type, Quality,
  Threshold, Smoothness, Clamp, Maximum, Strength, Saturation, Tint, Size, Streaks, Streaks Angle,
  Iterations, Fade, Color Modulation, Diagonal, Sun Position, Jitter, Kernel. [verified Glare in
  5.2.1]
  ([5.0/migration/compositor_migration](https://developer.blender.org/docs/release_notes/5.0/migration/compositor_migration/))
- **File Output**: `base_path`, `file_slots`, `layer_slots` -> `directory`, `file_name`,
  `file_output_items[i].name`; frame numbers appended only for animation renders (5.0); directories
  in item names restored (5.1). [verified props in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/),
  [5.1/compositor](https://developer.blender.org/docs/release_notes/5.1/compositor/))
- Behavior changes that alter old node setups: 4.2 GPU compositing and strict left-to-right
  evaluation (no size inference, transforms applied immediately; 4.4 re-delayed transforms,
  Translate Wrapping -> Repeat); Color-to-Float converts by luminance, not RGB average (4.4); Glare
  redesigned (4.4) and Fog Glow more realistic (5.0); Color Balance Lift/Gamma/Gain works in linear
  (5.0); Alpha Over inputs renamed Background/Foreground (5.0); Mix mixes alpha (5.1).
  `scene.copy()` no longer duplicates the compositor tree (5.0). [release notes]
  ([4.2/compositor](https://developer.blender.org/docs/release_notes/4.2/compositor/),
  [4.4/compositor](https://developer.blender.org/docs/release_notes/4.4/compositor/),
  [5.0/compositor](https://developer.blender.org/docs/release_notes/5.0/compositor/),
  [5.1/compositor](https://developer.blender.org/docs/release_notes/5.1/compositor/))
- Built-in compositor assets (5.0/5.2): Vignette, Film Grain, Chromatic Aberration, Sensor Noise,
  Sepia, Split Toning, Tune Image, Unsharp Mask, Retime, 3D/Screen space helpers. [verified in
  `compositing_nodes_essentials.blend`, 5.2.1]
  ([5.0/compositor](https://developer.blender.org/docs/release_notes/5.0/compositor/),
  [5.2/compositor](https://developer.blender.org/docs/release_notes/5.2/compositor/))

---

## 14. Geometry nodes

- **2.92/2.93 GN tutorials are obsolete**: 3.0 replaced attribute nodes with **fields**. [release
  notes] ([3.0/nodes_physics](https://developer.blender.org/docs/release_notes/3.0/nodes_physics/))
- Zones and data types by version: Simulation zone (3.6); Repeat zone, node tools, rotation socket
  (4.0); Bake node, Menu Switch, Index Switch, Sort Elements (4.1); Matrix socket (4.2); **For Each
  Element** zone, gizmos, Warning node, Grease Pencil support, packed bakes (4.3); Normal node
  outputs corner normals (4.4); Import OBJ/PLY/STL/CSV/VDB/Text nodes, Set Mesh Normal, _Visual
  Geometry to Objects_ (`object.visual_geometry_to_objects`) (4.5); **Bundles**, **Closures**,
  **volume grid** nodes, UV Tangent, multi-input Viewer (5.0); Get/Store Bundle Item, Bone Info,
  String to Curves sockets (5.1); **Lists** (Field to List, Closure to List, List Length, Get List
  Item, Filter List, Sort List), geometry bundles, **Mesh Bevel** node, Merge Points/Cluster nodes,
  Collection Children, Sample Sound Frequencies, GN modifiers on Empties, experimental XPBD physics
  (5.2). [node ids verified in 5.2.1: `GeometryNodeForeachGeometryElementInput`,
  `GeometryNodeRepeatInput`, `GeometryNodeSimulationInput`, `NodeClosureInput`, `NodeCombineBundle`,
  `GeometryNodeFieldToList`, `GeometryNodeListLength`, `GeometryNodeMeshBevel`,
  `GeometryNodeMergePoints`, `GeometryNodeClusterByDistance`, `GeometryNodeXPBDSolver`,
  `GeometryNodeMeshToSDFGrid`]
  ([4.0/geometry_nodes](https://developer.blender.org/docs/release_notes/4.0/geometry_nodes/),
  [4.1/nodes_physics](https://developer.blender.org/docs/release_notes/4.1/nodes_physics/),
  [4.3/geometry_nodes](https://developer.blender.org/docs/release_notes/4.3/geometry_nodes/),
  [4.5/geometry_nodes](https://developer.blender.org/docs/release_notes/4.5/geometry_nodes/),
  [5.0/geometry_nodes](https://developer.blender.org/docs/release_notes/5.0/geometry_nodes/),
  [5.1/geometry_nodes](https://developer.blender.org/docs/release_notes/5.1/geometry_nodes/),
  [5.2/geometry_nodes](https://developer.blender.org/docs/release_notes/5.2/geometry_nodes/))
- **Group sockets API** (4.0): `tree.inputs.new(...)` / `tree.outputs.new(...)` ->
  `tree.interface.new_socket(name, in_out='INPUT'|'OUTPUT', socket_type='NodeSocketFloat')`,
  `new_panel`, `move`, iterate `tree.interface.items_tree`. [verified in 5.2.1]
  ([4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/))
- **Modifier inputs API (5.2):** `md["Socket_1"] = 2.5` now raises `TypeError` ->
  `md.properties.inputs.Socket_1.value = 2.5`; attribute toggle: `.type = 'ATTRIBUTE'`,
  `.attribute_name = "..."`; outputs: `md.properties.outputs.<id>.attribute_name`. [verified in
  5.2.1] ([5.2/python_api](https://developer.blender.org/docs/release_notes/5.2/python_api/))
- Node-group assets as modifiers: set `node_group.is_modifier = True`, mark as asset, catalog path
  builds the Add Modifier menu (4.0); top-level catalogs named "Geometry Nodes"/"Compositing" are
  ignored when building menus (5.2). Node tools from pre-5.1 files must be re-saved in 5.1+.
  [is_modifier verified; rest release notes]
  ([4.0/geometry_nodes](https://developer.blender.org/docs/release_notes/4.0/geometry_nodes/),
  [5.2/assets](https://developer.blender.org/docs/release_notes/5.2/assets/),
  [5.1/geometry_nodes](https://developer.blender.org/docs/release_notes/5.1/geometry_nodes/))
- Socket access: dynamic-type nodes (Store Named Attribute etc.) need socket identifiers, not
  indices (4.1); Compare and Random Value socket identifiers changed (5.2); Random Value gives
  different large-int values (5.0); Curve to Mesh uses a Scale input instead of implicit `radius`
  (4.5). [release notes]
  ([4.1/python_api](https://developer.blender.org/docs/release_notes/4.1/python_api/),
  [5.2/python_api](https://developer.blender.org/docs/release_notes/5.2/python_api/),
  [5.0/geometry_nodes](https://developer.blender.org/docs/release_notes/5.0/geometry_nodes/),
  [4.5/geometry_nodes](https://developer.blender.org/docs/release_notes/4.5/geometry_nodes/))
- Essentials GN assets in 5.2.1: Smooth by Angle, Array, Scatter on Surface, Instance on Elements,
  Curve to Tube, Geometry Input, Randomize Transforms, Displace Geometry, selection helpers; hair
  node assets (Generate/Clump/Curl/Braid Hair Curves, etc.); dynamics assets (Hair Dynamics, Cloth
  Dynamics (Experimental), Collider, Custom Force). [verified in 5.2.1]
- Editor UX: `Shift+S` opens the Swap menu (`NODE_MT_swap`), `F` adds a named frame
  (`node.join_named`, old F moved to `J` per 4.5 notes), `Ctrl+J` joins nodes, `Alt+P` detaches;
  double-click enters/leaves groups and breadcrumbs are clickable (5.0); `Ctrl+1..9` set viewer
  shortcuts (4.5). [keys verified in 5.2.1]
  ([4.5/user_interface](https://developer.blender.org/docs/release_notes/4.5/user_interface/),
  [5.0/user_interface](https://developer.blender.org/docs/release_notes/5.0/user_interface/),
  [4.5/geometry_nodes](https://developer.blender.org/docs/release_notes/4.5/geometry_nodes/))

---

## 15. Animation

- **Keying.** Old: `I` pops up a keying-set menu (LocRotScale...) -> 4.1+: `I` inserts directly on
  the channels set in Preferences (default Location, Rotation, Scale, Custom Properties); `K` opens
  the keying menu; `Shift+K` sets the active keying set (was `Ctrl+Shift+Alt+I`). Defaults in 5.2.1:
  "Only Insert Available" **on** (5.2 change), "Only Insert Needed" off for manual, on for
  auto-keying. [verified in 5.2.1]
  ([4.1/animation_rigging](https://developer.blender.org/docs/release_notes/4.1/animation_rigging/),
  [5.2/animation_rigging](https://developer.blender.org/docs/release_notes/5.2/animation_rigging/))
- **Slotted Actions (4.4) and legacy API removal (5.0).** `action.fcurves`, `action.groups`,
  `action.id_root` raise `AttributeError`. `obj.keyframe_insert("location", frame=1)` still creates
  action + slot (`OB<name>`) + layer + keyframe strip + channelbag. [verified in 5.2.1]
  ```python
  from bpy_extras import anim_utils
  ad = obj.animation_data; act, slot = ad.action, ad.action_slot
  cb = anim_utils.action_get_channelbag_for_slot(act, slot)          # read
  cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)       # create if missing
  fc = cb.fcurves.ensure("location", index=2, group_name="Object Transform")  # was action.fcurves.new(..., action_group=)
  act.fcurve_ensure_for_datablock(obj, "location", index=0)          # convenience
  slot_type = slot.target_id_type                                    # was action.id_root
  ```
  ([4.4/upgrading/slotted_actions](https://developer.blender.org/docs/release_notes/4.4/upgrading/slotted_actions/),
  [5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))
- **Reusing an action on another object does not animate it** until a slot is assigned: after
  `other.animation_data.action = act`, `action_slot` was `None`; do
  `ad.action_slot = ad.action_suitable_slots[0]` or create a new slot. NLA strips and Action
  constraints auto-pick a compatible slot. [verified in 5.2.1]
  ([4.4/animation_rigging](https://developer.blender.org/docs/release_notes/4.4/animation_rigging/))
- **Layered animation / animation layers: not available yet in 5.2.1.** The data model has
  `action.layers` and strips, but `act.layers.new("Layer2")` fails with "An Action may not have more
  than one layer". Use the NLA for layering. [verified in 5.2.1]
  ([4.4/animation_rigging](https://developer.blender.org/docs/release_notes/4.4/animation_rigging/))
- Graph editor: slider operators (Blend to Neighbor, Breakdown, Ease range -1..1 in 4.0; Ease
  reshaped in 4.2), Butterworth smoothing (4.0), Bake Channels, Scale from Neighbor, Auto-Lock Axis
  (4.1), Noise modifier recomputed with legacy toggle (4.4), Gaussian Smooth modifier (5.1), local
  view and Ctrl+click channel isolation (5.2). Renames: "Bake Curve" -> "Keys to Samples", "Sample
  Keyframes" -> "Bake Keyframes" (4.0); `graph.keyframe_jump` -> `screen.keyframe_jump` (4.5).
  [release notes]
  ([4.0/animation_rigging](https://developer.blender.org/docs/release_notes/4.0/animation_rigging/),
  [4.1/animation_rigging](https://developer.blender.org/docs/release_notes/4.1/animation_rigging/),
  [4.4/animation_rigging](https://developer.blender.org/docs/release_notes/4.4/animation_rigging/),
  [5.1/animation_rigging](https://developer.blender.org/docs/release_notes/5.1/animation_rigging/),
  [5.2/animation_rigging](https://developer.blender.org/docs/release_notes/5.2/animation_rigging/))
- **Frame navigation keys changed (5.0):** `Up Arrow` = previous keyframe, `Down Arrow` = next
  keyframe (reverse of 2.8x to 4.x); `Ctrl+Left/Right` jump by a time delta; `Shift+Left/Right` jump
  to start/end. [verified in 5.2.1]
  ([5.0/user_interface](https://developer.blender.org/docs/release_notes/5.0/user_interface/),
  [5.0/animation_rigging](https://developer.blender.org/docs/release_notes/5.0/animation_rigging/))
- Editors: playback footer in all animation editors, Timeline channels hidden (5.0); loop modes,
  Select by Type (`action.select_by_type`), in-betweens in Object Mode (5.2); NLA Tab uses
  full-stack evaluation and `Shift+D` duplicates linked (4.0); "NLA Channels" -> "NLA Tracks" (4.1).
  Copy Global Transform is built in (5.0). Drivers created from Python get 2 keyframes instead of a
  Generator modifier (5.0). Shape keys: lock (4.1), Make Basis (5.0), Apply to Basis (5.1). Pose
  library lives in the asset shelf (4.0), legacy 2.93 pose-library conversion removed (5.0).
  [release notes]
  ([5.0/animation_rigging](https://developer.blender.org/docs/release_notes/5.0/animation_rigging/),
  [5.2/animation_rigging](https://developer.blender.org/docs/release_notes/5.2/animation_rigging/),
  [4.0/animation_rigging](https://developer.blender.org/docs/release_notes/4.0/animation_rigging/))

---

## 16. Rigging

- **Bone collections replace armature layers and bone groups** (4.0). Old: 32 layer buttons, `M`
  move to layer, bone groups for colors, `arm.layers`, `bone.layers`, `pose.bone_groups` -> 5.2:
  named, hierarchical collections (4.1). All old props are gone. `M`/`Shift+M` in Pose Mode = move
  to / assign to collection. [verified in 5.2.1]
  ([4.0/upgrading/bone_collections](https://developer.blender.org/docs/release_notes/4.0/upgrading/bone_collections/),
  [4.1/animation_rigging](https://developer.blender.org/docs/release_notes/4.1/animation_rigging/))
  ```python
  ik = arm.collections.new("IK"); child = arm.collections.new("Child", parent=ik)
  ik.assign(arm.bones["root"]); ik.is_visible = False; ik.is_solo = False
  [c.name for c in arm.collections]      # roots only
  [c.name for c in arm.collections_all]  # whole tree
  arm.bones["root"].color.palette = 'THEME09'          # edit-mode color (shared)
  obj.pose.bones["root"].color.palette = 'CUSTOM'      # per-object override; .color.custom.active = (r, g, b)
  arm.show_bone_colors = True                          # was show_group_colors
  ```
  `edit_bones.new()` does **not** add the bone to the active collection (returned `[]`); assign
  explicitly. [verified in 5.2.1]
  ([4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/))
- **Pose-mode hide/select live on pose bones** (5.0): `Bone.select` removed; use
  `pose.bones[n].select` / `.hide` for Object/Pose mode, `edit_bones[n].select` in Edit Mode;
  `anim.version_bone_hide_property` moves old visibility F-curves. [verified in 5.2.1]
  ([5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))
- Behavior changes: Preserve Volume fix and curved B-Bone mapping (4.0), IK bones visual keying
  (4.0), Limit Rotation fixed with a Legacy Behavior checkbox on old files (4.2), Python and Rigid
  Body constraints removed (4.5), Geometry Attribute constraint and custom-shape Affect Gizmo / Use
  As Pivot (5.0), per-bone display override (4.5), 5.2 Duplicate and Rename, Copy Constraints in
  `Ctrl+L`, Add Bone redo options. "Skeleton" panel renamed "Pose" (4.0). [release notes]
  ([4.0/animation_rigging](https://developer.blender.org/docs/release_notes/4.0/animation_rigging/),
  [4.2/animation_rigging](https://developer.blender.org/docs/release_notes/4.2/animation_rigging/),
  [4.5/animation_rigging](https://developer.blender.org/docs/release_notes/4.5/animation_rigging/),
  [5.0/animation_rigging](https://developer.blender.org/docs/release_notes/5.0/animation_rigging/),
  [5.2/animation_rigging](https://developer.blender.org/docs/release_notes/5.2/animation_rigging/))
- **Rigify** still ships but is disabled on factory settings; its layer UI was rewritten around bone
  collections in 4.0 and pre-4.0 metarigs need the upgrade button; nested collections supported in
  4.1. [bundled/disabled verified; rest release notes]
  ([4.0/add_ons](https://developer.blender.org/docs/release_notes/4.0/add_ons/),
  [4.1/add_ons](https://developer.blender.org/docs/release_notes/4.1/add_ons/))
- Weight painting with bones: bone selection is an explicit mode toggled with `3` (4.1, previously
  implicit when face and vertex masks were off); `Ctrl+Shift+LMB` selects bones in Weight Paint
  (4.0). [`3` verified in 5.2.1 keymap; rest release notes]
  ([4.1/animation_rigging](https://developer.blender.org/docs/release_notes/4.1/animation_rigging/),
  [4.0/keymap](https://developer.blender.org/docs/release_notes/4.0/keymap/))

---

## 17. Grease Pencil v3 (rewrite in 4.3)

- **Types and data:** object type `'GPENCIL'` -> `'GREASEPENCIL'`; data type
  `bpy.types.GreasePencil` (it was `GreasePencilv3` in 4.3 to 4.5, renamed in 5.0);
  `bpy.data.grease_pencils` (was `grease_pencils_v3` in 4.3 to 4.5). Annotations are separate:
  `bpy.types.Annotation`, `bpy.data.annotations`, `AnnotationLayer` (renamed 5.0). [verified in
  5.2.1]
  ([4.3/grease_pencil_migration](https://developer.blender.org/docs/release_notes/4.3/grease_pencil_migration/),
  [5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/))
- **Modes and operators:** `EDIT_GPENCIL` -> `'EDIT'`, `PAINT_GPENCIL` -> `'PAINT_GREASE_PENCIL'`,
  `SCULPT_/WEIGHT_/VERTEX_GREASE_PENCIL`; `bpy.ops.gpencil.*` now holds only annotation ops, drawing
  ops are `bpy.ops.grease_pencil.*`; add with
  `bpy.ops.object.grease_pencil_add(type='STROKE'|'EMPTY'|'MONKEY'|'LINEART_SCENE'|...)` (old
  `object.gpencil_add` gone). `EDIT_GPENCIL` still appears in the `Object.mode` enum but GP objects
  enter `'EDIT'`. [verified in 5.2.1]
  ([4.3/grease_pencil_migration](https://developer.blender.org/docs/release_notes/4.3/grease_pencil_migration/))
- **Strokes are attributes on a drawing:**
  ```python
  gp = bpy.data.grease_pencils.new("GP"); ob = bpy.data.objects.new("GP", gp)
  layer = gp.layers.new("Lines"); frame = layer.frames.new(1)
  d = frame.drawing; d.add_strokes([4])            # was frame.strokes.new()
  for i, pt in enumerate(d.strokes[0].points):
      pt.position = (i, 0, 0); pt.radius = 0.05    # was point.co / point.pressure
  ```
  Attributes created: `curve_type`, `position`, `radius`; point props `position`, `radius`,
  `opacity` (old `strength`), `delta_time` (old `time`); `layer.info` -> `layer.name`,
  `layer.active_frame` -> `layer.current_frame()`. Stroke/point helper objects are not RNA types; do
  not cache them across edits. [snippet, attributes and point props verified in 5.2.1; renames
  release notes]
  ([4.3/grease_pencil_migration](https://developer.blender.org/docs/release_notes/4.3/grease_pencil_migration/))
- **Fills (5.1):** fill is a per-curve `fill_id` attribute (0 = not filled, so curves are **not
  filled by default**) plus `hide_stroke`; draw tool has Stroke/Fill/Both. GN `Set Material` with a
  GP material no longer fills. 5.2 exposes `stroke.fill_id`/`hide_stroke` in Python and makes the
  Delaunay fill solver the default. [release notes]
  ([5.1/grease_pencil](https://developer.blender.org/docs/release_notes/5.1/grease_pencil/),
  [5.2/grease_pencil](https://developer.blender.org/docs/release_notes/5.2/grease_pencil/))
- **Modifiers are regular modifiers:** `object.grease_pencil_modifiers` removed ->
  `object.modifiers.new(name, 'GREASE_PENCIL_THICKNESS')`; types `GP_*` -> `GREASE_PENCIL_*`, Line
  Art is `'LINEART'`. [verified in 5.2.1]
  ([4.3/grease_pencil_migration](https://developer.blender.org/docs/release_notes/4.3/grease_pencil_migration/))
- **Workflow changes:** strokes always world-space thickness (Screen Space option removed, use a GN
  setup); brush Radius Unit View/Scene; "Input Samples" -> Spacing; Simplify in pixels; eraser cuts
  strokes; Curve Edit mode replaced by stroke curve types; drawing guides and interpolate selection
  order not ported (4.3); Stroke Placement back (4.4); Fill Guides (4.5); corner types, Pen tool,
  motion blur (5.0); layer groups (4.3). Files saved in 4.3+ do not load correctly in 4.2. Brushes
  come from `essentials_brushes-gp_draw.blend` (Pencil, Pencil Soft, Pen, Ink Pen, Ink Pen Rough,
  Marker Bold, Marker Chisel, Airbrush, Tint, Fill, Eraser Hard/Soft/Stroke); 5.2 online textured
  brushes need Allow Online Access. [brush list verified; rest release notes]
  ([4.3/grease_pencil](https://developer.blender.org/docs/release_notes/4.3/grease_pencil/),
  [4.4/grease_pencil](https://developer.blender.org/docs/release_notes/4.4/grease_pencil/),
  [4.5/grease_pencil](https://developer.blender.org/docs/release_notes/4.5/grease_pencil/),
  [5.0/grease_pencil](https://developer.blender.org/docs/release_notes/5.0/grease_pencil/),
  [5.2/grease_pencil](https://developer.blender.org/docs/release_notes/5.2/grease_pencil/))

---

## 18. Python API breaking changes (consolidated)

| Old code (tutorial / old script)                                                                                                  | 5.2 replacement                                                                                                                                                                                    | Since                       | Status                  |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------- |
| `bpy.ops.x.y(ctx_dict, ...)`                                                                                                      | `with context.temp_override(...):`                                                                                                                                                                 | 4.0                         | [verified in 5.2.1]     |
| `mesh.use_auto_smooth`, `auto_smooth_angle`                                                                                       | `object.shade_auto_smooth` / `shade_smooth_by_angle` / Smooth by Angle modifier                                                                                                                    | 4.1                         | [verified in 5.2.1]     |
| `mesh.calc_normals()`, `calc_normals_split()`                                                                                     | not needed / `mesh.corner_normals`                                                                                                                                                                 | 4.0 / 4.1                   | [verified in 5.2.1]     |
| `edge.crease`, `edge.bevel_weight`                                                                                                | attributes `crease_edge`, `bevel_weight_edge` (+ `_vert`)                                                                                                                                          | 4.0                         | [verified in 5.2.1]     |
| `mesh.face_maps`, `object.face_maps`                                                                                              | int attribute                                                                                                                                                                                      | 4.0                         | [verified in 5.2.1]     |
| `mesh.sculpt_vertex_colors`                                                                                                       | `mesh.color_attributes`                                                                                                                                                                            | 4.0                         | [verified in 5.2.1]     |
| `mat.use_nodes = True` (to create nodes)                                                                                          | not needed, deprecated no-op                                                                                                                                                                       | 5.0                         | [verified in 5.2.1]     |
| `mat.blend_method`, `shadow_method`                                                                                               | `surface_render_method`, `obj.visible_shadow`                                                                                                                                                      | 4.2 / 4.3                   | [verified in 5.2.1]     |
| Principled `"Specular"`, `"Subsurface"`, `"Transmission"`, `"Emission"`, `"Clearcoat"`                                            | `"Specular IOR Level"`, `"Subsurface Weight"`, `"Transmission Weight"`, `"Emission Color"`, `"Coat Weight"`                                                                                        | 4.0                         | [verified in 5.2.1]     |
| `ShaderNodeTexMusgrave`, `ShaderNodeSeparateRGB/HSV`, `ShaderNodeCombineRGB`, `ShaderNodeTexPointDensity`, `ShaderNodeBsdfVelvet` | Noise Texture, Separate/Combine Color, GN volumes, Sheen BSDF                                                                                                                                      | 4.1 / 5.0 / 4.0             | [verified in 5.2.1]     |
| `scene.render.engine = 'BLENDER_EEVEE_NEXT'`                                                                                      | `'BLENDER_EEVEE'`                                                                                                                                                                                  | 5.0                         | [verified in 5.2.1]     |
| `scene.eevee.use_bloom/use_ssr/use_gtao/use_soft_shadows/use_motion_blur`                                                         | Glare node / `use_raytracing` / `use_fast_gi` / light `use_shadow_jitter` / `render.use_motion_blur`                                                                                               | 4.2 to 5.0                  | [verified in 5.2.1]     |
| `light.cycles.cast_shadow`                                                                                                        | `light.use_shadow`                                                                                                                                                                                 | 4.2                         | [verified in 5.2.1]     |
| LightProbe `'CUBEMAP'/'PLANAR'/'GRID'`                                                                                            | `'SPHERE'/'PLANE'/'VOLUME'`                                                                                                                                                                        | 4.1                         | [verified in 5.2.1]     |
| `scene.use_nodes = True; scene.node_tree`                                                                                         | `scene.compositing_node_group = bpy.data.node_groups.new(..., "CompositorNodeTree")`                                                                                                               | 5.0                         | [verified in 5.2.1]     |
| `CompositorNodeComposite/Math/Gamma/MixRGB/ValToRGB/MapValue`                                                                     | `NodeGroupOutput`, `ShaderNodeMath/Gamma/Mix/ValToRGB`, Map Range                                                                                                                                  | 5.0                         | [verified in 5.2.1]     |
| `file_output.base_path`, `.file_slots`                                                                                            | `.directory`, `.file_name`, `.file_output_items`                                                                                                                                                   | 5.0                         | [verified in 5.2.1]     |
| `image_settings.file_format = 'FFMPEG'` directly                                                                                  | set `image_settings.media_type = 'VIDEO'` first (then file_format becomes `FFMPEG`; `ffmpeg.format='MKV'`, codec `H264`, audio `NONE` by default); `'MULTI_LAYER_IMAGE'` for `OPEN_EXR_MULTILAYER` | 5.0                         | [verified in 5.2.1]     |
| `arm.layers`, `bone.layers`, `pose.bone_groups`, `arm.show_group_colors`                                                          | `arm.collections(_all)`, `collection.assign()`, `bone.color`, `arm.show_bone_colors`                                                                                                               | 4.0                         | [verified in 5.2.1]     |
| `arm.bones[n].select`                                                                                                             | `obj.pose.bones[n].select` / `edit_bones[n].select`                                                                                                                                                | 5.0                         | [verified in 5.2.1]     |
| `action.fcurves`, `action.groups`, `action.id_root`                                                                               | channelbag via `bpy_extras.anim_utils`, `slot.target_id_type`                                                                                                                                      | 4.4 deprecated, 5.0 removed | [verified in 5.2.1]     |
| `ad.action = act` animates immediately                                                                                            | also set `ad.action_slot`                                                                                                                                                                          | 4.4                         | [verified in 5.2.1]     |
| `'GPENCIL'`, `bpy.ops.gpencil.*`, `frame.strokes`, `grease_pencil_modifiers`                                                      | `'GREASEPENCIL'`, `bpy.ops.grease_pencil.*`, `frame.drawing`, `modifiers`                                                                                                                          | 4.3 (+5.0 renames)          | [verified in 5.2.1]     |
| `bpy.ops.paint.brush_set(...)`, assigning `paint.brush`                                                                           | `bpy.ops.brush.asset_activate(...)`                                                                                                                                                                | 4.3 / 4.4                   | [verified in 5.2.1]     |
| `brush.sculpt_tool`, `brush.curve`, `brush.use_space/use_airbrush/...`                                                            | `brush.sculpt_brush_type`, `curve_distance_falloff`, `stroke_method`                                                                                                                               | 5.0 / 5.1                   | [verified in 5.2.1]     |
| `tool_settings.unified_paint_settings`, `sculpt.radial_symmetry`, `sculpt.use_automasking_*`                                      | `tool_settings.sculpt.unified_paint_settings`, `mesh.radial_symmetry`, `sculpt.mesh_automasking_settings.*`                                                                                        | 5.0 / 5.2                   | [verified in 5.2.1]     |
| `bpy.ops.sculpt.sample_color`                                                                                                     | `bpy.ops.paint.sample_color`                                                                                                                                                                       | 5.1                         | [verified in 5.2.1]     |
| `md["Socket_1"] = v` on GN modifiers                                                                                              | `md.properties.inputs.Socket_1.value = v`                                                                                                                                                          | 5.2                         | [verified in 5.2.1]     |
| `tree.inputs.new()` on node groups                                                                                                | `tree.interface.new_socket()`                                                                                                                                                                      | 4.0                         | [verified in 5.2.1]     |
| Boolean `solver='FAST'`                                                                                                           | `'FLOAT'` (or `'MANIFOLD'`)                                                                                                                                                                        | 5.0                         | [verified in 5.2.1]     |
| `import_scene.obj`, `wm.collada_import`, `import_image.to_plane`                                                                  | `wm.obj_import`, none, `image.import_as_mesh_planes`                                                                                                                                               | 4.0 / 5.0 / 4.2             | [verified in 5.2.1]     |
| `bpy.types.Sequence`, `sequence_editor.sequences`                                                                                 | `bpy.types.Strip`, `sequence_editor.strips`; VSE scene is `context.sequencer_scene`                                                                                                                | 4.4 / 5.0                   | [verified in 5.2.1]     |
| Strip `frame_final_start/end/duration`, `frame_start`                                                                             | `left_handle`, `right_handle`, `duration`, `content_start` (old names deprecated until 6.0)                                                                                                        | 5.1                         | [release notes]         |
| `import bgl`, `Image.bindcode`, `gpu.types.GPUShader(...)`                                                                        | `gpu` module, `gpu.texture.from_image`, `gpu.shader.create_from_info`                                                                                                                              | 5.0 / 4.5                   | [bgl/bindcode verified] |
| Render pass `"Z"`, `"DiffCol"`, `"IndexMA"`                                                                                       | `"Depth"`, `"Diffuse Color"`, `"Material Index"`                                                                                                                                                   | 5.0                         | [verified in 5.2.1]     |
| `edge.use_freestyle_mark`                                                                                                         | attribute `freestyle_edge`                                                                                                                                                                         | 5.0                         | [verified in 5.2.1]     |
| `context.asset_file_handle`, `AssetHandle`, `template_asset_view`                                                                 | `context.asset`, `AssetRepresentation`, asset shelf                                                                                                                                                | 4.0 / 5.0                   | [release notes]         |

Sources: [4.0/python_api](https://developer.blender.org/docs/release_notes/4.0/python_api/),
[4.1/python_api](https://developer.blender.org/docs/release_notes/4.1/python_api/),
[4.2/python_api](https://developer.blender.org/docs/release_notes/4.2/python_api/),
[4.3/python_api](https://developer.blender.org/docs/release_notes/4.3/python_api/),
[4.4/python_api](https://developer.blender.org/docs/release_notes/4.4/python_api/),
[4.5/python_api](https://developer.blender.org/docs/release_notes/4.5/python_api/),
[5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/),
[5.1/python_api](https://developer.blender.org/docs/release_notes/5.1/python_api/),
[5.2/python_api](https://developer.blender.org/docs/release_notes/5.2/python_api/).

---

## 19. UI and keymap changes an old tutorial describes differently

| Tutorial says                                                                       | In 5.2                                                                                            | Source / status                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object Data > Normals > Auto Smooth                                                 | Object > Shade Auto Smooth (modifier) or Shade Smooth by Angle                                    | [4.1/modeling](https://developer.blender.org/docs/release_notes/4.1/modeling/) [verified]                                                                                                                                                          |
| Pick a brush in the toolbar / brush dropdown                                        | Asset shelf at viewport bottom, or `Shift+Space` popup                                            | [4.3/sculpt](https://developer.blender.org/docs/release_notes/4.3/sculpt/) [verified keymap]                                                                                                                                                       |
| `X` Draw, `Shift+S` Smooth, `L` Layer, `Ctrl+D` Dyntopo (Sculpt)                    | `V` Draw, `S` Smooth, no Layer/Dyntopo keys                                                       | [4.0/keymap](https://developer.blender.org/docs/release_notes/4.0/keymap/) [verified]                                                                                                                                                              |
| Add Modifier: big grid menu                                                         | categorized menu incl. node-group assets; `Shift+A` over modifiers                                | [4.0/modeling](https://developer.blender.org/docs/release_notes/4.0/modeling/) [verified key]                                                                                                                                                      |
| `I` > pick LocRotScale                                                              | `I` keys prefs channels directly; `K` menu; `Shift+K` active keying set                           | [4.1/animation_rigging](https://developer.blender.org/docs/release_notes/4.1/animation_rigging/) [verified]                                                                                                                                        |
| `M` > armature layer, Bone Groups panel                                             | `M`/`Shift+M` bone collections, per-bone Color                                                    | [4.0/animation_rigging](https://developer.blender.org/docs/release_notes/4.0/animation_rigging/) [verified]                                                                                                                                        |
| Number keys `1..0` hide collections in the 3D viewport                              | moved to the **Outliner** (`1..0`, `Alt`, `Shift` variants)                                       | [5.0/user_interface](https://developer.blender.org/docs/release_notes/5.0/user_interface/) [verified]                                                                                                                                              |
| `Up Arrow` = next keyframe                                                          | `Up` = previous, `Down` = next                                                                    | [5.0/user_interface](https://developer.blender.org/docs/release_notes/5.0/user_interface/) [verified]                                                                                                                                              |
| Material > Settings > Blend Mode / Shadow Mode                                      | Material > Settings > Render Method; Object > Visibility > Ray Visibility > Shadow                | [4.2/eevee](https://developer.blender.org/docs/release_notes/4.2/eevee/) [verified props]                                                                                                                                                          |
| Render Properties: Bloom, Screen Space Reflections, Ambient Occlusion, Soft Shadows | Compositor Glare (Bloom); Raytracing panel; Fast GI; per-light Jitter                             | [4.2/eevee_migration](https://developer.blender.org/docs/release_notes/4.2/eevee_migration/) [verified props]                                                                                                                                      |
| Compositor: tick "Use Nodes"                                                        | "New" node tree button; no checkbox; Output properties > Post Processing > Compositing to disable | [5.0/migration/compositor_migration](https://developer.blender.org/docs/release_notes/5.0/migration/compositor_migration/) [verified API]                                                                                                          |
| Composite node                                                                      | Group Output node                                                                                 | [5.0/compositor](https://developer.blender.org/docs/release_notes/5.0/compositor/) [verified]                                                                                                                                                      |
| Output: File Format "FFmpeg Video"                                                  | first choose Media Type = Video, then container/codec                                             | [5.0/python_api](https://developer.blender.org/docs/release_notes/5.0/python_api/) [verified]                                                                                                                                                      |
| Preferences > Add-ons > enable LoopTools / Bool Tool / Extra Objects                | Get Extensions (online) or legacy zip; LoopTools Circle/Space/Flatten built in (5.2)              | [4.2 index](https://developer.blender.org/docs/release_notes/4.2/), [5.2/modeling](https://developer.blender.org/docs/release_notes/5.2/modeling/) [verified]                                                                                      |
| Hidden Wire overlay for retopo                                                      | Retopology overlay                                                                                | [3.6/eevee](https://developer.blender.org/docs/release_notes/3.6/eevee/) [verified prop]                                                                                                                                                           |
| Snapping popover "Project Individual Elements", "Absolute Grid Snap"                | "Face Project" target, "Snap to Grid" element; `B` sets snap base                                 | [4.0/modeling](https://developer.blender.org/docs/release_notes/4.0/modeling/), [4.2/modeling](https://developer.blender.org/docs/release_notes/4.2/modeling/) [verified enum]                                                                     |
| Vertex Colors panel                                                                 | Color Attributes panel                                                                            | [3.2/sculpt](https://developer.blender.org/docs/release_notes/3.2/sculpt/) [verified API]                                                                                                                                                          |
| Filmic view transform (default), looks "Medium High Contrast"                       | AgX default, looks "AgX - Punchy" etc.                                                            | [4.0/color_management](https://developer.blender.org/docs/release_notes/4.0/color_management/) [verified]                                                                                                                                          |
| Node editor: `F` make links, `Ctrl+J` frame, `Tab` into groups                      | `F` named frame (make links moved to `J`), `Shift+S` Swap, double-click into/out of groups        | [4.5/user_interface](https://developer.blender.org/docs/release_notes/4.5/user_interface/), [5.0/user_interface](https://developer.blender.org/docs/release_notes/5.0/user_interface/) [keys verified]                                             |
| Outliner "Orphan Data"                                                              | "Unused Data"; File > Clean Up > Manage Unused Data                                               | [4.2/user_interface](https://developer.blender.org/docs/release_notes/4.2/user_interface/)                                                                                                                                                         |
| View > Area > Toggle Maximize/"Full Screen Area"                                    | "Focus Mode"                                                                                      | [5.0/user_interface](https://developer.blender.org/docs/release_notes/5.0/user_interface/)                                                                                                                                                         |
| Overlay "HDRI Preview"                                                              | "Reference Spheres"                                                                               | [5.0/user_interface](https://developer.blender.org/docs/release_notes/5.0/user_interface/)                                                                                                                                                         |
| Preferences via Edit menu only                                                      | also `Ctrl+Comma` (4.0); 5.2 has a dedicated Asset Libraries page and preference search (5.1)     | [4.0/keymap](https://developer.blender.org/docs/release_notes/4.0/keymap/), [5.2/assets](https://developer.blender.org/docs/release_notes/5.2/assets/), [5.1/user_interface](https://developer.blender.org/docs/release_notes/5.1/user_interface/) |
| Custom theme files from 4.x                                                         | 300+ theme settings removed/unified in 5.0; old themes break                                      | [5.0/user_interface](https://developer.blender.org/docs/release_notes/5.0/user_interface/)                                                                                                                                                         |

Smaller UI shifts that change how steps look: menus searchable by typing (4.0); object/mode overlays
split into two popovers (4.0); Inter UI font (4.0); menus stay open until a click closes them (5.0);
nodes are flatter, group nodes lose their header icon, socket shapes carry new meaning (5.0);
sidebar tabs always visible (5.2); aligned area edges no longer move together without `Shift` (5.2);
Properties tabs can be hidden (4.5). [release notes]
([4.0/user_interface](https://developer.blender.org/docs/release_notes/4.0/user_interface/),
[4.0/viewport](https://developer.blender.org/docs/release_notes/4.0/viewport/),
[5.0/user_interface](https://developer.blender.org/docs/release_notes/5.0/user_interface/),
[5.2/user_interface](https://developer.blender.org/docs/release_notes/5.2/user_interface/),
[4.5/user_interface](https://developer.blender.org/docs/release_notes/4.5/user_interface/))

---

## 20. The 10 deltas that matter most for the skills

1. **Brush assets (4.3):** brushes are Essentials assets, activated with
   `bpy.ops.brush.asset_activate(... relative_asset_identifier="brushes/essentials_brushes-mesh_sculpt.blend/Brush/<Name>")`;
   many names changed (Crease Polish, Scrape/Fill, Pinch/Magnify, Elastic Grab, Density);
   Flatten/Fill/Scrape are one `PLANE` type. [verified]
2. **Brush size is a diameter (5.0)** and brush/automasking/unified settings moved
   (`sculpt_brush_type`, `stroke_method`, `mesh_automasking_settings`, per-mode unified settings,
   `mesh.radial_symmetry`). [verified]
3. **Auto Smooth is gone (4.1):** use `object.shade_auto_smooth` (Smooth by Angle modifier) or
   `shade_smooth_by_angle`; normals from `mesh.corner_normals`. [verified]
4. **Principled BSDF v2 (4.0):** renamed sockets, access by name; Emission Strength defaults to 0
   with a white color. [verified]
5. **EEVEE Next (4.2):** Render Method replaces Blend Mode, bloom is a compositor Glare node,
   AO/SSR/soft-shadow toggles replaced by ray tracing and per-light jitter; engine id is
   `BLENDER_EEVEE` again in 5.x. [verified]
6. **Compositor as node group (5.0):** `scene.compositing_node_group`, Group Output instead of
   Composite, `ShaderNode*` math/mix/ramp nodes, options as inputs. [verified]
7. **Output `media_type` (5.0):** set `image_settings.media_type='VIDEO'` before any FFmpeg
   settings. [verified]
8. **Slotted Actions (4.4) + legacy Action API removed (5.0):** channelbags via
   `bpy_extras.anim_utils`; reassigned actions need `action_slot`; no multi-layer animation yet in
   5.2.1. [verified]
9. **Bone collections (4.0) and pose-bone select/hide (5.0):** no layers or bone groups;
   `arm.collections`, `bone.color`, `pose.bones[n].select`. [verified]
10. **Grease Pencil v3 (4.3, renamed 5.0):** `GREASEPENCIL` objects, `bpy.ops.grease_pencil.*`,
    `frame.drawing` attributes, regular modifiers, `fill_id` fills (5.1). [verified]

Runners-up worth a line in every skill: AgX default and renamed color spaces (`Linear Rec.709`,
`Non-Color`); I/K keying change; UV sync select on by default and explicit `method=` for unwrap;
add-ons moved to Extensions (enable Node Wrangler/Rigify explicitly); GN modifier inputs through
`md.properties.inputs` (5.2); keymaps unavailable in background mode.
