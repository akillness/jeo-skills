# The Qubit Compass

An interactive pure-state Bloch sphere with angular controls and basis probabilities.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/bloch/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to build a polished pure-state Bloch sphere. Give it clear axis and basis labels, a state vector controlled by polar angle θ and azimuth φ, an optional azimuth sweep, and synchronized P(0), P(1), and radius readouts. State that this is state space rather than a particle orbit.

## Explore and implementation

Use Overview and Detail, orbit and zoom, adjust θ and φ, or animate the azimuth sweep. See [scene.js](scene.js) and the [shared model](../shared/breadth/src/crafted-bloch.js).

## Source and limits

Coordinates and probabilities follow [IBM Quantum's Bloch-sphere treatment](https://quantum.cloud.ibm.com/learning/en/courses/general-formulation-of-quantum-information/density-matrices/bloch-sphere). This artifact fixes `|r|=1`: it represents pure states only, with no mixed-state interior, channel map, or physical-space orbit. All geometry is procedural.

## Skill rules actually applied

The model corresponds to `recipe.single-qubit-bloch-ball` in [linear algebra](../../skills/3dviz-pro-max/references/catalog-directions/linear-algebra.md), while [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md) keeps angles, vector, and probabilities synchronized. This rule mapping does not claim historical retrieval unless separately recorded by the original breadth study.
