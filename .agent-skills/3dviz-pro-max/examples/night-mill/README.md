# The Mill After Dark

A close night study of a detailed mill wheel, warm local light, cool timber and water, and distinct bulb/receiver behavior.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/night-mill/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to light a watermill after dark. Use low warm light to reveal spokes, rim, axle, hubs, fasteners, timber, and water against a restrained cool key. Let me vary lantern output and see both the glowing source and the actual surface illumination, isolate sources at fixed exposure, rotate the key, and reset the rig.

## Explore and implementation

Use Overview and Detail, orbit/zoom around the wheel, adjust key direction/strength, lantern output, fill, and exposure, then compare Full lighting, Key only, and Lanterns only. See [scene.js](scene.js), [shared night rig](../shared/breadth/src/night-lighting.js), and [village/mill source](../shared/breadth/src/crafted-village.js).

## Assets and limits

The mill and lights are procedural. Wheel rotation is authored and independent of hydraulic flow; pond/stream surfaces are stylized. Light strengths are scene-tuned, not calibrated photometry, and no glTF/Blender transfer was performed.

## Skill rules actually applied

The night series actually retrieved the practical-balance, night-lantern, and punctual-light-handoff records indexed in [lighting profiles](../../skills/3dviz-pro-max/references/catalog-knowledge/lighting-profile.md) and [tool adapters](../../skills/3dviz-pro-max/references/catalog-knowledge/tool-adapter.md). Emitter/receiver separation, fixed-exposure isolation, and direction controls implement [lighting direction and scale](../../skills/3dviz-pro-max/references/lighting-direction-and-scale.md).
