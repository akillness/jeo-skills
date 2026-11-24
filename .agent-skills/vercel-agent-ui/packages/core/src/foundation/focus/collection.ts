// Keyboard and layout helpers shared by collections like Tabs, Radio Group and Toolbar.
// Pure, so they're unit tested without a DOM. Not part of the public API.

/**
 * An orientation as the option gives it. A custom element passes its
 * `orientation` attribute as written, so anything but the two values is the
 * default, never an invalid `aria-orientation`.
 */
const orientationOf = (value: unknown, fallback: "horizontal" | "vertical") =>
  value === "horizontal" || value === "vertical" ? value : fallback

/** Which way a selection moved, on screen. */
type Direction = "none" | "left" | "right" | "up" | "down"

// How many items a key moves focus by, or "first" and "last". Undefined for
// keys the list doesn't handle, including arrows along the other axis. With
// "both", every arrow works, like radios: Down and the inline end go forward.
function stepFor(
  key: string,
  orientation: "horizontal" | "vertical" | "both",
  rtl: boolean
) {
  if (orientation === "both") {
    return (
      radioStep(key, rtl) ??
      (key === "Home" ? "first" : key === "End" ? "last" : undefined)
    )
  }
  const forward =
    orientation === "vertical" ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight"
  const backward =
    orientation === "vertical" ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft"
  if (key === forward) {
    return 1
  }
  if (key === backward) {
    return -1
  }
  if (key === "Home") {
    return "first" as const
  }
  if (key === "End") {
    return "last" as const
  }
}

// The item a radio key moves to: Down and Right go forward, Up and Left back,
// with Left and Right swapped right to left. Like native radios, both axes work.
function radioStep(key: string, rtl: boolean) {
  if (key === "ArrowDown" || key === (rtl ? "ArrowLeft" : "ArrowRight")) {
    return 1
  }
  if (key === "ArrowUp" || key === (rtl ? "ArrowRight" : "ArrowLeft")) {
    return -1
  }
}

/** An item of a roving group, as the tab stop decision sees it. */
type RovingCandidate = {
  key: string
  /** Whether it can't be activated. */
  disabled: boolean
  /** Whether it can take focus at all. */
  focusable: boolean
  /** Whether it's selected, checked or pressed, so Tab lands on it first. */
  preferred: boolean
}

// The item that holds a group's one tab stop: the item focused last, when the
// group remembers one, else the first preferred item that's enabled, else the
// first enabled one, else the first that can take focus.
function rovingStop(
  items: readonly RovingCandidate[],
  remembered: string | null = null
) {
  const focusable = items.filter((item) => item.focusable)
  if (
    remembered !== null &&
    focusable.some((item) => item.key === remembered)
  ) {
    return remembered
  }
  const enabled = focusable.filter((item) => !item.disabled)
  return (
    (enabled.find((item) => item.preferred) ?? enabled[0] ?? focusable[0])
      ?.key ?? null
  )
}

// Whether a text field keeps a key for its caret instead of letting a roving
// group move focus. Left and Right leave the field only from the end they
// point at, with nothing selected, so its text can still be edited. Home and
// End always move the caret. Up and Down belong to fields that use them:
// multi-line text and number fields.
function fieldKeepsKey(
  key: string,
  field: {
    start: number | null
    end: number | null
    length: number
    rtl: boolean
    usesUpDown: boolean
  }
) {
  if (key === "Home" || key === "End") {
    return true
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    return field.usesUpDown
  }
  if (key !== "ArrowLeft" && key !== "ArrowRight") {
    return false
  }
  // Fields without a caret, like checkboxes, never keep arrows.
  if (field.start === null || field.end === null) {
    return false
  }
  if (field.start !== field.end) {
    return true
  }
  const backward = key === (field.rtl ? "ArrowRight" : "ArrowLeft")
  return backward ? field.start > 0 : field.end < field.length
}

// The index a step lands on, wrapping or stopping at the ends.
function moveIndex(
  index: number,
  step: number | "first" | "last",
  count: number,
  loop: boolean
) {
  if (step === "first") {
    return 0
  }
  if (step === "last") {
    return count - 1
  }
  const next = index + step
  if (loop) {
    return ((next % count) + count) % count
  }
  return Math.max(0, Math.min(count - 1, next))
}

// Values sorted by where they appear in `order`, like a group's items in
// document order, so a value reads the same however it was built. Values
// missing from `order` keep their place at the end.
function inOrder(values: readonly string[], order: readonly string[]) {
  const rank = new Map(order.map((value, index) => [value, index]))
  const at = (value: string) => rank.get(value) ?? Infinity
  return [...values].sort((a, b) => at(a) - at(b))
}

// The scroll position that brings a span into a viewport along one axis, or
// the current one when it's already in view. The span stays `before` and
// `after` clear of the edges, like scroll-padding.
function scrollToShow(
  scroll: number,
  viewport: number,
  start: number,
  size: number,
  before = 0,
  after = 0
) {
  if (start - before < scroll) {
    return Math.max(0, start - before)
  }
  if (start + size + after > scroll + viewport) {
    return Math.max(0, start + size + after - viewport)
  }
  return scroll
}

export {
  type Direction,
  fieldKeepsKey,
  inOrder,
  moveIndex,
  orientationOf,
  radioStep,
  type RovingCandidate,
  rovingStop,
  scrollToShow,
  stepFor,
}
