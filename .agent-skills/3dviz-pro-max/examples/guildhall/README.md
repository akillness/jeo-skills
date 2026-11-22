# The Stonewright Guild

A stone-dominant guildhall miniature with a broad facade, layered gables, timber accents, glazing, and brass details.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/guildhall/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create a stonewright guildhall miniature with a broad civic silhouette, closed tall gables, layered roof courses, a masonry body, structural timber accents, framed windows, a supported entrance, and hand-scale brass hardware. Keep material assignments tied to construction roles.

## Explore and implementation

Use Overview and Detail, orbit/zoom, and reset. See [scene.js](scene.js) and the [shared architecture factory](../shared/breadth/src/crafted-architecture.js).

## Assets and limits

All geometry and material grain are procedural. The building is fictional and makes no claims about structural performance, masonry bonds, historical style, accessibility, or code compliance.

## Skill rules actually applied

The scene applies role-based material and part decisions from [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md) and close-up identity guidance from [object craft](../../skills/3dviz-pro-max/references/object-craft.md). This is retrospective rule mapping.
