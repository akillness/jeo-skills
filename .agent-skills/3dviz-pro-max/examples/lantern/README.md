# The Lamplighter’s Lantern

An octagonal iron-and-brass lantern with thin glazing, scrollwork, rivets, and restrained flame motion.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/lantern/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create an inspectable lamplighter's lantern with an octagonal iron frame, brass rivets, scrollwork, thin amber glazing, and a sheltered candle. Preserve the metalwork under a subtle flame flicker and make clear whether the flame is decorative or actually lights nearby surfaces.

## Explore and implementation

Use Overview and Detail, orbit/zoom, pause/resume flicker, and reset. See [scene.js](scene.js), the [shared prop](../shared/breadth/src/crafted-props.js), and [procedural forms](../shared/breadth/src/craft-forms.js).

## Assets and limits

All geometry and materials are procedural. The flame scale flicker is authored decoration; this isolated prop does not simulate combustion, heat, smoke, or photometric output.

## Skill rules actually applied

Close-up part construction follows [object craft](../../skills/3dviz-pro-max/references/object-craft.md). The distinction between visible emissive source and receiver illumination follows [lighting direction and scale](../../skills/3dviz-pro-max/references/lighting-direction-and-scale.md); this standalone prop does not claim the full night-village lighting rig.
