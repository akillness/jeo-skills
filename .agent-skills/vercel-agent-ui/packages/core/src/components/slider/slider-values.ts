// The decisions a slider makes, as pure functions of its values and bounds:
// where each thumb may go, what a key does, and which thumb a press moves.
// slider.ts wires them to the DOM. Unit tested in test/slider.test.ts.
import { stepFromKey } from "../../foundation/number/keys"
import {
  clamp,
  maxOnGrid,
  snapToStep,
  type StepRange,
  stepOnGrid,
} from "../../foundation/number/steps"

type SliderRange = StepRange & {
  // How far apart neighbouring thumbs stay, in steps.
  minStepsBetweenThumbs: number
  largeStep: number
}

// Where one thumb may go: between its neighbours, kept apart by the minimum
// distance, and never past the bounds. When the thumbs are too close to keep
// the distance, like `[0, 0]` set from outside, the bounds win.
function thumbBounds(
  values: readonly number[],
  index: number,
  range: SliderRange
) {
  return boundsBetween(
    index > 0 ? values[index - 1] : undefined,
    values[index + 1],
    range
  )
}

/** Where a thumb may go between the values of the thumbs before and after it, if any. */
function boundsBetween(
  before: number | undefined,
  after: number | undefined,
  range: SliderRange
) {
  const gap = range.minStepsBetweenThumbs * range.step
  const end = maxOnGrid(range)
  const lower = clamp(
    before === undefined ? range.min : before + gap,
    range.min,
    end
  )
  const upper = clamp(after === undefined ? end : after - gap, lower, end)
  return { lower, upper }
}

// Moves one thumb, snapped and kept between its neighbours. Thumbs never pass
// each other, so each keeps its meaning, like "minimum price", and its focus.
// Returns the same array when nothing moved.
function moveThumb(
  values: readonly number[],
  index: number,
  target: number,
  range: SliderRange
) {
  const { lower, upper } = thumbBounds(values, index, range)
  const next = clamp(snapToStep(target, range), lower, upper)
  if (next === values[index]) {
    return values
  }
  const result = values.slice()
  result[index] = next
  return result
}

// Values sorted and within the bounds, for values that come from outside.
function normalizeValues(values: readonly number[], range: StepRange) {
  return values
    .map((value) => clamp(value, range.min, range.max))
    .sort((a, b) => a - b)
}

/** What a key does to a thumb's value, or null for keys a slider ignores. Home and End go to the thumb's own bounds. */
function keyTarget(
  key: string,
  {
    shiftKey = false,
    rtl = false,
    orientation = "horizontal" as "horizontal" | "vertical",
  } = {},
  value: number,
  bounds: { lower: number; upper: number },
  range: SliderRange
) {
  const move = stepFromKey(
    { key, shiftKey },
    { orientation, dir: rtl ? "rtl" : "ltr" }
  )
  if (!move) {
    return null
  }
  if ("bound" in move) {
    return move.bound === "min" ? bounds.lower : bounds.upper
  }
  return stepOnGrid(value, move, range)
}

/**
 * The thumb a press moves. The nearest one, and among thumbs stacked on one
 * value, the one on the side the press is on: below them the lowest, above
 * them the highest. Pressed right on the stack, the first move decides, so
 * the index is null and the stack comes back.
 */
function thumbForPress(values: readonly number[], pressed: number) {
  let nearest = 0
  for (let index = 1; index < values.length; index++) {
    if (
      Math.abs(values[index] - pressed) < Math.abs(values[nearest] - pressed)
    ) {
      nearest = index
    }
  }
  const stack = stackAt(values, nearest)
  if (stack.length === 1) {
    return { index: nearest, stack }
  }
  if (pressed < values[nearest]) {
    return { index: stack[0], stack }
  }
  if (pressed > values[nearest]) {
    return { index: stack[stack.length - 1], stack }
  }
  return { index: null, stack }
}

// The thumbs that share a thumb's value.
function stackAt(values: readonly number[], index: number) {
  const stack: number[] = []
  for (let other = 0; other < values.length; other++) {
    if (values[other] === values[index]) {
      stack.push(other)
    }
  }
  return stack
}

// Which thumb of a stack follows a drag: the first move's direction decides,
// and a stack at either bound can only move away from it.
function thumbForDirection(stack: readonly number[], direction: number) {
  return direction < 0 ? stack[0] : stack[stack.length - 1]
}

/** Where a value sits between the bounds, from 0 to 100, for positioning. */
function percentOf(value: number, range: StepRange) {
  if (!(range.max > range.min)) {
    return 0
  }
  return roundPercent(
    ((clamp(value, range.min, range.max) - range.min) /
      (range.max - range.min)) *
      100
  )
}

// Four decimals keep positions exact to well under a pixel, and the markup short.
function roundPercent(percent: number) {
  return Math.round(percent * 1e4) / 1e4
}

/**
 * Where a point falls along a box, from 0 at its start to 1 at its end: left
 * to right, right to left, or bottom to top.
 */
function fractionAlong(
  point: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  { rtl = false, vertical = false } = {}
) {
  const fraction = vertical
    ? (box.top + box.height - point.y) / box.height
    : rtl
      ? (box.left + box.width - point.x) / box.width
      : (point.x - box.left) / box.width
  return Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0
}

/** The value at a fraction of the track, unsnapped, so presses pick thumbs by distance. */
function valueAt(fraction: number, range: StepRange) {
  return range.min + clamp(fraction, 0, 1) * (range.max - range.min)
}

export {
  boundsBetween,
  fractionAlong,
  keyTarget,
  moveThumb,
  normalizeValues,
  percentOf,
  type SliderRange,
  stackAt,
  thumbBounds,
  thumbForDirection,
  thumbForPress,
  valueAt,
}
