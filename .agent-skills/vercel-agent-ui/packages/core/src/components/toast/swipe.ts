import type { DragSession } from "../../foundation/drag-and-drop/pointer"

/** A direction a swipe can dismiss toward. */
type SwipeDirection = "up" | "down" | "left" | "right"

const slop = 8

// Movement toward a direction: positive when the pointer moved that way.
function along(direction: SwipeDirection, x: number, y: number) {
  if (direction === "up") {
    return -y
  }
  if (direction === "down") {
    return y
  }
  return direction === "left" ? -x : x
}

function resist(distance: number) {
  return Math.sign(distance) * 4 * Math.log1p(Math.abs(distance) / 4)
}

/**
 * Where a swiped element shows, from how far the pointer moved: freely toward
 * an allowed direction, and resisting on the rest of that axis.
 */
function swipeOffset(
  x: number,
  y: number,
  axis: "x" | "y",
  directions: SwipeDirection[]
) {
  const free = (
    value: number,
    negative: SwipeDirection,
    positive: SwipeDirection
  ) =>
    (value < 0 && directions.includes(negative)) ||
    (value > 0 && directions.includes(positive))
      ? value
      : resist(value)
  return axis === "x"
    ? { x: free(x, "left", "right"), y: 0 }
    : { x: 0, y: free(y, "up", "down") }
}

/**
 * Which direction a released swipe dismisses toward, or null when it snaps
 * back. Far enough, or fast enough toward a direction, dismisses. Velocity is
 * in px per ms.
 */
function swipeOutcome({
  x,
  y,
  velocityX,
  velocityY,
  directions,
  threshold = 40,
  flick = 0.3,
}: {
  x: number
  y: number
  velocityX: number
  velocityY: number
  directions: SwipeDirection[]
  threshold?: number
  flick?: number
}) {
  for (const direction of directions) {
    const distance = along(direction, x, y)
    const speed = along(direction, velocityX, velocityY)
    if (distance >= threshold || (distance > slop && speed >= flick)) {
      return direction
    }
  }
  return null
}

// Which axis a press moved along first, if one of its directions is on it.
function swipeAxis(x: number, y: number, directions: SwipeDirection[]) {
  if (Math.hypot(x, y) < slop) {
    return undefined
  }
  const axis = Math.abs(x) > Math.abs(y) ? "x" : "y"
  const allowed =
    axis === "x"
      ? directions.some(
          (direction) => direction === "left" || direction === "right"
        )
      : directions.some(
          (direction) => direction === "up" || direction === "down"
        )
  return allowed ? axis : null
}

type SwipeCallbacks = {
  // The press became a swipe along an axis.
  onStart: (axis: "x" | "y") => void
  // Where the element should show now.
  onMove: (offset: { x: number; y: number }) => void
  // It ended: the direction it dismisses toward, or null to snap back.
  onEnd: (direction: SwipeDirection | null, event: PointerEvent) => void
}

/**
 * Follows a press on `el` that may become a swipe toward `directions`, as the
 * session's one drag. The press stays a press until the pointer moves past a
 * few pixels along an axis with a direction, so clicks on buttons inside keep
 * working. Then the pointer is captured until it lifts.
 */
function trackSwipe(
  drags: DragSession,
  el: HTMLElement,
  down: PointerEvent,
  directions: SwipeDirection[],
  callbacks: SwipeCallbacks
) {
  const start = { x: down.clientX, y: down.clientY }
  const samples = [{ x: start.x, y: start.y, time: down.timeStamp }]
  let axis: "x" | "y" = "x"
  drags.startOnMove(el, down, {
    pick(move) {
      const picked = swipeAxis(
        move.clientX - start.x,
        move.clientY - start.y,
        directions
      )
      if (picked === undefined) {
        return undefined
      }
      if (picked === null) {
        return false
      }
      axis = picked
      callbacks.onStart(axis)
      return true
    },
    onMove: ({ x, y, event }) => {
      samples.push({ x, y, time: event.timeStamp })
      if (samples.length > 2) {
        samples.shift()
      }
      callbacks.onMove(swipeOffset(x - start.x, y - start.y, axis, directions))
    },
    onEnd: (event, canceled) => {
      const [from, to] = samples
      const elapsed = to ? Math.max(1, to.time - from.time) : Infinity
      const x = event.clientX - start.x
      const y = event.clientY - start.y
      const direction = canceled
        ? null
        : swipeOutcome({
            x: axis === "x" ? x : 0,
            y: axis === "y" ? y : 0,
            velocityX: to ? (to.x - from.x) / elapsed : 0,
            velocityY: to ? (to.y - from.y) / elapsed : 0,
            directions,
          })
      callbacks.onEnd(direction, event)
    },
  })
}

export {
  along,
  swipeAxis,
  type SwipeDirection,
  swipeOffset,
  swipeOutcome,
  trackSwipe,
}
