// Where a value sits between bounds, and the value at a position, evenly or
// along a scale. Pure, so it runs on the server too.
import { clamp } from "./steps"

/**
 * How positions map to values: evenly (`"linear"`), by ratio (`"log"`, for
 * volume, frequency or zoom, with a positive `min`), or through your own `to`
 * and `from`, which map values into an even space and back.
 * @experimental
 */
type NumberScale =
  | "linear"
  | "log"
  | { to: (value: number) => number; from: (position: number) => number }

const scales = {
  linear: {
    to: (value: number) => value,
    from: (position: number) => position,
  },
  log: { to: Math.log, from: Math.exp },
}

/**
 * Where a value sits between `min` and `max`, from 0 to 1, along a scale: how
 * far to fill a progress bar or place a slider's thumb. Values outside the
 * bounds sit at an end.
 * @experimental
 */
function fractionOf(
  value: number,
  range: { min: number; max: number },
  scale: NumberScale = "linear"
) {
  const { to } = typeof scale === "string" ? scales[scale] : scale
  const low = to(range.min)
  const span = to(range.max) - low
  const fraction = (to(clamp(value, range.min, range.max)) - low) / span
  return Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0
}

/**
 * The value at a fraction from 0 to 1 between `min` and `max`, along a scale,
 * like where a press on a track lands. Unsnapped; `scrubTo` puts it on the grid.
 * @experimental
 */
function valueAt(
  fraction: number,
  range: { min: number; max: number },
  scale: NumberScale = "linear"
) {
  const { to, from } = typeof scale === "string" ? scales[scale] : scale
  const low = to(range.min)
  const value = from(low + clamp(fraction, 0, 1) * (to(range.max) - low))
  return clamp(value, range.min, range.max)
}

export { fractionOf, type NumberScale, valueAt }
