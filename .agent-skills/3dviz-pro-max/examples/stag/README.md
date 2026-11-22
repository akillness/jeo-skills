# The Moonwood Stag

A procedural forest-spirit character with branching antlers, split hooves, layered mane, and restrained planted motion.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/stag/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create a distinctive moonwood stag with a readable cervid silhouette, branching antlers, split hooves, shoulder anatomy, a layered tapered throat mane, and a patinated ceremonial collar. Add only quiet breathing, head, and tail gestures while keeping all feet planted and the close-up joins convincing.

## Explore and implementation

Use Overview and Detail, orbit/zoom, pause/resume, and reset. See [scene.js](scene.js), the [shared creature](../shared/breadth/src/crafted-creatures.js), and [procedural forms](../shared/breadth/src/craft-forms.js).

## Assets and limits

All geometry and materials are procedural; no external model or biological dataset is used. The creature is fictional. Its movement is authored ambient posing, without locomotion, foot IK, skeletal simulation, or biomechanics.

## Skill rules actually applied

The scene reflects silhouette/parts/surface reasoning in [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md), structural detail in [object craft](../../skills/3dviz-pro-max/references/object-craft.md), and planted ambient motion in [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md). These are rule matches to the final code, not claims of dataset retrieval.
