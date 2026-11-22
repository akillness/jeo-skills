# The Windwritten Tree

A branching procedural tree with exposed roots, fine twigs, oriented leaves, and deliberately open canopy gaps.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/tree/`; `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create a stylized hero tree whose identity comes from a branching hierarchy, exposed roots, fine twigs, individually oriented leaves, and open canopy gaps. Avoid a solid green blob; let light reveal the trunk-to-twig structure and distinguish bark, leaf, and stone.

## Explore and implementation

Use Overview and Detail, orbit/zoom, and reset. See [scene.js](scene.js), the [shared tree factory](../shared/breadth/src/crafted-props.js), and [procedural forms](../shared/breadth/src/craft-forms.js).

## Assets and limits

The tree is procedural and fictional. Its branching and leaves are composition geometry, not a botanical species model, growth simulation, wind solver, or structural analysis.

## Skill rules actually applied

The hierarchy and silhouette follow [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md), while canopy gaps and material separation follow [design synthesis](../../skills/3dviz-pro-max/references/design-synthesis.md). This is retrospective rule mapping.
