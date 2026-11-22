# Light Through Matter

A planar ray-tracing bench for refraction, total internal reflection, and optional illustrative dispersion.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/optics/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to build an optical bench where rays intersect the same triangular faces that are rendered. Apply Snell's law and total internal reflection, let me vary refractive index and incident angle, switch between monochromatic and white-light studies, and distinguish direction markers from optical power or light speed.

## Explore and implementation

Use Overview and Detail. Change index at 550 nm and incident bench angle, toggle the dispersion study, and play/pause direction markers. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/optics.js), and [physics helpers](../shared/art-science/scenes/physics-models.js).

## Source and limits

The trace follows [OpenStax University Physics 3](https://openstax.org/books/university-physics-volume-3/pages/1-4-total-internal-reflection). Dispersion uses an authored Cauchy-like family, not measured glass. Fresnel splitting, absorption, optical power, and physical light speed are omitted.

## Skill rules actually applied

The same geometry owns visible faces and intersection tests, applying the shared-space causality rule in [physical interaction](../../skills/3dviz-pro-max/references/physical-interaction.md) and claim boundaries in [research and truth](../../skills/3dviz-pro-max/references/research-and-truth.md). Catalog mapping is retrospective.
