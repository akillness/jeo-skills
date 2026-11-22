# Rigid Mechanics

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Simply supported bridge load-path beam model](../../data/recipes/bridge-load-path-beam-model.json) — `recipe.bridge-load-path-beam-model`: Compute reactions and one section response for declared point loads on a simply supported beam without presenting the result as structural design approval.
- [Elastic and inelastic collisions in space](../../data/recipes/collision-momentum-lab.json) — `recipe.collision-momentum-lab`: Compare momentum and kinetic energy across a one-dimensional central collision so that what is conserved and what is not becomes measurable.
- [Coupled gear kinematics](../../data/recipes/coupled-gears.json) — `recipe.coupled-gears`: Drive meshing gears from a shared angular constraint with inspectable pitch circles.
- [XPBD soft-body boundary fixture](../../data/recipes/general-soft-body-boundary-test.json) — `recipe.general-soft-body-boundary-test`: Exercise one compliant particle mesh with pinned boundaries, explicit timestep/substeps/iterations and residuals rather than treating visual softness as a material measurement.
- [Gyroscopic precession and angular momentum](../../data/recipes/gyroscope-precession.json) — `recipe.gyroscope-precession`: Show a torque changing the direction of angular momentum rather than speeding the spin, and keep the fast-spin assumption visible.
- [Projectile trajectory and first contact](../../data/recipes/projectile-trajectory.json) — `recipe.projectile-trajectory`: Keep position, velocity and acceleration consistent through ballistic flight.
- [Rigid robot contact task execution](../../data/recipes/robot-contact-task-execution.json) — `recipe.robot-contact-task-execution`: Inspect a bounded rigid robot approach/contact/hold/retreat task whose controller, collision solver and state transitions have separate authority.
- [Rolling without slipping and the inertia race](../../data/recipes/rolling-inertia-race.json) — `recipe.rolling-inertia-race`: Race bodies of equal mass and radius down one incline so the only difference is where their mass sits.
- [Ideal pendulum with measurable state](../../data/recipes/simple-pendulum.json) — `recipe.simple-pendulum`: Relate angular state to bob motion and distinguish small-angle approximation.
- [Torque-driven planar four-bar dynamics](../../data/recipes/torque-driven-four-bar-dynamics.json) — `recipe.torque-driven-four-bar-dynamics`: Integrate one planar four-bar generalized coordinate from applied torque while solving loop closure on a locked assembly branch.
