# Inside the Brain

A registered-anatomy inspection of selected cortical gyri, white matter, cerebellum, and brainstem components.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/brain/`. `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to create a licensed registered-anatomy brain study. Group selected cortical gyri by region, include white matter, cerebellum, and brainstem context, and provide left/right separation, a sagittal clip, contextual ghosting, and labels. Explain that omitted gyri are not holes and that colors do not imply functional localization.

## Explore and implementation

Use Overview and Detail. Isolate cortex or a regional group, separate bilateral parts, open the sagittal section, ghost surrounding structures, and toggle labels. The 33 registered parts include newly sourced bilateral fusiform, parahippocampal, and cingulate gyri, reducing the selection gap without overlapping existing parent meshes. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/brain.js), and [asset attribution](https://assets.3dviz.dev/anatomy/attribution.json).

## Sources, assets, and limits

Geometry is [BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D), [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/), with authoritative names and SHA-256 values in attribution. Regional context was checked against [OpenStax 13.2](https://openstax.org/books/anatomy-and-physiology-2e/pages/13-2-the-central-nervous-system). This remains selected anatomy: clipping leaves open boundaries, ghosting is an inspection overlay, and colors identify groups rather than function.

## Skill rules actually applied

The scene reflects [research and truth](../../skills/3dviz-pro-max/references/research-and-truth.md), [object reasoning](../../skills/3dviz-pro-max/references/object-reasoning.md), and [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md): preserve registered relationships, distinguish inspection transforms from anatomy, synchronize labels with visibility, and disclose missing structures. This mapping is retrospective, not proof of original catalog retrieval.
