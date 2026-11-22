# The Wishing Well

A masonry well with visible water, open bucket, rope coil, metal hoops, and a supported pitched roof.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/well/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to build a wishing-well prop that reads from above and beside it: staggered masonry, a visible water surface, supported roof, axle and rope coil, an open timber bucket, and metal hoops. Make every support and connection visible in the detail view.

## Explore and implementation

Use Overview and Detail, orbit/zoom, and reset. See [scene.js](scene.js) and the [shared prop](../shared/breadth/src/crafted-props.js).

## Assets and limits

Everything is procedural. The water is a surface and the rope/bucket are static authored geometry; no draw-well mechanism, rope dynamics, depth measurement, or fluid simulation runs.

## Skill rules actually applied

Support, connection, and inspection choices apply [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md), [object craft](../../skills/3dviz-pro-max/references/object-craft.md), and [physical interaction](../../skills/3dviz-pro-max/references/physical-interaction.md). This is final-code mapping.
