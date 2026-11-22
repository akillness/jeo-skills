// kit-walk.js - the gait maths every walker shares, kept out of kit-core.js so neither file
// grows past the 200-line rule. Nothing here builds geometry: a walker owns its rig and calls
// these three pure helpers to pose it. Import them from '../kit-core.js', which re-exports
// them, so a kit module still imports exactly one file.
// twoBoneIk poses a limb, footCycle says where a foot should be, routeStep moves the walker.

/** Two-bone analytic IK in the sagittal plane, for a leg or an arm. `dz`/`dy` are the offset
 *  of the goal from the joint root; `bend` +1 folds the joint backwards (a foreleg elbow), -1
 *  forwards (a knee). Returns [root, joint] rotations about X, in radians. */
export function twoBoneIk(dz, dy, upper, lower, bend) {
  const reach = Math.min(Math.hypot(dz, dy), upper + lower - 0.004);
  const clamp = value => Math.max(-1, Math.min(1, value));
  const a = Math.acos(clamp((reach * reach + upper * upper - lower * lower) / (2 * reach * upper)));
  const b = Math.acos(clamp((upper * upper + lower * lower - reach * reach) / (2 * upper * lower)));
  return [Math.atan2(-dz, -dy) + bend * a, -bend * (Math.PI - b)];
}

/** Foot offset [z, lift] from its neutral stand point at `cycle` (whole numbers are strides).
 *  Stance runs straight back over `span` metres, which is exactly how far the body travels in
 *  that stance, so the planted foot holds its world position instead of skating; swing arcs
 *  forward over a half sine of height `lift`. */
export function footCycle(cycle, span, duty = 0.6, lift = 0.13) {
  const u = cycle - Math.floor(cycle);
  if (u < duty) return [span * (0.5 - u / duty), 0];
  const t = (u - duty) / (1 - duty);
  return [span * (t - 0.5), lift * Math.sin(Math.PI * t)];
}

/** One walker step along `state.route`: a turn clamped to `yawRateRad`, forward travel, and
 *  phase advanced by distance / `strideM` - never by wall clock, so the gait cannot skate and a
 *  replayed dt sequence reproduces the pose exactly. `arrival` is how close counts as reaching
 *  a waypoint. Mutates `state`; returns false for dt <= 0, the liveness contract every
 *  animate(dt) inherits, and true when the walker moved. */
export function routeStep(state, dt, { yawRateRad = 1.8, strideM = 1, arrival = 0.12,
                                       speed = null } = {}) {
  if (!(dt > 0)) return false;
  state.time += dt;
  if (speed !== null) state.speed = speed;
  let travel = state.moving ? state.speed * dt : 0;
  const route = state.route;
  if (route?.length > 1) {
    const [tx, tz] = route[Math.min(state.waypoint, route.length - 1)];
    const wanted = Math.atan2(tx - state.position[0], tz - state.position[2]);
    const error = Math.atan2(Math.sin(wanted - state.heading), Math.cos(wanted - state.heading));
    const limit = yawRateRad * dt;                             // a clamped turn, never a snap
    state.heading += Math.max(-limit, Math.min(limit, error));
    if (Math.hypot(tx - state.position[0], tz - state.position[2])
        < Math.max(arrival, travel * 1.5) && ++state.waypoint >= route.length) {
      if (state.loop) state.waypoint = 0;
      else { state.waypoint = route.length - 1; state.moving = false; travel = 0; }
    }
  }
  state.position[0] += Math.sin(state.heading) * travel;
  state.position[2] += Math.cos(state.heading) * travel;
  state.distance += travel;
  state.phase += travel / Math.max(strideM, 1e-6);
  return true;
}
