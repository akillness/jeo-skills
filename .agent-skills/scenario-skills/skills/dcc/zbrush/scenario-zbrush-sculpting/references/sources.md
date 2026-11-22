# Sources of scenario-zbrush-sculpting

Each line: source, who, credential, where, what it is best for, best timestamps. Per-source notes
live in `notes/sculpting/` and `notes/fundamentals/`; the digests are
`notes/sculpting/_digest_sculpting_tools.md`, `notes/sculpting/_digest_sculpting_workflow_visual.md`
and `notes/fundamentals/_digest_fundamentals_logic_files.md`. Version facts:
`sources/zbrush-version-deltas.md`.

## Revisions

- 2026-09-24 v1: first build (kept in `skills/_versions/zbrush-sculpting v1 2026-09-24/`).
- 2026-09-24 v2, round 1 refactor from the blind grades Z1 (missing from both, risks) and Z6
  (missing from both, item 1): subdivision discipline for the final stage (when to leave DynaMesh,
  never Divide a DynaMesh, SDiv 1 for big moves, 2 or 3 for secondary, never all at the top:
  `level_for`, `set_level_code`, P15); safe reprojection referenced to the toolkit's
  `zb_ops.project_all(checkpoint=...)` (StoreMT, New Layer, gate, `morph_repair`) instead of this
  skill's own checkpoints (P11, live_s07 updated); checked re-DynaMesh with mask cleared, Draw mode
  and polypaint off when polygroups must survive (`remesh_code`, P16); Morph Target lifetime guard
  (`dial_code(expect_points=)`); LazyMouse off by default for scripted strokes; perspective path
  fixed to `Draw:Perspective` (`PERSP_PATHS`) and a perspective look render (`persp_snapshot_code`);
  eyes as spheres wrapped by lids and turned outward (P17); Standard for edges and ClayBuildup
  erasing detail; symmetry per SubTool; MergeDown vs MergeVisible; installed item ids from
  commands.xml in P1 and gui-paths. Tests: 45 offline (was 38), live_s08 added (not yet run in
  ZBrush).

## Evidence produced by this project (highest weight: it ran on this install or on its files)

- Installed command list `/Applications/Maxon ZBrush 2026/ZData/ZLang/zcommands/commands.xml` (read
  2026-09-24): ids such as `Draw:Perspective`, `Transform: Pf`, `Transform:Draw Pointer`,
  `Tool:Polypaint:Colorize`, `Tool:Morph Target:Morph`, `Tool:Layers:Intensity`,
  `Tool:SubTool:MergeDown`, `Stroke:LazyMouse`, `Stroke:Stroke Jitter`, `Stroke:SculptrisPro`. It
  lists no brushes or materials and no `Transform:Persp`. Best for: which item ids exist ([xml] in
  the references); exists() through the bridge stays the proof.
- scenario-zbrush-expert bridge tests v01 to v03 (`tests/code/zbrush-expert/v0N_*`, 2026-09-24,
  ZBrush 2026.2.1 build 53205). Best for: synthesized V02 strokes sculpt (v02: 11 points, volume
  4.189 to 4.193), Draw Size 64 and Z Intensity 20 defaults, the item paths that exist.
- `tests/code/zbrush-expert/fixtures/v03_sphere.obj` and `v03_canvas.png`, measured offline for this
  skill: DynaMesh 128 on the default sphere = 44,020 faces, 43,480 points, area 12.63, K = 1.063;
  the front-view projection at 207 px per unit with pivot (0, 0, 0) matches the canvas silhouette at
  IoU 0.98 (x 352 to 767), while the post-stroke bbox center as pivot misses by about 4 px
  vertically [pivot question: live_04]. Best for: DynaMesh estimates, the Scene fixture of
  `test_zb_sculpt.py`.
- `tests/code/zbrush-sculpting/` offline tests (45, passed 2026-09-24 after the round 1 refactor; 38
  in v1) and `dryrun_live.py` (live_s01 to live_s08 executed against a fake ZBrush without Python
  errors). Not ZBrush evidence.

## Experts

- Henning Sanden (ex-MPC modeling and texturing) and Morten Jaeger (ex-Framestore modeler),
  FlippedNormals founders:
  - Learn to Sculpt Like a Pro in ZBrush (2018), https://www.youtube.com/watch?v=0PaYUUvgwYM. Best
    for: pressure at 30 % [00:04:58], across the form [00:02:13 to 00:03:19], refinement instead of
    smoothing [00:08:51, 00:09:57], polycount ladder on screen (frames 00:00:45, 00:07:30,
    00:18:49), Dam_Standard at 15 with varied pressure [00:18:42, 00:20:55], contrast stage
    [00:23:39], dominance [00:25:49], Standard for specificity [00:27:26], ClayBuildup no alpha
    finish [00:31:28].
  - The Only 6 Brushes You Ever Need in ZBrush (2020), https://www.youtube.com/watch?v=TpS0QdlfHWU.
    Best for: the six brushes with settings (frames 00:02:15 to 00:15:45), eyes with perspective on
    and lids wrapping the eyeball [00:17:28 to 00:18:33], Move then DynaMesh [00:02:34], ClayBuildup
    erases what is under it [00:07:44], Smooth Stronger at 30 [00:14:53], TrimDynamic as the Shift
    brush [00:16:24], DynaMesh ladder 128/376/648 (frames 00:14:16, 00:18:45, 00:21:27), intensity
    descent 23, 13, 3, 1 [00:21:53 to 00:22:58].
  - Top Tips for Sculpting in ZBrush (2020), https://www.youtube.com/watch?v=G2o6fdoACIQ. Best for:
    seven stages and never skipping a frequency [00:00:19], all elements early [00:02:50], mid
    frequency as the backbone [00:05:46], pores two levels early [00:08:17], across vs along
    [00:10:08], silhouette stability [00:14:09 to 00:17:27].
  - Reprojecting Details in ZBrush (2018), https://www.youtube.com/watch?v=Zp07GW3rND0. Best for:
    about 3M before Project All [00:01:02], Store MT and New Layer at the top level [00:02:13],
    Morph brush repair [00:04:27], danger zones [00:07:10].
- Pablo Munoz Gomez, 3D concept artist and educator, ZBrushGuides founder, Maxon ZBrushLIVE host:
  - Understanding ZBrush's Logic, Parts 1 to 8 (2025): Part 1 canvas and Edit mode
    https://www.youtube.com/watch?v=NckHjyO6GNk [00:12:20]; Part 2 primitives, Gizmo deformers,
    SubTools, symmetry per SubTool https://www.youtube.com/watch?v=RABWfzWNw0c [00:09:18, 00:21:39,
    00:27:02]; Part 3 parts in their own tools, Local Symmetry trap, ZSpheres and Adaptive Skin at
    Resolution 0 https://www.youtube.com/watch?v=gitoJ7B8FmY [00:05:26, 00:10:22, 00:17:35]; Part 4
    Move vs Move Topological https://www.youtube.com/watch?v=mVp_jNfEI3I [00:10:21]; Part 5 DynaMesh
    resolution relative to size, Groups, merge is not DynaMesh
    https://www.youtube.com/watch?v=FrqUnna1jns [00:13:40, 00:16:16, 00:23:25]; Part 6 six core
    brushes, lumpiness, Mirror then Mirror And Weld https://www.youtube.com/watch?v=9a9S1OcYHx4
    [00:02:34, 00:09:35, 00:10:11]; Part 7 ZRemesher targets, ZRemesher once the form is settled,
    never Divide a DynaMesh, level discipline https://www.youtube.com/watch?v=rArw79xEpvE [00:03:16,
    00:05:50, 00:09:44, 00:12:28, 00:14:16]; Part 8 Dynamic Subdiv, Sculptris Pro, projection
    density rule, polypaint on a flat material at the top level
    https://www.youtube.com/watch?v=VRisbJQAaZw [00:10:41, 00:13:49, 00:17:24, 00:23:40, 00:24:54].
    Part 2 also: MergeDown confirmation [00:24:54].
  - Dos and Don'ts when Sculpting in ZBrush (2025, ZBrush 2025.3),
    https://www.youtube.com/watch?v=tbQqC6tyDBQ. Best for: ZSpheres for proportion only [00:01:13],
    light skin (frame 00:01:58), big Move plus Smooth [00:02:29], primitives as SubTools [00:03:51],
    low DynaMesh early [00:04:38], two-direction clay building [00:05:22 to 00:06:32], sharp masks
    for Move [00:09:09], details do not fix a weak sculpt [00:12:50 to 00:14:05], feature details
    first [00:15:19].
- Michael Pavlovich, Director of Character, Weapon and Vehicle Art at Certain Affinity, Maxon
  ZBrushLIVE host, Intro to ZBrush (2021):
  - 015 Brush Strokes and Lazy Mouse https://www.youtube.com/watch?v=AdkZe1yKFTU. Best for:
    LazyMouse radius 1 swallows taps [00:03:31], radius 27 for designed lines [00:05:05], global
    Jitter and Imperfection [00:09:52], ClayBuildup stepping fixes [00:10:33 to 00:11:06], Focal
    Shift -100 stamps [00:08:17].
  - 017 Materials https://www.youtube.com/watch?v=aR02CwyPTUw. Best for: MatCap Gray, Red Wax,
    Chrome, moving light [00:01:26 to 00:04:39].
  - 019 Masking https://www.youtube.com/watch?v=8kWFv1cZlCE. Best for: mask plus Deformation Inflate
    [00:17:10], blur for falloff [00:17:44], depth mask [00:14:48], mask instead of polypaint
    [00:20:38].
  - 021 Polygroups https://www.youtube.com/watch?v=5JM1fb7wnTM [00:02:30]. 029 Transpose
    https://www.youtube.com/watch?v=9qLbeAapUH0 [00:14:08, 00:16:14]. 026 Splitting
    https://www.youtube.com/watch?v=TjGlVX4w1nM. 030 SubTool options
    https://www.youtube.com/watch?v=bBHqeaKNOzg. 005 ZTool and QuickSave
    https://www.youtube.com/watch?v=rEIoFEEgS80. 010 Hotkeys
    https://www.youtube.com/watch?v=1sYMoWz_Mk4 [00:02:50 block-in rhythm].
- Kris Costa, former lead creature modeler at ILM, portrait instructor, Realism Idealized (ZBrush
  Summit 2021), https://www.youtube.com/watch?v=j5XLtLMN0P8. Best for: hierarchy by viewing distance
  [00:08:12], ClayBuildup respects form boundaries [00:12:58], thin layers at 2 to 3 [00:16:40],
  renders under several lights [00:19:51], eyes rotated 3 to 7 degrees outward [00:29:10], asymmetry
  for likeness [00:35:03].
- Joseph Drust, Pixologic, #AskZBrush Morph Target and Morph Brush (2015),
  https://www.youtube.com/watch?v=B_wKwXwjcZs. Best for: Morph slider softening and negative
  exaggeration [00:00:59, 00:05:20].
- Outpost VFX 3D team, 17 Pro Tips and Tricks for ZBrush (2022),
  https://outpost-vfx.com/en/news/17-pro-tips-and-tricks-for-zbrush. Best for: layers for alpha
  tests (tip 5), Morph Target volume recovery (tip 7), subdivision levels to test detail on a
  DynaMesh (tip 9).

## Maxon documentation and SDK (2026)

- Brushes, strokes, alphas, auto masking, Lazy Mouse, Smooth, Layer brush (help.maxon.net,
  `sources/docs/fundamentals-sculpting__brushes-strokes-alphas.md`). Best for: Smooth only via
  Shift, Draw Size Dynamic mode, Layer constant depth, stroke types.
- DynaMesh, Sculptris Pro, subdivision levels, Geometry palette
  (`sources/docs/fundamentals-sculpting__dynamesh-sculptris-subdivision.md`). Best for: 1024 and
  2048 cube limits, remesh conditions, Sculptris Pro restrictions, Divide needs no mask or hidden
  parts.
- Gizmo 3D, Transpose, deformers, Tool > Deformation
  (`sources/docs/fundamentals-sculpting__gizmo-transpose-deformers.md`). Best for: soft Gizmo unless
  Focal Shift -100, global axes of the Deformation sliders, deformers need no levels.
- Masking and polygroups (`sources/docs/fundamentals-sculpting__masking-polygroups.md`). Best for:
  masks modify all sculpting and Deformation actions, Mask Changed Points, Merge Stray Groups,
  QuickPolygroup.
- ZSpheres, layers, morph targets, SubTool palette
  (`sources/docs/fundamentals-sculpting__zspheres-layers-morph-extract-subtool.md`). Best for:
  Adaptive Skin, one Morph Target per SubTool, layer intensity, Groups Split keeps levels at the top
  level.
- Python SDK 2026.1 stubs and examples
  (`/Applications/Maxon ZBrush 2026/Documentation/python-api/`): `canvas_stroke` transforms from the
  stroke start in canvas space, `add_zsphere` only inside `edit_zsphere`, curves in tool coordinates
  (`zbrush.commands.add_curve_point.0.py`), `set_transform` example (0, 90, 90) = top view.

## Sister skills used for shape

- scenario-blender-sculpting (Blender Expert Skills project): the stance-and-gates layout and the
  "render, name one weakest link, fix, re-render" loop.
