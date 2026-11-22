# The Moonwatch Tower

A tapered masonry watchtower with staggered courses, gallery rail, framed windows, and a copper roof.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/tower/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to build a moonwatch tower miniature with a tapered stone silhouette, staggered masonry courses, framed windows, a supported brass gallery rail, and a distinct copper roof. Make construction roles and edge details remain legible in the close view.

## Explore and implementation

Use Overview and Detail, orbit/zoom, and reset. See [scene.js](scene.js) and the [shared tower factory](../shared/breadth/src/crafted-architecture.js).

## Assets and limits

The tower is fictional procedural geometry. Staggered blocks and rails are visual construction cues, not structural analysis, climbable circulation, or historical reconstruction.

## Skill rules actually applied

Silhouette, connection, and material-role reasoning follow [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md) and [object craft](../../skills/3dviz-pro-max/references/object-craft.md). This mapping describes the final scene and does not infer retrieval history.
