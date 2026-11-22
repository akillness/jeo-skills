# Sources of scenario-zbrush-character-creature

Each entry: expert, credential, where, what it is best for, best timestamps. Per-source notes live
in the project's `notes/anatomy/`, `notes/character/`, `notes/creature/` and `notes/hair-fibers/`.
Stylized hair notes in `hair-fibers/` (Dan Eder) belong to scenario-zbrush-stylized and were not
used here.

## Evidence produced on this install (highest weight)

- **scenario-zbrush-expert bridge tests** v01 to v03 (2026-09-24, ZBrush 2026.2.1 build 53205). Best
  for: synthesized V02 strokes sculpt, dialog-free `Document:Export` and `Tool:Export`, silent
  `set()` on missing paths.
- **Offline tests of this skill** (`tests/code/zbrush-character-creature/test_zb_character.py`, 54
  tests, `offline_results.json`). Best for: the stroke plans, fold planner, canon checks, stack and
  map-request gates, crack planner, view aiming and region mapping, projection spikes, big-form
  asymmetry, calibration dots, SSS detail survival, OBJ and alpha tools, and the wrappers against a
  fake `zbrush.commands` through the real bridge server. Nothing has run in ZBrush yet.
- **Local install listing** (`/Applications/Maxon ZBrush 2026`, read-only inspection 2026-09-24).
  - Present:
    - `ZData/BrushPresets` (Move, Standard, ClayBuildup, DamStandard, Inflat, Elastic, Morph,
      TrimAdaptive, TrimDynamic, Slash3, SnakeHook, Clay, MaskLasso, MaskPen, the cloth and groom
      brushes, CurveTube, CurveFlat, CurveFlatSnap, IMM Curve);
    - `Lightbox/Brushes/Smooth/SmoothDirectional.ZBP` and `Smooth Stronger.ZBP`;
    - `Lightbox/Brushes/Scales`;
    - `ZData/Alphas/Alpha 0NN.PSD` (including 006, 016, 039, 060);
    - `Lightbox/Alphas` (Scaly, Leathery and Bumpy Skin);
    - `Lightbox/Noises` (40 ZNM presets);
    - `Lightbox/FiberMeshes` (ZFP presets).
  - Absent: Orb brushes, Kingslien's RK_ brushes, Costa's Antro_ brushes.
- **Shipped 2026.2.1 macros** (`ZData/Macros`, text in
  `sources/docs/automation__zscript-shipped-macros-2026.md`):
  - Enhance Details: `Tool:Layers:New`, `Delete`, `Duplicate`, `Bake All`, `Rename` through
    ZFileUtils `RenameSetNext`, `Tool:Morph Target:StoreMT` and `Switch`, Polish with `IModSet`.
  - Append Eyes: `Tool:SubTool:Insert`, `PopUp:Sphere3D`, `Tool:Geometry:X/Y/Z Position`,
    `XYZ Size`, `Material:ToyPlastic`, `Color:FillObject`.
  - Toggle Mask By Polygroups: `Brush:Auto Masking:Mask By Polygroups`.
  - Create Stencil From Subtool: `Alpha:Transfer:GrabDoc`, `Alpha:Modify:Intensity`.
- **ZBrush Activity log** of the 05:20 session
  (`~/Library/Preferences/Maxon/ZBrush_03C27D49/Logs/Activity/`). Best for: startup values such as
  `Preferences:Mem:MaxPolyPerMesh` 100 and `Preferences:Draw:Dynamic Brush Scale` 1.
- **Python SDK stub and examples** (`/Applications/Maxon ZBrush 2026/Documentation/python-api/`):
  - curves API (`new_curves`, `add_new_curve`, `add_curve_point`, `curves_to_ui`, `delete_curves`,
    example `add_curve_point.0.py` with `Brush:CurveStandard`);
  - `create_displacement_map` and `create_normal_map`;
  - `get_stroke_info` (pressure readable per point);
  - `press_key` marked "does not work";
  - `pixol_pick`;
  - `examples/_tests/_stroke_fomat.py`, whose V03 strings carry `p` tokens (a pressure candidate
    [verify]).
- **OBJ fixture** `tests/code/zbrush-expert/fixtures/v03_sphere.obj`. Best for: ZBrush writes one
  `g Group<id>` line per polygroup.
- **`sources/zbrush-version-deltas.md`** (project). Best for: every 2026 fact used here (Asset
  Directory, NoiseMaker 2.0, FiberMesh Width Profile, Dynamics unchanged, Cmd+W).

## Faces and heads

- **Ryan Kingslien**, first ZBrush product manager at Pixologic (2004 to 2008), founder of
  ZBrushWorkshops and Vertex School. "Common Mistakes When Sculpting The Face" (live talk,
  2021-07-28, ZBrush 2021.6.2), https://www.youtube.com/watch?v=6wiDxO-ZADg. Best for: the face
  order of operations and the critique checklist. Timestamps:
  - move counting 00:20:29;
  - cranial versus facial mass 00:31:15;
  - Bridgeman masses 00:38:12;
  - maxilla 00:43:31;
  - nose 00:49:14;
  - nostril 00:54:07;
  - form-clue line 00:59:02;
  - eye 01:03:55;
  - brow 01:09:55;
  - mouth 01:12:20;
  - mouth corner 01:19:56;
  - lid 01:28:37;
  - nasolabial area 01:33:42;
  - "right or wrong back in the beginning" 01:37:20.
- **Kris Costa** ("Antropus"), 14 years at ILM, creature modeling lead (Warcraft, Star Wars TFA,
  Kong), portrait instructor.
  - "Realistic Portraiture" (ZBrush Summit 2018), https://www.youtube.com/watch?v=Lfen-BSwWcE. Best
    for: the HD stack, Multi Map Exporter values, Switch MT, pore and wrinkle method. Timestamps:
    stack 00:17:53; MME 00:19:30-00:23:59; HD regions 00:25:04; from afar and upside down 00:28:50;
    pores 00:31:18-00:39:01; spray texture 00:42:21; wrinkles 00:45:09; albedo 00:50:16;
    micro-displacement map 01:10:58.
  - "Realism Idealized: Learning How to Observe" (Summit 2021),
    https://www.youtube.com/watch?v=j5XLtLMN0P8. Best for: the evaluation checklist, subtle
    ClayBuildup, age and ripple, eyes and measurements, skin by region, Elastic pass. Timestamps:
    form hierarchy 00:04:44; blur read 00:09:18; ClayBuildup 00:12:58; lights 00:18:46; eyes
    00:28:36; asymmetry 00:35:03; measurements 00:38:12; skin by region 00:40:24; Elastic 00:51:50.
- **Anatomy For Sculptors** (Uldis Zarins and team, authors of the Anatomy for Sculptors books),
  free blog articles on the head, skull, forehead, pelvis, shoulder, arm and hand,
  https://anatomy4sculptors.com/blog/ (local copy
  `sources/docs/character-creature__anatomy-for-sculptors-articles.md`). Best for: numeric canon
  (head thirds, hand ratios, landmarks, sex differences).

## Skin

- **J Hill** (Jason Hill), lead character artist at Turtle Rock Studios, Bloodhound (Apex Legends)
  at Respawn, former student of Costa. "Sculpting SKIN DETAILS with ZBrush" (2021-10-17),
  https://www.youtube.com/watch?v=HlHoIGE2Ocs. Best for: regular plus HD split, the Surface Noise
  pore bed, heavy then dial back, region rules, lips, asymmetry, MME export. Timestamps:
  - stack 00:10:37-00:13:54;
  - noise bed 00:14:31;
  - fine wrinkles 00:17:38;
  - plastic 00:18:10;
  - Morph dial-back 00:19:16;
  - Elastic 00:20:21;
  - nose 00:22:16;
  - lips 00:24:10;
  - lower-level smoothing 00:27:57;
  - asymmetry 00:29:42;
  - export 00:32:43;
  - SSS highlights 00:34:53.

## Bodies

- **Scott Eaton**, classically trained sculptor, character supervisor and lead modeler on features,
  anatomy instructor to ILM, Framestore, Valve, Sony, Ubisoft, DICE. "Dynamic Figure Sculpture"
  (ZBrush Summit 2015), https://www.youtube.com/watch?v=Ale6SXXbJMM. Best for: force chain,
  landmarks, scapula rotation, subdivision with Smt off, layers as proportion dials. Timestamps:
  active and relaxed 00:13:39; base and stack 00:32:01; morph and layer 00:33:33; landmarks
  00:35:59; scapula 00:39:55; active muscles straight 00:54:07; Smooth Directional 01:09:27.

## Creatures

- **Zachary Berger**, lead creature designer on Avatar: The Way of Water (Lightstorm), 2023 Concept
  Art Award. "The Creature Design Philosophy of Avatar: The Way of Water" (ZBrush Summit 2023),
  https://www.youtube.com/watch?v=PcuC8K-bz44. Best for: the design pyramid, reference blending,
  layers for variants and articulation, grayscale approvals, readability. Timestamps: pyramid
  00:04:24; blend 00:12:33; metaphor 00:14:13; three versions 00:16:59; evolution layers 00:18:05;
  open and closed mouth 00:20:53; grayscale 00:37:47; underwater colors 00:41:07.
- **Henning Sanden**, FlippedNormals co-founder, former creature modeler at Framestore, MPC and
  DNEG. "Create Killer Alphas From Scratch" (2025-06-02),
  https://www.youtube.com/watch?v=TuRIf92oMCY. Best for: the alpha factory, mid value 50
  calibration, flow along anatomy, unify pass. Timestamps: flow 00:00:34; plane setup 00:02:11;
  generic tile 00:03:52; first test 00:14:15; photos lie 00:17:33; smoothing is blurring 00:20:47;
  calibration 00:25:09; stamping 00:27:51; unify 00:28:55; mid-frequency 00:30:02.
- **Luke Starkie**, creature designer and sculptor (God of War: Ragnarok Nidhogg and Drake;
  ex-Rockstar; ex-MPC senior creature artist). Maxon interview "Sculpting Creatures for God of War:
  Ragnarok and More" (2023-11-09),
  https://www.maxon.net/en/article/sculpting-creatures-for-god-of-war-ragnarok-and-more (local copy
  `sources/docs/character-creature__maxon-starkie-creature-interview.md`). Best for: hand scales on
  a hero close-up, staged cracks, wrinkles from elephant and rhino. It gives no brush values: the
  low ClayBuildup intensity in numbers (Z 2 to 3) is Costa's.
- **Marko Lazov**, creature artist at Mundfish. ZBrush Summit 2025 creature concept speed sculpt,
  https://www.youtube.com/watch?v=AQsmWcXLxk8. Best for: skull first, Mask by Cavity plus Inflate,
  detail zoning, asymmetry by Morph Target. Timestamps: skull 00:15:58; mask tricks
  00:22:02-00:25:56; silhouette 00:28:36; zones 00:31:12; growths 00:41:03; asymmetry 00:56:58.
- **Pablo Munoz Gomez**, ZBrushGuides and Pablander Academy, ZBrushLIVE host. "4 Ways to Create
  Horns in ZBrush" (2022-11-14), https://www.youtube.com/watch?v=TN9ARiC_82w. Best for: horn
  workflows with numbers (Array Mesh, curve IMM, Gizmo deformers, Spiral3D). Timestamps: decimation
  00:05:14; curve IMM 00:13:24; radial tube 00:21:19; Bend Curve 00:26:13; Spiral3D 00:29:23.

## Cloth

- **Rafael Grassetti**, art director on God of War (Santa Monica Studio). "How to sculpt cloth in
  3D?" (2020-11-23), https://www.youtube.com/watch?v=gNx4v0WVVHo. Best for: fold grammar (tension,
  termination, unevenness, four types) and the reference breakdown. Timestamps: drop 00:00:31;
  termination 00:02:35; unevenness 00:03:08; X 00:04:26; sleeve 00:05:30; subdivide and split
  00:08:14; reference 00:08:50; simulation limits 00:12:06.
- **Michael Pavlovich**, Director of Character, Weapon and Vehicle Art at Certain Affinity,
  ZBrushLIVE host. ZBrush 2021 lessons, each best for the part named:
  - 001 Dynamic Cloth Overview, https://www.youtube.com/watch?v=m5O_sBag_iA: the solver model,
    iterations versus speed, Firmness.
  - 005 Gravity Strength and Simulation Iterations, https://www.youtube.com/watch?v=F7bcjQAK0Wc.
  - 016 Inflate, Deflate, Expand, Contract, https://www.youtube.com/watch?v=s2qVeTnx89M: masked
    Expand for hems.
  - 018 Cloth Brushes, https://www.youtube.com/watch?v=gyaMwGSsrb8: Trails, dimples.
  - 021 Collision Volumes, https://www.youtube.com/watch?v=nqoCyOME8Jo: cached colliders,
    resolution, gap.
  - 025 Hair FiberMesh Dynamic Simulation, https://www.youtube.com/watch?v=QCcDTuDT2HM: roots,
    collision, cards, strands.
  - 082 Curve Flat Brushes, https://www.youtube.com/watch?v=goZavCi515k: hair cards.

## Fur and hair

- **Pablo Munoz Gomez**, "Working with FiberMesh for Hair and Fur: ZBrush Top Tips" (Maxon,
  2020-11-14), https://www.youtube.com/watch?v=lgTA_ebLGDw. Best for: groom versus settings,
  visibility tricks, guides, clump polygroups. Timestamps: routes 00:01:24; white fibers 00:06:53;
  fur settings 00:08:28; guides 00:10:04; clumps 00:12:43.

## Maxon official documentation (2026 help site; local copies in `sources/docs/`)

- **3D Layers and Morph Targets**,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/sculpting/3d-layers/3d-layers.html
  (`character-creature__layers-morph-targets.md`). Best for: top-level rule, Record, intensity,
  baking, erasing.
- **Surface Noise, NoiseMaker, Brush Noise, Alphas, Spotlight**,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/sculpting/surface-noise/surface-noise.html
  (`character-creature__surface-noise-alphas-spotlight.md`). Best for: Quick 3D Edit, SNorm, mask
  mixing, 16-bit alpha rules, Tool > Surface buttons.
- **HD Geometry, XTractor, Displacement Map**,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/modeling-basics/subdivision-levels/hd-geometry/hd-geometry.html
  (`character-creature__hd-geometry-xtractor-displacement.md`). Best for: HD capacity and regions,
  XTractor, displacement settings.
- **Cloth Simulation (Dynamics), cloth brushes, Mesh Extract**,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/cloth-simulation/cloth-simulation.html
  (`paint-pose-render-print__dynamics-cloth.md`, `character-creature__cloth-dynamics-extract.md`).
  Best for: every Dynamics control, stop and resume, Max Simulation Points, Extract Thick.
- **FiberMesh**,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/fibermesh/fibermesh.html
  (`paint-pose-render-print__fibermesh.md`). Best for: Preview and Accept rules, conversion
  triggers, profiles, export.
- **Masking and Polygroups** (`fundamentals-sculpting__masking-polygroups.md`). Best for: Mask By
  Cavity, Smoothness, PeaksAndValleys, AO and Fibers.
- **Tool palette reference: Geometry, Deformation, SubTool**
  (`hard-surface__zbrush-ref-tool-palette-geometry-deformation-subtool.md`). Best for: Deformation
  slider semantics (Offset as percent of the unit radius, Size 100 doubles, axis letters), Extract,
  SmartReSym.
- **Multi Map Exporter** (`topology-export__multi-map-exporter-maps.md`, owned by
  scenario-zbrush-retopology-export). Best for: Mid 0 for 32-bit maps.

## Projection, sharpness, brush order and map plumbing

- **Henning Sanden and Morten Jaeger** (FlippedNormals founders; ex-MPC and ex-Framestore senior
  film character artists):
  - "Reprojecting Details in ZBrush: Top Production Tip" (2018-09-10),
    https://www.youtube.com/watch?v=Zp07GW3rND0. Best for: Store MT plus a top-level layer before
    Project All, danger zones, the eye-interior mask, the level walk, Morph-brush repair.
    Timestamps: close parts 00:01:41; order at the top 00:02:13; staged projection 00:03:17; walk
    the levels 00:03:49; eye mask 00:05:31; no smoothing 00:06:36; danger zones 00:07:10; hard lines
    in displacement 00:07:43; local reprojection 00:09:27.
  - "Top Tips for Sculpting in ZBrush" (2020-02-27), https://www.youtube.com/watch?v=G2o6fdoACIQ.
    Best for: frequency stages, symmetry broken at mid-frequency 00:06:19, silhouette stability
    00:17:27.
  - "Learn to Sculpt Like a Pro in ZBrush" (2018-06-11),
    https://www.youtube.com/watch?v=0PaYUUvgwYM. Best for: carve deeper than feels right because SSS
    eats sharpness 00:19:49-00:20:22.
  - "The Only 6 Brushes You Ever Need in ZBrush" (Henning alone, 2020-12-17),
    https://www.youtube.com/watch?v=TpS0QdlfHWU. Best for: ClayBuildup erases what is under it,
    Standard enhances 00:03:55, 00:07:44.
  - "ZBrush to Arnold for Maya: 32-bit displacement UDIM" (2018-04-02),
    https://www.youtube.com/watch?v=-ThBTEc8L_M (owned by scenario-zbrush-retopology-export). Best
    for: Merge Maps off with EXR 00:04:43, UDIM names with a dot 00:06:36, Switch MT found broken
    00:07:09, Adaptive off 00:08:12, OBJ Grp off 00:15:08, Maya UDIM (Mari) tiling 00:17:29.
- **Joseph Drust** (Pixologic/Maxon), #AskZBrush "Is there a way to bake out the small details when
  creating a Normal/Displacement Map?" (2020-01-11), https://www.youtube.com/watch?v=2zDAtaQqwh8.
  Best for: maps compare the chosen level with the top 00:01:44; level max-1 gives micro detail only
  00:02:53.
- **Maxon docs, Decimation Master** (`sources/docs/topology-export__decimation-master.md`). Best
  for: decimate a duplicate; pre-process state; the scripted pre-process that ended a ZScript (forum
  report, [verify]).

## Game production

- **Rakan Khamash**, senior character artist on Overwatch 2 at Blizzard (hero Illari), now at Epic
  Games. "Overwatch Character Creation Pipeline" (ZBrush Summit 2023),
  https://www.youtube.com/watch?v=FRZtVXpAokc. Best for: readability rules, 70/30, rest areas,
  rig-first topology, floaters, fold intent, wear physics, 16k budget. Timestamps: readability
  00:02:16; shape language 00:06:07; topology 00:11:04; floaters 00:13:16; folds 00:19:55; blockout
  share 00:21:37; wear 00:25:34; face projection 00:41:27.

## Sister skills used for shape

- scenario-blender-sculpting (Blender Expert Skills project): the layout of a domain skill with a
  design table and gated stages.

## Revision log

- 2026-09-24, v1: first build (SKILL.md, five references, `zb_character.py`, 42 offline tests).
  Snapshot: `skills/_versions/zbrush-character-creature v1 2026-09-24/`.
- 2026-09-24, v2 (refactor after the Z2 blind grade, `tests/grading/Z2_grade.md`): stack route
  chosen before the first Divide with `stack_check` (SDK only: regular to about 20 to 25M plus a
  tiled micro map; computer use: 3 to 4 regular plus 3 to 4 HD; never HD over 6 or 7 regular
  levels); reprojection safety and danger zones (C19, `spike_report`, FlippedNormals Zp07GW3rND0);
  alpha tests on the model and calibration dots (C8, `dots_check`); big-form asymmetry (C12,
  `asymmetry_report`); Surface Noise guards (C7); SSS survival and brush order (`detail_survival`,
  critique); map consistency and UDIM plumbing (C20, `map_request_check`); decimate a copy; wrinkle
  direction across the compression and staged cracks (C10, C17, `crack_tree`); the 2026 Dam_Standard
  name (`brush_check`, live_c01); Redshift, Asset Directory (`alpha_library_dir`) and Substance
  Bridge; aimed, mesh-derived stamp regions instead of canvas fractions (C9, `aim_at`,
  `region_on_canvas`). Fixed: the Starkie attribution (he gives no numbers; Z 2 to 3 is Costa's) and
  the HD numbers (HD total = regular top x 4 per HD level; 3 DivideHD over 16M hits the 1 billion
  ceiling). 54 offline tests pass.
