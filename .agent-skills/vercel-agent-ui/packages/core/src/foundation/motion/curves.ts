// Styling curves: pure functions of the extent and the resolved snap points,
// which drivers turn into CSS variables and keyframes. `snapExtents` are
// ascending and exclude 0.

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

// 0 at or below the largest undimmed snap point, 1 at the next one. With no
// undimmed snap point (-1), the dim ramps in from 0 to the smallest snap point,
// as iOS fades the dimming view in while a sheet presents.
function dimAmount(
  extent: number,
  snapExtents: readonly number[],
  largestUndimmedIndex = -1
) {
  const lower = largestUndimmedIndex < 0 ? 0 : snapExtents[largestUndimmedIndex]
  const upper =
    largestUndimmedIndex < 0
      ? snapExtents[0]
      : snapExtents[largestUndimmedIndex + 1]
  if (upper === undefined || upper <= lower) {
    return extent > lower ? 1 : 0
  }
  return clamp01((extent - lower) / (upper - lower))
}

// 0 at the second-largest snap point, 1 at the largest: the range where iOS
// pushes the presenting view back. With one snap point, the whole travel.
function expandAmount(extent: number, snapExtents: readonly number[]) {
  const largest = snapExtents[snapExtents.length - 1]
  const lower = snapExtents.length > 1 ? snapExtents[snapExtents.length - 2] : 0
  if (largest <= lower) {
    return extent >= largest ? 1 : 0
  }
  return clamp01((extent - lower) / (largest - lower))
}

// 0 closed, 1 at the largest snap point. Never past 1, so the rubber band
// doesn't overshoot effects that follow it.
function progressAmount(extent: number, snapExtents: readonly number[]) {
  const largest = snapExtents[snapExtents.length - 1]
  return largest > 0 ? clamp01(extent / largest) : 0
}

export { dimAmount, expandAmount, progressAmount }
