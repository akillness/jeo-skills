---
name: scenario-maya-modeling
description: 'Use when modeling in Autodesk Maya, such as hard-surface props, weapons, vehicles, a sci-fi crate, a game-ready or SubD film model, or a character or creature base mesh, or when asked to "clean up this model" or a scene before rigging or UVs. Also for support loops vs bevels vs creases, Smart Bevel, weighted normals, hard edges, pinching or wobbly highlights, a faceted cage, flipped faces, a triangle budget, n-gons, non-manifold geometry, mirroring a half, a low poly from a high poly, or deformation-ready topology.'
license: MIT
---

# Maya modeling (hard surface, organic, props)

Expert modeling is purposeful topology: every loop exists for the silhouette, a highlight, a bake, a
UV seam or a joint, and the model arrives downstream with nothing the next person has to clean. The
agent works big to small, measures each stage with the toolkit, and looks at a metal highlight
render before believing a surface. If a sibling skill named here is missing from your available
skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).
Toolkit: [`scripts/mx_modeling.py`](scripts/mx_modeling.py)
(`sys.path[:0] = ["<skills>/scenario-maya-modeling/scripts", "<skills>/scenario-maya-expert/scripts"]; import mx_modeling as MM`),
used with `mx_audit`, `mx_validate`, `mx_review`, `mx_run`. **Not yet run in Maya:** its pure-Python
layer passed offline tests; every Maya call is pending `tests/code/maya-modeling/run_all.sh`.

## Stance (the expert delta)

- **Purpose first, then density.** A still from CAD or booleans can skip clean topology; games,
  animation and close-ups cannot (Mario Elementza [00:00:32]). Minimum density is the narrowest
  feature, "the shortest distance between the two edges" [00:17:19]; then camera distance decides:
  low density needs redirected edges and pinches slightly (background), high density needs none
  (hero close-up) [01:09:20] [01:39:46]. Vertex count is the real cost: UV seams, hard edges and
  materials split vertices; a hard edge on a UV seam is free (Polycount).
- **Clean uncut form, then cut.** On flats, offset before cutting: the offset ring becomes the
  support loop; on curved parts, cut the support loop before the detail (Mario [00:16:13] [00:38:16]
  [01:19:49]).
- **Even grid, never double; loops are the proof.** Neighbor quads under 2:1 (Mario [00:08:31]); a
  breaking loop is an unsolved area, a loop that stops dead is a hidden double extrude [00:18:57]
  [00:39:22].
- **Triangles: remove, solve, reinstate; n-gons never.** On a cage, take triangles out, solve the
  rest, put one back only where the metal test holds; flats forgive, curves and deforming areas do
  not (Mario [00:20:36] [00:29:59]; Jessica Dru Johnson [01:12:33]). On a game low, triangles end
  loops locally (On Mars [00:10:29]). Cleanup fixes only lamina, non-manifold and zero-length
  geometry; n-gons by hand (FlippedNormals ToWRH4IXF7A [00:11:15] [00:11:50]).
- **Cylinders in quarters, quad caps, ring loops only** (Mario [00:57:43] [01:12:04] [01:14:16];
  Pixar OpenSubdiv: no high-valence fans).
- **The destination picks the edge-holding method,** and subdivision lives in one place: Arnold
  renders Smooth Mesh Preview's state on top of its own iterations, so every save goes out with
  preview off (Arnold subdivision doc; FlippedNormals [00:24:00]). Creases are lost on export
  (antCGi RlNnp4qQIrU [00:28:12]).
- **Deformation topology is the modeler's job.** One control plus two support loops per joint
  (Jessica [01:15:51]), isolation loops bound controls [01:14:11], no pole on a deforming surface
  (antCGi QW8w15J00Ok [00:09:58]); prove a fix by bending two topologies with identical settings
  (antCGi x07USYlvu2o [00:16:24]).
- **Hygiene is a delivery contract.** Rebuild beats repair, unique short names, render stats at
  defaults; two-sided lighting hides flipped faces (FlippedNormals [00:08:31] [00:18:16] [00:02:35]
  [00:20:47]).

## Establish first

| Input           | Changes                                                         | Default when silent                                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destination     | edge-holding method, triangulation, normals                     | game (PC/console) if an engine is named, else offline SubD                                                                                                                                                                                                                            |
| Budget          | how much to strip                                               | ask the lead; meanwhile anchor on On Mars' bands (grenade-class prop): hero seen large on screen 20k to 30k tris, secondary or tertiary props at 10 to 15% of the screen "much less" (no number given), background 10k or 5k. Report tris and engine vertices, justify each kept edge |
| Camera distance | narrowest feature kept, density vs redirection, corner softness | mid-ground, player can walk up to it [assumption, written in the report]                                                                                                                                                                                                              |
| Deformation     | loops per joint, no weighted normals, symmetry                  | none for props; characters: yes                                                                                                                                                                                                                                                       |
| Size, units     | bevel widths, texel math                                        | real size in cm, grounded; the Maya scene stays Y up even for a Z-up engine (FBX export or import converts the axis)                                                                                                                                                                  |
| Pivot           | engine placement                                                | base center at the origin; a corner if the level snaps by corner (Epic)                                                                                                                                                                                                               |
| Texture set     | stacking, mirroring, UV2                                        | 2048, unique UVs (UVs belong to scenario-maya-retopology-uv)                                                                                                                                                                                                                          |

## Workflow

Every stage is a headless `mx_run` job that saves a new version with preview off; the GUI bridge is
for playblasts and interactive tools (substitutes in
[`references/procedures.md`](references/procedures.md)). Component lists cross stages only through
`MM.component_record` and `MM.carry_components`, never by name or by an index read before a topology
edit (P18).

1. **Session and brief.** `cmds.about(version=True)` (Smart Bevel changed in 2027.1 and 2027.2),
   units cm, Y up, brief in numbers (P1). GATE: assumptions written.
2. **Blockout at real size.** Primitives named at creation, stand on the grid, pivot per convention,
   freeze, delete history (P2). GATE: `mx_audit` frozen, no `default_name` or
   `duplicate_short_name`, dimensions within 2% [added]; silhouette and clay sheets compared to
   reference.
3. **Primary form, clean grid.** Write down the narrowest feature (groove, recess wall, gap) and its
   width: the grid near it takes that spacing, the rest balances to it; decide density or
   redirection per corner from the camera distance. Close the biggest quads, balance, stress-test by
   adding loops (Mario [00:10:11]); curves with Edit Edge Flow (antCGi [00:16:04]). GATE:
   `MM.balance(m)["edges_over_limit"] == 0` before support loops; `MM.cage_report(m)`: n-gons 0,
   every curved triangle removed or proven by the highlight review; loops continuous on the wire
   sheet.
4. **Secondary forms.** `MM.extrude(faces, offset_cm=...)` then recess (P3; refuses the empty
   extrude); openings from one quad; cylinders with `MM.cylinder_sides_for` and
   `MM.build_quad_cylinder` (P4), support loops cut before the opening; or `polyCBoolOp` on manifold
   meshes, then Smart Bevel (P5). GATE: zero-length edges, coincident pairs, non-manifold all 0.
5. **Edge holding, per destination:**
   - SubD hero or bake high, portable: support loops (offset rings, beveled-cube corner routing,
     Mario [00:44:24]).
   - SubD staying in Maya, Arnold or USD: creases, one method, values at or below render levels
     (`MM.crease`, `MM.crease_report`, P6).
   - Game low: chamfers with `MM.bevel` (Smart Bevel after booleans, legacy Fractional on clean
     quads) plus `MM.weighted_normals`, or hard edges on UV seams and a baked normal map
     (Polycount).
   - Still only from CAD or booleans: Smart Bevel, no retopology. GATE:
     `MM.cage_report(cage)["ready_to_smooth"]` (hard edges 0, since a faceted patch is a hard edge,
     Mario [01:28:38]; no fan caps; 6+ poles justified); `MM.highlight_review(..., subdiv=n)`
     stripes continuous across every cut; bevel `problems` empty; `crease_report` clean.
6. **Game low and bake prep** (P10). `MM.smooth_copy` the high; duplicate the cage and reach the low
   only by deleting edges (`MM.flat_edges` off the silhouette, loops ended with triangles); radius
   edges on round corners, evenly spaced, one on the crest (On Mars [00:12:50] [00:26:34]); parts
   touching the body welded in or their hidden faces deleted (Polycount: contiguous low);
   `MM.shrink_wrap`; `MM.set_hard_by_angle(low, 45)`; `MM.triangulated_copy(low, toward=high)` for
   bake and export. GATE: `MM.deviation` recorded, silhouettes overlap, tris in budget, engine
   vertices reported, each separate shell (`polyEvaluate(shell=True)`) justified,
   `diagonals_wrong_after == 0`.
7. **Characters: deformation check** (P13). Loops across wrist and ankle, lids and lips with
   matching counts, mouth-corner loop under the cheek, neutral face (antCGi; Jessica [01:00:30]).
   GATE: `MM.bend_test` shows no flips and no regression against the previous topology; `restored`
   true.
8. **Hygiene and handoff** (P14, P15). `MM.cleanup_technical`, `MM.inverted_shells`,
   `MM.handoff_report(roots, out, to=...)`,
   `mx_validate.validate(profile="model", fix=SAFE_FIXES + ("render_stats",))`, report again, save a
   new version. GATE: report `ok`; cleanup `ok`; 0 inverted shells; preview off; pending items
   named; sheets opened.

## Numbers

| Value                                  | Setting                                                                         | Relative to / source                                    |
| -------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Neighbor quad size                     | under 2:1                                                                       | base grid, support loops excluded (Mario [00:08:31])    |
| Minimum density                        | spacing = narrowest feature                                                     | balance the rest to it (Mario [00:17:19])               |
| Cylinder sides                         | 20, 24, 28, 32                                                                  | multiples of 4, aligned with the cut (Mario [01:12:04]) |
| Round feature on a cage                | about 6 spans hero, 4 background                                                | OpenSubdiv                                              |
| Valence                                | 4 regular; flag 6+; GPU limit about 27                                          | OpenSubdiv                                              |
| Radius edges on a visible round corner | more than 2 to 3, even spacing, one on the crest                                | On Mars [00:25:29] [00:26:34]                           |
| Loops per joint                        | 1 control + 2 support; knuckles 3                                               | Jessica [01:15:51] [01:17:34]                           |
| Crease                                 | Maya value N creases N levels; above 5 rarely; 10 tears under displacement      | Maya Help; OpenSubdiv                                   |
| Smart Bevel                            | Width world units; Depth 1 chamfer, 0.5 rounded; 1 segment hard, 2 to 3 typical | Maya 2027 Help                                          |
| Legacy bevel defaults                  | Fractional, 1 segment, depth 1, smoothing angle 30; 2 segments on box corners   | Maya 2027 Help; FlippedNormals [00:18:18]               |
| Hard edges on a mechanical low         | above about 45 degrees, and on UV seams                                         | Polycount                                               |
| Grenade budgets                        | cage 61k, low 24k; "polygons" is about half the tris                            | On Mars [00:04:21] [00:21:31]                           |
| Sheet share                            | surface cm² x (px/cm)² / map px² (12,800 cm² at 10.24 = 32% of 2048²)           | arithmetic [added]                                      |
| Subdivision cost                       | x4 polygons per level; preview levels + Arnold iterations add up                | Arnold doc                                              |

## Quality gates

Measurable, per mesh:
`mx_audit.verdict(mx_audit.audit(m, texture_size=2048), "game" | "film" | "subd", max_tris=budget)`
has no `error`, plus the `MM` checks named in each GATE; scene:
`mx_validate.validate(profile="model")` no `fail`; together: `MM.handoff_report`. Visual, opened
every time: `mx_review.review` sheet (silhouette vs reference, clay, wire loops, normals);
`MM.highlight_review` with `focus=` closeups on every cut (kinks, dark streaks, wobbles are
pinching, Mario frames 00:12:45, 01:38:42); high and low silhouettes side by side; in a GUI session,
two-sided lighting off or backface culling. Judge with
[`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                    | Looks like                                            | Fix                                                          |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| Empty extrude                              | loop stops dead; crease in smooth preview             | `MM.extrude` refuses it; `mx_audit` zero-length edges        |
| Vertical cuts on a cylinder                | wobbling highlight                                    | rebuild with more sides, or smooth once                      |
| Fan cap                                    | dimple at the cap center                              | `cage_report` fan poles; `MM.build_quad_cylinder`            |
| Hard edges left on a cage                  | faceted patches when smoothed                         | `polySoftEdge(angle=180)` until `cage_report` hard edges 0   |
| Cleanup with tessellation on               | random triangulation                                  | `MM.cleanup_technical`; n-gons by hand                       |
| Preview on at save, plus Arnold iterations | heavy files, huge slow renders                        | `MM.subdiv_setup` in one place; `mx_validate` smooth_preview |
| Creases on an FBX asset                    | sharpness gone in engine                              | bevel, or ship a smoothed copy                               |
| Weighted normals on a deforming mesh       | shading stuck while skinning                          | static meshes only                                           |
| Hard edges off UV seams                    | vertex count up, nothing gained                       | seams on hard edges (`hard_edge_components`)                 |
| Whole shell inside out                     | black with two-sided lighting off, fine with it on    | `MM.inverted_shells`, reverse                                |
| V-snap without weld                        | seam in smooth preview                                | Target Weld; `coincident_vertices`                           |
| Round high corner, sharp low               | bake artifacts                                        | radius edges on the low, one on the crest                    |
| Low left floating, or parts intersecting   | bake misses, overlap errors, UV space on hidden faces | `MM.shrink_wrap`; weld parts in or delete hidden faces       |
| Engine picks the diagonal                  | ridge instead of valley, zig-zag shading              | `MM.triangulated_copy(toward=high)`, export triangulated     |
| Component ids reused after an edit         | wrong edges deleted, silhouette lost                  | `MM.carry_components` refuses; re-derive                     |
| Spiral limb loops, pole on the chest       | muddy weights, kinks                                  | concentric loops, reroute the pole                           |

## Handoffs

- **Receives** the brief from scenario-maya-expert; sculpts from scenario-zbrush-expert (check
  scale, ZBrush has no units; orientation; locked normals); generated meshes from scenario-3d
  (reference or bake high only).
- **Delivers to scenario-maya-retopology-uv** (UVs, bake prep): a new version
  `<asset>_model_v###.ma`, `<asset>_GRP` with `_geo` meshes (engine names such as `SM_` and `UCX_`
  for games), the cage, `<asset>_high` with floaters separate and `castsShadows` off for AO
  (Polycount), the low if built, `handoff_<to>.json` with UVs pending, the hard-edge list for UV
  cuts, and the sheets looked at. Manifold after triangulation too: Unfold3D refuses non-manifold
  meshes and unfolds a triangulated copy (P17).
- **Delivers to scenario-maya-rigging** (deformation-ready): `to="rigging"` clean (X symmetry, no
  locked normals, no history), grounded and centered, eyes separate and looking ahead, symmetric
  parts combined, `bend_test` numbers (antCGi e74K checklist).
- **Delivers to scenario-maya-lookdev** (film SubD): subdivision set in one place, crease sets named
  with values, preview off. FBX export goes to scenario-maya-pipeline-scripting.

## Maya 2027 notes

- Smart Bevel (`polySmartBevel`, 2027): world-unit Width, Depth profile, Filter default Selected
  Edges; output differs 2027.0, .1, .2; flags unknown until probed (`MM.bevel` records `attr_map`).
  Its box-corner behavior is untested: the 2-segment rule comes from the legacy bevel, so read the
  `problems` census. Old bevel is "legacy bevel", with Filter attributes and intersection-only
  bevels on booleans since 2025.
- Shift+drag is "Shift Extrude" (2025); Smart Extrude stitches overlapping faces, Edit Mesh >
  Extrude does not. Booleans: `polyBoolean` (2023), 3ds Max engine (2025.3), Volume mode (2026).
- Smooth Mesh Preview is OpenSubdiv Catmull-Clark; Crease Tool and Crease Sets are exclusive per
  component.
- New scenes default to OpenPBR Surface; the highlight review uses aiStandardSurface.
- Reduce is decimation, not retopology; Quad Draw is interactive only.
- FBX import can bring user normals (2027); imported normals may arrive locked (Mesh Display >
  Unlock Normals).
- macOS keys: Ctrl is Control, Alt is Option.

## References

- `references/procedures.md`: full code P1 to P18 with test paths. Load before writing any modeling
  code.
- `references/critique.md`: the judging rubric. Load at every gate and before reporting.
- [`references/expert-notes.md`](references/expert-notes.md): each expert's reasoning, timestamps,
  disagreements. Load for an unfamiliar asset type or a judgment call.
- [`references/gui-paths.md`](references/gui-paths.md): menus and hotkeys for a GUI or computer-use
  session.
- [`references/sources.md`](references/sources.md): sources, credentials, best timestamps.
