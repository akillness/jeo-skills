# Critique rubric: judging a Geometry Nodes tree, asset or simulation

Use this at every gate. Each line says what the experts look at, how the agent checks it, and what
fails. "Code" items run through `bx_gn`; "Look" items need a render opened with the image reader
(`G.snapshot`, or `bx_review.review` for realized meshes).

## 1. The tree is sound (always)

| Check                                        | How                                                                          | Fail when                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Every link exists and is valid               | `G.check(md)["invalid_links"]` after one evaluation (nested groups included) | any entry: field into a single-value socket, gizmo on a non-invertible source, incompatible types                       |
| No errors or unexpected warnings             | `G.check(md)["warnings"]`                                                    | any ERROR (closure signature, missing data); a WARNING you did not design                                               |
| Zones paired, output linked                  | `unpaired_zones`, `output_unlinked`                                          | either non-empty or True                                                                                                |
| Every field has a known evaluation point     | read the tree: which node consumes it, on which domain and geometry          | coupled values written by separate nodes (position then velocity), a field reused on a different geometry than intended |
| Named attributes where a boundary is crossed | `G.stats(obj)` attributes, `G.attribute` domain and type                     | the shader, another modifier or the physics cache expects a name that is not there                                      |
| Seeds independent                            | one exposed Seed, offset per Random Value                                    | two Random Value nodes share Seed and ID (values move together)                                                         |

## 2. The result is right (numbers before looks)

| Check                                 | How                                                                                                                                                                           | Fail when                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Counts match the analytic expectation | scatter: density x mask x eligible area (about 12 percent tolerance); arrays: floor(length / spacing); repeat growth: F0 + sides x selected x iterations; sims: rate x frames | off by more than sampling noise, or a count that jumps with an unrelated change  |
| Values in range                       | `G.attribute(...)` min / max; temperature within ambient and source, factors within 0 to 1                                                                                    | NaN, out of range, constant where it should vary                                 |
| Rotation probe                        | rotate or flip the object, re-evaluate                                                                                                                                        | "up", "down", gravity or ground follow the object instead of the world           |
| Resolution probe                      | double the input resolution                                                                                                                                                   | a trait selection's share changes a lot, or an index selection silently moves    |
| Instances where they should be        | `G.instance_transforms` against the host surface (BVH nearest), slopes, normals                                                                                               | instance on a face steeper than the limit, Z axis off the normal in aligned mode |
| Topology after mesh operations        | `bx_audit.audit(obj, evaluated=True)`                                                                                                                                         | non-manifold edges, flipped faces, zero-area faces you did not intend            |

## 3. It is a tool, not a tree (reusable assets)

| Check                               | How                                                                                                                                   | Fail when                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| No scene data inside                | `G.check(md)["hard_refs"]`                                                                                                            | an Object or Collection set on a node instead of a Group Input socket (Thommes BCON23)                                |
| Interface a stranger can use        | read `tree.interface.items_tree`                                                                                                      | unnamed or technical socket names, no panels, missing min / max, angles without ANGLE subtype, factors without FACTOR |
| Defaults produce something sensible | attach to a fresh primitive with no inputs set                                                                                        | empty output or an explosion at defaults                                                                              |
| Works on a second object            | Thommes' Suzanne test: attach to a different mesh, check and look                                                                     | needs a tree edit to work elsewhere                                                                                   |
| Gizmos wired for artists            | gizmo Value links trace to Group Input sockets through the first input of invertible math; Transform outputs joined into the geometry | gizmo on an internal value (invisible without the editor), `is_valid` False, gizmo left behind after a transform      |
| Published correctly                 | `tree.is_modifier`, `tree.asset_data`                                                                                                 | not shown in Add Modifier / asset browser when it should be                                                           |

## 4. It is cheap enough

| Check                | How                                                                    | Fail when                                                         |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Evaluation time      | `G.time_eval(obj)` (not `md.execution_time`, which reads 0.0 headless) | hot tree slower than the brief allows                             |
| Loops justified      | list repeat and for-each zones                                         | a for-each that a field node could replace (Thommes: last resort) |
| Instances kept       | stats: instances vs realized verts                                     | realized for no downstream reason                                 |
| Static chunks cached | Bake node set to Still after heavy static work                         | recomputed every frame or file load                               |
| Secondary sims light | points per strand, substeps                                            | more than needed (Thommes caps threads at 3 points)               |

## 5. Simulations behave

| Check                      | How                                                                       | Fail when                                                                                    |
| -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| State persists             | step frames, read the state attribute                                     | resets each frame (not wired through, or not in Extra Sim Attributes for the physics assets) |
| Stepping discipline        | `G.step` in order, or `G.bake` before random access                       | results taken after a jump (one step only)                                                   |
| Bounds and contacts        | nothing below the ground or inside a collider, pins drift under tolerance | penetration, pinned points sliding                                                           |
| Monotonic where it must be | irreversible states (molten) never decrease                               | a Max(previous, current) missing                                                             |
| Append-only topology       | ids of existing elements unchanged frame to frame                         | new elements inserted before old ones                                                        |
| Frame range                | current frame inside the simulation range                                 | frame 0 or negative ("nothing works", Thommes BCON26)                                        |
| Bake equals stepping       | compare a baked jump with the stepped frame                               | differs                                                                                      |

## 6. It looks right (render and open it)

- **Scatter:** density reads natural (no grid, no clumps from correlated seeds), slopes bare where
  they should be, nothing floating or sunk (Workbench shadows in `G.snapshot` show contact),
  variation in scale and spin, instance attributes visible in the shader.
- **Arrays along curves:** even spacing, no flips at curvature changes, links or tiles interlock
  where intended.
- **Procedural modeling (repeat, extrude):** silhouette reads, no self-intersection at the base,
  tapering even; check silhouette and matcap in `bx_review`.
- **Simulations:** a frame strip (`G.snapshot(..., frames=[...])`) shows the motion you expect then
  rest; melt, drip, tear and fabric stiffness read naturally; tears asymmetric and reinforced where
  garments are reinforced (Thommes BCON26).
- **Attribute-driven shading:** edge masks, wrinkle or stretch maps, temperature glow checked at
  render resolution, not only in the viewport.
- **Gizmos:** placement and drag feel can only be judged in a live GUI session (viewport
  screenshot); headless, verify wiring only and say so.
