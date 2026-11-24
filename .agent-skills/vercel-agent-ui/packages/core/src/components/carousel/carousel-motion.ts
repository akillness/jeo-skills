// How a carousel's viewport moves. Fingers, wheels, trackpads, scrollbars and
// focus scroll it natively, with CSS scroll snap doing the paging, so it pages
// before hydration and feels like the platform. Everything the carousel does
// itself goes through the Drawer's gesture machine, with the scroll position as
// its extent and the pages as its snap points: mouse and pen drags, which
// follow the pointer and spring from the release velocity to the page the
// projection picks, and programmatic moves, which spring from wherever the
// viewport is, at whatever speed it's going. Springs write the scroll
// position once a frame, rather than a transform, so scroll-driven effects on
// slides stay in step. Past either end, a drag stretches the content with a
// rubber band on its `translate`, since a scroll position can't leave its range.
import {
  initialState,
  next,
  type SheetEffect,
  type SheetEvent,
  type SheetState,
} from "../../foundation/motion/machine"
import type { SheetPhysics } from "../../foundation/motion/physics"
import { projectDistance } from "../../foundation/motion/projection"
import { settleTime, solveSpring } from "../../foundation/motion/spring"
import { createVelocityTracker } from "../../foundation/motion/velocity"
import { clamp } from "../../foundation/number/steps"
import { nearestPage } from "./carousel-layout"
import { on } from "../../foundation/kernel/events"
import { swallowNextClick } from "../../foundation/drag-and-drop/pointer"

/** Which way the carousel scrolls, as the viewport lays it out. */
type CarouselAxis = { vertical: boolean; rtl: boolean }

// Never a drag: typing, picking and sliding belong to the control.
const ignoredTargets =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-carousel-no-drag]'

// No scroll for this long, with no finger down, counts as rest where
// `scrollend` isn't supported.
const restTimeout = 120

// UIScrollView's normal deceleration, for where a free drag coasts to.
const freeDecelerationRate = 0.998

type CarouselMotionOptions = {
  viewport: HTMLElement
  /** The element that holds the slides, which the rubber band stretches. */
  content: () => HTMLElement | undefined
  axis: () => CarouselAxis
  /** Each page's resting scroll position, ascending. */
  positions: () => readonly number[]
  /** The largest scroll position, as last measured. */
  maxScroll: () => number
  /** The viewport's size along the axis, which the rubber band stretches against. */
  viewportSize: () => number
  physics: () => SheetPhysics
  /** Whether a mouse or pen can drag the slides. */
  canDrag: () => boolean
  /** Whether a drag coasts to wherever it stops, instead of a page. */
  dragFree: () => boolean
  reducedMotion: () => boolean
  /** Snapping goes off while the carousel moves itself, and back on once it rests on a page. */
  setSnapping: (snapping: boolean) => void
  /** A drag was released, and it's heading for this page index. */
  onRelease: (index: number, event: PointerEvent) => void
  /** The user's own scroll came to rest. `touch` says whether a finger drove it. */
  onScrollRest: (
    position: number,
    cause: { touch: boolean; event?: Event }
  ) => void
  onDragChange: (dragging: boolean) => void
  /** A spring came to rest, from a drag's release or a programmatic move. */
  onSettle: () => void
  /** The scroll position changed: a frame of a spring or a drag, or the user's scroll. */
  onScroll: () => void
}

function createCarouselMotion(options: CarouselMotionOptions) {
  const { viewport } = options
  const doc = viewport.ownerDocument
  const view = doc.defaultView ?? window
  let state: SheetState = initialState(0, 0)
  let spring: { frame: number; to: number } | null = null
  let pendingPosition: number | null = null
  let moveFrame = 0
  let overshoot = 0
  // The scroll position written last, so the scroll event it causes isn't taken for the user's.
  let written: number | null = null
  let touching = false
  let touched = false
  let userScrolled = false
  let restMissed = false
  let restTimer = 0
  let pointerId: number | null = null
  let dragging = false
  let mouseDragged = false
  let offPointer: (() => void)[] = []
  let lastScrollEvent: Event | undefined
  let destroyed = false
  const point = { x: 0, y: 0 }
  const tracker = createVelocityTracker()
  const supportsScrollEnd = "onscrollend" in viewport

  const offs = [
    on(viewport, "scroll", onScroll, { passive: true }),
    ...(supportsScrollEnd
      ? [on(viewport, "scrollend" as "scroll", (event) => onRest(event))]
      : []),
    on(viewport, "touchstart", onTouchStart, { passive: true }),
    on(viewport, "touchend", onTouchEnd, { passive: true }),
    on(viewport, "touchcancel", onTouchEnd, { passive: true }),
    on(viewport, "pointerdown", onPointerDown),
    // A dragged image or link would start the browser's drag and drop instead.
    on(viewport, "dragstart", (event) => {
      if (options.canDrag()) {
        event.preventDefault()
      }
    }),
  ]

  function position() {
    const { vertical, rtl } = options.axis()
    if (vertical) {
      return viewport.scrollTop
    }
    return rtl ? -viewport.scrollLeft : viewport.scrollLeft
  }

  // Shows `target`: the scroll position within range, and the rest as a stretch.
  function write(target: number) {
    if (destroyed) {
      return
    }
    const { vertical, rtl } = options.axis()
    const scroll = clamp(target, 0, options.maxScroll())
    written = scroll
    if (vertical) {
      viewport.scrollTop = scroll
    } else {
      viewport.scrollLeft = rtl ? -scroll : scroll
    }
    writeOvershoot(target - scroll)
    options.onScroll()
  }

  function writeOvershoot(amount: number) {
    const content = options.content()
    if (!content || (amount === 0 && overshoot === 0)) {
      return
    }
    overshoot = amount
    if (amount === 0) {
      return content.style.removeProperty("translate")
    }
    const { vertical, rtl } = options.axis()
    const offset = `${Math.round(-amount * (rtl && !vertical ? -1 : 1) * 100) / 100}px`
    content.style.translate = vertical ? `0 ${offset}` : `${offset} 0`
  }

  function config() {
    return {
      snapPoints: options
        .positions()
        .map((extent, index) => ({ id: String(index), extent })),
      dimension: options.viewportSize(),
      dismissible: false,
      expandOnScroll: false,
      physics: options.physics(),
    }
  }

  // The machine's idea of where it rests, refreshed after the browser scrolled it natively.
  function restHere() {
    const at = position()
    state = initialState(at, Math.max(0, nearestPage(pagesAt(), at)))
  }

  const pagesAt = () => options.positions().map((position) => ({ position }))

  function dispatch(event: SheetEvent, source?: Event) {
    if (destroyed || options.positions().length === 0) {
      return
    }
    const result = next(state, event, config())
    state = result.state
    // Before the effects, so a release that reports its page finds the drag over.
    setDragging(state.phase === "dragging")
    const time = "time" in event ? event.time : performance.now()
    for (const effect of result.effects) {
      run(effect, time, source)
    }
  }

  function setDragging(value: boolean) {
    if (value === dragging) {
      return
    }
    dragging = value
    options.onDragChange(value)
  }

  function run(effect: SheetEffect, time: number, source?: Event) {
    if (effect.type === "move") {
      // Catching a spring replaces it at once, so its target never flashes.
      if (spring) {
        stopSpring()
        return write(effect.extent)
      }
      options.setSnapping(false)
      pendingPosition = effect.extent
      moveFrame ||= view.requestAnimationFrame(flushMove)
      return
    }
    if (effect.type === "settle") {
      return startSpring(effect, time)
    }
    // Only a drag's release picks a page here. Programmatic moves already changed it.
    if (
      effect.type === "snap" &&
      effect.reason === "swipe" &&
      source instanceof PointerEvent
    ) {
      options.onRelease(Number(effect.id), source)
    }
  }

  function flushMove() {
    moveFrame = 0
    if (pendingPosition === null) {
      return
    }
    write(pendingPosition)
    pendingPosition = null
  }

  function startSpring(
    effect: Extract<SheetEffect, { type: "settle" }>,
    startTime: number
  ) {
    stopSpring()
    pendingPosition = null
    const { from, to, velocity } = effect
    const isStill = Math.abs(to - from) < 0.5 && Math.abs(velocity) < 0.01
    if (isStill || options.reducedMotion()) {
      write(to)
      return finishSpring()
    }
    options.setSnapping(false)
    const solver = solveSpring(
      effect.response,
      effect.dampingRatio,
      from - to,
      velocity
    )
    const duration = settleTime(solver)
    // Its target moves when a looping track rotates under it.
    const running = { frame: 0, to }
    const step = (now: number) => {
      if (spring !== running) {
        return
      }
      const elapsed = now - startTime
      if (elapsed >= duration) {
        write(running.to)
        return finishSpring()
      }
      write(running.to + solver.position(Math.max(0, elapsed)))
      running.frame = view.requestAnimationFrame(step)
    }
    spring = running
    running.frame = view.requestAnimationFrame(step)
  }

  function stopSpring() {
    if (spring) {
      view.cancelAnimationFrame(spring.frame)
    }
    spring = null
  }

  function finishSpring() {
    spring = null
    dispatch({ type: "settled" })
    if (state.phase !== "idle") {
      return
    }
    // Resting exactly on a page, so snapping comes back on without a jump.
    if (!options.dragFree() || isOnPage()) {
      options.setSnapping(true)
    }
    options.onSettle()
  }

  function isOnPage() {
    const at = position()
    return options.positions().some((position) => Math.abs(position - at) < 1)
  }

  function onScroll(event: Event) {
    const at = position()
    const isOwn = written !== null && Math.abs(at - written) < 1
    written = null
    if (spring || dragging || isOwn) {
      return
    }
    userScrolled = true
    lastScrollEvent = event
    options.onScroll()
    if (supportsScrollEnd) {
      return
    }
    view.clearTimeout(restTimer)
    restTimer = view.setTimeout(() => onRest(event), restTimeout)
  }

  function onRest(event?: Event) {
    if (spring || dragging || !userScrolled) {
      return
    }
    // The browser's scroll can end before the page hears the finger lift.
    if (touching) {
      restMissed = true
      return
    }
    userScrolled = false
    const touch = touched
    touched = false
    restHere()
    options.onScrollRest(position(), { touch, event: event ?? lastScrollEvent })
  }

  function onTouchStart() {
    touching = true
    touched = true
    restMissed = false
    // A finger catches a spring where it is. Snapping stays off until the
    // gesture rests, then the carousel settles it on a page.
    if (spring) {
      stopSpring()
      restHere()
      userScrolled = true
    }
  }

  function onTouchEnd() {
    touching = false
    if (restMissed) {
      restMissed = false
      onRest()
    }
  }

  function isHeld() {
    return touching || dragging || userScrolled || pointerId !== null
  }

  function isIgnored(target: EventTarget | null) {
    return target instanceof Element && target.closest(ignoredTargets) !== null
  }

  // The pointer as the machine reads it: `y` along the axis, growing the way scrolling shrinks.
  function axisPoint(clientX: number, clientY: number) {
    const { vertical, rtl } = options.axis()
    point.y = vertical ? clientY : rtl ? -clientX : clientX
    point.x = vertical ? clientX : clientY
    return point
  }

  function onPointerDown(event: PointerEvent) {
    if (
      event.pointerType === "touch" ||
      event.button !== 0 ||
      pointerId !== null
    ) {
      return
    }
    if (!options.canDrag() || isIgnored(event.target)) {
      return
    }
    if (state.phase === "idle") {
      restHere()
    }
    pointerId = event.pointerId
    mouseDragged = false
    // A press that starts selecting text would scroll the viewport with the
    // selection in Firefox, so text can't be selected while a press may drag.
    viewport.style.userSelect = "none"
    tracker.reset()
    axisPoint(event.clientX, event.clientY)
    tracker.add(event.timeStamp, point.y)
    // The document hears the pointer until it lifts. Capturing it now would
    // send the click to the viewport instead of the link or button pressed.
    offPointer = [
      on(doc, "pointermove", onPointerMove, { capture: true }),
      on(doc, "pointerup", onPointerUp, { capture: true }),
      on(doc, "pointercancel", onPointerUp, { capture: true }),
    ]
    const pointer = event.pointerType === "pen" ? "pen" : "mouse"
    dispatch(
      { type: "down", time: event.timeStamp, x: point.x, y: point.y, pointer },
      event
    )
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return
    }
    // Engines without coalescing, and synthetic events, give an empty list.
    const coalesced = event.getCoalescedEvents?.()
    for (const sample of coalesced?.length ? coalesced : [event]) {
      tracker.add(sample.timeStamp, axisPoint(sample.clientX, sample.clientY).y)
    }
    axisPoint(event.clientX, event.clientY)
    dispatch(
      {
        type: "move",
        time: event.timeStamp,
        x: point.x,
        y: point.y,
        scroll: null,
      },
      event
    )
    if (state.phase !== "dragging" || mouseDragged) {
      return
    }
    // A mouse drag would also select text. The drag wins, and keeps the
    // pointer outside the viewport and the window.
    mouseDragged = true
    doc.getSelection()?.removeAllRanges()
    try {
      viewport.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic events have no active pointer to capture.
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return
    }
    pointerId = null
    offPointer.forEach((off) => off())
    offPointer = []
    viewport.style.removeProperty("user-select")
    const velocity =
      event.type === "pointercancel" ? 0 : tracker.velocity(event.timeStamp)
    if (state.phase === "dragging" && options.dragFree()) {
      releaseFree(event, velocity)
    } else {
      dispatch({ type: "up", time: event.timeStamp, velocity }, event)
    }
    // The press that dragged the slides isn't a click on what it started on.
    if (mouseDragged) {
      swallowNextClick(doc)
    }
  }

  // A free drag coasts to where the release velocity would carry it, like a
  // scroll view, and rests there. The nearest page becomes the current one.
  function releaseFree(event: PointerEvent, fingerVelocity: number) {
    if (state.phase !== "dragging") {
      return
    }
    const velocity = -fingerVelocity
    const target = clamp(
      state.extent + projectDistance(velocity, freeDecelerationRate),
      0,
      options.maxScroll()
    )
    const physics = options.physics()
    const index = Math.max(0, nearestPage(pagesAt(), target))
    state = {
      phase: "settling",
      extent: state.extent,
      restingIndex: state.restingIndex,
      targetIndex: index,
      from: state.extent,
      to: target,
      velocity,
      response: physics.response,
      dampingRatio: 1,
      startTime: event.timeStamp,
    }
    setDragging(false)
    startSpring({ type: "settle", ...state }, event.timeStamp)
    options.onRelease(index, event)
  }

  return {
    position,
    /** Whether the user holds or scrolls it: a finger, a drag, or a scroll that hasn't come to rest. */
    isHeld,
    /** Whether it's held, or a spring is moving it, so new layout shouldn't jump it. */
    isMoving: () => isHeld() || spring !== null,
    /** Moves to a page index: springs there from wherever it is, or jumps without `animate`. */
    moveTo(index: number, { animate = true } = {}) {
      const positions = options.positions()
      if (destroyed || index < 0 || index >= positions.length) {
        return
      }
      // A finger or a drag holds it. Its release settles it, and the carousel follows from there.
      if (touching || dragging || pointerId !== null) {
        return
      }
      if (!animate) {
        stopSpring()
        write(positions[index])
        state = initialState(positions[index], index)
        options.setSnapping(true)
        return
      }
      if (state.phase === "idle") {
        restHere()
      }
      dispatch({
        type: "snap-to",
        time: performance.now(),
        id: String(index),
        reason: "imperative",
      })
    },
    /**
     * Moves the scroll position from `from` by `delta` after a looping track
     * rotated by as much, so the same slides stay in view, along with a
     * running spring. `from` is read before the rotation, since the browser
     * may snap the moved slides on its own. `remap` turns the old page
     * indexes into the new ones.
     */
    shift(from: number, delta: number, remap: (index: number) => number) {
      if (destroyed) {
        return
      }
      if (spring) {
        spring.to += delta
      }
      if (state.phase === "settling") {
        state = {
          ...state,
          extent: state.extent + delta,
          from: state.from + delta,
          to: state.to + delta,
          restingIndex: remap(state.restingIndex),
          targetIndex: remap(state.targetIndex),
        }
      }
      write(from + delta)
      if (state.phase === "idle") {
        restHere()
      }
    },
    destroy() {
      destroyed = true
      stopSpring()
      if (moveFrame) {
        view.cancelAnimationFrame(moveFrame)
      }
      view.clearTimeout(restTimer)
      offs.forEach((off) => off())
      offPointer.forEach((off) => off())
      if (dragging) {
        options.onDragChange(false)
      }
      viewport.style.removeProperty("user-select")
      options.content()?.style.removeProperty("translate")
    },
  }
}

type CarouselMotion = ReturnType<typeof createCarouselMotion>

export {
  type CarouselAxis,
  type CarouselMotion,
  type CarouselMotionOptions,
  createCarouselMotion,
}
