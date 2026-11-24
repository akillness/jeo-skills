// Replays a golden trajectory's finger path through the machine and samples
// the sheet at the golden's frame times, so the engine is tested against a
// recording of the real thing. `lag` is the tracking lag measured on the
// recording: each frame shows the finger as it was `lag` ms earlier, and the
// lift starts the settle on time from wherever the sheet was shown, as UIKit
// does.
import { contentScroll } from "../../src/foundation/motion/content-scroll"
import {
  currentMotion,
  initialState,
  next,
  snapExtents,
  type SheetConfig,
  type SheetEvent,
  type SheetState,
} from "../../src/foundation/motion/machine"
import type { SheetPhysics } from "../../src/foundation/motion/physics"
import { nearestIndex } from "../../src/foundation/motion/projection"
import { settleTime, solveSpring } from "../../src/foundation/motion/spring"
import { createVelocityTracker } from "../../src/foundation/motion/velocity"

// One gesture as a fixture: the finger's path along the axis and the sheet's path.
type GoldenTrajectory = {
  name: string
  geometry: {
    dimension: number
    snapPoints: { id: string; extent: number }[]
    dismissible: boolean
  }
  start: { extent: number }
  finger: { t: number; y: number; phase: "down" | "move" | "up" }[]
  sheet: { t: number; extent: number }[]
  outcome: { snapPoint: string | null }
}

function interpolate(xs: readonly number[], ys: readonly number[], x: number) {
  if (x <= xs[0]) {
    return ys[0]
  }
  if (x >= xs[xs.length - 1]) {
    return ys[ys.length - 1]
  }
  let low = 0
  let high = xs.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (xs[middle] <= x) {
      low = middle
    } else {
      high = middle
    }
  }
  const span = xs[high] - xs[low]
  return span > 0
    ? ys[low] + ((ys[high] - ys[low]) * (x - xs[low])) / span
    : ys[low]
}

function replayGolden(
  golden: GoldenTrajectory,
  physics: SheetPhysics,
  lag = 0
) {
  const config: SheetConfig = {
    snapPoints: golden.geometry.snapPoints,
    dimension: golden.geometry.dimension,
    dismissible: golden.geometry.dismissible,
    expandOnScroll: true,
    physics,
    contentScroll,
  }
  let state: SheetState = initialState(
    golden.start.extent,
    nearestIndex(snapExtents(config), golden.start.extent)
  )
  const finger = golden.finger
  const down = finger[0]
  const lift =
    finger.find((sample) => sample.phase === "up") ?? finger[finger.length - 1]
  // Drivers feed the tracker moves only; the lift repeats the last position.
  const tracker = createVelocityTracker({ horizon: physics.velocityHorizon })
  for (const sample of finger) {
    if (sample.phase !== "up") {
      tracker.add(sample.t, sample.y)
    }
  }
  const releaseVelocity = tracker.velocity(lift.t)
  const fingerTimes = finger.map((sample) => sample.t)
  const fingerYs = finger.map((sample) => sample.y)
  const fingerAt = (t: number) => interpolate(fingerTimes, fingerYs, t)
  const send = (event: SheetEvent) => {
    state = next(state, event, config).state
  }
  const isSettling = () => state.phase === "settling"

  let settleEnd = Infinity
  let phase: "before" | "touching" | "released" = "before"
  const sheet = golden.sheet.map(({ t }) => {
    if (phase === "before" && t - lag >= down.t) {
      send({ type: "down", time: down.t, x: 0, y: down.y, pointer: "touch" })
      phase = "touching"
    }
    if (phase === "touching" && t >= lift.t) {
      send({
        type: "move",
        time: lift.t,
        x: 0,
        y: fingerAt(lift.t - lag),
        scroll: null,
      })
      send({ type: "up", time: lift.t, velocity: releaseVelocity })
      if (state.phase === "settling") {
        settleEnd =
          state.startTime +
          settleTime(
            solveSpring(
              state.response,
              state.dampingRatio,
              state.from - state.to,
              state.velocity
            )
          )
      }
      phase = "released"
    }
    if (phase === "touching") {
      send({ type: "move", time: t, x: 0, y: fingerAt(t - lag), scroll: null })
    }
    if (isSettling() && t >= settleEnd) {
      send({ type: "settled" })
    }
    return { t, extent: currentMotion(state, t).extent }
  })
  if (isSettling()) {
    send({ type: "settled" })
  }

  const restingIndex = state.restingIndex
  return {
    sheet,
    outcome: {
      snapPoint: restingIndex < 0 ? null : config.snapPoints[restingIndex].id,
    },
  }
}

// Pointwise error between two paths sampled at the same times.
function compareTrajectories(
  expected: { extent: number }[],
  actual: { extent: number }[]
) {
  const count = Math.min(expected.length, actual.length)
  let maxError = 0
  let sumOfSquares = 0
  for (let index = 0; index < count; index++) {
    const error = Math.abs(expected[index].extent - actual[index].extent)
    maxError = Math.max(maxError, error)
    sumOfSquares += error * error
  }
  return { maxError, rmsError: count ? Math.sqrt(sumOfSquares / count) : 0 }
}

export { compareTrajectories, type GoldenTrajectory, replayGolden }
