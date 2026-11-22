# Robotics Control

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Reachable workspace and singular configurations](../../data/recipes/arm-workspace-singularity.json) — `recipe.arm-workspace-singularity`: Map where an arm can reach and mark the configurations where it loses a direction of motion.
- [Autonomous planar phase portrait with time lift](../../data/recipes/autonomous-planar-phase-portrait.json) — `recipe.autonomous-planar-phase-portrait`: Compare phase trajectories, vector directions and a time-lifted solution for a bounded family of planar autonomous systems.
- [Differential-drive command and odometry view](../../data/recipes/differential-drive-odometry.json) — `recipe.differential-drive-odometry`: Distinguish requested motion, applied wheel motion and estimated pose in a teaching mobile robot.
- [Inverse-kinematics target and residual](../../data/recipes/inverse-kinematics-target.json) — `recipe.inverse-kinematics-target`: Make numerical target solving visible, including residuals and non-convergence.
- [PID joint control with saturation](../../data/recipes/joint-pid-control.json) — `recipe.joint-pid-control`: Show a controller responding to error, and let integral action and torque limits change the outcome visibly.
- [Path, time scaling and joint limits](../../data/recipes/joint-trajectory-time-scaling.json) — `recipe.joint-trajectory-time-scaling`: Separate the geometric path from the schedule along it, so speed limits change timing without changing the path.
- [Robot arm forward-kinematics frames](../../data/recipes/robot-arm-forward-frames.json) — `recipe.robot-arm-forward-frames`: Connect joint coordinates to an articulated arm and inspectable endpoint frame.
- [Rigid robot contact task execution](../../data/recipes/robot-contact-task-execution.json) — `recipe.robot-contact-task-execution`: Inspect a bounded rigid robot approach/contact/hold/retreat task whose controller, collision solver and state transitions have separate authority.
