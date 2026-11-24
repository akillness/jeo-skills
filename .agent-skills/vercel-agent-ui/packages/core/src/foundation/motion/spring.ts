// An analytic damped spring, parameterized like SwiftUI: `response` (the period
// of the undamped oscillation, in seconds) and `dampingRatio` (1 is critical).
// Positions are in px, times in ms and velocities in px/ms, so one solver
// serves every driver.

// Solves x'' = −ω²x − 2ζωx' for a start displacement (position − target) and
// velocity, and returns closures over the coefficients, so sampling it every
// frame allocates nothing.
/**
 * A damped spring from `displacement` px away from its target with `velocity`
 * px/ms: `position(t)` and `velocity(t)` at `t` ms, so a frame loop samples
 * it with no allocation. `response` is the period in seconds, `dampingRatio`
 * 1 for no bounce, below 1 to bounce.
 * @experimental
 */
function solveSpring(
  response: number,
  dampingRatio: number,
  displacement: number,
  velocity: number
) {
  const omega = (2 * Math.PI) / (response * 1000)
  const zeta = dampingRatio
  if (Math.abs(zeta - 1) < 1e-6) {
    return criticallyDamped(omega, displacement, velocity)
  }
  if (zeta < 1) {
    return underdamped(omega, zeta, displacement, velocity)
  }
  return overdamped(omega, zeta, displacement, velocity)
}

function underdamped(omega: number, zeta: number, x0: number, v0: number) {
  const decay = zeta * omega
  const damped = omega * Math.sqrt(1 - zeta * zeta)
  const b = (v0 + decay * x0) / damped
  return {
    position: (t: number) =>
      Math.exp(-decay * t) *
      (x0 * Math.cos(damped * t) + b * Math.sin(damped * t)),
    velocity: (t: number) => {
      const cos = Math.cos(damped * t)
      const sin = Math.sin(damped * t)
      return (
        Math.exp(-decay * t) *
        ((b * damped - decay * x0) * cos - (x0 * damped + decay * b) * sin)
      )
    },
  }
}

function criticallyDamped(omega: number, x0: number, v0: number) {
  const b = v0 + omega * x0
  return {
    position: (t: number) => Math.exp(-omega * t) * (x0 + b * t),
    velocity: (t: number) => Math.exp(-omega * t) * (b - omega * (x0 + b * t)),
  }
}

function overdamped(omega: number, zeta: number, x0: number, v0: number) {
  const root = Math.sqrt(zeta * zeta - 1)
  const fast = -omega * (zeta + root)
  const slow = -omega * (zeta - root)
  const slowWeight = (v0 - fast * x0) / (slow - fast)
  const fastWeight = x0 - slowWeight
  return {
    position: (t: number) =>
      slowWeight * Math.exp(slow * t) + fastWeight * Math.exp(fast * t),
    velocity: (t: number) =>
      slowWeight * slow * Math.exp(slow * t) +
      fastWeight * fast * Math.exp(fast * t),
  }
}

// The first time, in ms, when the spring is within `positionTolerance` px of
// rest and slower than `velocityTolerance` px/ms. Checking both skips the zero
// crossings of an underdamped spring, where it passes the target at speed.
function settleTime(
  solver: ReturnType<typeof solveSpring>,
  {
    positionTolerance = 0.5,
    velocityTolerance = 0.02,
    step = 1,
    limit = 10_000,
  } = {}
) {
  for (let t = 0; t <= limit; t += step) {
    if (
      Math.abs(solver.position(t)) <= positionTolerance &&
      Math.abs(solver.velocity(t)) <= velocityTolerance
    ) {
      return t
    }
  }
  return limit
}

// A CSS `linear()` easing that replays the spring from `from` to `to`, sampled
// every `step` ms, for a WAAPI animation of `duration` ms on the compositor.
// Progress overshoots past 1 when the spring bounces, which `linear()` allows.
function springLinearEasing(
  solver: ReturnType<typeof solveSpring>,
  from: number,
  to: number,
  duration: number,
  step = 1000 / 120
) {
  const distance = to - from
  // No distance, no progress to ease. Callers sample positions instead.
  if (Math.abs(distance) < 1e-6) {
    return "linear"
  }
  const stops: string[] = []
  for (let t = 0; t < duration; t += step) {
    stops.push(round(1 + solver.position(t) / distance))
  }
  stops.push("1")
  return `linear(${stops.join(", ")})`
}

function round(value: number) {
  return String(Math.round(value * 10_000) / 10_000)
}

export { settleTime, solveSpring, springLinearEasing }
