# Across the Lantern Bridge

A close bridge-and-pond lighting study with one local lantern, cool key light, and receiver-visible shadows.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/night-bridge/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to light a timber village bridge at night. Let one lantern reveal the bridge beams, fasteners, rail, reeds, bank stones, and pond edge while cool moonlight separates leaves and water. Provide direction, output, fill, exposure, source-isolation, and reset controls, and inspect receivers and shadows rather than judging only the glowing bulb.

## Explore and implementation

Use Overview and Detail, orbit near the bridge, adjust key and lantern parameters, and compare Full lighting, Key only, and Lanterns only. See [scene.js](scene.js), [shared night rig](../shared/breadth/src/night-lighting.js), [fixtures](../shared/breadth/src/night-fixtures.js), and [village geometry](../shared/breadth/src/crafted-village.js).

## Assets and limits

The scene is procedural. Water uses authored highlights rather than a mirrored scene or fluid/optical simulation. Intensities are renderer-scale artistic values, not calibrated lux measurements. No Blender or glTF light import was used.

## Skill rules actually applied

The series actually retrieved the practical-balance, night-lantern, and punctual-light-handoff records indexed in [lighting profiles](../../skills/3dviz-pro-max/references/catalog-knowledge/lighting-profile.md) and [tool adapters](../../skills/3dviz-pro-max/references/catalog-knowledge/tool-adapter.md). [Lighting direction and scale](../../skills/3dviz-pro-max/references/lighting-direction-and-scale.md) is directly visible in source isolation, explicit exposure, and receiver/occluder inspection.
