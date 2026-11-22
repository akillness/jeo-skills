# Lanterns by the River

A cool moonlit village composed around warm pools of lantern light and darkness between them.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/night-river/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create a lantern-led night composition along a village river. Keep cool moon and sky fill restrained, place warm practical pools at human height, preserve darkness between pools, and expose direction, strength, lantern output, fill, exposure, source isolation, and reset controls. Make glowing bulbs and illuminated surfaces respond separately and coherently.

## Explore and implementation

Use Overview and Detail, then vary key direction and strength, lantern output, sky fill, and exposure. Compare Full lighting, Key only, and Lanterns only. See [scene.js](scene.js), the [shared night rig](../shared/breadth/src/night-lighting.js), and [village source](../shared/breadth/src/crafted-village.js).

## Assets and limits

All geometry and lights are procedural. Light values and colors are authored for this scale and renderer; they are not photometric survey data. Pond highlights are a surface treatment, not a mirrored render or optical-water simulation. No glTF/Blender light transfer occurred.

## Skill rules actually applied

This night series actually retrieved `knowledge.emissive-practical-light-balance`, `knowledge.lighting-mood-night-lantern`, and `knowledge.gltf-punctual-light-units-handoff`; see [lighting profiles](../../skills/3dviz-pro-max/references/catalog-knowledge/lighting-profile.md), [tool adapters](../../skills/3dviz-pro-max/references/catalog-knowledge/tool-adapter.md), and [lighting direction and scale](../../skills/3dviz-pro-max/references/lighting-direction-and-scale.md). The glTF guidance contributed declared exposure/unit thinking, not an export claim.
