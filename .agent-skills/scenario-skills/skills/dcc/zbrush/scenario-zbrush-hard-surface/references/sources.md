# Sources of scenario-zbrush-hard-surface

One line per source: who, credential, where, what it is best for, best timestamps.

## Revisions

- **v1 2026-09-24:** first build (copy in `skills/_versions/zbrush-hard-surface v1 2026-09-24/`,
  with its tests under `_tests-code/`).
- **v2 2026-09-24 (refactor after the blind grade `tests/grading/Z3_grade.md`):** fixed the inverted
  crease label (4/3 is the tight pair, `intent="wide"` refused); the NanoMesh insert and ZModeler
  actions moved from "not scriptable" to click routes marked [verify] (`click_target`,
  `canvas_action`); `mirror_weld` now requires the kept side, with `mirror_report` and
  `mirror_check`; added the 2026 ZModeler crease options and Bevel modes (`zmodeler_plan`), the 2023
  to 2026.2 handoff routes (Substance Bridge with `bridge_preflight`, Unwrap with crease seams,
  Retopo brush), micro detail on layers (`layer_safe`), the seam port and fitted-split boolean
  groups (`seam_port_groups`, `fitted_split_groups`, `roles_from_groups`), NanoMesh fastener routes
  (`fastener_from_brush`, Rotate 360 then Convert, ZRVar, helper plane, Edit Mesh swap), IMM
  mechanics (`imm_ready`, LazyStep, Curve Step, `spaced_points`), mesh hygiene (`hygiene`), star
  pinches (`pinch_report`), native Show Coplanar and Show Issues, hidden-area and first-engine-check
  rules, exact-width chamfers (`to_tool_units`, Crease Bevel), panel planning and `mask_fillet`.
  Offline tests 32 to 46, all passing; live test live_hs_07 added, not yet run. Notes are in
  `notes/hard-surface/` and `notes/kitbash/` of the project; digests:
  `_digest_hard_surface_tools.md` (with its addendum from the Whisper re-transcriptions),
  `_digest_hard_surface_projects.md`, `_digest_hard_surface_masters_plouffe.md`. Version facts:
  `sources/zbrush-version-deltas.md`.

## Evidence from this install (2026-09-24)

- ZBrush 2026.2.1 UI string resources,
  `/Applications/Maxon ZBrush 2026/ZData/ZLang/english/UInterface.zsc` (read with `strings`). **Best
  for:** the exact labels, bubble help and prefixes:
  - labels and prefixes: `s.`, `P.`, `a.`, `m.`, `B.`; `Groups By Normals` with `MaxAngle`;
    `DetectEdges`, `SmoothGroups`; `Crease UM`; `Unweld Groups Border`; `Check Mesh Integrity`;
  - the blocking notes: coplanar Boolean, invalid Boolean inputs, Mirror And Weld floor Elv, n-gon
    import, DynaMesh on levels, auto-activate Dynamic Subdiv;
  - `Render:Render Booleans` as a path string; Show Issues with its bubble help ("Show issues that
    preventing Boolean computation like holes and edges sharing more than 2 polygons").
  - v2 additions: the ZModeler modifiers Do Not Crease, Crease New Edges, Crease Inner Poly and All
    Edges, Outer Edges, Inner Edges; `MeshFromBrush` ("Create Mesh From Brush"); `LazyStep`,
    `CurveStep`, `Curve Mode`; the Check Mesh Integrity result notes; the Create InsertMesh prompt
    "Would you like to APPEND the active mesh to this brush or create a NEW brush?".
- Shipped macros, `/Applications/Maxon ZBrush 2026/ZData/Macros/`. **Best for:** known-good 2026
  paths.
  - Append a QCube Subtool: Append, `PopUp:PolyMesh3D`, Initialize X/Y/Z Res, QCube, Unify.
  - Create Instance Subtool: `Brush:Create:Create InsertMesh` with `IKeyPress '1'`,
    `Tool:NanoMesh:m.*`, the canvas click on a front-facing plane
    (`[IClick,1004, width/2, height/2]`), absolute `SubToolSetStatus`, and a final info `[Note]`
    (source text in `sources/docs/automation__zscript-shipped-macros-2026.md`).
  - Append Eyes: Mirror And Weld modifier values 1/2/4; X Position and XYZ Size.
  - Snap To Ground: Y Size and Y Position semantics.
  - GrpUnMasked: `Tool:Polygroups:Group Visible`.
- Shipped MatCaps, `ZData/Materials/MatCap/`: `MatCap Metal01`, `MatCap Metal02`, `Green Metallic`,
  `MatCap Gray`. **Best for:** the metal plane test.
- SDK stub and examples, `/Applications/Maxon ZBrush 2026/Documentation/python-api/` (Maxon SDK
  team, 2025-10). **Best for:**
  - `get_subtool_status` and `set_subtool_status` bits, where the docstring says "toggle logic" and
    the example writes absolute values;
  - the curves API (`new_curves`, `add_new_curve`, `add_curve_point`, `curves_to_ui`,
    `create_mesh_from_curves`);
  - `get_info` (bubble help), `get_tool_count`, `get_tool_path`, `select_tool`, `pixol_pick`
    normals, `query_mesh3d` bbox modes;
  - `ex_mod_curve_lightning.py`: curves are in tool space, and a curve brush applies only after a
    curve is touched.
- The v03 OBJ export (`tests/code/zbrush-expert/fixtures/v03_sphere.obj`). **Best for:** ZBrush
  writing polygroups as `g Group<id>` lines.
- The lead skill scenario-zbrush-expert: bridge, `zb_ops`, `zb_review`, `zb_audit`, `zb_stroke`, the
  2026 traps and the SDK cookbook.

## Maxon documentation (help.maxon.net, retrieved 2026-09-24)

- Live Boolean, Boolean remesh, Remesh SubTools (14 pages; models by Joseph Drust),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/modeling-basics/creating-meshes/live-boolean/live-boolean.html.
  **Best for:** the four input rules, processing order and Start groups, what survives, Show
  Coplanar and Show Issues.
- Dynamic Subdivision (9 pages),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/modeling-basics/dynamic-subdivision/dynamic-subdivision.html.
  **Best for:** the order QGrid, Flat, Smooth; x4 per step; Apply levels; triangles under Smooth;
  MicroPoly.
- Hard Surface tools (19 pages; Christopher Brändström, Daniel Bystedt, Paul Gaboury, Joseph Drust),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/hard-surface/hard-surface.html.
  **Best for:** Clip, Trim, Slice, Knife and Crease brush behavior; Panel Loops; BevelPro; Polish by
  Features; ZRemesher on hard surfaces.
- ZModeler (20 pages; Joseph Drust, Daisuke Narukawa),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/modeling-basics/creating-meshes/zmodeler/zmodeler.html.
  **Best for:** action, target and modifier names; restrictions; 2025.2 to 2026 additions.
- Gizmo 3D deformers and operators (7 pages),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/modeling-basics/gizmo-3d/deformers/list-of-deformers/list-of-deformers.html.
  **Best for:** which deformers act without levels; Slice Topology; Remesh by Union.
- Tool palette reference: Geometry, Deformation, SubTool,
  https://help.maxon.net/zbr/en-us/Content/html/reference-guide/tool/polymesh/geometry/geometry.html.
  **Best for:** button-level names and options.
- Insert Mesh, IMM creation, Curve brushes, Curve Bridge, Mesh Fusion, ArrayMesh, NanoMesh (20
  pages; Ken Toney, Geert Melis, Joseph Drust),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/sculpting/sculpting-brushes/insert-mesh/insert-mesh.html.
  **Best for:** capture rules, TriParts, Curve Step, ArrayMesh stages and pivot, NanoMesh placement
  and Edit Mesh.
- Maxon ZBrush channel, "ZBrush 2026: ZModeler Updates" (2025-12-03),
  https://www.youtube.com/watch?v=6KZiNEO65YY. **Best for:** creasing at creation on Insert EdgeLoop
  and Inset [00:01:06]-[00:02:44]; Insert snap with Ctrl taps [00:02:44].

## Experts

- **Marco Plouffe,** co-founder of Keos Masons, concept and 3D artist (Sideshow Sentinel). ZBrush
  Masters: Hard Surface Modeling, Pixologic, hosted by Paul Gaboury, 2020-05-26,
  https://www.youtube.com/watch?v=u75skb32GTo. **Best for:** the visual language and the quick and
  clean methods.
  - Rulebook: [00:23:20], [00:52:55], [00:59:02]-[01:01:47], [01:05:00]-[01:06:09], [01:31:40],
    [01:50:44].
  - Quick commit: [00:44:38]-[00:49:33].
  - Clean plate: [01:57:33]-[02:25:26], Panel Loops [02:09:12], CreaseLvl [02:18:03]-[02:19:44].
  - Pinches: [02:25:59].
- **Michael Pavlovich,** games sculptor (Halo 4, Call of Duty, Doom), official ZBrushLIVE presenter,
  CGMA instructor.
  - "Intro to ZBrush" (2021): Dynamic Subdivisions and Creasing
    https://www.youtube.com/watch?v=qeFclVta4No (crease first [00:08:18], CreaseLvl rule
    [00:14:11]-[00:16:29], QGrid on arcs [00:22:59], bake split [00:25:50]).
  - Live Boolean https://www.youtube.com/watch?v=HXnKnrhlFpA (DSDiv [00:02:31], ZRemesher on the
    UMesh [00:03:31], Start groups [00:07:01]).
  - Sharp clip results https://www.youtube.com/watch?v=03BMMabyK8U. Clip, Trim, Slice
    https://www.youtube.com/watch?v=FOdVdgiAHWo (never past the widest part [00:03:56], symmetry per
    modifier [00:06:20]).
  - ZModeler Polygon Actions https://www.youtube.com/watch?v=XcR5TzvIaoc. ZModeler Edge Actions
    https://www.youtube.com/watch?v=qob31SzC754.
  - ZRemesher https://www.youtube.com/watch?v=6PtmKtr1kx0 (smooth group borders [00:07:56]). Gizmo
    Deformers https://www.youtube.com/watch?v=FCAb-CSVCBg.
  - IMM kitbash https://www.youtube.com/watch?v=U5u3RpI9In4 (capture [00:15:04]). MicroMesh and
    NanoMesh https://www.youtube.com/watch?v=QGNn1-ey6ME (Edit Mesh swap [00:12:26], placeholder
    SubTool [00:14:07]).
  - 2024 updates: Knife Split To Parts https://www.youtube.com/watch?v=8LNjAkqr_lI (base prep
    [00:04:04], debris [00:10:46]); IMM Strokes https://www.youtube.com/watch?v=wnONEaRVhYU
    (LazyStep [00:03:43]).
- **Michael Pavlovich, Mechanical Skull (2020):**
  - 030 https://www.youtube.com/watch?v=1iJ_sO1U0V4; 031
    https://www.youtube.com/watch?v=qBi-JF23r4Y; 032 https://www.youtube.com/watch?v=max2JumNDp4;
    033 https://www.youtube.com/watch?v=Yprguxci8NY;
  - 034 https://www.youtube.com/watch?v=MteQbBFxgqk; 036
    https://www.youtube.com/watch?v=ejuEogNKNoo; 037 https://www.youtube.com/watch?v=16AAIFE9CRc;
    038 https://www.youtube.com/watch?v=FAFtW_8zB5Q;
  - 039 https://www.youtube.com/watch?v=H_ETE4qJduU; 042
    https://www.youtube.com/watch?v=FM3uQJy1GUY; 044 https://www.youtube.com/watch?v=cw449pmS64g.
  - **Best for:** exploration resolution, sculpted hard-surface brushes, mask and slice separations,
    seams, screw ports.
- **Michael Pavlovich, Sci Fi Pistol (2017, ZBrush 4R8):**
  - 007 https://www.youtube.com/watch?v=TANNfCLxFx4; 010
    https://www.youtube.com/watch?v=GrIf_eeq6K0; 012 https://www.youtube.com/watch?v=KOmR4vepB04;
    013 https://www.youtube.com/watch?v=x1gN9-SocYY;
  - 015 https://www.youtube.com/watch?v=Ab0ixptmNeA; 019
    https://www.youtube.com/watch?v=KroRw6dFs10; 022 https://www.youtube.com/watch?v=QbEHsPGNnlY;
    032 https://www.youtube.com/watch?v=VfUqkvHymeQ;
  - 033 https://www.youtube.com/watch?v=h5gsm_-6df4; 034
    https://www.youtube.com/watch?v=iWq7dFxf55I; 035 https://www.youtube.com/watch?v=te7lV_EpGQ0.
  - **Best for:** blocking from a concept, ArrayMesh cutters, cutter crease numbers, Start groups,
    the quick game low poly, DCC and bake hand-off.
- **Mike Klimer,** senior hard-surface artist at Bungie (Destiny 2), previously The Division.
  Weapons of Destiny 2, ZBrush Summit 2017, https://www.youtube.com/watch?v=08crkU999Fs. **Best
  for:** function and manufacturing [00:22:18], first-person readability [01:16:23], validating in
  engine twice [00:17:32], [00:36:13], consistency [00:29:04], [01:00:37], micro detail on layers
  [00:29:36].
- **Henry Chervenka,** CEO of 3D Dynamic Studios, hard-surface instructor. Pushing the Boundaries of
  ZBrush, ZBrush Summit 2023, https://www.youtube.com/watch?v=PGX39tnEf3Y. **Best for:** project
  setup [00:08:24]-[00:10:33], NanoMesh versus ArrayMesh [00:10:33]-[00:24:18], ZRemesher
  preparation [00:32:14]-[00:37:48], Project Morph [00:24:52].
- **Polycount Technical Talk,** "3ds Max ProBoolean plus DynaMesh hard-surface workflow" (2016;
  author "Amsterdam Hilton Hotel", identity unverified),
  https://polycount.com/discussion/168610/3ds-max-zbrush-proboolean-dynamesh-hardsurface-workflow-tutorial.
  **Best for:** the DCC-booleans school, cylinder segment counts, Polish as the minimum edge width.

## Version deltas used (`sources/zbrush-version-deltas.md`)

- 3.4 Hard surface and ZModeler: crease options on Insert Edge Loop, Insert Multiple Edge Loop and
  Inset (2026.0); Bevel inner or outer edge modes and the QMesh default fix (2026.2.1); Knife
  (2021.7 to 2022) and Split To Parts (2024); BevelPro.
- 3.5 Retopology and UVs: the Retopo brush (2026.1); Tool > UV Map > Create (Unwrap) with Crease
  seams (2023).
- 3.6 Maps and export: Substance Bridge (2026.2.0) with Low & High, Auto-Bake, Send PolyPaint and
  the global Force UV Auto-Unwrap; the FBX options window.
- 3.12 Scripting: `press_key` does not work; no undo control.

## Baseline, scenario and grade

- `tests/grading/Z3_grade.md` (blind grade, 2026-09-24). **Best for:** the missing-from-both list
  and the factual errors this v2 fixes.
- `tests/baseline/answers.md` Z3 and `tests/scenarios.md` Z3 (sci-fi helmet). **Best for:** what
  generic practice gets wrong; corrected in `expert-notes.md` section 9.
