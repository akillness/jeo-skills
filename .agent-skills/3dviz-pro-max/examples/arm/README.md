# Arm in Motion

A registered bone-and-muscle elbow study with an approximate hinge and opposing biceps/triceps shape changes.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/arm/`. `pnpm build` builds all examples.

## Generation prompt

> Use 3dviz-pro-max to build an elbow-flexion study from licensed registered anatomy. Skin selected biceps and triceps heads to a clear hinge state, add inspectable opposing belly changes, support scrub/play/pause, opacity, separation, and labels, and distinguish illustration from force, activation, volume, and patient biomechanics.

## Explore and implementation

Use Overview and Detail; scrub 0–80° flexion, play/pause the cycle, change rate and muscle visibility, separate groups, and toggle labels. The current assembly has five registered bones and five selected biceps/triceps heads; added shoulder-girdle bones extend context while the established arm rig remains unchanged. See [scene.js](scene.js), [shared arm scene](../shared/art-science/scenes/arm.js), and [motion helpers](../shared/art-science/body-motion.js).

## Sources, assets, and limits

Geometry is [BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D), [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/). Relationships use [OpenStax 11.1](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-1-interactions-of-skeletal-muscles-their-fascicle-arrangement-and-their-lever-systems) and [11.5](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs). The hinge, corrective bulges, coloring, and striations are illustrative; shoulder, hand, forces, activation, and volume conservation are not modeled.

## Skill rules actually applied

The scene uses the deformation-inspection ideas in [subject clarity and motion](../../skills/3dviz-pro-max/references/subject-clarity-and-motion.md) and [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md). `knowledge.skin-weight-and-deformation-inspection` informed extreme-pose and attachment inspection only; no Blender export workflow is claimed. Mapping of other catalog guidance is retrospective.
