---
name: scenario-blender-retopology
description: "Use when turning a dense sculpt, scan or AI-generated mesh into clean topology in Blender, for animation, subdivision or a game low poly with a triangle budget. Also when choosing between QuadriFlow or voxel remesh and manual retopo, placing loops around eyes, mouth and joints, deciding pole placement, setting up a Shrinkwrap cage, fixing volume loss after subdivision, preparing a low poly for baking, or auditing topology for spirals, 6-poles and triangles. Keywords: retopo, retopology, quad remesh, clean up an AI mesh, edge flow, low poly, bake prep."
license: MIT
---

# Blender retopology

Expert retopology is a plan executed with the fewest loops that capture the forms and let the mesh
deform: loops close around eyes, mouth and joints, poles sit where nothing moves, and the subdivided
surface, not the cage, matches the sculpt. An agent without a mouse can build every piece of this
from data, but it reaches expert quality only on the parts it plans explicitly. Automatic remeshing
is a finish for static assets and a start for everything else. If a sibling skill named here is
missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).
Toolkit: [`scripts/bx_retopo.py`](scripts/bx_retopo.py)
(`import sys; sys.path.append("<skills>/scenario-blender-retopology/scripts"); import bx_retopo as R`),
all coordinates in the sculpt's local space.

## Stance (the expert delta)

- **Map first, as data.** Kaspar draws six layers on the sculpt before any vertex: edge flow,
  primary creases, secondary (expression-only) creases, articulation, expression bounds, landmarks
  (BCON22 [00:07:55], shown in frames 00:07:53 to 00:14:38). The agent writes the same map as
  coordinates and loop counts (landmarks from renders plus `R.surface_point`), then builds.
- **Loops are the budget, not vertices.** Articulation minimum (Kaspar after Brian Tindall): lids,
  lips and brows as curves with 3 controls and 2 handle loops each, plus 2 corner loops on eyes;
  upper count = lower count (Dikko, Kaspar, Kenny); 3 loops per joint; a crease is 1 loop on it plus
  2 hugging it. Elsewhere "as much as it needs to be" (Kaspar Live #3 [01:56:33]).
- **Poles: valence 3 or 5, where nothing moves, never on a crease loop, a shell rim or the face
  center line** (Kaspar Live #7 [00:11:41], Live #3 [00:36:54]; Dikko [00:04:49]). Lampel's reason:
  pinching is a density jump in the subdivided result, harmless on flat still areas (BCON24
  [00:21:18]). [added] An agent's poles come from ring-count reductions (4 per unit) and from cut
  borders that staircase across an auto base (about half their vertices): budget both.
- **Loops close on themselves.** A spiral around eyes or lips means rebuild (Dikko); a spiral that
  terminates in a still area is tolerated (Dikko body [00:09:34], Kaspar nose).
- **Judge the subdivided surface.** A snapped cage shrinks inside when subdivided; a Shrinkwrap
  offset fixes convex areas and worsens cavities. Fit the cage so its subdivided surface matches
  (Duha BCON23 [00:08:58]): `R.fit_subdiv`. Kaspar's Multires Apply Base does the same job but
  overshoots (measured below).
- **Game low poly = silhouette plus animation loops** (SpeedChar): face about 3x body density,
  triangles wherever nothing bends, twisted quads cut by hand so baker and engine agree, low poly
  slightly proud of the high; every hard edge is a UV seam (On Mars 3D).
- **Auto-remesh fits static, scanned, background or bake-only assets** (Lampel [00:09:05], Grant
  Abbitt, Duha, Jamie Dunbar). For deforming characters it lacks the judgment calls: on the sheep,
  QuadriFlow at expert density gave no rings around eyes or mouth and tore a thin ear.

## Establish first

| Input          | Why it changes the plan                                                        | Default when silent                                                                                                 |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Purpose        | film cage renders at subdivision 2 (Kaspar); game ships triangles and bakes    | deforming character: film-style all-quad cage                                                                       |
| Budget         | film: no vertex budget, minimum loops (Kaspar); game: triangle budget          | film stylized head 1,650 to 4,100 faces, body 9,400 to 16,500 (Blender Studio meshes); game character < 10,000 tris |
| Deformation    | face rig, joints, how far the mouth travels (expression bounds)                | face + limbs deform                                                                                                 |
| Camera         | detail and density follow the closest view (SpeedChar)                         | close-up face                                                                                                       |
| Style          | stylized: creases in topology; realistic: generic base + displacement (Kaspar) | stylized                                                                                                            |
| Symmetry       | `R.topology_report(sculpt)["sym_local_pct"]`, local space                      | Mirror only above ~98 % (the sheep is 21 %, posed)                                                                  |
| Separate parts | eyes, teeth, hair clumps, clothing (from the body duplicate)                   | separate objects                                                                                                    |

## Workflow

1. **Inspect** (procedures P1): holes, manifoldness, scale, rotation, symmetry. GATE: all four
   written down.
2. **Map**: read the sculptor's face sets first (`R.face_set_map`, `R.face_set_review`, P1b: lip
   line, eye masks, ears, hooves); landmarks with coordinates, loop counts per feature from the
   Numbers table, crease list (check expression shape keys), per-part density. GATE: map exists
   before any geometry.
3. **Choose a method per part:**

   | Part                                     | Method                                                                                                                                                                            | Evidence                                                                                             |
   | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
   | Eyes, mouth, brows (deforming)           | `carve_rings(corners=, count=(lo, hi))`: upper = lower by construction, geodesic rings, the border's count kept when inside the range; pair odd boundaries first (`parity_strip`) | v2: eyes 24 (12/12), mouth 30 (15/15) on every clean ring; forcing Kaspar's 18/24 cost 40 more poles |
   | Nasolabial, face frame, neck (map lines) | `carve_band` along `enclosing_contour` of face sets (P7): one clean loop, poles pushed onto the base                                                                              | v2: nasolabial +18 poles; face frame opt-in, +64 poles on the sheep                                  |
   | Limbs, ears, tail, fingers, horns        | `limb_profile` (geodesic contours, root and joints found) + `socket_tube(count=)` (P3b, P8); straight parts: `tube` from sections                                                 | v2: all 7 parts incl. the 1 m curled tail, 3 rings per joint                                         |
   | Skull, torso, smooth masses              | QuadriFlow start acceptable, else grid patches                                                                                                                                    | little deformation                                                                                   |
   | Static prop, scan, bake-only             | QuadriFlow whole object (`R.quadriflow`)                                                                                                                                          | Lampel, Grant Abbitt                                                                                 |
   | Realistic human head                     | shrinkwrap a clean generic base mesh, then fit (Kaspar BCON22 [00:20:16])                                                                                                         | not scripted here                                                                                    |

4. **Build** islands separately and roughly (Kaspar: "don't focus on tweaking all the points").
   Stack via `R.setup_cage` (Mirror clip > Shrinkwrap Target Normal Project > Subsurf hidden in edit
   mode). GATE: topology gate below passes per island.
5. **Relax and freeze** hand-built layouts: `R.relax`, `R.freeze`. Not after QuadriFlow (worsened
   coverage 0.44 % to 0.55 %).
6. **Connect** by counts: `R.boundary_loops`, then `R.bridge` / `R.weld_loops` on equal counts;
   reduce the larger side first (Kaspar: wrist 10 vs hand 16 was "six too many"). GATE: no triangles
   created.
7. **Volume**: film `R.fit_subdiv` (gentle defaults); game `R.push_outside` then
   `R.triangulate_twisted` and a Triangulate modifier on export.
8. **Review and hand off**: gates, two render sheets, handoff hygiene (P13). Report what the agent
   did not plan.

## What an agent reaches (measured on the sheep; `tests/code/blender-retopology/sheep_results.json` and `compare/metrics.json`)

| Strategy                                                                                                                   | Faces | Subdiv-2 mean error | Inside | Eye / mouth rings                              | Closed-loop edges | Looks                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------- | ------ | ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Kaspar's own retopo                                                                                                        | 2,596 | 0.24 %              | 47 %   | 5,5 / 2                                        | 29.9 %            | clean, reads unsubdivided                                                                                                       |
| QuadriFlow, area-matched budget                                                                                            | 4,372 | 0.14 %              | 87 %   | 0 / 0                                          | 1.6 %             | faceted, torn ear, uniform density                                                                                              |
| + gentle `fit_subdiv`                                                                                                      | 4,372 | 0.045 %             | 53 %   | 0 / 0                                          | 1.6 %             | smooth masses, lumpy hooves                                                                                                     |
| + Multires Apply Base instead                                                                                              | 4,372 | 0.11 %              | 15 %   | 0 / 0                                          | 1.6 %             | overshoot                                                                                                                       |
| Hybrid: eye rings + ear tubes + gentle fit                                                                                 | 4,544 | 0.042 %             | 52 %   | 3,3 / 0                                        | 5.9 %             | first skill version                                                                                                             |
| E1 run with the skill (fresh agent: face sets, warp, 4 eye rings, 5 lip rings, limb tubes)                                 | 5,778 | 0.040 %             | 51 %   | 4,4 / 5 (46 to 48 verts)                       | 19.4 %            | planned face, rippled lids, lumps at leg joins                                                                                  |
| v2 tools, final (`test_sheep_v2.py`: face sets, counts as ranges, corner split, geodesic rings and tubes, nasolabial loop) | 4,980 | 0.028 %             | 52 %   | 4,4 clean 24-vert rings, 12/12 / 5 x 30, 15/15 | 33.9 %            | best agent result: poles 5.7 % (Kaspar 5.2 %), none on clean rings, no 6-poles; nose and upper-lip patch irregular (human pass) |

Numbers flatter the agent: an aggressive fit scored 0.043 % and looked lumpier than Kaspar's cage.
What stays human-level only: articulation counts with handle loops, crease loops placed from
expression shapes, pole routing and loop budgets out of the face. Say so in the report.

## Numbers

| Item                          | Value                                                                                                         | Source                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Render subdivision (film)     | 2 levels; viewport 1                                                                                          | Kaspar Live #6 [00:21:53]; BCON22 frame 00:26:38 |
| Joint                         | 3 loops over the bending part                                                                                 | Kaspar Live #5 [01:37:48]                        |
| Limb start ring               | 8 verts (legs 8 then 12); Dikko arms 8 min, 10 to 12 typical, legs 18                                         | Kaspar Live #4 [00:06:54]; Dikko [00:13:47]      |
| Eyelid                        | 2 loops per lid crease + ~4 across; 10/10 spans example                                                       | Kaspar Live #1 [02:11:22]; Dikko [00:04:16]      |
| Studio mesh                   | 99.9 %+ quads, 0 to 4 valence 6+ (report and justify each), poles ~1.8 % head, ~5 % body, edge CV 0.33 to 0.8 | calibration (bx_audit on Blender Studio files)   |
| Auto-remesh hint (not a gate) | edge CV ~0.17 to 0.27 on an unedited uniform remesh, near 0 % closed loops                                    | calibration, sheep                               |
| Game                          | head 2,000 to 3,000 tris, hands ~1,000 both, body 5,000 to 6,000                                              | SpeedChar ep23 [00:09:58], ep24 [00:50:34]       |
| Apply Base levels             | 2 body, 3 head, hair, clothes                                                                                 | Kaspar Live #5 [02:15:03]                        |

## Quality gates

Code (thresholds [added], calibrated on Kaspar's sheep: 0.24 % mean, 47 % inside, coverage p95 0.82
%):

```python
retopo_gate = R.topology_report(retopo)
fit_gate = R.fidelity(retopo, sculpt, levels=2)
gate = {"six_poles_to_justify": retopo_gate["valence_6plus"], "no_rim_poles": retopo_gate["rim_poles"] == 0,
        "quads": retopo_gate["non_quads_visible"] == 0 or retopo_gate["quads_pct"] >= 99.0,
        "subd_fit": fit_gate["mean_pct"] <= 0.3 and 40 <= fit_gate["inside_pct"] <= 60,
        "coverage": fit_gate["cov_p95_pct"] <= 1.0, "loops": R.loop_stats(retopo)}
print(gate)
```

Edge-length CV is never pass/fail (studio meshes read 0.33 to 0.8); 6-poles are reported and
justified, not banned (studio 0 to 4). Also: `crease_poles == 0`, `center_poles == 0` on mirrored
faces, `R.loops_around(retopo, eye, normal, max_radius)` returns at least 3 closed rings per eye and
mouth, ring counts equal before every merge, triangles only in hidden or rigid areas, budget met
(`R.tri_count`). Visual (`bx_review`, same views as the sculpt): cage in wire (rings close, no
wandering loops, poles in still areas) and subdivided matcap (lumps, pinching at poles, creases
held), then the cage alone: it must read without subdivision (Kaspar Finale [01:58:41]). Score with
[`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                                   | Looks like                                           | Fix                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Carving around QuadriFlow's closed eye slits              | every eye ring odd (47, 45), no all-quad fix         | `R.parity_strip` between the two odd boundaries BEFORE carving                               |
| Counts inherited from a dense cut, or forced far below it | eye rings 46 to 48; or pole density 9.5 %            | `count=(lo, hi)`: each reduction unit costs 4 poles; ranges took the sheep from 9.5 to 5.7 % |
| 3D-nearest lookups where surfaces touch                   | a band or socket cut bites an ear lying on the cheek | geodesic fields, `curve_verts`, oriented `nearest_vertex` (built into bands and tubes)       |
| Tight rings for an edge-flow loop                         | a ridge after subdivision                            | band `spacing` = edge length; tight only for creases                                         |
| Shipping a snapped cage                                   | subdivided surface inside the sculpt (87 %)          | `R.fit_subdiv`                                                                               |
| Shrinkwrap offset for volume                              | cavities worse                                       | fit, offset 0                                                                                |
| Raw `quadriflow_remesh` on a small dense mesh             | CANCELED, "needs to be manifold"                     | `R.quadriflow` (scale trick, voxel fallback)                                                 |
| QuadriFlow symmetry left at its default True              | wrong half on a posed mesh                           | `symmetry=False` unless symmetric                                                            |
| Relaxing an auto-remesh                                   | tips and ears shrink                                 | relax hand-built layouts only                                                                |
| Mark Sharp / Seam as reminders                            | shading breaks (4.1+), unwrap cuts                   | `retopo_crease` attribute (P5)                                                               |
| Grid fill on an odd loop                                  | FINISHED, 0 faces                                    | count first; `R.grid_fill` raises                                                            |
| Connecting parts early                                    | every new loop runs everywhere                       | islands, count, merge last                                                                   |
| Trusting mean error                                       | lumpy fit passes                                     | matcap review, gentle fit                                                                    |
| Re-shrinkwrap after Apply Base                            | volume lost again                                    | never (Kaspar Live #6 [00:20:08])                                                            |
| Game quads left non-planar                                | lines in the normal map                              | `R.triangulate_twisted`, Triangulate on export                                               |

## Blender 5.2 notes

- Hidden Wire is the **Retopology overlay** (`overlay.show_retopology`, offset 0.01 m since 4.5);
  "Project Individual Elements" is `snap_elements_individual = {'FACE_PROJECT'}`. GUI only.
- Slide Relax is the **Relax Slide** brush asset (strokes need a window, `bx_gui`); headless use
  `R.relax`. F2, LoopTools, BSurfaces are extensions; `mesh.circularize`, `space_edge_loops_evenly`,
  `flatten` are built in; `mesh.select_by_pole_count` exists (4.4).
- The BCON22 build's Shrinkwrap showed Smooth Factor 0.05 / Repeat 1 (frame 00:22:53); 5.2.1's
  Shrinkwrap has no such option.
- `sharp_edge` is always honored since 4.1; Auto Smooth is gone (Smooth by Angle modifier).
- Apply Base = `object.multires_base_apply(apply_heuristic=True)`; QuadriFlow lost its shortcut and
  has the traps above.

## References

- [`references/procedures.md`](references/procedures.md): tested code, P0 to P14 (inspect, face sets
  P1b, stack, tubes, geodesic limbs P3b, freeze/relax, annotations, QuadriFlow, map-line loops and
  rings, sockets, volume, checks, game, expression test, handoff, AI-mesh finishing). Load before
  writing any code.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps,
  face and body loop maps, clothing, game rules, the sheep experiment in full. Load when planning a
  face, body, clothing or game mesh.
- `references/critique.md`: the rubric to judge your own retopo. Load at every review.
- [`references/sources.md`](references/sources.md): all 24 source videos with best timestamps.
