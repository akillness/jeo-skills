---
name: scenario-zbrush-hard-surface
description: "Use when modeling hard surface in ZBrush 2026 (sci-fi helmet, weapon, prop, armor plates, mechanical parts, kitbash, vents, panel lines, bolts, concept to game asset), when using ZModeler, Dynamic Subdivision and creasing, Live Boolean, Knife, Clip, Slice or Trim curves, IMM, ArrayMesh, NanoMesh or Panel Loops, or when edges look razor sharp, a Make Boolean Mesh fails or leaves holes, planes look wobbly, Mirror And Weld erased an edit, or ZRemesher ruins a hard-surface part."
license: MIT
---

# ZBrush hard surface

Hard surface is judged as a result: it reads as manufactured when every edge is clearly straight or
clearly curved, planes carry an even highlight, edges are wide enough to catch light and every part
could be built (Plouffe, Klimer). The agent builds that language from deterministic operations
(primitives, Live Boolean stacks, polygroups as the crease plan, Dynamic Subdivision numbers,
ArrayMesh, Panel Loops) and uses clicks and strokes only where nothing else exists. If a sibling
skill named here is missing from your available skills, load it with `skill_get` (Scenario MCP) or
ask the user to install it (https://github.com/scenario-labs/skills#install); unattended, proceed
from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-zbrush-expert (bridge, stroke engine, review loop, 2026 traps).
Toolkit: [`scripts/zb_hardsurface.py`](scripts/zb_hardsurface.py)
(`import sys; sys.path.insert(0, "<this skill>/scripts"); import zb_hardsurface as hs`, then
`hs.hs_call("new_part", "cube")`), built on the lead's `zb_ops`, `zb_review`, `zb_audit` and
`zb_stroke`. Nothing in it has run in ZBrush yet.

## Stance (the expert delta)

- **Polygroups are the crease plan.** Groups By Normals at 45 degrees (33 catches softer planes, 60
  misses edges), Mirror And Weld, UnCreaseAll, Crease PG (Pavlovich; Plouffe). Crease first, a loop
  only where the falloff must be local. Crease PG after later edits recreases borders you softened
  on purpose: regroup, or crease by angle.
- **The gap SmoothSubdiv minus CreaseLvl sets the edge.** 0 reads razor, "very CG"; the closer
  CreaseLvl sits to SmoothSubdiv, the tighter the edge, so 4/3 is tighter than 4/2
  (`hs.edge_width`). Pavlovich works at 3/2 and bakes 4/2; Plouffe keeps CreaseLvl 3 over a razor 4
  and calls 2 too soft. Deciding condition: render both under metal, keep the widest edge that still
  looks planned.
- **QGrid is for boxy blocks** (it facets arcs). Curved spans take Smooth Subdiv plus Crease
  Tolerance, tuned per span: 22 held Pavlovich's arch; too low creases the arc's small angles.
- **Booleans need clean inputs** (Live Boolean doc; Pavlovich): watertight, no coplanar faces,
  similar density, low Dynamic levels, nothing partly hidden. DSDiv on, one Start group per separate
  part, then ZRemesher Detect Edges at Half. Creases, UVs, levels and layers die in the boolean;
  polygroups survive.
- **Keep cuts and repeats live.** ArrayMesh the cutter, not the result. Instanced fasteners
  (NanoMesh, ArrayMesh) make a late "flathead, not Phillips" one Edit Mesh swap; per-seat imports
  cost one call per seat.
- **Straight or curved, never in between** (Plouffe). Polish planes, then edges, then corner
  softness, sharp to smooth; never mix sharp and round edges close together; one cavity along a
  border sells a separate plate.
- **Function and camera set the detail** (Klimer): how it is made, where power flows, one fastener
  family, repeated angles identical. Validate twice in engine: the block (500 to 40k polys) with the
  rig, then a decimated high under 1M points. Unseen interiors and undersides stay filled or simple,
  sold by dark AO (Pavlovich).
- **Micro detail waits for sign-off, on 3D layers** (Klimer): a negative strength carves in,
  duplicating doubles, and a layer dies with any topology change, so layers come after the last
  boolean, remesh or Apply [added].
- **Mirror And Weld always copies negative X onto positive X.** Good half on +X: Deformation Mirror
  first (Pavlovich, Plouffe). Slice, Trim and BRadius ignore symmetry, so every one-sided edit ends
  here.

## What the agent can and cannot do here

| Deterministic (script it)                                                                                                                                                                | Click or stroke [verify]                                                                                                                                  | GUI only, or substitute                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primitives, Unify, placement (`new_part`, `place`, `import_part`); Live Boolean roles (`set_roles`, `roles_from_groups`), DSDiv, Make Boolean Mesh, Show Coplanar and Show Issues        | ZModeler: a saved brush or 2026 preset holding the action and crease option, one `canvas_action` at `click_target` (a drag the first time; a tap replays) | Clip, Trim, Slice, Knife (Ctrl+Shift drag; `press_key` is broken): boolean cutters, `fitted_split_groups`, DynaMesh Groups on a group outline, a ZScript `IKeyPress` wrapper (scenario-zbrush-automation) |
| Dynamic Subdiv, CreaseLvl, CTolerance, Crease PG, Crease Bevel, Apply                                                                                                                    | NanoMesh insert: one click on a face of the target group, or on a front-facing plane (the shipped macro's routine)                                        | Gizmo deformers: Deformation sliders on an axis-aligned part                                                                                                                                              |
| Groups By Normals, Mirror And Weld, Panel Loops, GroupsLoops, ArrayMesh, NanoMesh sliders, MeshFromBrush (`fastener_from_brush`), masks (`mask_fillet`), ZRemesher, DynaMesh, Decimation | IMM: a synthesized Dots stroke, or Curve Mode on script curves; `imm_ready` first                                                                         | Retopo brush, Mask By Polypaint dialog, freehand masks, hPolish planing (weak strokes)                                                                                                                    |

## Establish first

| Input           | Changes                                                      | Default when silent                                                                          |
| --------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Destination     | game (bake to a low), film, print collectible, concept read  | game asset baked to one 2048 map (Pavlovich's pistol)                                        |
| Camera          | first person and ADS, third person, turntable, print framing | third person; detail sized to what reads there                                               |
| Budget          | low-poly triangles, map size, high-poly cap                  | report counts and ask; never invent a budget                                                 |
| Function sheet  | how it opens, vents, power, how it is made, fastener family  | write one before blocking (Klimer)                                                           |
| Scale           | rigged: real scale in the block; concept: proportion         | Unify (about 2 units), Z forward, perspective off (Chervenka); mm briefs via `to_tool_units` |
| Moving parts    | a hinged visor stays a separate part and Start group         | separate                                                                                     |
| Painter handoff | Substance Bridge, or OBJ plus an external bake               | ask; both are below                                                                          |

## Workflow

1. **Setup.** Proxy or concept as a SubTool; Unify, Z forward, X symmetry; versioned ZTL before
   every boolean, DynaMesh, ZRemesher and Apply (no undo from Python). GATE: longest bbox side about
   2; ZTL on disk.
2. **Block.** `new_part` and `place`, or `import_part` from a DCC block; body first, cutters below.
   GATE: forms sheet (`zb_review.review`) against the concept; a rigged asset's block OBJ checked in
   engine with the rig before detailing.
3. **Shell.** Deformation sliders on primitives, subtractive boxes for openings, Make Boolean Mesh,
   `zremesh_recipe("after_boolean")`. The sculpted route (DynaMesh 128 to 176, hPolish, TrimDynamic)
   is concept only. GATE: `hygiene(obj)` ok (it stands in for Check Mesh, which reports through a
   note); PolyFrame shows even quads.
4. **Crease plan.** `crease_by_groups(45)`, `dynamic_subdiv(intent="working")`; arcs
   `crease_by_angle`, tuned per span. Loops and insets made with ZModeler take their crease at
   creation (`zmodeler_plan`: Insert EdgeLoop "Crease"; Inset "Crease New Edges" crisp, "Crease
   Inner Poly" rounded; defaults are Do Not Crease). GATE: `check_crease`; metal sheet
   (`review_sheets`) shows soft, light-catching edges, no scalloping, symmetric polygroups.
5. **Cuts and vents.** Cutters `new_part(..., op="sub")` through the surface, never flush; Smooth 3
   / CreaseLvl 2 plus crease by angle; `array_mesh` on the cutter. GATE before:
   `stack_report()["problems"]` empty, `coplanar_report` clean, Show Coplanar snapshot has no red,
   `array_plan` walls ok. Then `make_boolean_mesh` (short timeout). GATE after: UMesh SubTools equal
   Start groups; Show Issues snapshot clean; recrease (Crease PG unless a border was softened on
   purpose); `hygiene` before ZRemesher. Any one-sided edit: `mirror_report`,
   `mirror_weld(keep=...)`, then `mirror_check` on exports before and after.
6. **Panels and fitted parts.** Plan panels as polygroups first. Real separations: Panel Loops with
   Plouffe's recipe (`panel_loops`). A visor or hatch that fits its opening: one cutter used twice
   (`fitted_split_groups`: Intersect in one Start group, Subtract in the other), or DynaMesh Groups
   on a group outline. Seams: a thin subtractive cutter from `border_polylines` plus `curve_mesh`
   [verify]. Masks: `mask_fillet` (Klimer's blur, invert, repeated). GATE: `split_copy("groups")`
   counts panels; gaps constant on the sheet.
7. **Hardware.** One family. ArrayMesh rows; radial sets as ArrayMesh Rotate 360 then
   `array_commit("nano")` with ZRVar variation (Chervenka); a part from an IMM without a drag:
   `fastener_from_brush`; no face where a bolt goes: a helper plane. A port across a seam:
   `seam_port_groups` (Pavlovich). Exact runs: `spaced_points`. GATE: count, orientation and the
   same fastener everywhere on the sheet.
8. **High-poly commit.** `bake_split()`: Apply at 4/2 on a copy, Dynamic off on the original. Exact
   chamfer widths: Crease Bevel width or a boolean chamfer, since Polish only gives the minimum
   (Polycount). GATE: levels = 1 + Flat + Smooth; `edge_language` has no ambiguous lines;
   `plane_flatness` no wobbly groups; `pinch_report` flags nothing.
9. **Micro detail** (after sign-off). Layers per region (Tool:Layers:New; procedures P15). GATE:
   `layer_safe(recorded, zb_ops.stats())` before and after each pass.
10. **Low poly and handoff.** Dynamic-off cage; ZRemesher per part (`zremesh_recipe("part")`); quick
    static prop: `dynamesh_visible(res)` then one `decimate_percent`; or Maya or Blender. Klimer's
    ZRemesher plus auto-reduction gave "the nastiest mesh I've ever shipped". Painter routes
    (scenario-zbrush-retopology-export runs them): Substance Bridge Low & High plus Auto-Bake plus
    Send PolyPaint (`bridge_preflight`), or native Unwrap with crease seams (`unwrap_creases`) then
    OBJ. GATE: `zb_audit.verdict(..., "game")`; animated parts separate.

## Numbers

| Value                                                                          | Use                 | Source               |
| ------------------------------------------------------------------------------ | ------------------- | -------------------- |
| Groups By Normals 45 (33 softer, 60 misses)                                    | crease plan         | Pavlovich; Plouffe   |
| Smooth/Crease 3/2 working, 4/2 bake, 4/3 tight, 4/1 soft                       | edge width          | Pavlovich; Plouffe   |
| Crease Tolerance 45 (22 on one arch)                                           | crease by angle     | Pavlovich            |
| Faces x4 per QGrid, Flat or Smooth step; Apply levels 1 + Flat + Smooth        | budgets             | DSUB doc             |
| Cutter cylinders 8, 12, 16, 24 or 32 sides; 36 to 140 before a DynaMesh bake   | cutters             | Pavlovich; Polycount |
| ArrayMesh Repeat 4 to 5                                                        | vents               | Pavlovich            |
| Panel Loops: Loops 1, Polish 0, Bevel 0, Elevation -100, Double, Ignore Groups | plates              | Plouffe              |
| ZRemesher Half + Detect Edges + Adaptive 0                                     | cut-ready base      | Pavlovich            |
| Keep Groups, Smooth Groups 0, AdaptiveSize 25                                  | part retopology     | Chervenka            |
| About 3 stars on a panel base                                                  | pinch budget        | Plouffe              |
| LazyStep 2 touching (his guess), 2.5 rivets; Curve Step 1 touching             | IMM runs            | Pavlovich; IMM doc   |
| DynaMesh 176 exploration; 1000 game shell                                      | resolution          | Pavlovich            |
| 25k of 1.671M = 1.4 to 1.5 percent                                             | one decimation pass | Pavlovich            |
| 10M polygons per SubTool                                                       | high-poly cap       | Plouffe              |
| Block 500 to 40k polys; review high under 1M points                            | engine checks       | Klimer               |
| 2048 bake, 4 px padding                                                        | maps                | Pavlovich            |

## Quality gates

- **Code:** `stack_report` and `coplanar_report` clean; `make_boolean_mesh()["ok"]`; `hygiene`;
  `check_crease`; `mirror_check`; `edge_language` (no `ambiguous`); `plane_flatness(obj)["wobbly"]`
  empty; `pinch_report`; `layer_safe`; `bridge_preflight`; `zb_audit.verdict`.
- **Visual:** `review_sheets`: MatCap Gray from five views for forms; metal, square-on and 30-degree
  grazing for planes and edge width; PolyFrame for groups and dotted crease lines. Show Coplanar
  before and Show Issues after each boolean. Pinches: a low level with dark polypaint and a
  low-metal MatCap. Judge with [`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                             | Looks like                           | Fix                                         |
| ----------------------------------- | ------------------------------------ | ------------------------------------------- |
| CreaseLvl >= SmoothSubdiv           | razor CG edges                       | `dynamic_subdiv(intent="bake")`             |
| QGrid on a curved shell             | faceted arcs                         | QGrid 0, Smooth plus `crease_by_angle`      |
| Cutter flush with the body          | coplanar note blocks; holes          | cut through; `coplanar_report`              |
| No Start group or DSDiv off         | part sewn to the body; faceted UMesh | `set_roles(... start=True)`; `dsdiv=True`   |
| Mirror And Weld, good half on +X    | edit erased                          | `mirror_weld(keep="pos")`, `mirror_check`   |
| Crease PG after softening borders   | softened edges razor again           | crease by angle, or merge groups first      |
| Debris after cuts                   | ZRemesher fails                      | `hygiene`, hide debris, Del Hidden          |
| IMM on a SubTool with levels        | insert refused                       | `imm_ready`; level-free placeholder SubTool |
| Layer made before a topology change | layer no longer applies              | layers after the last boolean or Apply      |
| Force UV Auto-Unwrap on             | every SubTool loses its UVs          | `bridge_preflight`; off                     |

## Handoffs

- **Receives:** a concept and brief from the user; an AI mesh from scenario-3d; a DCC block from
  scenario-maya-modeling or scenario-blender-hard-surface (OBJ, quads and tris); a forms pass from
  scenario-zbrush-sculpting.
- **Delivers:** a versioned ZTL (high SubTools, Dynamic-off cages), OBJ per part with matching high
  and low names, `stack_report` and the last sheets; to scenario-zbrush-retopology-export for UVs
  (Unwrap with crease seams, UV Master), Substance Bridge or Multi Map Exporter bakes (a polypaint
  ID travels by Send PolyPaint or an MME Texture From Polypaint map; OBJ vertex color is not
  established) and the game low poly; the 2026.1 Retopo brush is a GUI step there; to
  scenario-maya-modeling, scenario-maya-retopology-uv, scenario-blender-retopology or
  scenario-blender-uv-baking for a hand-built low; polypaint IDs with scenario-zbrush-paint-render;
  print parts to scenario-zbrush-pose-print.

## ZBrush 2026 notes

- Knife (2021.7 to 2022) with Split To Parts (2024) replaces most Slice and Trim routines; Knife
  cannot cut holes.
- ZModeler 2026.0 creases at creation (Insert EdgeLoop, Inset); 2026.2.1 adds Bevel All, Outer or
  Inner Edges and fixes the Extrude-instead-of-QMesh default.
- Substance Bridge (2026.2.0): Low & High, Auto-Bake, Send PolyPaint; Force UV Auto-Unwrap is
  global; each send makes a new Painter project.
- 2026.2.1 fixes Live Boolean rendering and an Apply crash. ZRepeat It is not shipped: loop SubTools
  in Python.
- Blocking notes (2026.2.1 UI strings): coplanar Make Boolean Mesh; floor Elv on Mirror And Weld;
  n-gons on import; DynaMesh with levels; the Check Mesh Integrity result [verify]; the Create
  InsertMesh Append-or-New prompt when the current brush is already an insert brush; the shipped
  Create Instance Subtool macro ends on a note.
- Prefixed labels: `s.SmoothSubdiv`, `P.Panel Loops`, `a.Repeat`, `m.Width`; sections of Tool >
  Geometry add no path level. Cmd+W quits ZBrush on macOS; Control+W groups.

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, timestamps,
  deciding conditions; load when planning.
- [`references/procedures.md`](references/procedures.md): full bridge procedures; load before
  writing code.
- `references/critique.md`: the rubric; load at every gate.
- [`references/gui-paths.md`](references/gui-paths.md): palettes, hotkeys, brushes; load when a step
  is GUI only.
- [`references/sources.md`](references/sources.md): every source, credential, URL and timestamp.
