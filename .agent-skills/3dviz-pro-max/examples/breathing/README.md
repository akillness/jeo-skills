# Breath by Breath

A registered lung-lobe study with an authored thoracic expansion field, schematic diaphragm, and directional airway cues.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/breathing/`. `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to build a breathing-mechanics study from licensed registered lung lobes and trachea. Keep shared lobe boundaries coherent as the diaphragm descends and the thorax expands; provide cycle scrub/play/rate, airway visibility, and an anterior section; and disclose that pressure, flow, gas exchange, compliance, and tissue mechanics are not solved.

## Explore and implementation

Use Overview and Detail, scrub or play the breathing cycle, change its illustrative rate, reveal denser schematic bronchi and direction arrows, open the anterior section, and toggle the optional upper-rib resting reference. The moving source anatomy remains a selected six-part lung/trachea study. See [scene.js](scene.js), [shared breathing scene](../shared/art-science/scenes/breathing.js), and [anatomy attribution](https://assets.3dviz.dev/anatomy/attribution.json).

## Sources, assets, and limits

Source meshes are [BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D), [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/). Mechanics were checked against [OpenStax 22.3](https://openstax.org/books/anatomy-and-physiology-2e/pages/22-3-the-process-of-breathing). The envelope, diaphragm and its fiber marks, bronchi, arrows, upper-rib reference, and 40/60 timing are authored. Lungs are shown passively following thoracic motion; no fluid or tissue solver runs.

## Skill rules actually applied

The scene follows [research and truth](../../skills/3dviz-pro-max/references/research-and-truth.md), [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md), and [subject clarity](../../skills/3dviz-pro-max/references/subject-clarity-and-motion.md): one shared deformation state, direction-only arrows, synchronized phase readouts, and precise exclusions. Catalog mapping is retrospective.
