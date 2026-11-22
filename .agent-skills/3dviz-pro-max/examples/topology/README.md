# The Topology Atelier

An analytic Möbius ribbon, torus-cycle, and trefoil traversal study.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/topology/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to create an interactive topology study with a Möbius ribbon, the two fundamental torus cycles, and a trefoil knot. Animate a local frame or bead, allow traversal scrubbing, and make the Möbius normal reversal and two-circuit restoration inspectable without calling the trefoil a surface.

## Explore and implementation

Use Overview and Detail, choose Möbius, torus, or trefoil, scrub traversal through two circuits, and play/pause. See [scene.js](scene.js) and the [shared scene](../shared/art-science/scenes/topology.js).

## Source and limits

Definitions and context follow [Hatcher, Algebraic Topology](https://pi.math.cornell.edu/~hatcher/AT/AT.pdf). Geometry is analytic. The Möbius boundary is one closed curve; the torus shows two cycle directions; the trefoil is a knotted closed curve.

## Skill rules actually applied

The implementation corresponds to `recipe.mobius-orientation-trace` in [topology and symmetry](../../skills/3dviz-pro-max/references/catalog-directions/topology-symmetry.md), plus [subject clarity](../../skills/3dviz-pro-max/references/subject-clarity-and-motion.md). This is a retrospective mapping, not proof of original catalog retrieval.
