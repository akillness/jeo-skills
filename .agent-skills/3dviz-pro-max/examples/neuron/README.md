# The Neural Signal

An authored multipolar-neuron illustration with a directional signal marker, myelin, and terminal branches.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/neuron/`. `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create an interactive multipolar neuron explainer with tapering dendrites, soma and nucleus, one axon, myelin segments, and terminal branches. Let me trigger and pace one directional signal and hide structural layers, while stating that the marker is not voltage, ions, or a calibrated action-potential solver.

## Explore and implementation

Use Overview and Detail, trigger one signal, change its display speed, toggle myelin, and reveal the nucleus. See [scene.js](scene.js) and the [shared implementation](../shared/art-science/scenes/neuron.js).

## Sources and limits

Structure follows [OpenStax 12.1](https://openstax.org/books/anatomy-and-physiology-2e/pages/12-1-basic-structure-and-function-of-the-nervous-system); action-potential context follows [OpenStax 12.4](https://openstax.org/books/anatomy-and-physiology-2e/pages/12-4-the-action-potential). The marker and nodal glow are teaching cues. Hiding myelin changes visibility only and does not alter conduction.

## Skill rules actually applied

The code reflects [subject clarity and meaningful motion](../../skills/3dviz-pro-max/references/subject-clarity-and-motion.md), [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md), and [research and truth](../../skills/3dviz-pro-max/references/research-and-truth.md): controls name presentation quantities, motion has one authoritative progress state, and non-simulated physiology is explicit. Catalog mapping is retrospective.
