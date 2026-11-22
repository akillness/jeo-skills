# The Carpenters’ Long Hall

A long-form timber hall miniature with repeated structural bays, roof courses, framed openings, and supported entry details.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/hall/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to build a carpenters' long hall as a detailed architectural miniature. Make its long proportion, repeated timber bays, closed gables, layered roof, framed windows, foundation, porch supports, and entry hardware readable at both overview and inspection distance.

## Explore and implementation

Use Overview and Detail, orbit/zoom, and reset. See [scene.js](scene.js) and the [shared architecture factory](../shared/breadth/src/crafted-architecture.js).

## Assets and limits

The hall is fictional procedural geometry with generated material grain. It demonstrates visual construction logic, not engineering loads, joinery certification, historical accuracy, or building-code compliance.

## Skill rules actually applied

Part hierarchy, repeated construction, and scale-aware details follow [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md) and [object craft](../../skills/3dviz-pro-max/references/object-craft.md). These are retrospective matches to the implementation.
