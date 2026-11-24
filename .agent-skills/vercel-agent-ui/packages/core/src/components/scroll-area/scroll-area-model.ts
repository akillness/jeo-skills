// The decisions a scroll area makes, as pure functions of plain numbers, so
// they're unit tested without a DOM. `scroll-area-view.ts` measures the page
// and calls these.

/**
 * How a scroll area shows its scrollbars.
 * @stable
 */
type ScrollAreaType = "auto" | "always" | "scroll" | "hover"

type Axis = "x" | "y"

/** One axis of the viewport: where it is and how far it can go. */
type AxisMetrics = {
  // Distance scrolled from the start edge. Right to left, it's already positive.
  position: number
  // The visible length.
  client: number
  // The whole scrollable length.
  scroll: number
}

// Scroll positions are fractional on high density screens, while scroll sizes
// are rounded, so an edge within a pixel counts as reached.
const edgeTolerance = 1

// Thumbs never shrink below this, so they stay easy to grab on long content.
const minThumbSize = 16

// Chrome pages by this much of the viewport, keeping a little of the last page in view.
const pageFraction = 0.875

/**
 * The axis a scroll area's start and end refer to: the vertical one, or the
 * horizontal one when only that overflows, like a carousel.
 */
function mainAxis({
  overflowX,
  overflowY,
}: {
  overflowX: boolean
  overflowY: boolean
}) {
  return overflowX && !overflowY ? "x" : "y"
}

function maxScroll({ client, scroll }: AxisMetrics) {
  return Math.max(0, scroll - client)
}

function overflows(metrics: AxisMetrics) {
  return maxScroll(metrics) >= edgeTolerance
}

// The position clamped to the scrollable range. Safari's rubber band goes past both ends.
function clampedPosition(metrics: AxisMetrics) {
  return Math.min(Math.max(metrics.position, 0), maxScroll(metrics))
}

/** How far the content reaches past each edge, and how far along the scroll is, from 0 to 1. */
function edgesOf(metrics: AxisMetrics) {
  const max = maxScroll(metrics)
  const position = clampedPosition(metrics)
  const before = max < edgeTolerance ? 0 : position
  const after = max < edgeTolerance ? 0 : max - position
  return {
    before,
    after,
    atStart: before < edgeTolerance,
    atEnd: after < edgeTolerance,
    progress: max < edgeTolerance ? 0 : position / max,
  }
}

/** The thumb's length and its offset from the start of the track, in pixels. */
function thumbGeometry(metrics: AxisMetrics, track: number) {
  if (track <= 0 || metrics.scroll <= 0) {
    return { size: 0, offset: 0 }
  }
  const size = Math.min(
    track,
    Math.max(minThumbSize, (track * metrics.client) / metrics.scroll)
  )
  const max = maxScroll(metrics)
  const offset =
    max <= 0 ? 0 : ((track - size) * clampedPosition(metrics)) / max
  return { size, offset }
}

/** The scroll position for a thumb dragged `delta` pixels along a track, from where the drag started. */
function draggedPosition(
  start: number,
  delta: number,
  metrics: AxisMetrics,
  track: number
) {
  const { size } = thumbGeometry(metrics, track)
  const travel = track - size
  // A thumb as long as its track can't move, and dividing by zero would jump.
  if (travel <= 0) {
    return start
  }
  const max = maxScroll(metrics)
  return Math.min(Math.max(start + (delta / travel) * max, 0), max)
}

/** The scroll position that centers the thumb on a point of the track. */
function positionAt(point: number, metrics: AxisMetrics, track: number) {
  const { size } = thumbGeometry(metrics, track)
  const travel = track - size
  if (travel <= 0) {
    return 0
  }
  const ratio = Math.min(Math.max((point - size / 2) / travel, 0), 1)
  return ratio * maxScroll(metrics)
}

/**
 * Which way a press on the track pages: toward the start (-1), toward the end
 * (1), or not at all once the thumb is under the pointer (0). `point` is along
 * the track, from its start.
 */
function pageDirection(point: number, thumb: { size: number; offset: number }) {
  if (point < thumb.offset) {
    return -1
  }
  if (point > thumb.offset + thumb.size) {
    return 1
  }
  return 0
}

/** One page, for a viewport this long. */
function pageLength(client: number) {
  return Math.max(1, Math.round(client * pageFraction))
}

/**
 * A wheel delta in pixels. Firefox reports mouse wheels in lines, and some
 * devices in pages, so a wheel forwarded from a scrollbar scrolls as far as
 * it would over the content.
 */
function wheelPixels(
  delta: number,
  mode: number,
  lineHeight: number,
  page: number
) {
  if (mode === 1) {
    return delta * lineHeight
  }
  if (mode === 2) {
    return delta * page
  }
  return delta
}

/** Why a scrollbar wants to show: the inputs `scrollbarShown` weighs. */
type ScrollbarSignals = {
  overflow: boolean
  hovering: boolean
  scrolling: boolean
  dragging: boolean
}

/**
 * Whether a scrollbar should show now, before the hide delay. "always" shows
 * even without overflow, "auto" whenever there's overflow, "scroll" while
 * scrolling, and "hover" while the pointer is over the scroll area too.
 */
function scrollbarShown(type: ScrollAreaType, signals: ScrollbarSignals) {
  if (type === "always") {
    return true
  }
  if (!signals.overflow) {
    return false
  }
  if (type === "auto" || signals.dragging || signals.scrolling) {
    return true
  }
  return type === "hover" && signals.hovering
}

/**
 * Whether a scroll area sticking to the end still follows it after the
 * viewport scrolled by `delta` (positive toward the end). Moving away from the
 * end lets go, whatever moved it: the user, find in page, or the app. Reaching
 * the end while moving toward it follows again. Content growing or shrinking
 * scrolls nothing toward the start and changes nothing.
 */
function followsEnd(
  following: boolean,
  scroll: { delta: number; after: number }
) {
  const atEnd = scroll.after < edgeTolerance
  if (following) {
    return atEnd || scroll.delta >= 0
  }
  return atEnd && scroll.delta > 0
}

// Keys that scroll a viewport toward its start when the focus is inside it, but
// not in a text field, where they move the caret instead.
const startwardKeys = new Set(["ArrowUp", "PageUp", "Home"])

/** Whether a key pressed in the viewport asks to scroll toward the start, which lets go of the end. */
function scrollsTowardStart(key: string, shiftKey: boolean, editing: boolean) {
  if (editing) {
    return false
  }
  return startwardKeys.has(key) || (key === " " && shiftKey)
}

export {
  type Axis,
  type AxisMetrics,
  draggedPosition,
  edgesOf,
  edgeTolerance,
  followsEnd,
  mainAxis,
  maxScroll,
  minThumbSize,
  overflows,
  pageDirection,
  pageLength,
  positionAt,
  type ScrollAreaType,
  scrollbarShown,
  type ScrollbarSignals,
  scrollsTowardStart,
  thumbGeometry,
  wheelPixels,
}
