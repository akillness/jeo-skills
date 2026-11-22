# Sources behind scenario-maya-modeling

Per-source notes: the project's `notes/modeling/` and `notes/fundamentals/` (plus
`notes/rigging/e74KphYwMww` and `notes/pipeline/modeling__game-asset-fbx-export-unreal-maya` for the
handoffs). Digests: `notes/modeling/_digest_modeling_topology_hard_surface.md`,
`_digest_modeling_tools_scene_hygiene.md`, `_digest_modeling_organic_base_mesh.md`. Version facts:
`sources/maya-version-deltas.md` § 2.1, 2.2, 2.12, 2.13. Credentials as the notes state them;
"unverified" kept where the manifest could not confirm.

## Experts and videos

| Source                                                                                                                                                                       | Who                                                                                                                          | Best for                                                                                                                                                     | Best timestamps                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Clean Hard Surface Topology (Why we struggle with topology & Where to start?)", Mario Elementza, 2024, 1:44:12, https://www.youtube.com/watch?v=_bpsEd_5IW4                 | hard-surface and industrial-design modeling educator (Elementza courses); no studio credits found                            | sub-D hard-surface reasoning: purpose, even grid, triangle policy, offset before cutting, support loops, cylinders, density vs redirection, metal pinch test | [00:08:31] not double; [00:17:19] narrowest feature; [00:18:57] loops prove quads; [00:20:36] triangle protocol; [00:30:32] metal test; [00:38:16] offset before cutting; [00:39:22] empty extrude; [00:44:24] beveled-cube corner; [00:57:43] cylinder rule; [01:09:20] [01:10:26] density vs redirection; [01:12:04] sides in fours; [01:14:16] quad cap; [01:19:49] support loop before the detail on curves; [01:28:38] faceted patch = hard edges; [01:39:46] camera distance |
| "How to create exact and technical topology workflow for the Blizzard animators", Jessica Dru Johnson, CG Futures 2018, 1:34:29, https://www.youtube.com/watch?v=ZiYEO49B768 | Senior Cinematic Artist, Blizzard in-game cinematics (verified: CG Futures speaker page, LinkedIn)                           | deformation topology: isolation loops, rule of threes, shear, mouth and eyes, neutral face, influence budget                                                 | [00:44:17] 4 influences; [00:58:51] standardized base; [01:00:30] neutral face; [01:12:33] concentric loops; [01:15:51] rule of threes; [01:18:38] thumb; [01:21:55] bounded weights; [01:28:31] mouth; [01:30:10] jaw shear                                                                                                                                                                                                                                                       |
| #ModelingInMaya Base Mesh: Torso & Limb Blocking, antCGi, 2021, https://www.youtube.com/watch?v=-mWWeFv07SI                                                                  | Antony Ward, game-industry veteran, author of _Game Character Development with Maya_ (book verified, studio list unverified) | primitive counts, merge order, Target Weld, Delete Edge, history per object, autosave                                                                        | [00:02:01] autosave; [00:05:28] primitives; [00:13:50] history per object; [00:16:04] edge flow; [00:17:07] Target Weld; [00:30:21] fold loops                                                                                                                                                                                                                                                                                                                                     |
| #ModelingInMaya Base Mesh: Hand, Foot & Head Blocking, antCGi, 2021, https://www.youtube.com/watch?v=QW8w15J00Ok                                                             | same                                                                                                                         | Mirror settings and failure mode, symmetry distrust, chest pole, Cleanup for Relax errors, fingers                                                           | [00:02:24] mirror threshold; [00:03:29] center-line strays; [00:06:09] red symmetry; [00:09:58] chest pole; [00:13:56] Cleanup; [00:19:24] finger joints                                                                                                                                                                                                                                                                                                                           |
| #ModelingInMaya Base Mesh: Head & Face Detail First Pass, antCGi, 2022, https://www.youtube.com/watch?v=RlNnp4qQIrU                                                          | same                                                                                                                         | face loop intent, openings, lid and lip counts, bevel vs crease for export                                                                                   | [00:01:46] openings; [00:05:22] matching counts; [00:09:32] mouth corner; [00:23:15] blend-shape loop; [00:28:12] creases lost on export                                                                                                                                                                                                                                                                                                                                           |
| #ModelingInMaya Base Mesh: Deformation Testing, antCGi, 2022, https://www.youtube.com/watch?v=x07USYlvu2o                                                                    | same                                                                                                                         | the modeler's test bind, topology vs rig faults, Non-Deformer History, ROM                                                                                   | [00:04:12] Neighbors bind; [00:10:27] rig fault; [00:11:04] wrist loops; [00:12:41] Non-Deformer History; [00:16:24] same weights proof; [00:21:10] ROM                                                                                                                                                                                                                                                                                                                            |
| #RiggingInMaya Model Evaluation, antCGi, 2021, https://www.youtube.com/watch?v=e74KphYwMww (rigging batch)                                                                   | same                                                                                                                         | what a rigger checks on a delivered model (the rigging handoff gate)                                                                                         | [00:02:52] units; [00:05:44] centered on X; [00:08:14] eyes ahead; [00:22:50] budget never beats deformation; [00:24:32] combine symmetric parts                                                                                                                                                                                                                                                                                                                                   |
| Ultimate Guide to Clean Scenes in Maya, FlippedNormals, 2018, https://www.youtube.com/watch?v=ToWRH4IXF7A                                                                    | Henning Sanden and Morten Jaeger, former senior film character artists (London VFX; Framestore for Henning per manifest)     | the handoff checklist, rebuild vs repair, Cleanup limits, render stats, naming                                                                               | [00:02:35] render stats; [00:08:31] rebuild; [00:10:44] [00:11:15] Cleanup only for technical defects; [00:11:50] no Cleanup for n-gons; [00:18:16] unique names; [00:20:47] two-sided lighting, backface culling; [00:24:00] smoothing off; description checklist                                                                                                                                                                                                                 |
| How to Use The Modeling Tools in Maya, FlippedNormals, 2021, https://www.youtube.com/watch?v=zSr8i6yT5Ek                                                                     | Henning Sanden                                                                                                               | tool choices: Multi-Cut, Average Vertices, bridge one face first, Edit Edge Flow, 2-segment box bevel                                                        | [00:06:12]; [00:07:43]; [00:10:48]; [00:16:06]; [00:18:18]                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Maya Modeling Secrets, FlippedNormals, 2018, https://www.youtube.com/watch?v=BAxUMjHdS84                                                                                     | Henning Sanden, Morten Jaeger                                                                                                | move along normals, Circularize, pivot snapping, few custom hotkeys                                                                                          | [00:02:00]; [00:05:52]; [00:11:30]                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| High to Low Poly Workflow in 3D Modeling, On Mars 3D, 2021, https://www.youtube.com/watch?v=YDu9pYMkkSM                                                                      | Aunmar Mohammed, 15+ years CG, VFX and games; Epic credit self-reported (unverified)                                         | triangle budgets from screen coverage, low from the cage, silhouette and contrast checks, round corners, shrink wrap                                         | [00:01:16] silhouette; [00:03:15] hero "seen large on screen"; [00:04:21] budgets and the 10 to 15% band; [00:04:55] background 10k or 5k; [00:05:50] strip holding loops; [00:07:27] contrast; [00:10:29] triangles terminate loops; [00:12:50] round corners; [00:17:45] shrink wrap; [00:21:31] polygons vs tris; [00:25:29] [00:26:34] radius edges, edge on the crest                                                                                                         |

## Documentation (retrieved 2026-09-24)

- Maya 2027 Help, polygon modeling (preferences, Multi-Cut, legacy Bevel, Smart Bevel and its 2027.1
  and 2027.2 changes, creases and the Crease Set Editor, Smooth Mesh Preview, Edit Edge Flow,
  extrude, bridge, booleans, topological symmetry):
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-Modeling/files/GUID-4A9B7918-06B9-4BDD-80DE-DD6D756B09B3.htm
  (Smart Bevel Options: GUID-8088912A-A766-4BCD-8E9A-F45FDB9FA09F). Saved:
  `sources/docs/modeling__maya2027-help-polygon-modeling-tools.md`.
- Maya 2027 Help, fundamentals (DAG and DG, construction history, freeze and reset, pivots, marking
  menus, hotkeys, Optimize Scene Size):
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-Basics/files/GUID-9C82DAE2-8F19-4F63-BA1A-C28E95DDBE58.htm.
  Saved: `sources/docs/modeling__maya2027-help-fundamentals-dag-dg-history.md`.
- Arnold user guide, polygon subdivision settings (Arnold renders the Smooth Mesh Preview state on
  top of its iterations; iterations quadruple polygons):
  https://help.autodesk.com/cloudhelp/ENU/AR-Core/files/ac-shapes/ac-polygons/arnold_user_guide_ac_polygons_ac_subdivision_settings_html.html.
  Saved in `sources/docs/lookdev-lighting__arnold-standard-surface-hair-displacement.md`.
- Pixar OpenSubdiv, modeling tips and schemes:
  https://github.com/PixarAnimationStudios/OpenSubdiv/blob/release/documentation/mod_notes.rst.
  Saved: `sources/docs/modeling__pixar-opensubdiv-modeling-tips.md`.
- Polycount wiki, Topology, Polygon Count, Normal Map Modeling, Texture Coordinates (CC BY-SA;
  sections by working game artists): http://wiki.polycount.com/wiki/Topology. Saved:
  `sources/docs/modeling__polycount-wiki-topology-polycount-normals-uvs.md`. Best sections: Triangle
  Count vs. Vertex Count; Smoothing Groups & Hard Edges (tangent basis); Polygons Vs. Triangles
  (check the triangulation in the engine); Contiguous Meshes; Floating Geometry; Edited Vertex
  Normals; Level of Detail Models; UV Tutorials & Threads (straight shell borders for LODs).
- Epic Games, FBX Static Mesh Pipeline (pivot at origin, triangulate in the DCC, UCX collision, FBX
  2020.2):
  https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine.
  Saved: `sources/docs/modeling__game-asset-fbx-export-unreal-maya.md`.
- Maya 2027 Help, retopology and UV Toolkit (for the handoff boundary):
  `sources/docs/modeling__maya2027-help-retopology-quad-draw.md`,
  `sources/docs/modeling__maya2027-help-uv-toolkit-unfold-layout.md` (§ Prepare a UV mesh step 2:
  Unfold3D refuses non-manifold and unfolds a triangulated mesh; § Room Space Options: keep 2 px; §
  Unfold a UV mesh: unselected UVs pinned; § Optimizations).
- What's New in Maya 2025 to 2027 (Smart Extrude, Shift Extrude, legacy bevel filters, boolean
  engine, Volume mode, Smart Bevel point releases, FBX user normals):
  `sources/docs/scripting-pipeline__whats-new-maya-202{5,6,7}.md`.

## Decisions of this skill not taken from a source ([added])

`MM.weighted_normals` "largest" mode and its 0.5 ratio (chosen to agree with Mario's 2:1 rule); the
quad-cap layout with one ring so rim vertices stay valence 4; the engine vertex estimate as unique
(vertex, fan, UV, shader) corners; `mirror_merge` near-miss band 0.01 cm and its manual fallback;
`highlight_review` stripes (8 bands on a V ramp) and roughness 0.2; the 2% size tolerance;
`handoff_report`'s rule that UV lines are pending, not hidden, when the receiver is
scenario-maya-retopology-uv; the MA carrier for clean-scene rebuilds of multi-part or UV2 assets.
Added in the refactor pass: `cage_report`'s "flat" test (every face touching a triangle within 1
degree of its plane) and its fan-pole definition (interior valence 5 or more, only triangles around
it); `triangulated_copy(toward=)`'s criterion (keep the diagonal whose midpoint lies closer to the
high); `inverted_shells` by signed volume on closed shells; `cleanup_technical`'s tessellation
heuristic (n-gons down while triangles up); `topology_key` as the condition for carrying component
ids. Each is documented where it is used and can be overridden.

## Revision history

- 2026-09-24, v1: initial build (snapshot in `skills/_versions/maya-modeling v1 2026-09-24/`).
- 2026-09-24, v2 (refactor after the blind grade `tests/grading/M1_grade.md`): taught the items both
  graded answers missed, each from its cited note: narrowest-feature density and density vs
  redirection by camera distance (Mario); the triangle protocol on the cage and triangles ending
  loops on the low (Mario, On Mars); support loop before the detail on curves; hard edges 0 on a
  cage, valence census and fan caps (`MM.cage_report`); the Cleanup policy (`MM.cleanup_technical`);
  preview off at every save; flipped shells beyond two-sided lighting (`MM.inverted_shells`);
  contiguous low; deliberate triangulation of non-planar quads (`MM.triangulated_copy(toward=)`); On
  Mars' three budget bands; unique and non-default names as a stated gate; the edge on a round
  corner's crest; the Unfold3D preconditions, LOD and tangent-basis points at the UV handoff (P17);
  component lists across stages (`MM.component_record`, `MM.carry_components`, P18). Fixed the
  skill's own wording: the budget row no longer calls the grenade figure the only sourced number,
  the 2-segment box-corner rule is now attributed to the legacy bevel and left untested for Smart
  Bevel, and the Y-up row no longer reads as if the engine were Y up. New code: offline-tested pure
  functions, Maya job `tests/code/maya-modeling/test_mm_cage.py` (not yet run in Maya).
