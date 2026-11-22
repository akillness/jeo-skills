# Space, Rewritten

An interactive geometric SVD showing a sphere transformed by `Vᵀ`, `Σ`, then `U`.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/svd/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to visualize a 3D singular value decomposition as rotate, stretch, rotate. Keep the ghost sphere and grid fixed, derive geometry and determinant/rank readouts from the same singular values, allow the smallest value to reach zero, and let me scrub or replay the three stages.

## Explore and implementation

Use Overview and Detail. Scrub factorization progress, set `σ₁` and `σ₃`, and replay. At `σ₃ = 0`, the final image visibly has rank two. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/svd.js), and [math helpers](../shared/art-science/scenes/math-models.js).

## Source and limits

The factorization follows [MIT 18.06SC](https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/pages/positive-definite-matrices-and-applications/singular-value-decomposition/). It uses proper rotations and ordered nonnegative singular values; the sphere lattice is transformed without rebuilding geometry. It is a teaching model of one factorization, not a general matrix calculator.

## Skill rules actually applied

The implementation matches `recipe.svd-sphere-to-ellipsoid` in [linear algebra](../../skills/3dviz-pro-max/references/catalog-directions/linear-algebra.md) and [mathematical authoritative-state rules](../../skills/3dviz-pro-max/references/motion-and-state.md). This correspondence is retrospective; original retrieval of the present catalog record is not claimed.
