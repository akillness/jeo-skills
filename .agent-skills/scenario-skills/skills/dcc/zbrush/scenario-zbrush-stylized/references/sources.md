# Sources of scenario-zbrush-stylized

Each entry: source, who, credential, where, what it is best for, best timestamps. Notes live in the
project's `notes/` folder; digests are `_digest_*.md`.

## Revisions

- 2026-09-24 v1: first build (kept in `skills/_versions/zbrush-stylized v1 2026-09-24/`).
- 2026-09-24 v2, round 1 refactor from the blind grade Z1 (missing from both, errors): stylized
  plane breaks kept through subdivision (DynaMesh merge, ZRemesher, `crease_planes` with Groups By
  Normals, Crease PG and CreaseLvl, then Divide; Guillaume [00:46:42]-[00:47:50]); head sides
  clipped to taper and kept an arc, measured by `head_taper` on a top view (Shane [02:00:26],
  [02:11:58]); eyes as spheres wrapped by lids, turned outward, judged on a perspective look render
  (pointer to scenario-zbrush-sculpting P17 and `persp_snapshot_code`); scarf drape by Dynamics
  cloth as an option; polypaint at the top level judged on SkinShade4 (Pablo VRisbJQAaZw [00:23:40],
  [00:24:54]); perspective path fixed to `Draw:Perspective` and installed command ids tried first in
  `PATHS`; examples generalized beyond the adventurer bust. Tests: 43 offline (was 40), live_04
  added (not yet run in ZBrush).

## Experts (video and articles)

- **Shane Olson, Stylized Anatomy Episode 1** (ZBrushLIVE stream on the Maxon ZBrush channel, 2017,
  ZBrush 4R8). Stylized character sculptor and teacher (3D Character Workshop); says he worked at
  Disney Interactive on Disney Infinity, unverified. https://www.youtube.com/watch?v=t_gg7MIGSDM.
  Note: `notes/stylized/t_gg7MIGSDM - Shane Olson Stylized Anatomy Skeleton Blockout.md`. Best for:
  the stylized skeleton by landmarks, proportion knobs with a real baseline, the head block,
  perspective policy, the ruler SubTool. Best timestamps:
  - [00:15:02] landmarks; [00:25:08]-[00:26:35] knobs; [00:59:24] posture;
  - [01:10:33] "this dot"; [01:11:09] not bad anatomy; [01:41:03] perspective;
  - [01:50:21] 200 mm ruler; [01:54:40] Mirror And Weld; [02:00:26]-[02:00:59] head sides clipped
    from the top; [02:04:29]-[02:11:58] head block, side of the head an arc [02:11:58];
  - [02:22:56] finger sections.
- **Keos Masons, Character Design and Production** (ZBrush Summit 2019). Outsourcing studio: Cedric
  Seaut (concept, silhouettes, lineups), Guillaume Tiberghien (stylized production, Fortnite at
  Epic), Marco Plouffe (realistic and hard surface, Sideshow).
  https://www.youtube.com/watch?v=UthCuDB1IEQ. Note:
  `notes/stylized/UthCuDB1IEQ - Keos Masons Character Design and Production.md`. Best for: lineups,
  "simple is hard", planes and creases, contact shadows, grayscale value, material IDs, the metal
  MatCap check. Best timestamps:
  - [00:08:31], [00:10:46], [00:12:28] lineups;
  - [00:43:05]-[00:48:24] Gretel from primitives; [00:46:42]-[00:47:50] DynaMesh, ZRemesher, creases
    kept through subdivision;
  - [00:55:57] simple is hard; [00:58:45] value;
  - [01:19:22]-[01:26:54] polish routine.
- **Rakan Khamash, Overwatch Character Creation Pipeline** (Blizzard, ZBrush Summit 2023). Senior
  character artist on Overwatch 2, owner of the hero Illari, now at Epic Games.
  https://www.youtube.com/watch?v=FRZtVXpAokc. Note:
  `notes/character/FRZtVXpAokc - Overwatch Character Creation Pipeline.md`; also
  `notes/character/_digest_character_creature_studio.md` (delta 10, checklists, P4 and P6). Best
  for: shape language rules, readability at distance, 70/30, blockout as 90 to 95% of the low poly,
  rig-driven design, fold logic, the 16k budget. Best timestamps:
  - [00:02:16], [00:05:00] readability;
  - [00:06:07]-[00:08:53] curves and parallel lines;
  - [00:16:37] 70/30; [00:20:28] folds; [00:21:37] blockout; [00:42:31] budget.
- **Pablo Munoz Gomez, Stylized Sculpted Hair** (2023). Concept and character artist, ZBrushLIVE
  presenter, founder of ZBrushGuides and the Pablander Academy.
  https://www.youtube.com/watch?v=WFqyj6lKgik. Note:
  `notes/stylized/WFqyj6lKgik - Pablo Munoz Gomez Stylised Sculpted Hair.md`. Best for: the scalp
  shell, the chunk plan, Sculptris Pro blocking, one stroke per clump, the finishing stack, curve
  strands in a dummy SubTool. Best timestamps:
  - [00:04:21]-[00:09:43] shell; [00:15:24]-[00:20:00] chunk plan; [00:20:42] blocking;
  - [00:26:10] single motion; [00:30:32] rest versus detail;
  - [00:33:52]-[00:35:33] finish; [00:36:19] dummy SubTool.
- **Dan Eder, The Ultimate Guide for Creating Stylized Hair in ZBrush** (Stylized Station, 2020).
  Senior 3D character artist for games; the ArtStation portfolio is confirmed, the current studio is
  not. https://www.youtube.com/watch?v=VJ2nMJRtIwQ. Note:
  `notes/hair-fibers/VJ2nMJRtIwQ - Dan Eder Stylized Hair With Curve Tube Strands.md`. Best for: the
  curve-strand route, sections as rig chains, Curve Step, front to back, no Smooth, mirroring parted
  styles, braids from creased loops. Best timestamps:
  - [frame 00:01:26] section plan; [00:01:38] blockout; [00:03:23] Curve Step and falloff;
  - [00:12:57]-[00:13:29] strand rules; [00:26:38] mirror; [00:26:57] MatCaps;
  - [00:40:19]-[00:42:21] braids.
- **Michael Pavlovich, 082 Curve Flat Brushes for Hair Cards** (2021). Director of Character, Weapon
  and Vehicle Art at Certain Affinity, ZBrushLIVE host. https://www.youtube.com/watch?v=goZavCi515k.
  Note: `notes/hair-fibers/goZavCi515k - Curve Flat Brushes for Hair Cards.md`. Best for: the Curve
  Tube family by Brush Modifier (20, 4, 0), commit by tapping off, Curve Res. Best timestamps:
  [00:01:31]-[00:02:50], [00:03:31], [00:05:18].
- **Paul Bennett, Hasbro Star Wars Rey Skywalker Toy and More** (ZBrush Summit 2019). Digital
  product designer in the Hasbro sculpture department, Star Wars Black Series.
  https://www.youtube.com/watch?v=P08kuTIRziE. Note:
  `notes/3d-print/P08kuTIRziE - Hasbro Star Wars Toy Articulation.md`. Best for: toy constraints
  (plastics, undercuts, walls, fused flyaways, closed loops), articulation from spheres and discs,
  scale and shrink, fit offsets. Best timestamps:
  - [00:07:36] spheres and cylinders; [00:10:57] 1 mm; [00:12:54], [00:17:51] scale;
  - [00:19:34] neutral pose and fingers; [00:20:41] hair parts; [00:37:55] 0.12 mm;
  - [00:48:28] 0.5 mm edges; [01:06:02] 115 degrees; [01:24:32] Group Front.
- **Alex Carratala, The Rules and Intricacies of Sculpting Miniatures in ZBrush** (80.lv interview
  by Arti Burton, 2023). Sculptor of about 90 mm collectibles (Kimera Models), unverified beyond the
  article. https://80.lv/articles/the-rules-intricacies-of-sculpting-miniatures-in-zbrush. Note:
  `notes/3d-print/paint-pose-render-print__80lv-miniatures-collectibles-carratala - Carratala Miniatures Rules.md`.
  Best for: over-sculpting for the print size.
- **Pablo Munoz Gomez, Understanding ZBrush's Logic Part 8** (2025),
  https://www.youtube.com/watch?v=VRisbJQAaZw. Note:
  `notes/fundamentals/VRisbJQAaZw - Pablo Logic Part 8 Dynamic Subdiv Sculptris Pro Reprojection Polypaint.md`.
  Best for: polypaint on a flat material (SkinShade4) at the highest level [00:23:40], [00:24:54].
- **Henning Sanden (FlippedNormals), The Only 6 Brushes You Ever Need** (2020),
  https://www.youtube.com/watch?v=TpS0QdlfHWU, and **Kris Costa, Realism Idealized** (ZBrush Summit
  2021), https://www.youtube.com/watch?v=j5XLtLMN0P8: used through scenario-zbrush-sculpting P17 for
  eyes (lids wrapping an eyeball with perspective on [00:17:28]-[00:18:33]; eyes 3 to 7 degrees
  outward [00:29:10]).
- **Anatomy For Sculptors free articles** (Uldis Zarins and team, authors of the Anatomy for
  Sculptors books). https://anatomy4sculptors.com/blog/. Note:
  `notes/anatomy/character-creature__anatomy-for-sculptors-articles - Landmarks and Proportions.md`,
  used through the character digest. Best for: the real head and hand ratios that stylized knobs are
  measured against.

## Digests used

- `notes/stylized/_digest_stylized_hair_polypaint_visual.md`: consensus, disagreements, expert
  delta, candidate checklists and procedures P1 to P4 for the stylized bust and hair (the polypaint
  half belongs to scenario-zbrush-paint-render).
- `notes/character/_digest_character_creature_studio.md`: P4 (stylized bust block-in and readability
  gates), P5 (landmark markers), P6 (game readiness), the measurable checklist (70/30 band, IoU,
  head ratios).

## Maxon official

- ZBrush Python SDK 2026 curve API: `new_curves`, `add_new_curve`, `add_curve_point` (points in tool
  coordinates), `curves_to_ui` ("necessary to update the active brush"), `delete_curves`,
  `create_mesh_from_curves(name, action, thickness)`. Stub:
  `/Applications/Maxon ZBrush 2026/Documentation/python-api/api/zbrush/commands.py`. Example:
  `examples/modeling/ex_mod_curve_lightning.py` by Ferdinand Hoppe: CurveTube, Draw Size 10; "to see
  the brush applied you must move one of the created curves a tiny bit"; curves cannot be read back.
  Best for: `lay_strands`.
- ZScript command reference, Curves (`CurvesCreateMesh`, `CurvesToUI`...):
  `sources/docs/automation__zscript-command-reference.md`,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/customizing-zbrush/zscripting/command-reference/command-reference.html.
  Best for: the action codes of `create_mesh_from_curves`.
- Curve Strokes, Curve brushes and Curve Bridge pages (IMM docs):
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/sculpting/sculpting-brushes/insert-mesh/curve-strokes/curve-strokes.html
  and
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/sculpting/sculpting-brushes/curve-brushes/curve-brushes.html
  (local `sources/docs/hard-surface__zbrush-docs-imm-arraymesh-nanomesh-curves.md`). Best for: Curve
  Step, "click once on the already active curve" to re-apply, Brush Modifier 4 for a square section,
  the insert auto-mask on the support mesh.
- Tool palette reference, Geometry > ClayPolish and DynaMesh (Polish mode):
  https://help.maxon.net/zbr/en-us/Content/html/reference-guide/tool/polymesh/geometry/geometry.html
  (local `sources/docs/hard-surface__zbrush-ref-tool-palette-geometry-deformation-subtool.md`). Best
  for: ClayPolish sliders (Max, Sharp, Soft, RSharp, RSoft, Edge, Surface).
- Dynamic Thickness (Offset: negative values build inward):
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/modeling-basics/dynamic-subdivision/dynamic-thickness/dynamic-thickness.html.
  Best for: Pablo's shell settings.

## Project evidence

- Installed command list `/Applications/Maxon ZBrush 2026/ZData/ZLang/zcommands/commands.xml` (read
  2026-09-24): `Draw:Perspective`, `Draw:Angle Of View`, `Stroke:CurveStep`, `Stroke:Curve Mode`,
  `Stroke:Lock Start`, `Stroke:Frame Mesh`, `Stroke:Creased edges`, `Stroke:SculptrisPro`,
  `Tool:Geometry:ClayPolish` with `Max`, `Sharp`, `Soft`, `RSharp`, `RSoft`,
  `Tool:Geometry:Del Hidden`, `Tool:Polygroups:Groups By Normals`, `Tool:Polygroups:MaxAngle`,
  `Tool:Geometry:Crease PG`, `Tool:Geometry:CreaseLvl`; no `Transform:Persp`. Best for: the [xml]
  candidates tried first in `PATHS`. `ZData/BrushPresets/ClipCurve.ZBP` ships (head-side clips).
- `sources/zbrush-version-deltas.md` (2026-09-24): Curve Flat (2021.6.3), Bend split, IMM all
  strokes (2024), curve brush fix (2026.2.1), Asset Directory brushes (2026.1), Cmd+W, Local
  Symmetry, ZRemesher Legacy removed.
- `tests/code/zbrush-expert/fixtures/v03_sphere.obj` (ZBrush 2026.2.1 export, DynaMesh 128),
  measured with `zb_audit`: longest side 2.0401, mean edge 0.017266, hence `DYNAMESH_EDGE_FACTOR`
  1.083 (one sample).
- UI strings in `/Applications/Maxon ZBrush 2026/ZData/ZLang/english/`: labels `CurveStep`,
  `Lock Start`, `Frame Mesh`, `Curve Res`, `Bend Start`, `ClayPolish`,
  `Tool:[Geometry]:{ClayPolish}` exist (location in the UI not proven).
- Installed brush files (`ZData/BrushPresets`): CurveTube, CurveTubeSnap, CurveFlat, CurveFlatSnap,
  CurveStrapSnap, CurveMultiTube, ClayBuildup, ClayTubes, DamStandard, hPolish, Inflat, Pinch,
  SnakeHook, Move Topological, TrimDynamic. Materials: `ZData/Materials/MatCap/MatCap Gray`,
  `MatCap Metal01`, `MatCap Metal02`, `Startup/SkinShade4`.
- scenario-zbrush-expert toolkit and its README evidence (strokes, exports, the bridge): see that
  skill's `references/sources.md`.
