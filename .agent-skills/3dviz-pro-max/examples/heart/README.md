# The Living Heart

A registered-anatomy heart study with an anterior cutaway, selected vessels and valves, and an authored cardiac-cycle pose.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/heart/`. `pnpm build` builds the complete example set.

## Generation prompt

> Use 3dviz-pro-max to build an interactive heart cutaway from licensed registered anatomy. Let me isolate the myocardial wall, coronary vessels, and internal valves; scrub or play an illustrative cardiac cycle; and open the anterior section. Preserve source registration, cite the asset license and anatomy references, and state clearly that the animation is not a pressure, flow, or patient-specific simulation.

## Explore and implementation

Use Overview and Detail, orbit and zoom, then choose assembled anatomy, wall, coronary arteries, or valves. Controls open the section, scrub/play the cycle, change its illustrative rate, and toggle annotations. See the [entry wrapper](scene.js) and [shared scene](../shared/art-science/scenes/heart.js).

## Sources, assets, and limits

Geometry is from [BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D), credited under [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/). Anatomy and cycle claims use [OpenStax heart anatomy](https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy) and [cardiac cycle](https://openstax.org/books/anatomy-and-physiology-2e/pages/19-3-cardiac-cycle). The assembly has 15 selected parts, cropped vessels, three valve meshes, and open clipping boundaries. It does not calculate chamber pressure, blood flow, valve motion, ejection fraction, or patient biomechanics.

## Skill rules actually applied

The scene visibly follows [research and truth](../../skills/3dviz-pro-max/references/research-and-truth.md), [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md), and the `recipe.heart-cutaway` guidance in [anatomy structures](../../skills/3dviz-pro-max/references/catalog-directions/anatomy-structures.md): source provenance, reversible inspection, one authoritative pose state, synchronized readouts, and explicit limits. This is a retrospective rule mapping; it is not evidence that the current catalog record was retrieved during the scene's original construction.
