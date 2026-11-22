# Upper-body Muscle Atlas

A source-registered inspection atlas for selected upper-body muscle portions and their skeletal framework.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/muscle-atlas/`. `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to build a licensed upper-body muscle atlas from registered anatomical meshes. Let me isolate pectoralis major, deltoid, biceps, triceps, rectus abdominis, and brachialis; separate muscles from the bones; and toggle labels. Treat separation as inspection rather than contraction, preserve registration, and name the omitted anatomy.

## Explore and implementation

Use Overview and Detail, orbit and zoom, choose a muscle family, separate it from the framework, isolate the selected bones, and toggle labels. The current atlas contains 28 muscle components and 20 bones, including bilateral clavicles, scapulae, ribs 1–4, manubrium, and brachialis; it remains a selected atlas. See [scene.js](scene.js), the [shared atlas](../shared/art-science/scenes/muscle-atlas.js), and [asset attribution](https://assets.3dviz.dev/anatomy/attribution.json).

## Sources, assets, and limits

Meshes come from [BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D), [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/); names and hashes are recorded in the attribution file. Muscle relationships were checked against [OpenStax 11.5](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs). Surface striations are artistic, not measured fascicles; separation is an exploded view; the head, hands, and many deep muscles remain omitted. The rib selection is upper-thorax context, not a complete rib cage.

## Skill rules actually applied

The implementation reflects [external-asset routing and provenance](../../skills/3dviz-pro-max/SKILL.md#construction-routing), [research and truth](../../skills/3dviz-pro-max/references/research-and-truth.md), and [inspection-state separation](../../skills/3dviz-pro-max/references/motion-and-state.md). `knowledge.reasoning-dissection-layer-order` was actually retrieved and reviewed but not adopted because that record is skin-layer specific; this scene separates muscles spatially rather than asserting a peel order. `knowledge.skin-weight-and-deformation-inspection` was also retrieved and influenced inspection principles only; no Blender export or weight-inspection workflow is claimed.
