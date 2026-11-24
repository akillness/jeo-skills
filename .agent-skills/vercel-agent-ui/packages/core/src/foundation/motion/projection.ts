// Where a released sheet comes to rest. UIScrollView decelerates by a fixed
// rate per millisecond, so a release at v px/ms travels v·r/(1 − r) before it
// stops (WWDC18 803). 0.998 is `.normal`, 0.99 is `.fast`.
/**
 * How far something thrown at `velocity` px/ms travels before it stops, slowing by `rate` per ms, like 0.998 for a scroll view.
 * @experimental
 */
function projectDistance(velocity: number, rate: number) {
  return (velocity * rate) / (1 - rate)
}

// Picks the index of the candidate extent a release settles on. `candidates`
// are ascending extents, including 0 when the sheet can be dismissed.
// `velocity` is the extent's velocity in px/ms, positive when growing.
function chooseSnapTarget(input: {
  /** The extent at release, in px. */
  extent: number
  /** px/ms, positive toward a larger extent. */
  velocity: number
  /** Ascending resting extents, in px. */
  candidates: readonly number[]
  /** Per-millisecond deceleration used for the projection. */
  rate: number
  /** Below this speed, in px/ms, the nearest candidate wins. */
  minFlingVelocity: number
  /** Whether a fling can pass over a candidate. */
  skipSnapPoints: boolean
}) {
  const { extent, velocity, candidates } = input
  if (Math.abs(velocity) < input.minFlingVelocity) {
    return nearestIndex(candidates, extent)
  }
  const projected = extent + projectDistance(velocity, input.rate)
  const nextInDirection = firstBeyond(candidates, extent, Math.sign(velocity))
  let target = nearestIndex(candidates, projected)
  const isBehind =
    velocity > 0
      ? candidates[target] <= extent + 0.5
      : candidates[target] >= extent - 0.5
  if (isBehind && nextInDirection !== -1) {
    target = nextInDirection
  }
  if (!input.skipSnapPoints && nextInDirection !== -1) {
    target =
      velocity > 0
        ? Math.min(target, nextInDirection)
        : Math.max(target, nextInDirection)
  }
  return target
}

function nearestIndex(candidates: readonly number[], value: number) {
  let best = 0
  for (let index = 1; index < candidates.length; index++) {
    if (
      Math.abs(candidates[index] - value) < Math.abs(candidates[best] - value)
    ) {
      best = index
    }
  }
  return best
}

// The first candidate strictly past `extent` in `direction`, or -1.
function firstBeyond(
  candidates: readonly number[],
  extent: number,
  direction: number
) {
  if (direction > 0) {
    return candidates.findIndex((candidate) => candidate > extent + 0.5)
  }
  for (let index = candidates.length - 1; index >= 0; index--) {
    if (candidates[index] < extent - 0.5) {
      return index
    }
  }
  return -1
}

export { chooseSnapTarget, nearestIndex, projectDistance }
