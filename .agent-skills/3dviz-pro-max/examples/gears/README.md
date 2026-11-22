# Coupled Gears

A machined steel-and-brass spur-gear study with a continuously enforced 3:2 speed ratio.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/gears/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to build two inspectable coupled spur gears: 24 and 16 teeth, module 10 mm, pitch radii 120 and 80 mm, center distance 200 mm. Drive both from one angular state so the second turns oppositely at a 3:2 ratio. Add readable hubs, bearings, supports, and dimensions, and disclose that straight tooth flanks are illustrative rather than involute contact geometry.

## Explore and implementation

Use Overview and Detail, orbit/zoom, global pause/resume, and reset. See [scene.js](scene.js) and the [shared gear implementation](../shared/breadth/src/coupled-gears.js).

## Source and limits

The scene is procedurally authored and uses no external asset. The tooth count, module, pitch radii, center distance, and angular ratio are code-owned invariants. Straight trapezoidal flanks do not solve involute contact, interference, force, wear, or manufacturing tolerances.

## Skill rules actually applied

The implementation follows `recipe.coupled-gears` in [rigid mechanics](../../skills/3dviz-pro-max/references/catalog-directions/rigid-mechanics.md), plus single-driver state ownership in [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md) and close-up part identity in [object craft](../../skills/3dviz-pro-max/references/object-craft.md). The earlier breadth design system records this recipe/style mapping; this README does not infer additional retrieval.
