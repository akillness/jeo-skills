// Where spans fall on a waterfall's time axis, the axis's ticks, and how times
// read. Pure, so it runs on the server and in tests.
import { formatNumber, type NumberFormat } from "../../foundation/number/format"
import { clamp } from "../../foundation/number/steps"

type Range = readonly [number, number]

type Span = {
  start: number
  duration: number
  children?: readonly Span[]
}

/**
 * One tick of the axis: its time, the text it shows, and where it sits on the
 * axis, from 0 to 100.
 * @experimental
 */
type WaterfallTickData = {
  /** The moment it marks, in milliseconds. */
  time: number
  /** The time as the waterfall's `format` and locale show it. */
  label: string
  /** Where it sits between the range's start and end, from 0 to 100. Also `--waterfall-tick`. */
  position: number
}

// The earliest start and latest end of every span, or [0, 0] for none.
function spanRange(items: readonly Span[]) {
  let start = Infinity
  let end = -Infinity
  const visit = (list: readonly Span[]) => {
    for (const item of list) {
      start = Math.min(start, item.start)
      end = Math.max(end, item.start + Math.max(0, item.duration))
      if (item.children) {
        visit(item.children)
      }
    }
  }
  visit(items)
  return (Number.isFinite(start) ? [start, end] : [0, 0]) as [number, number]
}

const round = (percent: number) => Math.round(percent * 1e4) / 1e4

// Where a moment sits between the range's ends, from 0 to 100, clamped.
function percentAt(time: number, [start, end]: Range) {
  return end > start
    ? round(((clamp(time, start, end) - start) / (end - start)) * 100)
    : 0
}

// The part of the axis a span covers, both from 0 to 100: zero wide when it falls outside the range.
function spanPlacement(span: Span, range: Range) {
  const start = percentAt(span.start, range)
  const end = percentAt(span.start + Math.max(0, span.duration), range)
  return { start, size: round(end - start) }
}

// The smallest step of 1, 2 or 5 times a power of ten that fits `max` ticks,
// each with a step of room after it.
function tickStep(span: number, max: number) {
  const rough = span / (max + 1)
  const power = 10 ** Math.floor(Math.log10(rough))
  for (const factor of [1, 2, 5, 10]) {
    if (factor * power >= rough) {
      return factor * power
    }
  }
  return 10 * power
}

// The times of the ticks: round steps, at most `max` of them, inside the range.
// A label sits after its tick, in the step before the next, so the last tick
// needs a step of room before the end too.
function tickTimes([start, end]: Range, max: number) {
  if (!(end > start) || max < 1) {
    return [start]
  }
  const step = tickStep(end - start, max)
  const times: number[] = []
  for (
    let time = Math.ceil(start / step) * step;
    time <= end - step + step * 1e-9 && times.length < max;
    time += step
  ) {
    // Steps like 0.1 add up float error, so each tick is rounded to the step's precision.
    times.push(Number(time.toFixed(Math.max(0, -Math.floor(Math.log10(step))))))
  }
  const first = Math.ceil(start / step) * step
  return times.length === 0 && first <= end ? [first] : times
}

// The decimals a step needs, like 2 for 0.05, so ticks a step apart read differently.
const stepDigits = (step: number) =>
  Math.min(6, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)))

// Milliseconds, seconds or minutes, picked by `scale`, so every tick of an axis
// reads in one unit, with the decimals `step` needs in that unit.
function formatTime(
  time: number,
  locale: string,
  format?: NumberFormat,
  scale = time,
  step?: number
) {
  if (format) {
    return formatNumber(time, locale, format)
  }
  const size = Math.abs(scale)
  const unit =
    size < 1000
      ? {
          unit: "millisecond",
          ms: 1,
          digits: Math.abs(time) < 10 ? 1 : 0,
        }
      : size < 60_000
        ? { unit: "second", ms: 1000, digits: 2 }
        : { unit: "minute", ms: 60_000, digits: 1 }
  return formatNumber(time / unit.ms, locale, {
    style: "unit",
    unit: unit.unit,
    unitDisplay: "short",
    maximumFractionDigits: Math.max(
      unit.digits,
      step !== undefined && step > 0 ? stepDigits(step / unit.ms) : 0
    ),
  })
}

function waterfallTicks(
  range: Range,
  max: number,
  locale: string,
  format?: NumberFormat
) {
  const scale = Math.max(Math.abs(range[0]), Math.abs(range[1]))
  const step = tickStep(range[1] - range[0], max)
  return tickTimes(range, max).map<WaterfallTickData>((time) => ({
    time,
    label: formatTime(time, locale, format, scale, step),
    position: percentAt(time, range),
  }))
}

export {
  formatTime,
  percentAt,
  spanPlacement,
  spanRange,
  tickTimes,
  type WaterfallTickData,
  waterfallTicks,
}
