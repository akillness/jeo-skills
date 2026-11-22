# The Copperleaf Cottage

A close-readable architectural miniature with layered roofing, closed gables, timber structure, glazing, and a supported porch.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/cottage/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create a handcrafted cottage miniature whose construction reads from overview to close-up: closed gables, layered roof courses, structural timber, framed glazing, stone foundation and steps, brass door hardware, supported porch, and window gardens. Use material changes to explain parts and joins.

## Explore and implementation

Use Overview and Detail, orbit/zoom, and reset. See [scene.js](scene.js), [shared architecture](../shared/breadth/src/crafted-architecture.js), and [procedural forms](../shared/breadth/src/craft-forms.js).

## Assets and limits

Geometry, canvas textures, and materials are authored in Three.js; no external asset is used. This is a fictional miniature, not a structural, historical, weatherproofing, or code-compliance model.

## Skill rules actually applied

The visible hierarchy and join detail follow [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md), [object craft](../../skills/3dviz-pro-max/references/object-craft.md), and overview/inspection quality targets in the [skill workflow](../../skills/3dviz-pro-max/SKILL.md#workflow). This is a final-code mapping, not historical retrieval evidence.
