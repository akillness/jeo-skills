# Inside a Sarcomere

A reduced longitudinal model showing filament overlap as Z discs approach without shortening actin or myosin.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/sarcomere/`. `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to make an interactive sarcomere comparison between resting and 25% shorter states. Keep actin and myosin lengths fixed, narrow the I band and H zone as overlap increases, expose the A-band invariant, and let me scrub, play, pause, and isolate filament components. Label every authored simplification.

## Explore and implementation

Overview and Detail share the same model state. Scrub shortening, play/pause sliding, jump to resting or shorter comparisons, hide myosin, and toggle schematic bridges. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/sarcomere.js), and [model equations](../shared/art-science/sarcomere-model.js).

## Sources and limits

The sliding-filament and cross-bridge context follows [OpenStax 10.3](https://openstax.org/books/anatomy-and-physiology-2e/pages/10-3-muscle-fiber-contraction-and-relaxation) and the band structure follows [OpenStax 10.2](https://openstax.org/books/anatomy-and-physiology-2e/pages/10-2-skeletal-muscle). Counts, spacing, display scale, and timing are authored. Bridges mark overlap only; they do not solve ATP cycles or generate motion. Lengthening is prescribed, not myosin pushing actin apart.

## Skill rules actually applied

The artifact matches `recipe.sarcomere-sliding-filaments` in [physiology and biomechanics](../../skills/3dviz-pro-max/references/catalog-directions/physiology-biomechanics.md), plus [subject clarity](../../skills/3dviz-pro-max/references/subject-clarity-and-motion.md) and [authoritative state](../../skills/3dviz-pro-max/references/motion-and-state.md). The rule mapping is retrospective; no claim is made that the present catalog record was retrieved during original construction.
