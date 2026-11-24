import {
  createDragSession,
  repeatWhileHeld,
} from "../../foundation/drag-and-drop/pointer"
import { on } from "../../foundation/kernel/events"
import {
  draggedPosition,
  edgeTolerance,
  maxScroll,
  pageDirection,
  pageLength,
  positionAt,
  thumbGeometry,
  wheelPixels,
  type Axis,
  type AxisMetrics,
} from "./scroll-area-model"

// Pointer input on a scroll area's scrollbars: dragging the thumb, pressing
// the track, and wheels over them. The engine in `scroll-area-view.ts` owns
// the measurements and hands them over.

/** What the scrollbars need from the engine. */
type ScrollbarHost = {
  viewport: () => HTMLElement | undefined
  // The latest measurement, kept up to date by `measure`.
  metrics: Record<Axis, AxisMetrics>
  // Each track's length, from the scrollbars' resize observers.
  track: Record<Axis, number>
  rtl: () => boolean
  measure: () => void
  // Reads the direction again, for horizontal input as it starts.
  readDirection: () => void
  scrollTo: (axis: Axis, position: number, behavior?: ScrollBehavior) => void
  // Lets go of the end, for input that scrolls toward the start.
  release: () => void
  stopEasing: () => void
  setDragging: (axis: Axis | null) => void
}

// A Firefox mouse wheel reports lines.
const lineHeight = 16

function createScrollbarInput(host: ScrollbarHost) {
  const thumbs = new Map<Axis, HTMLElement>()
  const drags = createDragSession()
  // The part whose drag or press is held, so a part leaving the page
  // mid-gesture ends its own instead of listening on the document until the pointer lifts.
  let holder: HTMLElement | undefined
  // Ended where it is: only Escape puts the content back.
  const endPress = (el: HTMLElement) => {
    if (holder !== el) {
      return
    }
    holder = undefined
    drags.cancel()
  }

  // A scrollbar sits beside the viewport, not inside it, so a wheel over it
  // would scroll the page. It scrolls the viewport instead, as far as it would
  // over the content, and lets the page scroll once the viewport can't.
  function forwardWheel(event: WheelEvent) {
    if (!host.viewport() || event.ctrlKey) {
      return
    }
    if (event.deltaX !== 0) {
      host.readDirection()
    }
    host.measure()
    const dx = wheelPixels(
      event.deltaX,
      event.deltaMode,
      lineHeight,
      host.metrics.x.client
    )
    const dy = wheelPixels(
      event.deltaY,
      event.deltaMode,
      lineHeight,
      host.metrics.y.client
    )
    const canScroll = (delta: number, axis: Axis) => {
      // Right to left, a positive deltaX moves toward the start.
      const toward = axis === "x" && host.rtl() ? -delta : delta
      if (toward < 0) {
        return host.metrics[axis].position > 0
      }
      return (
        toward > 0 &&
        maxScroll(host.metrics[axis]) - host.metrics[axis].position >=
          edgeTolerance
      )
    }
    if (!canScroll(dx, "x") && !canScroll(dy, "y")) {
      return
    }
    event.preventDefault()
    if (dy < 0) {
      host.release()
    } else {
      host.stopEasing()
    }
    host.viewport()!.scrollBy({ left: dx, top: dy, behavior: "instant" })
  }

  function bindThumb(el: HTMLElement, axis: Axis) {
    thumbs.set(axis, el)
    const off = on(el, "pointerdown", (event) => {
      if (!host.viewport() || !drags.accepts(event)) {
        return
      }
      // The track's own press handler would page.
      event.stopPropagation()
      event.preventDefault()
      if (axis === "x") {
        host.readDirection()
      }
      host.measure()
      drag(el, event, axis, host.metrics[axis].position)
    })
    return () => {
      off()
      endPress(el)
      if (thumbs.get(axis) === el) {
        thumbs.delete(axis)
      }
    }
  }

  // The thumb moves as far as the pointer does. Scroll snapping would round
  // every step to a snap point, so it's off until the pointer lifts. Escape
  // puts the content back where the drag started, so a drag can be called off
  // (WCAG 2.5.2).
  function drag(
    el: HTMLElement,
    down: PointerEvent,
    axis: Axis,
    start: number
  ) {
    const from = axis === "y" ? down.clientY : down.clientX
    // A scaled ancestor moves the pointer further on screen than in layout.
    const scale = scaleOf(el, axis)
    const restoreSnap = suspendSnap(host.viewport()!)
    host.stopEasing()
    host.setDragging(axis)
    holder = el
    drags.start(el, down, {
      cancelOnEscape: true,
      onMove: (sample) => {
        const distance = ((axis === "y" ? sample.y : sample.x) - from) / scale
        const delta = axis === "x" && host.rtl() ? -distance : distance
        host.scrollTo(
          axis,
          draggedPosition(start, delta, host.metrics[axis], host.track[axis])
        )
      },
      // Only Escape puts the content back. It ends with the last move; a lost
      // pointer or a new press ends with its own event.
      onEnd: (end, canceled) => {
        if (canceled && holder === el && end.type === "pointermove") {
          host.scrollTo(axis, start)
        }
        holder = undefined
        restoreSnap()
        host.setDragging(null)
      },
    })
  }

  // A press on the track pages toward the pointer, and keeps paging while it's
  // held, until the thumb reaches the pointer. With Alt (Option on a Mac) it
  // jumps there and drags instead, like macOS.
  function pressTrack(event: PointerEvent, el: HTMLElement, axis: Axis) {
    if (!host.viewport() || !drags.accepts(event)) {
      return
    }
    event.preventDefault()
    if (axis === "x") {
      host.readDirection()
    }
    host.measure()
    let point = trackPoint(el, axis, event)
    if (event.altKey) {
      const position = positionAt(point, host.metrics[axis], host.track[axis])
      host.scrollTo(axis, position)
      const thumb = thumbs.get(axis)
      if (thumb) {
        drag(thumb, event, axis, position)
      }
      return
    }
    const direction = pageDirection(
      point,
      thumbGeometry(host.metrics[axis], host.track[axis])
    )
    if (direction === 0) {
      return
    }
    if (axis === "y" && direction < 0) {
      host.release()
    }
    const page = pageLength(host.metrics[axis].client)
    const max = maxScroll(host.metrics[axis])
    let target = host.metrics[axis].position
    const stopRepeat = repeatWhileHeld(() => {
      const thumb = thumbGeometry(
        { ...host.metrics[axis], position: target },
        host.track[axis]
      )
      if (pageDirection(point, thumb) !== direction) {
        return false
      }
      target = Math.min(Math.max(target + direction * page, 0), max)
      // Pages follow the viewport's own `scroll-behavior`, like native ones.
      host.scrollTo(axis, target, "auto")
      return target > 0 && target < max
    })
    holder = el
    drags.start(el, event, {
      onMove: (sample) => (point = trackPoint(el, axis, sample.event)),
      onEnd: () => {
        holder = undefined
        stopRepeat()
      },
    })
  }

  return { forwardWheel, bindThumb, pressTrack, endPress }
}

function suspendSnap(el: HTMLElement) {
  const saved = el.style.scrollSnapType
  el.style.scrollSnapType = "none"
  return () => {
    el.style.scrollSnapType = saved
  }
}

// Where a pointer is along a scrollbar's track: from the start of its content
// box, in the axis's direction. Read once per press, so a style read is fine.
function trackPoint(el: HTMLElement, axis: Axis, event: PointerEvent) {
  const rect = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  const px = (value: string) => Number.parseFloat(value) || 0
  const scale = scaleOf(el, axis)
  if (axis === "y") {
    return (
      (event.clientY - rect.top) / scale -
      px(style.borderTopWidth) -
      px(style.paddingTop)
    )
  }
  if (style.direction === "rtl") {
    return (
      (rect.right - event.clientX) / scale -
      px(style.borderRightWidth) -
      px(style.paddingRight)
    )
  }
  return (
    (event.clientX - rect.left) / scale -
    px(style.borderLeftWidth) -
    px(style.paddingLeft)
  )
}

// How much larger an element shows on screen than in layout, from a scaled ancestor.
function scaleOf(el: HTMLElement, axis: Axis) {
  const rect = el.getBoundingClientRect()
  const layout = axis === "y" ? el.offsetHeight : el.offsetWidth
  const screen = axis === "y" ? rect.height : rect.width
  return layout > 0 && screen > 0 ? screen / layout : 1
}

export { createScrollbarInput, type ScrollbarHost }
