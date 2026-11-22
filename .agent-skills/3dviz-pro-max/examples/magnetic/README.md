# Magnetic Atelier

An ideal current-loop field study with numerical streamlines and an exact on-axis probe readout.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/magnetic/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to create a magnetic-field study around one circular current loop. Let me vary and reverse current and move an axial probe; compute probe values with the exact on-axis formula while tracing selected off-axis streamlines numerically; and state that line density is not measured flux density.

## Explore and implementation

Use Overview and Detail. Set loop current and probe `z`, or reverse the current; arrows and readouts reverse together. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/magnetic.js), and [physics helpers](../shared/art-science/scenes/physics-models.js).

## Source and limits

The model follows the [OpenStax Biot–Savart law](https://openstax.org/books/university-physics-volume-2/pages/12-1-the-biot-savart-law). Streamlines integrate normalized vectors with midpoint quadrature; probe values use the exact SI on-axis expression. Lines are geometric paths, not particles or density measurements.

## Skill rules actually applied

The artifact corresponds to `recipe.current-loop-magnetic-field` in [waves, optics, and fields](../../skills/3dviz-pro-max/references/catalog-directions/waves-optics-fields.md), preserving the analytic/numerical distinction. This is a retrospective mapping, not original retrieval evidence.
