// Scrolling while dragging near an edge, so a drag can reach what's out of
// view: a card to a column off screen, a row past the bottom of a long list.
// The closer the pointer is to the edge, the faster it scrolls.

/**
 * How `createAutoScroll` scrolls.
 * @experimental
 */
type AutoScrollOptions = {
  /** How far in from an edge scrolling starts, in pixels. @defaultValue 48 */
  edge?: number
  /** The fastest it scrolls, in pixels per frame, with the pointer at the edge. @defaultValue 18 */
  speed?: number
  /** Runs after each frame that scrolled, so a drag can find its target again under a pointer that didn't move. */
  onScroll?: () => void
  /** The element being dragged, which sits under the pointer, so the scrollers under it are found instead of its own. */
  ignore?: () => Element | null | undefined
}

const scrollable = (el: Element, axis: "x" | "y") => {
  const style = getComputedStyle(el)
  const overflow = axis === "x" ? style.overflowX : style.overflowY
  return (
    /auto|scroll|overlay/.test(overflow) &&
    (axis === "x"
      ? el.scrollWidth > el.clientWidth
      : el.scrollHeight > el.clientHeight)
  )
}

// How fast to go along one axis: negative toward the start, by how deep into the edge band the pointer is.
function velocity(
  at: number,
  start: number,
  end: number,
  edge: number,
  speed: number
) {
  const band = Math.min(edge, (end - start) / 3)
  if (at < start + band) {
    return -speed * Math.min(1, (start + band - at) / band)
  }
  if (at > end - band) {
    return speed * Math.min(1, (at - (end - band)) / band)
  }
  return 0
}

/**
 * Scrolls the scrollers under a dragging pointer when it nears their edges,
 * the innermost first, then the window. Call `update` from every pointer move
 * and `stop` when the drag ends:
 *
 * ```ts
 * const scroll = createAutoScroll({ onScroll: () => findDropTarget(lastX, lastY) })
 * // onMove: scroll.update(x, y)
 * // onEnd: scroll.stop()
 * ```
 * @experimental
 */
function createAutoScroll(options: AutoScrollOptions = {}) {
  let point: { x: number; y: number } | null = null
  let frame = 0

  function tick() {
    frame = 0
    if (!point || typeof document === "undefined") {
      return
    }
    const edge = options.edge ?? 48
    const speed = options.speed ?? 18
    let moved = false
    const ignored = options.ignore?.()
    let el: Element | null =
      document
        .elementsFromPoint(point.x, point.y)
        .find((hit) => !ignored?.contains(hit)) ?? null
    const done = { x: false, y: false }
    while (el && !(done.x && done.y)) {
      const rect = el.getBoundingClientRect()
      for (const axis of ["x", "y"] as const) {
        if (done[axis] || !scrollable(el, axis)) {
          continue
        }
        const v =
          axis === "x"
            ? velocity(point.x, rect.left, rect.right, edge, speed)
            : velocity(point.y, rect.top, rect.bottom, edge, speed)
        if (!v) {
          continue
        }
        const before = axis === "x" ? el.scrollLeft : el.scrollTop
        if (axis === "x") {
          el.scrollLeft += v
        } else {
          el.scrollTop += v
        }
        if ((axis === "x" ? el.scrollLeft : el.scrollTop) !== before) {
          done[axis] = moved = true
        }
      }
      el = el.parentElement
    }
    const view = document.defaultView
    if (view && !done.y) {
      const v = velocity(point.y, 0, view.innerHeight, edge, speed)
      const before = view.scrollY
      if (v) {
        view.scrollBy(0, v)
      }
      if (view.scrollY !== before) {
        moved = true
      }
    }
    if (moved) {
      options.onScroll?.()
      frame = requestAnimationFrame(tick)
    }
  }

  return {
    /** The pointer moved to `x`, `y` in viewport pixels. Starts scrolling if it's near an edge. */
    update(x: number, y: number) {
      point = { x, y }
      if (!frame) {
        frame = requestAnimationFrame(tick)
      }
    },
    /** Stops scrolling, like when the drag ends. */
    stop() {
      point = null
      if (frame) {
        cancelAnimationFrame(frame)
      }
      frame = 0
    },
  }
}

export { type AutoScrollOptions, createAutoScroll }
