# Crystal Conservatory

A fictional subterranean garden with crystal light, a bounded pond resident, and restrained ambient motion.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/cavern/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to create a distinctive crystal conservatory inside a cavern: layered stone canopy, masonry portal, pond and bridge, varied crystal garden, plants, mushrooms, a moon axolotl, and a silk moth. Give me crystal-glow, motion-pace, and canopy controls; keep the pond resident on a bounded path; and label the water and creatures as stylized rather than simulated biology or fluid dynamics.

## Explore and implementation

Use Overview and Detail. Adjust crystal luminescence and garden pace, pause globally, and reveal/hide the stone canopy. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/cavern.js), and its [authored craft helpers](../shared/art-science/scenes/conservatory-craft.js).

## Assets and limits

The world is fictional and procedurally authored. Background rock clusters reuse the project's kit geometry; no remote or copied model asset is required. The axolotl stays inside the pond, but water is a stylized moving surface rather than a fluid solver.

## Skill rules actually applied

The scene reflects [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md), [object craft](../../skills/3dviz-pro-max/references/object-craft.md), [design synthesis](../../skills/3dviz-pro-max/references/design-synthesis.md), and bounded living-world motion in [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md). These are retrospective matches to visible decisions, not historical retrieval evidence.
