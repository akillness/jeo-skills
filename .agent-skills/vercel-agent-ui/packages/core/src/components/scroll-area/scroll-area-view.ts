import { isRTL } from "../../foundation/platform/env"
import { prefersReducedMotion } from "../../foundation/platform/platform"
import { ahead, registerUninherited } from "../../foundation/platform/style"
import { bindTabStop } from "../../foundation/focus/tabbable"
import { createScrollbarInput } from "./scroll-area-pointer"
import { on } from "../../foundation/kernel/events"
import type { Store } from "../../foundation/kernel/store"
import {
  edgesOf,
  edgeTolerance,
  followsEnd,
  mainAxis,
  maxScroll,
  overflows,
  scrollbarShown,
  scrollsTowardStart,
  thumbGeometry,
  type Axis,
  type AxisMetrics,
  type ScrollAreaType,
} from "./scroll-area-model"

// The scroll area's engine. It measures the viewport at most once per frame,
// writes thumb geometry and scroll progress as CSS variables, keeps the view
// sticking to the end, and hands pointer input on the scrollbars to
// `scroll-area-pointer.ts`. The
// viewport stays a native scroller, so wheel, touch, keys, find in page and
// screen readers all scroll it themselves. Nothing here renders: per-frame
// values go straight to styles, and the store only hears about flags flipping.

type ScrollAreaModel = {
  type: ScrollAreaType
  scrollHideDelay: number
  stickToEnd: boolean
  // How many Scrollbar parts of each axis are on the page. Native scrollbars
  // hide while any is.
  scrollbarsX: number
  scrollbarsY: number
  // Whether the parts on the page have been counted. Until then, as on the
  // server, custom scrollbars are assumed, so native ones never flash.
  counted: boolean
  overflowX: boolean
  overflowY: boolean
  // Live from here on: written to the DOM without a render.
  atXStart: boolean
  atXEnd: boolean
  atYStart: boolean
  atYEnd: boolean
  scrollingX: boolean
  scrollingY: boolean
  hovering: boolean
  visibleX: boolean
  visibleY: boolean
  dragging: Axis | null
  sticking: boolean
}

const liveKeys: (keyof ScrollAreaModel)[] = [
  "atXStart",
  "atXEnd",
  "atYStart",
  "atYEnd",
  "scrollingX",
  "scrollingY",
  "hovering",
  "visibleX",
  "visibleY",
  "dragging",
  "sticking",
]

/**
 * How a programmatic scroll moves.
 * @stable
 */
type ScrollAreaScrollOptions = {
  /**
   * "smooth" eases there, following content that keeps growing. It's instant
   * when the user prefers reduced motion.
   * @defaultValue "smooth"
   */
  behavior?: "smooth" | "instant"
}

// Scroll events further apart than this end a scroll.
const scrollEndDelay = 150

const axes = ["x", "y"] as const

// State keys and CSS variables per axis, spelled out once, so frames build no strings.
const names = {
  x: {
    overflow: "overflowX",
    atStart: "atXStart",
    atEnd: "atXEnd",
    scrolling: "scrollingX",
    visible: "visibleX",
    thumbSize: "--scroll-area-thumb-width",
    before: "--scroll-area-overflow-x-start",
    after: "--scroll-area-overflow-x-end",
    progress: "--scroll-area-progress-x",
  },
  y: {
    overflow: "overflowY",
    atStart: "atYStart",
    atEnd: "atYEnd",
    scrolling: "scrollingY",
    visible: "visibleY",
    thumbSize: "--scroll-area-thumb-height",
    before: "--scroll-area-overflow-y-start",
    after: "--scroll-area-overflow-y-end",
    progress: "--scroll-area-progress-y",
  },
} as const

// The root's variables change on every frame of a scroll. They don't inherit,
// so they restyle only the root, never the whole content, and Chromium's
// restyle count doesn't depend on the page's history. An element that reads
// one, like a fade over an edge, takes it from the root with `inherit`.
const frameVariables = axes.flatMap((axis) => [
  names[axis].before,
  names[axis].after,
  names[axis].progress,
])

type Flag = {
  [Key in keyof ScrollAreaModel]: ScrollAreaModel[Key] extends boolean
    ? Key
    : never
}[keyof ScrollAreaModel]
type Part = { el: HTMLElement; axis: Axis }

function createScrollView(store: Store<ScrollAreaModel>) {
  let root: HTMLElement | undefined
  let viewport: HTMLElement | undefined
  // The viewport's own window, for frames and timers, like in an iframe.
  const host = () => viewport?.ownerDocument.defaultView ?? window
  const scrollbars = new Set<Part>()
  // Track lengths and thicknesses, from the scrollbars' resize observers.
  const track = { x: 0, y: 0 }
  const thickness = { x: 0, y: 0 }
  let rtl = false

  // The last measurement, reused between frames so scrolling allocates nothing.
  const metrics: Record<Axis, AxisMetrics> = {
    x: { position: 0, client: 0, scroll: 0 },
    y: { position: 0, client: 0, scroll: 0 },
  }
  const previous = { x: Number.NaN, y: Number.NaN }
  // The last value written per element and variable, so unchanged ones aren't written again.
  const written = new WeakMap<HTMLElement, Record<string, number>>()

  let frame = 0
  // Where sticking to the end last scrolled the viewport, to tell its own scroll events apart.
  let stuckTo = Number.NaN
  // Whether a finger or a button is down in the viewport, when growth must not move the content.
  let touchY: number | null = null
  let pressed = false
  let easing = 0
  const scrollEnds = { x: 0, y: 0 }
  const lastScroll = { x: 0, y: 0 }
  const hideTimers = { x: 0, y: 0 }

  function measure() {
    const el = viewport!
    metrics.y.position = el.scrollTop
    metrics.y.client = el.clientHeight
    metrics.y.scroll = el.scrollHeight
    // Right to left, scrollLeft runs from 0 down to minus the maximum. A turned
    // page resizes nothing but flips the sign, which Safari's rubber band does too,
    // so a sign that disagrees asks the style.
    const left = el.scrollLeft
    if (left !== 0 && left < 0 !== rtl) {
      rtl = isRTL(el)
    }
    metrics.x.position = rtl ? -left : left
    metrics.x.client = el.clientWidth
    metrics.x.scroll = el.scrollWidth
  }

  function write(
    el: HTMLElement,
    property: string,
    value: number,
    unit = "px"
  ) {
    let values = written.get(el)
    if (!values) {
      written.set(el, (values = {}))
    }
    const rounded = Math.round(value * 100) / 100
    if (values[property] === rounded) {
      return
    }
    values[property] = rounded
    el.style.setProperty(property, `${rounded}${unit}`)
  }

  function setFlag(key: Flag, value: boolean) {
    // A computed key widens to a string index, so the patch needs its type back.
    if (store.get()[key] !== value) {
      store.set({ [key]: value } as Partial<ScrollAreaModel>)
    }
  }

  // Measures, then writes, so a frame never reads layout after a write.
  function update({ resized = false } = {}) {
    frame = 0
    if (!viewport) {
      return
    }
    measure()
    if (resized) {
      follow()
    }
    const state = store.get()
    let patch: Partial<ScrollAreaModel> | undefined
    const set = <Key extends keyof ScrollAreaModel>(
      key: Key,
      value: ScrollAreaModel[Key]
    ) => {
      if (state[key] !== value) {
        ;(patch ??= {})[key] = value
      }
    }

    for (const axis of axes) {
      const axisMetrics = metrics[axis]
      const name = names[axis]
      const delta = Number.isNaN(previous[axis])
        ? 0
        : axisMetrics.position - previous[axis]
      previous[axis] = axisMetrics.position
      const edges = edgesOf(axisMetrics)
      set(name.overflow, overflows(axisMetrics))
      set(name.atStart, edges.atStart)
      set(name.atEnd, edges.atEnd)
      if (root) {
        registerUninherited(frameVariables)
        write(root, name.before, edges.before)
        write(root, name.after, edges.after)
        write(root, name.progress, edges.progress, "")
      }
      writeThumb(axis)
      if (delta === 0) {
        continue
      }
      // Sticking to the end isn't scrolling: streaming shouldn't flash the scrollbars.
      const ownScroll =
        axis === "y" && Math.abs(axisMetrics.position - stuckTo) < edgeTolerance
      if (!ownScroll) {
        lastScroll[axis] = performance.now()
        set(name.scrolling, true)
        scrollEnds[axis] ||= host().setTimeout(
          () => endScroll(axis),
          scrollEndDelay
        )
      }
      if (axis === "y" && state.stickToEnd) {
        set(
          "sticking",
          followsEnd(state.sticking, { delta, after: edges.after })
        )
      }
    }
    writeCorner(
      patch?.overflowX ?? state.overflowX,
      patch?.overflowY ?? state.overflowY
    )
    if (patch) {
      store.set(patch)
    }
    // Scrolling only matters to visibility when a flag flipped.
    if (patch || resized) {
      refreshVisibility()
    }
  }

  function writeThumb(axis: Axis) {
    const geometry = thumbGeometry(metrics[axis], track[axis])
    for (const scrollbar of scrollbars) {
      if (scrollbar.axis !== axis) {
        continue
      }
      write(scrollbar.el, names[axis].thumbSize, geometry.size)
      // Right to left, the horizontal thumb starts at the right and moves left.
      write(
        scrollbar.el,
        "--scroll-area-thumb-offset",
        axis === "x" && rtl ? -geometry.offset : geometry.offset
      )
    }
  }

  // Scrollbars stop short of the corner only while both show.
  function writeCorner(overflowX: boolean, overflowY: boolean) {
    if (!root) {
      return
    }
    const state = store.get()
    const both =
      overflowX && overflowY && state.scrollbarsX > 0 && state.scrollbarsY > 0
    write(root, "--scroll-area-corner-width", both ? thickness.y : 0)
    write(root, "--scroll-area-corner-height", both ? thickness.x : 0)
  }

  function schedule() {
    if (frame || !viewport) {
      return
    }
    frame = host().requestAnimationFrame(() => update())
  }

  // Scrolling ends once scroll events stop for a moment. One timer per axis,
  // armed again only when it fires early, so scrolling doesn't churn timers.
  function endScroll(axis: Axis) {
    const elapsed = performance.now() - lastScroll[axis]
    if (elapsed < scrollEndDelay) {
      scrollEnds[axis] = host().setTimeout(
        () => endScroll(axis),
        scrollEndDelay - elapsed
      )
      return
    }
    scrollEnds[axis] = 0
    setFlag(names[axis].scrolling, false)
    refreshVisibility()
  }

  // Shows a scrollbar at once, and hides it after the delay once nothing asks for it.
  function refreshVisibility() {
    const state = store.get()
    for (const axis of axes) {
      const name = names[axis]
      const shown = scrollbarShown(state.type, {
        overflow: state[name.overflow],
        hovering: state.hovering,
        scrolling: state[name.scrolling],
        dragging: state.dragging === axis,
      })
      if (shown) {
        host().clearTimeout(hideTimers[axis])
        hideTimers[axis] = 0
        setFlag(name.visible, true)
        continue
      }
      if (!state[name.visible] || hideTimers[axis]) {
        continue
      }
      const delay =
        state.type === "scroll" || state.type === "hover"
          ? state.scrollHideDelay
          : 0
      if (delay <= 0) {
        setFlag(name.visible, false)
      } else {
        hideTimers[axis] = host().setTimeout(() => {
          hideTimers[axis] = 0
          setFlag(name.visible, false)
          refreshVisibility()
        }, delay)
      }
    }
  }

  // Sticking to the end, growth keeps the end in view. Not while a finger or
  // a button is down or the thumb is held, so selecting text or a touch scroll
  // isn't pulled away, and not while easing there already.
  function follow() {
    const state = store.get()
    if (
      !state.stickToEnd ||
      !state.sticking ||
      state.dragging ||
      pressed ||
      touchY !== null ||
      easing
    ) {
      return
    }
    const max = maxScroll(metrics.y)
    if (max - metrics.y.position < edgeTolerance) {
      return
    }
    stuckTo = max
    viewport!.scrollTo({ top: max, behavior: "instant" })
    metrics.y.position = viewport!.scrollTop
  }

  // Scrolls the viewport itself, never its ancestors, so the page stays put.
  function scrollTo(
    axis: Axis,
    position: number,
    behavior: ScrollBehavior = "instant"
  ) {
    if (!viewport) {
      return
    }
    if (axis === "y") {
      viewport.scrollTo({ top: position, behavior })
    } else {
      viewport.scrollTo({ left: rtl ? -position : position, behavior })
    }
  }

  // Input that scrolls toward the start lets go of the end before the scroll
  // lands, so growth in the same frame can't pull the view back down.
  function release() {
    stopEasing()
    if (store.get().sticking && metrics.y.position > 0) {
      store.set({ sticking: false })
    }
  }

  function stopEasing() {
    if (!easing) {
      return
    }
    host().cancelAnimationFrame(easing)
    easing = 0
  }

  // Eases toward the end, reading it every frame, since content may still be growing.
  function easeToEnd() {
    const step = () => {
      easing = 0
      if (!viewport) {
        return
      }
      measure()
      const gap = maxScroll(metrics.y) - metrics.y.position
      if (gap < edgeTolerance) {
        return update()
      }
      scrollTo("y", metrics.y.position + Math.max(1, gap * 0.2))
      easing = host().requestAnimationFrame(step)
    }
    easing = host().requestAnimationFrame(step)
  }

  function scrollToEdge(
    edge: "start" | "end",
    { behavior = "smooth" }: ScrollAreaScrollOptions = {}
  ) {
    if (!viewport) {
      return
    }
    const axis = mainAxis(store.get())
    // At scrollLeft 0 the sign can't show a turned page, so a horizontal call reads the direction.
    if (axis === "x") {
      rtl = isRTL(viewport)
    }
    measure()
    const smooth = behavior === "smooth" && !prefersReducedMotion()
    stopEasing()
    if (edge === "end" && axis === "y" && store.get().stickToEnd) {
      setFlag("sticking", true)
    }
    if (edge === "end" && axis === "y" && smooth) {
      return easeToEnd()
    }
    scrollTo(
      axis,
      edge === "start" ? 0 : maxScroll(metrics[axis]),
      smooth ? "smooth" : "instant"
    )
  }

  function bindViewport(el: HTMLElement) {
    viewport = el
    const view = el.ownerDocument.defaultView ?? window
    // The first measure waits for the observer's first call, once the frame has
    // laid the viewport out: Vue binds before the element is in the page, and
    // a state change while it hydrates would mismatch.
    let counted = false

    // Keeps the end in view at once, before the frame paints, and leaves the
    // writes to the next frame: writing sizes here would resize the observed
    // scrollbars again, a loop WebKit reports as an error.
    const resize = new ResizeObserver(() => {
      rtl = isRTL(el)
      if (!counted && viewport === el) {
        counted = true
        update({ resized: true })
        store.set({ counted: true })
      }
      measure()
      follow()
      schedule()
    })
    // Content growing inside the viewport resizes its children, not the viewport.
    const observeChildren = () => {
      resize.observe(el)
      for (const child of Array.from(el.children)) {
        resize.observe(child)
      }
    }
    observeChildren()
    const children = new MutationObserver(() => {
      observeChildren()
      update({ resized: true })
    })
    children.observe(el, { childList: true })

    // Keyboard users reach a viewport that scrolls and holds nothing focusable.
    const scrollable = () => store.get().overflowX || store.get().overflowY
    const tabStop = bindTabStop(el, scrollable)
    let wasScrollable = scrollable()
    const unsubscribe = store.subscribe(() => {
      if (scrollable() === wasScrollable) {
        return
      }
      wasScrollable = scrollable()
      tabStop.check()
    })

    const lift = () => {
      pressed = false
      view.removeEventListener("pointerup", lift, true)
      view.removeEventListener("pointercancel", lift, true)
      update({ resized: true })
    }
    const endTouch = () => {
      touchY = null
      update({ resized: true })
    }

    const cleanups = [
      () => resize.disconnect(),
      () => children.disconnect(),
      tabStop.stop,
      unsubscribe,
      on(el, "scroll", schedule, { passive: true }),
      on(
        el,
        "wheel",
        (event) => {
          if (event.deltaY >= 0) {
            stopEasing()
          } else if (!scrollsInside(event.target, el)) {
            release()
          }
        },
        { passive: true }
      ),
      on(el, "keydown", (event) => {
        // A widget inside, like a listbox, used the key, or a scroller inside moves for it.
        if (
          event.defaultPrevented ||
          !scrollsTowardStart(
            event.key,
            event.shiftKey,
            isEditing(event.target)
          )
        ) {
          return
        }
        if (!scrollsInside(event.target, el)) {
          release()
        }
      }),
      on(
        el,
        "touchstart",
        (event) => (touchY = event.touches[0]?.clientY ?? null),
        { passive: true }
      ),
      on(
        el,
        "touchmove",
        (event) => {
          const y = event.touches[0]?.clientY
          if (y === undefined) {
            return
          }
          // A finger moving down scrolls the content toward its start,
          // unless a scroller inside takes the move.
          if (
            touchY !== null &&
            y > touchY &&
            !scrollsInside(event.target, el)
          ) {
            release()
          }
          touchY = y
        },
        { passive: true }
      ),
      on(el, "touchend", endTouch, { passive: true }),
      on(el, "touchcancel", endTouch, { passive: true }),
      on(el, "pointerdown", (event) => {
        if (event.pointerType === "touch" || event.button !== 0) {
          return
        }
        pressed = true
        stopEasing()
        view.addEventListener("pointerup", lift, true)
        view.addEventListener("pointercancel", lift, true)
      }),
    ]
    return () => {
      cleanups.forEach((cleanup) => cleanup())
      view.removeEventListener("pointerup", lift, true)
      view.removeEventListener("pointercancel", lift, true)
      if (frame) {
        view.cancelAnimationFrame(frame)
      }
      frame = 0
      stopEasing()
      for (const axis of axes) {
        view.clearTimeout(scrollEnds[axis])
        view.clearTimeout(hideTimers[axis])
        scrollEnds[axis] = hideTimers[axis] = 0
      }
      if (viewport === el) {
        viewport = undefined
      }
    }
  }

  function bindRoot(el: HTMLElement) {
    ahead(() => registerUninherited(frameVariables))
    root = el
    // The pointer may already be over it when it mounts.
    queueMicrotask(() => {
      if (root === el && el.isConnected && el.matches(":hover")) {
        setFlag("hovering", true)
      }
    })
    const hover = (hovering: boolean) => (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return
      }
      setFlag("hovering", hovering)
      refreshVisibility()
    }
    const cleanups = [
      on(el, "pointerenter", hover(true)),
      on(el, "pointerleave", hover(false)),
    ]
    return () => {
      cleanups.forEach((cleanup) => cleanup())
      if (root === el) {
        root = undefined
      }
    }
  }

  const input = createScrollbarInput({
    viewport: () => viewport,
    metrics,
    track,
    rtl: () => rtl,
    measure,
    // At the start, scrollLeft has no sign to show a turned direction.
    readDirection: () => {
      rtl = isRTL(viewport!)
    },
    scrollTo,
    release,
    stopEasing,
    setDragging,
  })

  function bindScrollbar(el: HTMLElement, axis: Axis) {
    const part = { el, axis }
    scrollbars.add(part)
    // Counted a microtask later, so hydration sees the state the server rendered.
    queueMicrotask(countScrollbars)
    const resize = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0]
      const length =
        axis === "y" ? entry.contentRect.height : entry.contentRect.width
      const appeared = track[axis] === 0 && length > 0
      track[axis] = length
      thickness[axis] = (axis === "y" ? box?.inlineSize : box?.blockSize) ?? 0
      // A track that just got its length, like on mount, sizes its thumb now:
      // this runs after layout and before paint, so the first frame that shows
      // the thumb has its size. Only the scrollbar's own variables change, which
      // resize no observed element. The rest waits for the next frame.
      if (appeared && viewport) {
        measure()
        writeThumb(axis)
      }
      schedule()
    })
    resize.observe(el)
    schedule()
    const cleanups = [
      () => resize.disconnect(),
      on(el, "wheel", input.forwardWheel, { passive: false }),
      // Pressing a scrollbar never moves focus, like a native one.
      on(el, "mousedown", (event) => event.preventDefault()),
      on(el, "pointerdown", (event) => input.pressTrack(event, el, axis)),
    ]
    return () => {
      cleanups.forEach((cleanup) => cleanup())
      input.endPress(el)
      scrollbars.delete(part)
      countScrollbars()
      // What it wrote for its axis goes with it, so bound again along the
      // other one it holds only that one's.
      for (const property in written.get(el)) {
        el.style.removeProperty(property)
      }
      written.delete(el)
    }
  }

  function countScrollbars() {
    let x = 0
    let y = 0
    for (const part of scrollbars) {
      if (part.axis === "x") {
        x++
      } else {
        y++
      }
    }
    store.set({ scrollbarsX: x, scrollbarsY: y })
  }

  function setDragging(dragging: Axis | null) {
    store.set({ dragging })
    refreshVisibility()
  }

  return {
    bindRoot,
    bindViewport,
    bindScrollbar,
    bindThumb: input.bindThumb,
    scrollToEdge,
    // Whether the view is at an edge now. The store catches up a frame after
    // a scroll, so a scroll handler reading it would get where the view was.
    // Undefined without a viewport, like on the server.
    isAt(edge: "start" | "end") {
      if (!viewport?.isConnected) {
        return undefined
      }
      measure()
      const axis = mainAxis({
        overflowX: overflows(metrics.x),
        overflowY: overflows(metrics.y),
      })
      const edges = edgesOf(metrics[axis])
      return edge === "start" ? edges.atStart : edges.atEnd
    },
    // Moves focus to the viewport, programmatically focusable for as long as
    // it holds focus when it isn't a tab stop.
    focusViewport() {
      const el = viewport
      if (!el) {
        return
      }
      if (!el.hasAttribute("tabindex")) {
        el.setAttribute("tabindex", "-1")
        const restore = () =>
          el.getAttribute("tabindex") === "-1" && el.removeAttribute("tabindex")
        el.addEventListener("blur", restore, { once: true })
      }
      el.focus({ preventScroll: true })
    },
    // Applies changed options, like stickToEnd or type.
    refresh() {
      if (viewport?.isConnected) {
        update({ resized: true })
      }
      refreshVisibility()
    },
  }
}

function isEditing(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
  )
}

// Whether a scroller between `target` and the viewport can still scroll
// toward its start, so it takes an upward wheel, key or swipe and the
// viewport stays where it is, still stuck to its end.
function scrollsInside(target: EventTarget | null, viewport: HTMLElement) {
  for (
    let el = target instanceof Element ? target : null;
    el && el !== viewport;
    el = el.parentElement
  ) {
    if (el.scrollTop <= 0 || el.scrollHeight <= el.clientHeight) {
      continue
    }
    const { overflowY } = getComputedStyle(el)
    if (overflowY === "auto" || overflowY === "scroll") {
      return true
    }
  }
  return false
}

export {
  createScrollView,
  liveKeys,
  type ScrollAreaModel,
  type ScrollAreaScrollOptions,
}
