# The Differential

An equal-side-gear differential whose wheel and carrier speeds share one kinematic constraint.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/differential/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to build an inspectable automotive differential with equal side gears. Drive every angle from `ωc=(ωL+ωR)/2`, preserve continuous angles when speeds change, let me open the carrier and hold one axle, and disclose that tooth contact, torque, loads, and manufacturing geometry are illustrative or absent.

## Explore and implementation

Use Overview and Detail. Change carrier angular velocity and half wheel-speed difference, open the shell, or hold the left axle so the right runs at twice carrier speed. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/differential.js), and [physics helpers](../shared/art-science/scenes/physics-models.js).

## Source and limits

Mechanism context follows [MIT 2.972](https://web.mit.edu/2.972/www/reports/differential/differential.html). The 24:12 side/pinion teeth and openings are illustrative. The model solves kinematics only, with no conjugate contact, interference, torque split, or loads.

## Skill rules actually applied

The code applies authoritative mechanism state from [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md) and readable invariants from [subject clarity](../../skills/3dviz-pro-max/references/subject-clarity-and-motion.md). Its catalog relationship is retrospective; the differential-drive recipe is not presented as this automotive mechanism's source.
