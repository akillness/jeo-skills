# Sources of scenario-zbrush-retopology-export

Revision 2026-09-24 (v2, after the blind grades `tests/grading/Z4_grade.md` and `Z6_grade.md`; v1
kept in `skills/_versions/zbrush-retopology-export v1 2026-09-24/`): added the neutral-face,
ears-and-hands, Close Holes before ZRemesher, Alt+ZRemesher (computer use), Retry return, snap-back,
danger-zone and eye-protection, top-first projection with nets, Colorize for color passes, morph
target before bakes, `create_normal_map` world-space, DynaMesh polypaint versus polygroups,
MergeDown-not-MergeVisible, scripted plugs and orientation-branch teachings; corrected the FBX
dialog claim, the hole gate after DynaMesh and the `#Auto scale` evidence; projection now runs
through the lead's safe `zb_ops.project_all`. New sources below: FlippedNormals Zp07GW3rND0,
Pavlovich 8kWFv1cZlCE and aR02CwyPTUw, Pablo Logic Parts 3 and 8, the DynaMesh doc (all under
`notes/sculpting/` or `notes/fundamentals/`).

Each entry: source, who, credential, where, what it is best for, best timestamps. Notes live in the
project's `notes/retopology-uv/`, `notes/maps-export/` and `notes/pipeline/` (digests:
`_digest_topology_maps_export.md`, `_digest_retopology_visual.md`).

## Evidence from this install (highest weight for paths and labels)

- `/Applications/Maxon ZBrush 2026/ZData/ZLang/zcommands/commands.xml` (2026.2.1, dated 2026-06-01):
  2,357 command ids with full item paths, e.g. `Tool:SubTool:ProjectAll`,
  `Tool:Geometry:Close Holes`, `Tool:Geometry:Legacy (2018)`, `Transform: Pf`. Best for: `[cmdxml]`
  path evidence. Read only.
- `/Applications/Maxon ZBrush 2026/ZData/ZLang/english/UInterface.zsc` (UI strings): plugin items
  stored as `Zplugin:[Decimation Master]:Freeze borders`, the Multi Map Exporter option groups
  (`[Options]:[Displacement Map |]:Mid`), Substance Bridge labels (Auto-Bake, Force Auto-Unwrap),
  FBX versions to 2020, help strings (Tool > Export Mrg = "Merge Uv Cords"). Best for: `[uistr]`
  label evidence. A string proves the label exists, not the path form.
- `/Applications/Maxon ZBrush 2026/ZData/Macros/Delete.TXT`: the shipped macro answers the SubTool
  Delete confirmation with `[IKeyPress,'2',[IPress,Tool:SubTool:Delete]]`.
- `tests/code/zbrush-expert/fixtures/v03_sphere.obj` (ZBrush 2026.2.1 export, 2026-09-24): header
  `#Auto scale x=1.000000 y=1.000000 z=1.000000`, `#Auto offset x=0.000000 ...`, one `g Group10389`.
  Best for: what ZBrush writes in an OBJ (`[obj]`). The `#Auto scale` line is observed in this file,
  not documented in any note: live_rx_05 confirms it carries a non-1 Export Scale.
- README "Agent bridge into ZBrush", "Side channels": AppleScript System Events (Accessibility
  allowed) clicks ZBrush dialogs on this Mac, a candidate route for the FBX options window [verify].
- Commands.xml also lists `Tool:SubTool:MoveUp` and `MoveDown` (used by `move_subtool`),
  `Tool:Morph Target:DelMT`, `Tool:Layers:New`, `Tool:Geometry:X Position` to `Z Position`,
  `Tool:Visibility:Grow` and `ShowPt`, `Tool:Masking:MaskAll`.
- ZBrush Activity log
  `~/Library/Preferences/Maxon/ZBrush_03C27D49/Logs/Activity/Activity 2026-09-24-05-20-14.txt`:
  canonical short paths (`Tool:Geometry:Resolution`), plugin sliders set at startup
  (`Zplugin:3D Print Hub:Y(mm)`).
- SDK stub `/Applications/Maxon ZBrush 2026/Documentation/python-api/api/zbrush/commands.py` (also:
  `press(item_path)` has no modifier argument, so Alt-clicks are computer-use steps;
  `locate_subtool_by_name`; `is_enabled`) and examples
  (`examples/modeling/ex_mod_subtool_export.py`,
  `fragments/zbrush.commands.set_subtool_status.0.py`):
  `create_normal_map(..., local_coordinates=False)` = world space; displacement needs UVs and the
  lowest level; `query_mesh3d` 3 to 8 (UV bbox, tiles, per-tile counts and areas); SubTool name from
  `get_active_tool_path()`; status flags written as absolute values.
- `sources/zbrush-version-deltas.md` (project): 2026 version facts (Retopo brush 2026.1, Substance
  Bridge 2026.2, UV Master Polygroups fix 2026.2.0, Cmd+W quits).
- Lead skill toolkit and tests (`<skills>/scenario-zbrush-expert/scripts`,
  `tests/code/zbrush-expert`): the proven bridge, dialog-free OBJ export, `zb_audit`; the
  distiller's `archive/tests/retopology_visual/topo_qa.py` (ring test, reused in `rx.topo_report`).

## Maxon official documentation (help.maxon.net, 2026 help)

- ZRemesher guide (13 pages: V3, 4.0, Introduction, Using Curves, Adaptive Size, Partial Mesh,
  Symmetry, Hard Surfaces, High Polycounts, Spirals, Transferring Detail, Tips and Tricks,
  reference),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/topology/zremesher/zremesher.html
  (4.0: .../zremesher-4-0/zremesher-4-0.html; Transferring Detail:
  .../transferring-detail/transferring-detail.html). Best for: option semantics, the Retry cache
  rules, the 8M-vertex limit, both detail-transfer recipes, the Legacy contradiction.
- Retopo brush pages 01 to 07, Topology, Topology Brush, ZSphere Topology,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/topology/Retopo/01-retopo.html.
  Best for: when manual beats ZRemesher, the 10k to 20k animated-head target, gestures, patches,
  legacy tools.
- Subdivision Levels, Project UndoHistory, Tool > SubTool and Tool > Geometry reference,
  https://help.maxon.net/zbr/en-us/Content/html/reference-guide/tool/polymesh/subtool/subtool.html
  and .../geometry/geometry.html. Best for: Project All parameters, Close Holes, Mesh Integrity,
  Freeze, Reconstruct Subdiv, Unweld Group Border.
- UV Master, UV Master Unwrap Tutorials, UV Mapping, UV Map Unwrap, Tool > UV Map,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/zbrush-plugins/uv-master/uv-master.html
  and .../uv-mapping/uv-map-unwrap/uv-map-unwrap.html. Best for: polycount ceiling, Protect and
  Attract rules, Work on Clone, control-map pitfalls, Flatten limits, native unwrap options.
- Multi Map Exporter, Exporting Your Model, Displacement, Normal, Vector Displacement and Texture
  maps, Tool > Displacement Map and Normal Map references,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/zbrush-plugins/multi-map-exporter/multi-map-exporter.html.
  Best for: Mid and Scale per bit depth, UDIM naming, Get Scale, Switch MT, vector displacement
  diagnostics, the ESC warning.
- Decimation Master, its preferences, 3D Print Hub,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/zbrush-plugins/decimation-master/decimation-master.html.
  Best for: the pre-process model, memory costs, masks and polygroups, cache pitfalls.
- Tool > Export and Import, Preferences > Importexport, FBX ExportImport and settings, Texture >
  Substance Bridge, Scale Master, GoZ pages, SubTool Master,
  https://help.maxon.net/zbr/en-us/Content/html/reference-guide/tool/polymesh/export/export.html,
  .../zbrush-plugins/fbx-exportimport/fbx-settings/fbx-settings.html,
  .../reference-guide/texture/substance-bridge/substance-bridge.html,
  .../zbrush-other-programs/goz/restrictions/restrictions.html,
  .../zbrush-plugins/scale-master/scale-master.html. Best for: export switches, axis presets ("If in
  doubt then MayaYUp"), GoZ restrictions, Substance Bridge options, Scale Master units, ScaleOffset
  (per-SubTool export values).
- Maxon developer forum, ZBrush SDK category,
  https://developers.maxon.net/forum/category/55/zbrush-sdk. Best for: the FBX Export Options window
  that script cannot escape; no SubTool rename API.

## Experts

- Joseph Drust, Pixologic then Maxon support and #AskZBrush presenter. ZRemesher control:
  https://www.youtube.com/watch?v=0TlG4Ex9lQA (partial remesh, levels lost [00:02:26]),
  https://www.youtube.com/watch?v=8D-xqasgUws (Keep Groups, Smooth Groups [00:02:17], Frame Mesh
  [00:03:41]), https://www.youtube.com/watch?v=IpTYcGxxsdM (curves at 100 [00:02:56], polygroups
  preferred [00:04:02], Edgeloop Masked Border [00:05:08]),
  https://www.youtube.com/watch?v=Kjce71jjWJU (symmetry mirror and weld [00:01:11]),
  https://www.youtube.com/watch?v=N1WABlp45ts (ZSphere edits of ZRemesher output). Reprojection:
  https://www.youtube.com/watch?v=R2MzFqWMaWY (duplicate, divide, project [00:02:16 to 00:03:52]),
  https://www.youtube.com/watch?v=_ips3GhWI0s (quads for rigging, polypaint last [00:05:25]),
  https://www.youtube.com/watch?v=nxMYYsyJt3o (Dist 0.1 [00:02:19], StoreMT, engulf [00:02:52 to
  00:07:11]), https://www.youtube.com/watch?v=NrsuP4Vj4Lg (Freeze SubDivision Levels [00:01:17]).
  UVs: https://www.youtube.com/watch?v=tl_FOvZOqHU (relaxing a flattened clone [00:03:19]). Maps:
  https://www.youtube.com/watch?v=n0qqpwvn-jA (same-SubTool rule [00:01:14]),
  https://www.youtube.com/watch?v=2zDAtaQqwh8 (level filters frequency [00:02:53]),
  https://www.youtube.com/watch?v=RYGkbSUaHHg (Color ID, Unweld [00:03:24]),
  https://www.youtube.com/watch?v=ADIRhNlvXbI (HD Geometry export). Scale:
  https://www.youtube.com/watch?v=n2xPrwI9o1U (Export Scale math [00:04:19]),
  https://www.youtube.com/watch?v=fiIVK6t-2x0 (scan sizing, 63 mm pupils [00:03:27]),
  https://www.youtube.com/watch?v=YrD29hiokJo (STL at scale, no units [00:05:21]). Decimation:
  https://www.youtube.com/watch?v=mRfA_WDvvrg (keep polygroups [00:02:35]). Cleanup:
  https://www.youtube.com/watch?v=PrFQXjs_6_w (single-sided scan to clean sculpt, the Z6 base
  [00:00:42 to 00:20:58]), https://www.youtube.com/watch?v=udiPVJIODX0 (filling holes, deleting
  fills [00:04:30]). Best for: button-level behavior and the official numbers.
- Paul Gaboury, Pixologic then Maxon ZBrush staff, #AskZBrush.
  https://www.youtube.com/watch?v=34D6VljTjBs (ZRemesher is not for detail [00:00:39], counts for an
  arm [00:02:18], Project History [00:04:20]), https://www.youtube.com/watch?v=pQbPtH0p5Bg
  (ProjectionShell and Inner, Dist 1 [00:02:30 to 00:03:02]),
  https://www.youtube.com/watch?v=cemmalvugFk (UVs on a subdivided mesh, Work on Clone [00:04:00 to
  00:07:28]). Best for: the alternatives to the duplicate route and UV Master on stacks.
- Ian Robinson, Maxon, #AskZBrush. https://www.youtube.com/watch?v=bVX9utHc_ZI (Keep Polypaint off
  by default [00:01:17]), https://www.youtube.com/watch?v=bICt_XruvQM (Scale Master). Best for:
  plugin defaults.
- Michael Pavlovich, games sculptor (Halo 4, Halo MCC, Call of Duty, Doom), Maxon ZBrushLIVE
  "Pavlovich Workshop" host, CGMA instructor. ZBrush Topology: Face, Body, Whatever! (2023-11-05)
  https://www.youtube.com/watch?v=n5_cZK-9peg (delete and rebuild [00:21:36], border smoothing
  [00:05:27, 00:15:18], Smooth Groups 0 [00:17:08], overshoot frames [00:18:50, 00:22:09], ears and
  hands [00:44:36], density colors [01:01:32], eye icon and Solo [01:07:26], shrink-wrap values
  [00:54:08]); UV Map Unwrap and crease seams (2023-01-17)
  https://www.youtube.com/watch?v=cvqoVUX5aBw (Crease PG [00:03:49], Crease Shortest Path
  [00:05:26], seams out of sight [00:06:00]). Best for: production judgment on ZRemesher and
  explicit seams.
- Pablo Munoz Gomez, ZBrushGuides founder, Maxon ZBrushLIVE presenter, Retopo brush beta tester. The
  fastest way to retopo in ZBrush 2026 (2026-01-30) https://www.youtube.com/watch?v=I4nePXDTrhQ (Yes
  or No [00:05:59 to 00:07:09], visible SubTools [00:08:33], Space [00:12:46], loops first
  [00:16:26], patches [00:29:38], "whatever works" [00:32:18]); Understanding ZBrush's Logic Part 7
  https://www.youtube.com/watch?v=rArw79xEpvE (5 gave 4,963 [00:03:16], never divide a DynaMesh
  [00:09:44]). Best for: the 2026 manual route and the production order.
- FlippedNormals (Henning Sanden and Morten Jaeger, ex-MPC and ex-Framestore film artists). ZBrush
  to Arnold 32-bit displacement UDIM (2018-04-02) https://www.youtube.com/watch?v=-ThBTEc8L_M (MME
  switches with reasons [00:04:09 to 00:14:22], Grp off [00:15:08], Arnold setup [00:17:29 to
  00:20:35], bad geometry causes most issues [00:21:41]); Working with ZBrush and Substance Painter
  (2019-05-31) https://www.youtube.com/watch?v=p56N-dN11zY (decimated high to Painter [00:00:42],
  polygroups as texture sets [00:03:46], smooth normals [00:06:03], ID map [00:09:45]); ZBrush to
  Blender with GoB https://www.youtube.com/watch?v=2-pFspCbykk (via the lead's sources). Best for:
  film displacement and the Painter handoff.
- Laura Gallagher, Outgang; former Lead Character Artist at Eidos Montreal (Deus Ex: Mankind
  Divided) and Guerrilla Games, CGMA instructor. How does ZBrush deal with units and scale?
  (2021-10-05) https://www.youtube.com/watch?v=EXjfH_X2hkM (no units [00:04:27], DynaMesh and scale
  [00:11:41], Export Scale and the readout [00:19:46], Unify vs MultiAppend [00:27:16], 1 to 4
  [00:28:23], offsets [00:33:04], MultiAppend fix [00:38:48]). Best for: the two-scales model and
  safe rescaling.
- FlippedNormals, Reprojecting Details in ZBrush: Top Production Tip (2018-09-10)
  https://www.youtube.com/watch?v=Zp07GW3rND0 (note in `notes/sculpting/`): Store MT then New Layer
  at the top level [00:02:13], staged projection from level 1 [00:03:17], eye protection by a grown
  eye-interior group [00:05:31], Morph brush not smoothing [00:06:36], danger zones and hard lines
  in displacement [00:07:10, 00:07:43], local reprojection [00:09:27]. Best for: projection safety
  and repair.
- Michael Pavlovich, Masking Basics (2021-03-19) https://www.youtube.com/watch?v=8kWFv1cZlCE
  (polypaint lost when DynaMesh ran with Colorize off [00:20:06]) and Materials, MatCaps and Lights
  (2021-03-19) https://www.youtube.com/watch?v=aR02CwyPTUw (Red Wax [00:03:32], Standard material
  and a moving light for form reading [00:04:07, 00:04:39]); notes in `notes/sculpting/`. Best for:
  the DynaMesh color trap and cleanup review materials.
- Pablo Munoz Gomez, Understanding ZBrush's Logic Part 3 (2025-12-07)
  https://www.youtube.com/watch?v=gitoJ7B8FmY (MergeVisible makes a new tool, MergeDown merges in
  the tool [00:03:31, 00:04:11]; brush-free blockout with primitives [00:05:26]) and Part 8
  (2025-12-31) https://www.youtube.com/watch?v=VRisbJQAaZw (Sculptris Pro for local resolution
  [00:10:41, 00:11:53], target points at least the source's [00:17:24]); Part 7 level discipline
  [rArw79xEpvE 00:12:28 to 00:14:16]; notes in `notes/fundamentals/`. Best for: merges, local
  rebuilds, projection density, handover rules.
- Maxon DynaMesh, Sculptris Pro and Subdivision documentation,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/modeling-basics/creating-meshes/dynamesh/dynamesh.html
  (note `notes/sculpting/fundamentals-sculpting__dynamesh-sculptris-subdivision`): "PolyGroups >
  Important" (polypaint on keeps polypaint instead of polygroups), DynaMesh deletes UVs (convert
  textures to polypaint first). Best for: what survives a remesh.
- Polycount wiki (game-art practitioners, pages credited to Eric Chadwick, Joe "EarthQuake" Wilson
  and others), http://wiki.polycount.com/wiki/Texture_Baking,
  http://wiki.polycount.com/wiki/Normal_map, http://wiki.polycount.com/wiki/Displacement_map,
  http://wiki.polycount.com/wiki/ReTopologyModeling. Best for: external baking, triangulation, flat
  color 128/128/255, "assume all tutorials are incorrect until you can verify".

## Sister skills used for shape and handoffs

- scenario-zbrush-expert (lead): protocol, toolkit, dialog budget, 2026 traps.
- scenario-maya-retopology-uv, scenario-maya-lookdev (Maya Expert Skills project): what the Maya
  side expects (cm, Y-up, eyes separate, no n-gons; displacement zero value and scale recorded).
- scenario-blender-uv-baking (Blender Expert Skills project): `bake_high_to_low` for game normals in
  MikkTSpace; Normal Map node convention.
- scenario-3d: GLB outputs of text-to-3D and image-to-3D; part segmentation and remesh utilities
  upstream.
