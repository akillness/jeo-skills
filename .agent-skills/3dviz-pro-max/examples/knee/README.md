# The Moving Knee

A registered bone assembly for resting, exploded, and approximate hinge inspection of the knee.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/knee/`. `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create a licensed registered-anatomy knee inspection with femur, tibia, fibula, and patella. Provide a reversible exploded assembly, a clearly labeled illustrative hinge, optional cruciate guides, and patella visibility. Preserve resting anatomy as the reliable reference and name the contact mechanics that are absent.

## Explore and implementation

Use Overview and Detail, explode the bones, adjust the 0–45° illustrative hinge, toggle schematic cruciate guides, and reveal or hide the patella. See [scene.js](scene.js) and the [shared scene](../shared/art-science/scenes/knee.js).

## Sources, assets, and limits

Geometry is [BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D), [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/). Joint context follows [OpenStax 9.6](https://openstax.org/books/anatomy-and-physiology-2e/pages/9-6-anatomy-of-selected-synovial-joints). Cruciate guides use authored attachments. Rolling, sliding, patellar tracking, cartilage, menisci, load, and contact are not solved.

## Skill rules actually applied

The scene matches `recipe.knee-layer-peel` in [anatomy structures](../../skills/3dviz-pro-max/references/catalog-directions/anatomy-structures.md) and the assembly-state rules in [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md): source pose remains authoritative and exploded offsets are reversible presentation transforms. This is a retrospective mapping, not original retrieval evidence.
