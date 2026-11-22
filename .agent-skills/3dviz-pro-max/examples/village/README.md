# Copperleaf Hollow

A procedural village diorama with raised gardens, distinct landmarks, curved paths, stream and pond, bridge, creatures, and a working visual mill.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/village/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to build a coherent copper-and-timber village diorama with varied foundations and architecture, raised gardens, curved inset paths, a persistent pond and stream, a supported timber bridge with beams and fasteners, reeds and bank stones, a detailed watermill with axle hubs, and two restrained ambient creatures. Keep the mill and ripples visually meaningful without calling them hydraulics.

## Explore and implementation

Use Overview and Detail, orbit/zoom, pause/resume village motion, and reset. Inspect bridge supports, stream banks, mill axle/hubs, landmark foundations, and creature placement. See [scene.js](scene.js), the [shared village](../shared/breadth/src/crafted-village.js), and its architecture, prop, and creature factories in [shared breadth sources](../shared/breadth/src/).

## Assets and limits

The scene is procedural and uses no external model. Building grain is generated at runtime. Mill rotation, ripples, and creature gestures are authored; there is no hydraulic, fluid, pathfinding, collision, or ecological simulation.

## Skill rules actually applied

The artifact applies [design synthesis](../../skills/3dviz-pro-max/references/design-synthesis.md), [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md), [physical interaction](../../skills/3dviz-pro-max/references/physical-interaction.md), and time/state ownership in [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md). These links explain visible decisions; they do not imply unrecorded historical catalog retrieval.
