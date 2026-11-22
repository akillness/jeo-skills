# The Last Light

A blue-hour direction study with a low amber key and cool sky fill over Copperleaf Hollow.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/blue-hour/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to light a crafted village at blue hour. Use a low amber key to graze roof courses and masonry and a cool sky fill to retain shadow detail. Give me azimuth, elevation, key strength, lantern output, sky fill, exposure, source isolation, and reset controls so I can compare front, side, and rim light at fixed settings.

## Explore and implementation

Use Overview and Detail, orbit/zoom, and the lighting controls. Compare Full lighting, Key only, and Lanterns only; reset restores the authored blue-hour rig. See [scene.js](scene.js), [shared night rig](../shared/breadth/src/night-lighting.js), [fixtures](../shared/breadth/src/night-fixtures.js), and [village](../shared/breadth/src/crafted-village.js).

## Assets and limits

The village and lights are procedural. Numeric light intensities are scene-tuned Three.js values, not measured site photometry. Window and bulb emission is separated from lights that illuminate receivers; exposure is explicit. No glTF light import or Blender export was run.

## Skill rules actually applied

The project actually retrieved and adapted `knowledge.emissive-practical-light-balance`, `knowledge.lighting-mood-night-lantern`, and `knowledge.gltf-punctual-light-units-handoff`, indexed in [lighting profiles](../../skills/3dviz-pro-max/references/catalog-knowledge/lighting-profile.md) and [tool adapters](../../skills/3dviz-pro-max/references/catalog-knowledge/tool-adapter.md). It applies emitter/receiver ownership, fixed-exposure isolation, and directional checks from [lighting direction and scale](../../skills/3dviz-pro-max/references/lighting-direction-and-scale.md); the glTF record informed unit/exposure discipline only.
