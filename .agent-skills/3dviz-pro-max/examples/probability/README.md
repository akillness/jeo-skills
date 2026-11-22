# Probability in Glass

A seeded three-dimensional Gaussian sample with a covariance ellipsoid and marginal-density floor curves.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/probability/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to create a seeded multivariate-Gaussian point cloud with a covariance ellipsoid. Let me vary population correlation, sample count, horizontal spread, seed, and shell visibility; report sample correlation separately; and explain exactly what the ellipsoid and floor projections do and do not encode.

## Explore and implementation

Use Overview and Detail. Adjust `ρ`, sample count, and `σx`; draw another deterministic sample; toggle the shell. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/probability.js), and [math helpers](../shared/art-science/scenes/math-models.js).

## Source and limits

The model follows [Stanford CS229's multivariate Gaussian notes](https://cs229.stanford.edu/section/gaussians.pdf). Box–Muller samples are transformed by a Cholesky factor. The shell is Mahalanobis radius 2, not a 95% boundary in 3D. Correlation controls X–Y; the floor shadow is X–Z and does not display it.

## Skill rules actually applied

The artifact corresponds to `recipe.covariance-ellipsoid-axes` in [probability and statistics](../../skills/3dviz-pro-max/references/catalog-directions/probability-statistics.md), especially population/sample separation and still-state rendering. This is a retrospective mapping, not original retrieval evidence.
