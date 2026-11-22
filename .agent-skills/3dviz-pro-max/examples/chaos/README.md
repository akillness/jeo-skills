# The Chaos Desk

Two independently integrated double pendulums reveal divergence from a controlled angular difference.

From `examples/`, run `pnpm install` once, then `pnpm dev` and open `/chaos/`. Use `pnpm build` for all examples.

## Generation prompt

> Use 3dviz-pro-max to build a double-pendulum sensitivity experiment with two independent systems. Let me set release angle and a small second-angle difference, release/pause, and repeat exactly; use a fixed numerical timestep and report model time, tip separation, and energy error without presenting numerical drift as friction.

## Explore and implementation

Use Overview and Detail, set the release angle and `ε`, release/pause, and repeat the same experiment. See [scene.js](scene.js), the [shared scene](../shared/art-science/scenes/chaos.js), and [physics helpers](../shared/art-science/scenes/physics-models.js).

## Source and limits

Equations follow [UC Berkeley's double-pendulum treatment](https://rotations.berkeley.edu/the-double-pendulum/). The model uses point masses, massless rods, frictionless pivots, and fixed `1/240 s` RK4 integration. Display-depth separation aids comparison; the systems do not collide.

## Skill rules actually applied

The implementation follows numerical-dynamics guidance in [motion and state](../../skills/3dviz-pro-max/references/motion-and-state.md): declared units and timestep, independent solver state, repeatable initial conditions, time-based playback, and reported numerical error. Mapping is retrospective.
