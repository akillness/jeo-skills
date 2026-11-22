---
name: scenario-blender-hard-surface
description: "Use when modeling hard-surface objects in Blender (sci-fi panels, props, weapons, vehicles, robots, machined or product parts) with booleans and cutters, bevel modifiers, weighted normals, or subdivision with support loops or creases. Also when shading is broken (smears on flat faces, stretching near a cut, pinching), a bevel shrinks or vanishes after a boolean, a boolean empties the mesh or leaves holes, choosing n-gons vs quads, or making a game-ready mid-poly."
license: MIT
---

# Blender hard surface

Expert hard surface is controlled light on edges: every edge catches a highlight from a bevel or a
support loop, flat faces read perfectly flat, and cuts stay editable until the design is settled.
The experts disagree on method (n-gons and booleans vs quad cages and subdivision), not on the
checks: order of operations, cutter hygiene, planar faces, a shiny matcap orbit. The agent builds
the stack with the toolkit and lets the measurable gates find what a human finds by orbiting. If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).
Toolkit: [`scripts/bx_hardsurface.py`](scripts/bx_hardsurface.py)
(`import sys; sys.path.append("<skills>/scenario-blender-hard-surface/scripts"); import bx_hardsurface as HS`),
world-space meters, stock Blender only.

## Stance (the expert delta)

- **Cut first, bevel after, normals last.** Booleans above the angle-limited micro bevel, Weighted
  Normal at the very bottom, a late Mirror above it (Ryuu [00:26:26], [00:28:37]; du Mont
  [00:19:46]). In 5.2 a pinned modifier keeps its relative order inside the pinned group and new
  modifiers land above it, so pin bottom-up: `HS.order_stack` does it and `HS.add_boolean` always
  lands above the tail (verified).
- **Two bevels, two jobs** (du Mont [00:12:25] to [00:15:15]): a weight-limited design bevel (8 to
  12 segments) on chosen silhouette edges before the cuts, and an angle-limited micro bevel (30
  degrees, Harden Normals, Miter Outer Arc) after every cut, because no real edge is perfectly sharp
  (Gambrell, du Mont, Ryuu).
- **A bevel that shrinks after a boolean is geometry, not a setting** (du Mont [00:20:18],
  [00:30:20]). Move the cutter well away from target edges or make it exactly coincident; keep Clamp
  Overlap on. Clamp Overlap limits the bevel over the whole object: a slot running 0.7 degrees off a
  facet edge (clamp ratio 3.8) wiped out the 3 mm bevel on a port elsewhere on the part [verified in
  5.2.1]. `HS.clamp_culprits` names the cut.
- **Every wall, step, gap and rounding facet must be wider than 2x the micro bevel width** [added,
  verified]: a 1 mm pocket floor, a 1.5 mm wall, a 2 mm groove with 1.5 mm bevels (a 3.1 mm one was
  clean) and a slot rounded in 30-degree facets all clamped the whole object's bevel.
- **If Harden Normals or Weighted Normal changes nothing, the face is not flat** (Gambrell
  [00:01:06]). Flatten it; more normal modifiers will not help.
- **Pick the school by the part, not by taste.** Planar machined parts with many cuts: n-gons +
  booleans + bevel + custom normals, about a quarter of the time and stays editable (Gambrell
  [00:18:01]). Continuous curvature, non-uniform roundness, a sculpt or bake high: quad cage +
  subdivision (rileyb3d, PzThree). Sharpen subD edges with support loops, not creases: 36,800 vs
  3,600 triangles at equal quality (Lampel [00:05:28]).
- **EXACT is the solver.** Gambrell's 2021 "switch to Fast" predates 5.x: Float left 16 non-manifold
  edges on a coplanar cutter where Exact and Manifold were clean [verified]. When Exact misbehaves
  the operand is broken (Ryuu [00:15:13]): an open cutter gave Exact 19 non-manifold edges and
  Manifold silently skipped the cut [verified].
- **Judge in a shiny matcap and close up on every cut** (Gambrell [00:00:33], rileyb3d [00:06:32]).
  Whole-object sheets hide smears and shrunken bevels.

## Establish first

| Input             | Why it changes the plan                                                                                                                       | Default when silent                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Purpose           | render: 3+ micro segments (Gambrell); game mid-poly: 1 to 2 segments, triangulated, custom normals; bake: subD or boolean high + separate low | render still                                                                      |
| Real size         | bevel widths are absolute: du Mont uses about 3 mm on a small robot body, 1 mm on small parts, 0.1 mm on a collar                             | model at real size; if unknown, micro width 0.5% of the largest dimension [added] |
| Surface           | mostly planar vs curved vs organic-mechanical                                                                                                 | School A for planar parts, B for curved shells, hybrid when mixed                 |
| Budget and engine | Augusto: 15k tris, one 2K map; a quad-only pipeline forces School B (Gambrell [00:24:35])                                                     | no budget: report tris                                                            |
| Later stages      | sculpted damage or multires detail needs a quad cage (PzThree); rigging needs collapsed copies (du Mont)                                      | none                                                                              |
| Symmetry          | mirror the target when the part is symmetric; mirror the cutter around the target when only the cut is (Gambrell [00:14:53])                  | ask the reference                                                                 |

## Workflow

1. **Blockout at real size.** Primitives or bmesh, then `HS.apply_scale(ob)` (keeps children in
   place, flips winding on negative scale). Check proportions against a human-scale box through a
   long lens (du Mont [00:10:01]). GATE: scale is 1 on every object with a bevel, solidify or array;
   silhouette sheet reads (`bx_review.review(..., modes=("silhouette",))`).
2. **Pick the school and build the base stack.**
   - A: design edges with `HS.find_edges(ob, min_angle=80, inside=...)` +
     `HS.set_edge_attr(ob, edges, 1.0)`, then
     `HS.hard_surface_stack(ob, micro_width=..., design_width=...)`.
   - B: quad cage in bmesh (few control points, square quads, rileyb3d / PzThree), then
     `HS.subd_stack(ob, support_width=...)` (Bevel Weight, even segments, profile 1.0, Subdivision
     with UV Smooth Keep Corners) or explicit `HS.support_loops`. GATE:
     `HS.stack_problems(ob) == []`; A has custom normals on the evaluated mesh.
3. **Cut (School A).** `HS.make_cutter(target, "BOX"|"CYLINDER"|"SLOT", size, location, ...)` builds
   a cutter that meets the checklist (scale 1, smooth, Cutters collection only, wire, hidden from
   render, parented, EXACT, wired above the tail). `HS.as_cutter` for custom shapes,
   `HS.slice_boolean` for Slice. Rules: extend past every surface entered; keep cutter edges far
   from target edges or exactly on them; offset a round cutter by half a segment against a target
   with the same count (same phase gave 10 non-manifold edges and streaks [verified]; `make_cutter`
   default); round cutter corners in facets well under the bevel angle (4+ segments per 90 degrees).
   GATE after each cut: `HS.cutter_report(c, target)` clean,
   `HS.clamp_probe(target)["ratio"] < 0.1`, a `HS.closeup` of the cut looked at.
4. **Design pass.** Cluster details, leave calm areas, align with neighboring features (Ryuu
   [00:28:37], Gambrell [00:34:15]); hide perfect intersections behind a collar (du Mont
   [00:39:36]); union parts that must share a bevel (Gambrell [00:18:57]). GATE: a review sheet
   shows intent, not noise.
5. **Shading pass.** `r = HS.shading_audit(ob); HS.verdict(r)`, then
   `HS.review([ob], out, modes=("matcap","reflect","hsgrey","wire"))` and closeups. Triage with
   [`references/critique.md`](references/critique.md): smear on flat faces, non-planar faces, cuts
   on curvature (render first: Harden + WN already shaded 24/48-segment cylinder cuts cleanly; on a
   sphere `HS.transfer_normals` cut the normal error p95 from 2.79 to 0.34 degrees [verified]),
   mirror seam (`HS.mirror_seam_fix`). GATE: verdict empty or every remaining line explained, and
   the closeups agree.
6. **School B detail and pinch check.** Even bevel segments, profile 1.0, Keep Corners (Lampel
   [00:11:15]); brace both sides of a ridge equally (rileyb3d [00:11:08]); outset a border ring
   around inset circles (PzThree [00:42:25]); turn subdivision off to debug a cage artifact
   (Gambrell [00:14:44]). GATE: `r["subd_cage"]` quads near 100%, no long rectangles on a cage that
   will be sculpted, shiny-matcap closeups free of pinches.
7. **Game or export.** Mid-poly: `g, tris = HS.game_version(ob, micro_segments=1)` (Triangulate with
   keep custom normals after WN; stays in place because it shares the cutters); glTF kept the custom
   normals 100% [verified]. Baked asset: the low poly and bake go to scenario-blender-retopology and
   scenario-blender-uv-baking. Rig or export: `HS.collapse(ob)` on a copy (du Mont [01:07:29]).
   GATE: tri count within budget, triangles only, matcap closeup of the game copy.
8. **Deliver** renders, the verdict, tris per object, and what was not verified.

## Numbers

| Value                    | Setting                                                                                     | Relative to / source                    |
| ------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| Micro bevel              | angle 30 degrees, 3 segments render, 1 to 2 game, Harden Normals, Miter Outer Arc           | Gambrell [00:17:20], du Mont [00:14:40] |
| Micro width              | about 3 mm body, 1 mm small parts, 0.1 mm collar                                            | real size, du Mont                      |
| Design bevel             | Limit Method Weight, 8 to 12 segments                                                       | du Mont [00:13:32]                      |
| Big rolling curve        | 46 to 50 segments; cutter edge bevels about 8 to 10                                         | Ryuu [00:12:53], [00:05:42]             |
| Min feature              | wall, step, groove, facet width > 2 x micro width                                           | [added, verified]                       |
| Clamp probe              | displacement over 10% of width = clamping                                                   | [added]                                 |
| Solver                   | EXACT; MANIFOLD for speed with manifold operands; FLOAT only to diagnose                    | verified in 5.2.1                       |
| Round cutters            | vertex count set at creation (40 for screw holes); half-segment phase vs target             | Ryuu [00:29:43]; [verified]             |
| Bevel before Subdivision | 2 or 4 segments, profile 1.0, Weight, UV Smooth Keep Corners                                | Lampel [00:08:06], [00:11:15]           |
| Creases                  | fine for small details or rounding a coarse cylinder at level 1; 10x tris for primary edges | Lampel, du Mont [00:52:18]              |
| SubD cage                | circle 18 verts body, 36 on a denser part; square quads                                     | rileyb3d [00:01:34], PzThree [00:03:15] |
| Mirror seam fix          | bevel Face Strength Affected + WN Face Influence, weight 100                                | Gambrell [00:06:57]                     |
| Game budget              | 15k tris, one 2K map, animated parts separate                                               | Augusto [00:11:48]                      |
| Cost measured            | case 1,984 tris (A) vs 4,608 (B, level 2); barrel 7,308 (A), 25,728 (B), 3,716 (A game)     | test_03 [added]                         |

## Quality gates

**In code** (all in `HS.shading_audit`, readable through `HS.verdict`): scale applied;
`stack_problems` empty; custom normals present when expected; 0 non-manifold edges; 0 flat-shaded
faces; 0 non-planar base faces (tolerance 1e-4 x size); no smear (corner normal leaning over 3
degrees on a flat face [added]); no hard edge (over 45 degrees) smoothed across; clamp ratio under
0.1; every boolean changes the mesh; cutter reports clean (coplanar, near-parallel, thin wall,
narrow gap, near-miss, rounding facets, pokes out, hygiene). School B: quads %, quad aspect, crease
length. Game: `HS.tri_count`, triangles only.

**Visual:** `HS.review` rows matcap (forms), reflect (`check_reflection_horizontal`: stripes run
continuous over bevels and rounds), hsgrey (bevel highlights), wire (real boolean topology); views
front, threequarter, top, low. Then one `HS.closeup(ob, point, radius, ...)` per cut in `shiny`
(metal_carpaint). Look for gradient smears on flat faces, a bevel highlight broken or narrower at a
cut, stretch at cut corners on curves, a butterfly on a mirror seam, subD pinches, facets on cut
walls. A straight-down shiny view saturates white: use matcap or hsgrey from the top.

## Common mistakes

| Mistake                                                     | What it looks like                           | Fix                                                                        |
| ----------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| Boolean below the micro bevel                               | cut edges razor sharp, rest beveled          | `HS.order_stack(ob)`                                                       |
| Weighted Normal added after pinning the bevel               | WN lands above the bevel, smears return      | pin bottom-up (`order_stack`)                                              |
| Cutter near but not on a target face or edge                | whole-object bevel narrower, thin steps      | move clearly away or snap exactly; `cutter_report`, `clamp_culprits`       |
| Groove or wall thinner than 2x bevel                        | clamped bevels everywhere                    | widen the feature or thin the bevel                                        |
| Round cutter in phase with the target facets                | streaks, black patches, non-manifold edges   | half-segment phase (default in `make_cutter`)                              |
| Rounded cutter corners at 30-degree facets                  | micro bevel catches facet edges, clamps      | more segments (`beveled_narrow_facet_edges`)                               |
| Flat-shaded cutter                                          | facets on the cut walls                      | cutters smooth (`make_cutter` does it)                                     |
| "Switch to Fast"                                            | non-manifold result on coplanar faces        | EXACT; repair the operand instead                                          |
| Unapplied scale                                             | uneven bevel widths                          | `HS.apply_scale`                                                           |
| Stacking normal fixes on a non-planar face                  | stretch that nothing fixes                   | `HS.flatten_faces`                                                         |
| Data Transfer placed before WN, or scoped by a vertex group | no effect / cut walls shaded like the skin   | `HS.transfer_normals` (after WN, distance-scoped)                          |
| du Mont's support cut placed through a round cut            | rim edges halved, clamp 0 to 1.2 [verified]  | only where `sliver_report` shows boolean slivers; measure before and after |
| Creases on primary subD edges                               | soft, pinched, heavy                         | support loops or bevel before subdivision                                  |
| Moving a game copy or slice                                 | cuts vanish (cutters stay with the original) | keep it in place, or `HS.collapse` then move                               |

## Blender 5.2 notes

- Auto Smooth is gone (4.1): `bpy.ops.object.shade_auto_smooth` adds a pinned Smooth by Angle node
  modifier (works headless with `temp_override`); WN, Harden Normals and Data Transfer need no Auto
  Smooth.
- Boolean solvers: `'EXACT'` (default), `'MANIFOLD'` (4.5), `'FLOAT'` (the old Fast, renamed 5.0).
- Bevel weights and creases are attributes `bevel_weight_edge` / `crease_edge` (4.0); the Bevel
  modifier reads any attribute through `edge_weight`.
- `ob.modifiers.move(i, j)` silently refuses moves that involve pinned modifiers;
  `modifier_move_to_index` returns CANCELED. Unpin, move, re-pin bottom-up.
- `bmesh.ops.bevel` defaults are `segments=0, profile=0.0`: always pass both.
- EXACT gives cutter-made vertices the target's vertex-group weights (verified), so vertex groups
  cannot keep a Data Transfer off cut walls.
- Bool Tool, LoopTools, Extra Objects are extensions (4.2); LoopTools Circle/Flatten/Space are built
  in (`mesh.circularize`, `mesh.flatten`, `mesh.space_edge_loops_evenly`); Relax and Round Cube are
  not.

## References

- [`references/procedures.md`](references/procedures.md): full tested code for the three parts
  (panel, case both schools, barrel both schools), every audit case, game routes. Load before
  scripting.
- `references/critique.md`: the rubric and triage table to judge a render and a verdict. Load at
  every shading pass.
- [`references/expert-notes.md`](references/expert-notes.md): the experts' principles, disagreements
  and deciding conditions, with timestamps. Load when a choice is not covered here.
- [`references/sources.md`](references/sources.md): the nine videos, who, what each is best for,
  best timestamps.
