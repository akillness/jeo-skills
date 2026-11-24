// The pointer driver: touch, mouse and pen input into the machine, a spring
// that starts at the release velocity, and one `translate` write per frame
// while a finger drives. Settles run as WAAPI animations on `translate` with
// the spring sampled into `linear()`, so they stay on the compositor.
//
// Touch listens on the document, in the capture phase: `touchmove` keeps
// arriving after the browser starts scrolling content, so the sheet can take
// the gesture over mid-way, in either direction.
// Mouse and pen use pointer events with their coalesced samples.
import { handoff } from "../motion/handoff"
import {
  initialState,
  next,
  type SheetEffect,
  type SheetEvent,
  type SheetState,
} from "../motion/machine"
import { nearestIndex } from "../motion/projection"
import { settleTime, solveSpring, springLinearEasing } from "../motion/spring"
import { createVelocityTracker } from "../motion/velocity"
import { on } from "../kernel/events"
import { isDragPress, swallowNextClick } from "../drag-and-drop/pointer"
import {
  axisPoint,
  scrollContext,
  scrollForward,
  translateValue,
} from "./sheet-axis"
import {
  afterFirstFrame,
  openHold,
  reducedFade,
  reducedSettle,
  sampleTranslate,
  type SheetDriver,
  type SheetDriverOptions,
} from "./sheet-driver"
import { supportsLinear } from "./sheet-effects"

// UIScrollView's normal deceleration, for content flung past the sheet's largest snap point.
const contentDecelerationRate = 0.998

const ignoredTargets =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-drawer-no-drag]'

function createPointerDriver(options: SheetDriverOptions) {
  const { sheet } = options
  const doc = sheet.ownerDocument
  const view = doc.defaultView ?? window
  let state: SheetState = initialState(0, -1)
  let shown = 0
  let pendingExtent: number | null = null
  let pendingScroll = 0
  let frame = 0
  let animation: Animation | null = null
  let fade: Animation | null = null
  // A swipe's close holds until the popup confirms it: a refused one snaps back.
  let closing: "swipe" | "close" | null = null
  let coast: {
    velocity: number
    startTime: number
    startScroll: number
    area: HTMLElement
  } | null = null
  let area: HTMLElement | null = null
  let touch: { id: number; originX: number; originY: number } | null = null
  let pointerId: number | null = null
  let dragging = false
  let mouseDragged = false
  // Kept to see whether a drag inside took the press, like a slider's: it
  // isn't the sheet's. A framework's own listener runs after the sheet's.
  let press: PointerEvent | null = null
  let targetId: string | null = null
  let caught: string | null = null
  const point = { x: 0, y: 0 }
  const tracker = createVelocityTracker({
    horizon: options.config().physics.velocityHorizon,
  })

  const offs = [
    on(doc, "touchstart", onTouchStart, { capture: true, passive: true }),
    on(doc, "touchmove", onTouchMove, { capture: true, passive: false }),
    on(doc, "touchend", onTouchEnd, { capture: true, passive: true }),
    on(doc, "touchcancel", onTouchEnd, { capture: true, passive: true }),
    on(sheet, "pointerdown", onPointerDown),
  ]

  let destroyed = false

  function writeTranslate(extent: number) {
    if (destroyed) {
      return
    }
    sheet.style.translate = translateValue(
      options.side(),
      options.size() - extent
    )
    shown = extent
  }

  function dispatch(event: SheetEvent, source?: Event) {
    if (destroyed) {
      return
    }
    const result = next(state, event, options.config())
    state = result.state
    const time = "time" in event ? event.time : performance.now()
    for (const effect of result.effects) {
      run(effect, time, source)
    }
    const isDragging = state.phase === "dragging"
    if (isDragging === dragging) {
      return
    }
    dragging = isDragging
    options.onDragChange(dragging)
  }

  function run(effect: SheetEffect, time: number, source?: Event) {
    switch (effect.type) {
      case "move":
        if (animation) {
          stopAnimation()
          writeTranslate(effect.extent)
          options.onFrame(effect.extent)
        } else {
          pendingExtent = effect.extent
          schedule()
        }
        return
      case "settle":
        return startSettle(effect, time)
      case "scroll":
        pendingScroll += effect.delta
        return schedule()
      case "fling-scroll":
        if (area) {
          coast = {
            velocity: effect.velocity,
            startTime: time,
            startScroll: 0,
            area,
          }
        }
        return schedule()
      case "snap":
        targetId = effect.id
        return options.onSnap(effect.id, effect.reason, source)
      case "dismiss":
        if (effect.reason !== "swipe") {
          return
        }
        closing = "swipe"
        return options.onDismiss(source)
      case "attempt-dismiss":
        return options.onDismissAttempt(source)
    }
  }

  function startSettle(
    effect: Extract<SheetEffect, { type: "settle" }>,
    startTime: number
  ) {
    stopAnimation()
    pendingExtent = null
    const closed = options.closedExtent()
    const from = effect.from <= 0 ? closed : effect.from
    const to = effect.to <= 0 ? closed : effect.to
    const isFade = options.reducedMotion() && (from === closed || to === closed)
    const motion = options.reducedMotion()
      ? reducedMotion(from, to, isFade)
      : springMotion(from, to, effect)
    writeTranslate(isFade ? Math.max(to, 0) : to)
    if (
      (Math.abs(to - from) < 0.5 && effect.velocity === 0) ||
      motion.duration === 0
    ) {
      return finishSettle()
    }
    const size = options.size()
    const side = options.side()
    animation = isFade
      ? sheet.animate(
          { opacity: from === closed ? [0, 1] : [1, 0] },
          { duration: motion.duration, fill: "both" }
        )
      : Math.abs(to - from) < 1 || !supportsLinear()
        ? sheet.animate(
            {
              translate: sampleTranslate(motion, (extent) =>
                translateValue(side, size - extent)
              ),
            },
            { duration: motion.duration, fill: "backwards" }
          )
        : sheet.animate(
            {
              translate: [
                translateValue(side, size - from),
                translateValue(side, size - to),
              ],
            },
            {
              duration: motion.duration,
              easing: motion.easing,
              fill: "backwards",
            }
          )
    if (isFade) {
      fade = animation
    }
    const running = animation
    animation.onfinish = () => {
      if (animation === running) {
        finishSettle()
      }
    }
    animation.startTime = startTime
    options.onMotion({
      type: "settle",
      extentAt: motion.extentAt,
      startTime,
      duration: motion.duration,
    })
  }

  function springMotion(
    from: number,
    to: number,
    effect: Extract<SheetEffect, { type: "settle" }>
  ) {
    const solver = solveSpring(
      effect.response,
      effect.dampingRatio,
      from - to,
      effect.velocity
    )
    const duration = settleTime(solver)
    return {
      duration,
      easing: springLinearEasing(solver, from, to, duration),
      extentAt: (elapsed: number) => to + solver.position(elapsed),
    }
  }

  function reducedMotion(from: number, to: number, isFade: boolean) {
    const duration = isFade ? reducedFade : reducedSettle
    const ease = (t: number) => 1 - (1 - t) ** 3
    return {
      duration,
      easing: "cubic-bezier(0.33, 1, 0.68, 1)",
      extentAt: (elapsed: number) =>
        from + (to - from) * ease(Math.min(1, elapsed / duration)),
    }
  }

  function stopAnimation() {
    animation?.cancel()
    animation = null
    if (fade) {
      fade.cancel()
      fade = null
    }
  }

  function finishSettle() {
    stopAnimation()
    dispatch({ type: "settled" })
    if (state.phase !== "idle") {
      return
    }
    if (state.restingIndex < 0) {
      closing = null
      targetId = null
      return options.onRest(null)
    }
    targetId = options.config().snapPoints[state.restingIndex].id
    options.onRest(targetId)
  }

  function schedule() {
    frame ||= view.requestAnimationFrame(flush)
  }

  function flush(now: number) {
    frame = 0
    if (pendingScroll && area) {
      scrollForward(area, options.side(), pendingScroll)
      pendingScroll = 0
    }
    if (coast) {
      stepCoast(now)
    }
    if (pendingExtent === null) {
      return
    }
    writeTranslate(pendingExtent)
    pendingExtent = null
    options.onFrame(shown)
  }

  function stepCoast(now: number) {
    if (!coast) {
      return
    }
    const elapsed = Math.max(0, now - coast.startTime)
    const travelled =
      (coast.velocity * (contentDecelerationRate ** elapsed - 1)) /
      Math.log(contentDecelerationRate)
    scrollForward(coast.area, options.side(), travelled - coast.startScroll)
    coast.startScroll = travelled
    if (Math.abs(coast.velocity * contentDecelerationRate ** elapsed) < 0.01) {
      coast = null
    } else {
      schedule()
    }
  }

  function isIgnored(target: EventTarget | null) {
    return target instanceof Element && target.closest(ignoredTargets) !== null
  }

  function scroll(target: EventTarget | null) {
    const context = scrollContext(target, sheet, options.side())
    area = context?.area ?? null
    return context && { atStart: context.atStart, atEnd: context.atEnd }
  }

  function onTouchStart(event: TouchEvent) {
    const taken = press !== null && isDragPress(press)
    press = null
    if (touch || event.touches.length > 1 || closing || taken) {
      return
    }
    if (!options.owns(event.target) || isIgnored(event.target)) {
      return
    }
    const first = event.changedTouches[0]
    touch = {
      id: first.identifier,
      originX: first.clientX,
      originY: first.clientY,
    }
    coast = null
    tracker.reset()
    axisPoint(options.side(), first.clientX, first.clientY, point)
    tracker.add(event.timeStamp, point.y)
    dispatch(
      {
        type: "down",
        time: event.timeStamp,
        x: point.x,
        y: point.y,
        pointer: "touch",
      },
      event
    )
  }

  function onTouchMove(event: TouchEvent) {
    const current = findTouch(event.changedTouches)
    if (!current) {
      return
    }
    axisPoint(options.side(), current.clientX, current.clientY, point)
    tracker.add(event.timeStamp, point.y)
    const wasDragging = state.phase === "dragging"
    const context = scroll(event.target)
    dispatch(
      {
        type: "move",
        time: event.timeStamp,
        x: point.x,
        y: point.y,
        scroll: context,
      },
      event
    )
    if (state.phase === "pending") {
      return claimEarly(event, current, context)
    }
    if (state.phase !== "dragging") {
      return
    }
    if (event.cancelable) {
      event.preventDefault()
    }
    // The browser already scrolls the content and it just reached its edge:
    // stop it bouncing while the sheet follows the rest of the gesture.
    else if (!wasDragging && area) {
      area.style.overscrollBehavior = "none"
    }
  }

  // iOS decides on the first cancelable touchmove whether the whole gesture
  // scrolls, before the slop is passed. Off scroll areas the sheet owns every
  // move; on one, the hand-off rule decides from the first move's direction.
  function claimEarly(
    event: TouchEvent,
    current: Touch,
    context: ReturnType<typeof scroll>
  ) {
    if (!event.cancelable || !touch) {
      return
    }
    const origin = axisPoint(options.side(), touch.originX, touch.originY, {
      x: 0,
      y: 0,
    })
    if (Math.abs(point.y - origin.y) < Math.abs(point.x - origin.x)) {
      return
    }
    const largest = options.config().snapPoints.at(-1)?.extent ?? 0
    const owner = context
      ? handoff({
          towardMore: point.y < origin.y,
          scrollAtStart: context.atStart,
          atLargest: shown >= largest - 0.5,
          expandOnScroll: options.config().expandOnScroll,
        })
      : "sheet"
    if (owner === "sheet") {
      event.preventDefault()
    }
  }

  function onTouchEnd(event: TouchEvent) {
    if (!findTouch(event.changedTouches)) {
      return
    }
    touch = null
    if (area) {
      area.style.removeProperty("overscroll-behavior")
    }
    const velocity =
      event.type === "touchcancel" ? 0 : tracker.velocity(event.timeStamp)
    dispatch({ type: "up", time: event.timeStamp, velocity }, event)
  }

  // Indexed, since a TouchList isn't iterable everywhere and copying it would allocate on every move.
  function findTouch(touches: TouchList) {
    if (!touch) {
      return null
    }
    for (let index = 0; index < touches.length; index++) {
      if (touches[index].identifier === touch.id) {
        return touches[index]
      }
    }
    return null
  }

  function onPointerDown(event: PointerEvent) {
    press = event
    if (
      event.pointerType === "touch" ||
      event.button !== 0 ||
      pointerId !== null ||
      closing
    ) {
      return
    }
    const target = event.target
    if (
      !options.owns(target) ||
      isIgnored(target) ||
      !(target instanceof Element) ||
      !options.canMouseDrag(target)
    ) {
      return
    }
    pointerId = event.pointerId
    mouseDragged = false
    caught =
      state.phase === "settling" && state.targetIndex >= 0 ? targetId : null
    coast = null
    tracker.reset()
    axisPoint(options.side(), event.clientX, event.clientY, point)
    tracker.add(event.timeStamp, point.y)
    // The document hears the pointer until it lifts. Capturing it now would
    // send the click to the sheet instead of a handle or button pressed.
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

  let offPointer: (() => void)[] = []

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return
    }
    if (press && isDragPress(press)) {
      return release(event, 0, caught)
    }
    // Engines without coalescing, and synthetic events, give an empty list.
    const coalesced = event.getCoalescedEvents?.()
    for (const sample of coalesced?.length ? coalesced : [event]) {
      tracker.add(
        sample.timeStamp,
        axisPoint(options.side(), sample.clientX, sample.clientY, point).y
      )
    }
    axisPoint(options.side(), event.clientX, event.clientY, point)
    dispatch(
      {
        type: "move",
        time: event.timeStamp,
        x: point.x,
        y: point.y,
        scroll: scroll(event.target),
      },
      event
    )
    if (state.phase !== "dragging" || mouseDragged) {
      return
    }
    mouseDragged = true
    doc.getSelection()?.removeAllRanges()
    sheet.style.userSelect = "none"
    try {
      sheet.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic events have no active pointer to capture.
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return
    }
    if (press && isDragPress(press)) {
      return release(event, 0, caught)
    }
    release(
      event,
      event.type === "pointercancel" ? 0 : tracker.velocity(event.timeStamp)
    )
  }

  // `resume` is the snap point a settle was heading to when the press caught
  // it: the sheet goes on there, since letting go mid-settle could dismiss it.
  function release(
    event: PointerEvent,
    velocity: number,
    resume: string | null = null
  ) {
    pointerId = null
    press = null
    offPointer.forEach((off) => off())
    offPointer = []
    sheet.style.removeProperty("user-select")
    const time = event.timeStamp
    const index = options
      .config()
      .snapPoints.findIndex((point) => point.id === resume)
    if (resume !== null && index >= 0) {
      state = initialState(state.extent, index)
      dispatch({ type: "snap-to", time, id: resume, reason: "imperative" })
    } else {
      dispatch({ type: "up", time, velocity }, event)
    }
    if (mouseDragged) {
      swallowNextClick(doc)
    }
  }

  return {
    open(id, animate) {
      closing = null
      targetId = id
      stopAnimation()
      const index = options
        .config()
        .snapPoints.findIndex((point) => point.id === id)
      if (!animate && index >= 0) {
        state = initialState(options.config().snapPoints[index].extent, index)
        writeTranslate(state.extent)
        return options.onRest(id)
      }
      state = initialState(0, -1)
      writeTranslate(options.closedExtent())
      dispatch({
        type: "snap-to",
        time: performance.now() + openHold,
        id,
        reason: "imperative",
      })
      const opening = animation
      if (!opening) {
        return
      }
      afterFirstFrame(view, (frameTime) => {
        if (animation !== opening || state.phase !== "settling") {
          return
        }
        opening.startTime = frameTime
        state = { ...state, startTime: frameTime }
        options.onMotionStart(frameTime)
      })
    },
    close() {
      const wasClosing = closing
      closing = "close"
      if (!wasClosing) {
        dispatch({ type: "close", time: performance.now() })
      }
    },
    snapTo(id, reason) {
      if (closing === "close") {
        return
      }
      closing = null
      dispatch({ type: "snap-to", time: performance.now(), id, reason })
    },
    nudge() {
      if (!closing && !options.reducedMotion()) {
        dispatch({ type: "nudge", time: performance.now() })
      }
    },
    relayout(immediate, fallback) {
      const points = options.config().snapPoints
      if (
        closing ||
        targetId === null ||
        state.phase === "dragging" ||
        state.phase === "pending"
      ) {
        return writeTranslate(shown)
      }
      const kept = points.findIndex((point) => point.id === targetId)
      const wanted = points.findIndex((point) => point.id === fallback)
      const index =
        kept >= 0
          ? kept
          : wanted >= 0
            ? wanted
            : nearestIndex(
                points.map((point) => point.extent),
                shown
              )
      const { id, extent } = points[index]
      if (state.phase === "idle") {
        state = initialState(shown, kept)
        if (immediate || Math.abs(extent - shown) < 0.5) {
          state = initialState(extent, index)
          writeTranslate(extent)
          if (!immediate) {
            return
          }
          if (id !== targetId) {
            run(
              { type: "snap", id, reason: "content-resize" },
              performance.now()
            )
          }
          return options.onRest(id)
        }
      }
      dispatch({
        type: "snap-to",
        time: performance.now(),
        id,
        reason: "content-resize",
      })
    },
    target: () => (closing ? null : targetId),
    isMoving: () => state.phase !== "idle",
    destroy() {
      destroyed = true
      stopAnimation()
      if (frame) {
        view.cancelAnimationFrame(frame)
      }
      offs.forEach((off) => off())
      offPointer.forEach((off) => off())
      if (dragging) {
        options.onDragChange(false)
      }
      for (const property of ["translate", "user-select", "opacity"]) {
        sheet.style.removeProperty(property)
      }
    },
  } satisfies SheetDriver
}

export { createPointerDriver }
