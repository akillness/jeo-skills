# A Light at the Door

A close architectural lighting study of warm panes, nearby lantern light, cool rim separation, and readable door construction.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/night-doorway/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create a night doorway study where warm windows and one lantern reveal brass hardware, timber joints, stone steps, and porch supports. Let me move the cool key behind the roof to inspect silhouette separation, isolate key and lantern sources, tune fill and exposure, and reset to a deliberate authored composition.

## Explore and implementation

Use Overview and Detail, orbit/zoom around the entrance, adjust all lighting quantities, and compare Full lighting, Key only, and Lanterns only. See [scene.js](scene.js), the [shared night rig](../shared/breadth/src/night-lighting.js), and [architecture source](../shared/breadth/src/crafted-architecture.js).

## Assets and limits

All geometry, glazing, and lights are procedural. Emissive panes and bulbs do not illuminate receivers by themselves; separate scene lights own that effect. Values are authored, not architectural photometry. No glTF or Blender handoff ran.

## Skill rules actually applied

The series actually retrieved `knowledge.emissive-practical-light-balance`, `knowledge.lighting-mood-night-lantern`, and `knowledge.gltf-punctual-light-units-handoff`; indexes: [lighting profiles](../../skills/3dviz-pro-max/references/catalog-knowledge/lighting-profile.md) and [tool adapters](../../skills/3dviz-pro-max/references/catalog-knowledge/tool-adapter.md). The implemented source isolation and fixed exposure follow [lighting direction and scale](../../skills/3dviz-pro-max/references/lighting-direction-and-scale.md).
