# Sources of scenario-zbrush-pose-print

Each line: source, who, credential, where, what it is best for, best timestamps. Notes are in the
project's `notes/posing/` and `notes/3d-print/`; the batch digest is
`notes/posing/_digest_print_pose_render.md`; version facts come from
`sources/zbrush-version-deltas.md`.

## Revisions

- 2026-09-24, v1: first build (snapshot in `skills/_versions/zbrush-pose-print v1 2026-09-24/`,
  tests in its `tests-code/`).
- 2026-09-24, v2, refactor after the Z5 blind grade (`tests/grading/Z5_grade.md`): taught the items
  missing from both answers (Auto Groups and Move Topological in the TPose mesh, the Gizmo deformer
  warning with a point-order guard, the clean project and ZPR save, Gaboury's full hollow chain, the
  brief box with one-call resize, masks and re-pre-process for Decimation Master, thickening from
  the inside, the seam evened under the mask, linear layer blending, detail sized to the print, the
  Transpose caliper, mold rules) and fixed the graded errors (a carried weapon re-placed by one
  rotation, now kept in the TPose mesh or given its carrier's whole transform and gated by
  `follows`; "the SDK has no modifier clicks", now: `press_key` is documented but marked "Does not
  work, hidden for now" in the installed stub and reported unreliable with `canvas_click`; From
  Thickness asks, the wrapper refuses). New code in `zb_pose.py` and `zb_print.py` with offline
  tests; live checks added to `live_p05`, `live_p07` and the new `live_p08`, not yet run in ZBrush.
  Also fixed: the v1 hollowing snippet and `live_p05` pressed MergeDown with the insert active, the
  last SubTool, which has nothing below it to merge with.

## Evidence produced by this project

- Offline tests `tests/code/zbrush-pose-print/test_zb_print.py` and `test_zb_pose.py`, results in
  `offline_results.json` (2026-09-24: 42 pass in v1, 57 in v2, Python 3.14 with numpy; synthetic
  meshes, the fake `zbrush.commands`, and the real v03 ZBrush export
  `tests/code/zbrush-expert/fixtures/v03_sphere.obj`). Best for: what the measuring and planning
  code is known to do.
- Live tests `tests/code/zbrush-pose-print/live_p01..p08` with `run_live.sh`: written, not yet run
  in ZBrush (p08 and the p05, p07 additions from the v2 refactor). Best for: the exact questions
  still open (plugin control return, bound rigs, signs, dialogs).
- ZBrush 2026.2.1 UI string resources, read-only:
  `/Applications/Maxon ZBrush 2026/ZData/ZLang/english/UInterface.zsc` (read 2026-09-24). Best for:
  labels that exist in this build (TPose|SubT, Proxy Pose buttons, From Thickness with Min
  Thickness, Max Thickness, Ball, Ray, Max Thickness Polygons, 3D Print Hub Export to 3MF, Scale
  Master and Decimation Master item paths, Intersection Masker, Tool:Layers:New, Tool:Export:Grp;
  added in v2: Load Tool, Load Tools From Project, MoveUp and MoveDown, Groups Split, Mask By
  Cavity, Mask PeaksAndValleys, Group Front, Draw Draft Analysis, MaskByDraft, Bend Arc, Bend Curve,
  Twist, Taper).
- Install listing, read-only (2026-09-24): `Lightbox/Projects/` has `DefaultProject.ZPR` and
  `Cube.ZPR` but no `DefaultCube.ZPR` (the doc's clean project);
  `ZData/BrushPresets/Move Topological.ZBP`; `ZData/Macros/Misc/Toggle Mask By Polygroups.TXT` (sets
  `Brush:Auto Masking:Mask By Polygroups` to 100). Best for: the clean-project default and
  stroke-free masking options.
- ZBrush Activity logs
  `~/Library/Preferences/Maxon/ZBrush_03C27D49/Logs/Activity/Activity 2026-09-24-05-20-14.txt` and
  later. Best for: preference values on this Mac (Rotation Steps 18, Mask Blur Strength 24,
  Transpose Units, Max Thickness Polygons 8) and canonical paths such as
  `Zplugin:3D Print Hub:Y(mm)`.
- Shipped macros `/Applications/Maxon ZBrush 2026/ZData/Macros/` (Maxon): `GrpUnMasked.TXT` (HidePt,
  ShowPt, Group Visible), `Snap To Ground.TXT` (Y Size, Y Position),
  `Misc/Append a QCube Subtool.TXT` (Append, PopUp:PolyMesh3D, Initialize),
  `Misc/Center Mesh to World.TXT`. Best for: known-good 2026 item paths.
- ZBrush Python SDK 2026 stub and examples,
  `/Applications/Maxon ZBrush 2026/Documentation/python-api/` (Maxon SDK team, Ferdinand Hoppe):
  `add_zsphere`, `set_zsphere`, `get_zsphere`, `edit_zsphere`, `delete_zsphere`, `get_transpose`,
  `set_transpose` (origin plus direction, not two points), `set_subtool_status` (toggle logic),
  `query_mesh3d`, `is_polymesh3d_solid`, `press_key` (its docstring: "Does not work, hidden for
  now"); `examples/modeling/_ex_mod_zsphere_biped.py` (WIP rig builder, delete children in reverse),
  `ex_mod_subtool_export.py` (SubTool name from the tool path). Best for: rigs by code and checks.
- Lead skill scenario-zbrush-expert: `zb_launch`, `zb_ops`, `zb_audit`, `zb_review`, `zb_stroke` and
  the v01 to v03 bridge evidence. Best for: everything that talks to ZBrush.

## Experts

- **Paul Gaboury**, Pixologic Lead Product Development Manager (now Maxon), freelance toy artist for
  Hasbro, Disney Consumer Products and Topps; "Using ZBrush for 3D Printing: The Creative Process",
  Gnomon live event hosted by Josh Herman, 2020-05-05, https://www.youtube.com/watch?v=W9P5YmLGBj0.
  Best for: scale first, Scale Master, hollowing a light copy, cups and vents, snap joints, Boolean
  folders, decimation by eye. Timestamps: bounding box [00:21:43], Scale Master [00:29:45] to
  [00:41:05], DynaMesh for the shell copy [00:56:58], "never hollow the 9 million" [00:57:33],
  Create Shell [01:03:10] to [01:10:32], inner shell as subtract [01:13:48], thin ends [01:15:30],
  decimation [01:11:40] [01:22:53], masks and Tessimate [01:30:30], cups [01:35:21], snap joints
  [01:40:38] to [01:53:44], folders [02:05:48].
- **Paul Bennett**, digital product designer, Hasbro sculpture department (Star Wars Black Series);
  "Hasbro Toys: Star Wars Rey Skywalker Toy and More with ZBrush", ZBrush Summit 2019,
  https://www.youtube.com/watch?v=P08kuTIRziE. Best for: production constraints, minimum walls, the
  0.12 mm offset and its calibration, scale with shrink, articulation from spheres and cylinders,
  molding checks. Timestamps: walls [00:10:57] [00:16:46], offset [00:37:55] [00:53:04] to
  [00:56:51], scale [00:12:54] [00:17:51], articulation [00:07:36] [00:40:08], elbow range
  [01:06:02], decimate early [00:25:28], parting line [01:24:32].
- **Alex Carratala**, sculptor of about 90 mm collectibles (Kimera Models; credentials beyond the
  article unverified); "The Rules and Intricacies of Sculpting Miniatures in ZBrush", 80.lv,
  2023-08-21, https://80.lv/articles/the-rules-intricacies-of-sculpting-miniatures-in-zbrush. Best
  for: the miniature order of operations (pose first, cuts in mind, cut, decimate, scale, STL),
  scale awareness.
- **Pablo Munoz Gomez**, 3D concept and character artist, founder of Pablander Academy, ZBrushLIVE
  streamer; "A very cool trick to pose characters in and outside ZBrush", 2021-05-24,
  https://www.youtube.com/watch?v=oxyKKr4aHPY. Best for: lowest-level posing, Transpose Master with
  Auto Groups, the external rig round trip onto a layer. Timestamps: lowest level [00:07:44], seam
  cleanup [00:08:16], Transpose Master [00:14:00] to [00:22:24], same mesh rule [00:39:55], layer
  import [00:42:34] to [00:44:44], layers record at the top [00:45:23], linear interpolation
  [00:50:20].
- **Michael Pavlovich**, Director of Character, Weapon and Vehicle Art at Certain Affinity (Halo,
  Call of Duty, DOOM), ZBrushLIVE streamer; "Proxy Pose ZBrush 2023.1 with ZSphere Rigging",
  2023-04-02, https://www.youtube.com/watch?v=irnuxmVuF1Y. Best for: Proxy Pose plus ZSphere rig on
  a DynaMesh, rig placement rules, Adaptive Skin settings for Overwrite Pose. Timestamps: copy with
  the same order [00:01:03], placement [00:02:01] to [00:03:36], bind [00:08:00], rig fixes
  [00:09:33] to [00:12:50], rotations only [00:13:58], Adaptive Skin and Overwrite [00:15:50] to
  [00:16:53].
- **Marco Plouffe**, co-founder and art director of Keos Masons, sculptor for Sideshow Collectibles,
  Prime 1 Studio and XM Studios; "How a Master ZBrush Artist Sculpts and Poses a Character", Outgang
  excerpt, 2022-12-05, https://www.youtube.com/watch?v=lakCNFUOQlI. Best for: collectible pose order
  and time budget, equal level-1 density, primitives unstretched, economy by viewing distance.
  Timestamps: blockout pose [00:15:25], final pose [00:25:45] [00:26:18], plate groups [00:27:24],
  density [00:28:30] to [00:30:41], primitives [00:32:49] [00:33:55], economy [00:18:51] [00:23:15].

## Maxon documentation

- Posing pages of the ZBrush 2026 help (Gizmo topology masking, one-touch polygroup masking, Gizmo
  with multiple SubTools, Transpose, Transpose Master, Proxy Pose, rigging), saved as
  `sources/docs/paint-pose-render-print__posing-transpose-master-zsphere-rig.md`, e.g.
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/zbrush-plugins/transpose-master/transpose-master.html
  and
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/posing-your-model/proxy-pose/proxy-pose.html.
  Best for: button names and the two TPoseMesh warnings.
- 3D printing pages (3D Print Hub, Scale Master, Decimation Master, Ready for Print, PolyPaint From
  Thickness, Draw Draft Analysis, Mask by Draft), saved as
  `sources/docs/paint-pose-render-print__3d-print-hub-scale-decimation.md`, e.g.
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/ready-for-print/polypaint-from-thickness/polypaint-from-thickness.html.
  Best for: units, export formats, From Thickness ranges, decimation rules.
- Tool palette reference for Deformation (Offset in percent of the tool's unit radius, Rotate,
  Size), saved as
  `sources/docs/hard-surface__zbrush-ref-tool-palette-geometry-deformation-subtool.md`. Best for:
  rigid moves by slider.
- Release notes and What's New (via `sources/zbrush-version-deltas.md` sections 2, 3.8, 3.11). Best
  for: Proxy Pose 2023.1, Transpose Classic 2024, Transpose Master fix 2025.2, 3MF fixes 2026.0.1
  and 2026.2.1, Scale Master fixes, Decimation Master 100M.

## Sister skills named in handoffs

- scenario-blender-rigging (Blender Expert Skills team): numeric bone posing with automatic weights
  for route A.
- scenario-maya-expert: the same round trip through Maya if the studio pipeline is Maya.
