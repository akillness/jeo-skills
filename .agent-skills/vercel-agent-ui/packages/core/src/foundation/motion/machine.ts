// The sheet's gesture state machine, shared by every driver (pointer and
// scroll snap) and by the golden-trajectory replay. It is a reducer:
// `next(state, event, config)` returns the next state and a list of effects,
// which drivers execute. No DOM, no timers. Extents are px from the attached
// edge, times are ms on the input clock, and the finger's `y` is its position
// along the sheet's axis, growing toward the attached edge (down for a bottom
// sheet). `x` is across the axis.

import type { ContentScroll } from "./content-scroll"
import type { SheetPhysics } from "./physics"
import { chooseSnapTarget, nearestIndex } from "./projection"
import { rubberBand, rubberBandInverse, rubberBandSlope } from "./rubber-band"
import { solveSpring } from "./spring"

type SheetConfig = {
  /** Resting extents, ascending, in px. 0 (dismissed) is implied. */
  snapPoints: readonly { id: string; extent: number }[]
  /** The rubber band's dimension: the container's size on the axis, in px. */
  dimension: number
  /** Whether a swipe can close the sheet. */
  dismissible: boolean
  /** Whether dragging up on scrollable content first expands the sheet. */
  expandOnScroll: boolean
  physics: SheetPhysics
  /** The hand-off to scroll areas under the finger, for sheets with scrollable content. */
  contentScroll?: ContentScroll
}

/** What the scroll area under the finger can do, or null when there is none. */
type ScrollContext = { atStart: boolean; atEnd: boolean } | null

/** Why a sheet moved to a snap point: a swipe, new geometry, or a call from code. */
type SheetSnapReason = "swipe" | "content-resize" | "imperative"

type SheetEvent =
  | {
      type: "down"
      time: number
      x: number
      y: number
      pointer: "touch" | "mouse" | "pen"
    }
  | { type: "move"; time: number; x: number; y: number; scroll: ScrollContext }
  /** `velocity` is the finger's, along y, in px/ms. */
  | { type: "up"; time: number; velocity: number }
  | { type: "settled" }
  /** The scroll-snap driver's browser scroll came to rest. */
  | { type: "rest"; extent: number }
  /** Settle on a snap point, like a handle press, a controller or new geometry. `reason` comes back on the snap effect. */
  | { type: "snap-to"; time: number; id: string; reason: SheetSnapReason }
  | { type: "close"; time: number }
  /** A refused dismissal, like Escape on a sheet that can't be dismissed: a small push toward closing that springs back. */
  | { type: "nudge"; time: number }

type SheetEffect =
  /** Cancel any animation and show this extent. */
  | { type: "move"; extent: number }
  | {
      type: "settle"
      from: number
      to: number
      velocity: number
      response: number
      dampingRatio: number
    }
  /** Scroll the content forward by `delta` px (negative scrolls back). */
  | { type: "scroll"; delta: number }
  /** Let the content coast at `velocity` px/ms, forward when positive. */
  | { type: "fling-scroll"; velocity: number }
  | { type: "snap"; id: string; reason: SheetSnapReason }
  | { type: "dismiss"; reason: "swipe" | "imperative" }
  | { type: "attempt-dismiss"; reason: "swipe" }

// `restingIndex` is the snap point the sheet last rested on, -1 when closed.
type SheetState =
  | { phase: "idle"; extent: number; restingIndex: number }
  | {
      phase: "pending"
      extent: number
      restingIndex: number
      originX: number
      originY: number
      slop: number
    }
  | {
      phase: "dragging"
      extent: number
      restingIndex: number
      /** The finger's y when `anchorExtent` was shown 1:1. */
      anchorY: number
      /** The unconstrained extent at `anchorY`, before the rubber band. */
      anchorExtent: number
      lastY: number
      /** The finger currently scrolls the content instead of moving the sheet. */
      isScrollingContent: boolean
    }
  | { phase: "scrolling"; extent: number; restingIndex: number; lastY: number }
  | {
      phase: "settling"
      extent: number
      restingIndex: number
      /** The snap point it settles on, -1 for dismissal. */
      targetIndex: number
      from: number
      to: number
      velocity: number
      response: number
      dampingRatio: number
      startTime: number
    }

const none: SheetEffect[] = []

// The velocity, in px/ms toward closing, that a refused dismissal starts with.
// With the iOS spring it dips about 20px and comes back.
const nudgeVelocity = 1

function initialState(extent: number, restingIndex: number) {
  return { phase: "idle" as const, extent, restingIndex }
}

function next(state: SheetState, event: SheetEvent, config: SheetConfig) {
  switch (event.type) {
    case "down":
      return onDown(state, event, config)
    case "move":
      return onMove(state, event, config)
    case "up":
      return onUp(state, event, config)
    case "settled":
      return onSettled(state)
    case "rest":
      return onRest(state, event, config)
    case "snap-to":
      return onSnapTo(state, event, config)
    case "nudge":
      return onNudge(state, event, config)
    case "close":
      return settleTo(state, config, {
        targetIndex: -1,
        motion: currentMotion(state, event.time),
        time: event.time,
        reason: "imperative",
        outcome: { type: "dismiss", reason: "imperative" },
      })
  }
}

// The extent and velocity of a settling sheet at `time`, or its resting extent.
function currentMotion(state: SheetState, time: number) {
  if (state.phase !== "settling") {
    return { extent: state.extent, velocity: 0 }
  }
  const solver = solveSpring(
    state.response,
    state.dampingRatio,
    state.from - state.to,
    state.velocity
  )
  // A settle can be scheduled to start a little later, like an open that
  // waits for the sheet's first frames. Until then it's where it starts.
  const elapsed = Math.max(0, time - state.startTime)
  return {
    extent: state.to + solver.position(elapsed),
    velocity: solver.velocity(elapsed),
  }
}

function onDown(
  state: SheetState,
  event: Extract<SheetEvent, { type: "down" }>,
  config: SheetConfig
) {
  const slop =
    event.pointer === "mouse"
      ? config.physics.mouseSlop
      : config.physics.touchSlop
  if (state.phase === "idle" && state.restingIndex >= 0) {
    return {
      state: {
        ...state,
        phase: "pending" as const,
        originX: event.x,
        originY: event.y,
        slop,
      },
      effects: none,
    }
  }
  if (state.phase !== "settling") {
    return { state, effects: none }
  }
  // A touch during a settle catches the sheet where the spring is now and
  // drags from there with no slop.
  const { extent } = currentMotion(state, event.time)
  const dragging: SheetState = {
    phase: "dragging",
    extent,
    restingIndex: state.restingIndex,
    anchorY: event.y,
    anchorExtent: unconstrainExtent(extent, config),
    lastY: event.y,
    isScrollingContent: false,
  }
  return {
    state: dragging,
    effects: [{ type: "move", extent }] satisfies SheetEffect[],
  }
}

function onMove(
  state: SheetState,
  event: Extract<SheetEvent, { type: "move" }>,
  config: SheetConfig
) {
  if (state.phase === "pending") {
    return leavePending(state, event, config)
  }
  if (state.phase === "scrolling" && config.contentScroll) {
    return config.contentScroll.move(state, event)
  }
  if (state.phase === "dragging") {
    return drag(state, event, config)
  }
  return { state, effects: none }
}

function leavePending(
  state: Extract<SheetState, { phase: "pending" }>,
  event: Extract<SheetEvent, { type: "move" }>,
  config: SheetConfig
) {
  const dx = event.x - state.originX
  const dy = event.y - state.originY
  if (Math.max(Math.abs(dx), Math.abs(dy)) < state.slop) {
    return { state, effects: none }
  }
  // Off-axis moves belong to the page, so a horizontal carousel keeps working.
  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      state: initialState(state.extent, state.restingIndex),
      effects: none,
    }
  }
  const scrolling = config.contentScroll?.claim(state, event, dy < 0, config)
  if (scrolling) {
    return { state: scrolling, effects: none }
  }
  // Anchor where the finger crossed the slop, not where this sample landed,
  // so the sheet trails the finger by exactly the slop at any input rate.
  const dragging = {
    ...startDragging(state, state.originY + Math.sign(dy) * state.slop),
    lastY: event.y,
  }
  const extent = constrainExtent(
    dragging.anchorExtent + (dragging.anchorY - event.y),
    config
  )
  return {
    state: { ...dragging, extent },
    effects: [{ type: "move", extent }] satisfies SheetEffect[],
  }
}

function startDragging(
  state: { extent: number; restingIndex: number },
  y: number
) {
  return {
    phase: "dragging" as const,
    extent: state.extent,
    restingIndex: state.restingIndex,
    anchorY: y,
    anchorExtent: state.extent,
    lastY: y,
    isScrollingContent: false,
  }
}

function drag(
  state: Extract<SheetState, { phase: "dragging" }>,
  event: Extract<SheetEvent, { type: "move" }>,
  config: SheetConfig
) {
  // Positive when the finger moves up: more extent, or content scrolled forward.
  const delta = state.lastY - event.y
  // Once the content is back at its start, the sheet continues from here.
  const anchor = state.isScrollingContent
    ? { anchorY: state.lastY, anchorExtent: state.extent }
    : state
  const fingerExtent = anchor.anchorExtent + (anchor.anchorY - event.y)
  const scrolled = config.contentScroll?.drag(
    state,
    event,
    delta,
    fingerExtent,
    config
  )
  if (scrolled) {
    return scrolled
  }
  const extent = constrainExtent(fingerExtent, config)
  const dragging = {
    ...state,
    anchorY: anchor.anchorY,
    anchorExtent: anchor.anchorExtent,
    extent,
    lastY: event.y,
    isScrollingContent: false,
  }
  return {
    state: dragging,
    effects: [{ type: "move", extent }] satisfies SheetEffect[],
  }
}

function onUp(
  state: SheetState,
  event: Extract<SheetEvent, { type: "up" }>,
  config: SheetConfig
) {
  if (state.phase === "pending" || state.phase === "scrolling") {
    return {
      state: initialState(state.extent, state.restingIndex),
      effects: none,
    }
  }
  if (state.phase !== "dragging") {
    return { state, effects: none }
  }
  const released = config.contentScroll?.release(state, event, config)
  if (released) {
    return released
  }
  const velocity = -event.velocity * bandSlope(state.extent, config)
  const candidates = [0, ...snapExtents(config)]
  const physics = config.physics
  const target = {
    candidates,
    rate: physics.projectionRate,
    minFlingVelocity: physics.minFlingVelocity,
    skipSnapPoints: physics.skipSnapPoints,
  }
  const candidate = chooseSnapTarget({
    ...target,
    extent: state.extent,
    velocity,
  })
  const release = {
    motion: { extent: state.extent, velocity },
    time: event.time,
    reason: "swipe" as const,
  }
  if (config.dismissible) {
    if (candidate > 0) {
      return settleTo(state, config, { ...release, targetIndex: candidate - 1 })
    }
    return settleTo(state, config, {
      ...release,
      targetIndex: -1,
      outcome: { type: "dismiss", reason: "swipe" },
    })
  }
  // The band hides how far the finger went, so a refused dismissal is judged
  // by the finger: released where it would have dismissed, it's an attempt.
  const fingerExtent = state.anchorExtent + (state.anchorY - state.lastY)
  const wouldDismiss =
    chooseSnapTarget({
      ...target,
      extent: fingerExtent,
      velocity: -event.velocity,
    }) === 0
  const index = Math.max(0, candidate - 1)
  if (!wouldDismiss) {
    return settleTo(state, config, { ...release, targetIndex: index })
  }
  return settleTo(state, config, {
    ...release,
    targetIndex: 0,
    outcome: { type: "attempt-dismiss", reason: "swipe" },
  })
}

function onSettled(state: SheetState) {
  if (state.phase !== "settling") {
    return { state, effects: none }
  }
  return { state: initialState(state.to, state.targetIndex), effects: none }
}

function onRest(
  state: SheetState,
  event: Extract<SheetEvent, { type: "rest" }>,
  config: SheetConfig
) {
  if (event.extent < 1 && config.dismissible) {
    return {
      state: initialState(0, -1),
      effects: [{ type: "dismiss", reason: "swipe" }] satisfies SheetEffect[],
    }
  }
  const index = nearestIndex(snapExtents(config), event.extent)
  const effects: SheetEffect[] =
    index === state.restingIndex
      ? []
      : [{ type: "snap", id: config.snapPoints[index].id, reason: "swipe" }]
  return { state: initialState(event.extent, index), effects }
}

function onSnapTo(
  state: SheetState,
  event: Extract<SheetEvent, { type: "snap-to" }>,
  config: SheetConfig
) {
  const index = config.snapPoints.findIndex((point) => point.id === event.id)
  if (index === -1 || state.phase === "dragging") {
    return { state, effects: none }
  }
  return settleTo(state, config, {
    targetIndex: index,
    motion: currentMotion(state, event.time),
    time: event.time,
    reason: event.reason,
  })
}

function onNudge(
  state: SheetState,
  event: Extract<SheetEvent, { type: "nudge" }>,
  config: SheetConfig
) {
  if (state.phase !== "idle" || state.restingIndex < 0) {
    return { state, effects: none }
  }
  return settleTo(state, config, {
    targetIndex: state.restingIndex,
    motion: { extent: state.extent, velocity: -nudgeVelocity },
    time: event.time,
    reason: "imperative",
  })
}

function settleTo(
  state: SheetState,
  config: SheetConfig,
  options: {
    /** The snap point to settle on, -1 to close. */
    targetIndex: number
    motion: { extent: number; velocity: number }
    time: number
    reason: SheetSnapReason
    /** Dismissal, or a refused one, reported after the settle and snap effects. */
    outcome?: SheetEffect
  }
) {
  const { targetIndex, motion, time, reason } = options
  const physics = config.physics
  const to = targetIndex < 0 ? 0 : config.snapPoints[targetIndex].extent
  const hasMomentum = Math.abs(motion.velocity) >= physics.minFlingVelocity
  const dampingRatio = hasMomentum
    ? physics.momentumDampingRatio
    : physics.dampingRatio
  const settling: SheetState = {
    phase: "settling",
    extent: motion.extent,
    restingIndex: state.restingIndex,
    targetIndex,
    from: motion.extent,
    to,
    velocity: motion.velocity,
    response: physics.response,
    dampingRatio,
    startTime: time,
  }
  const effects: SheetEffect[] = [
    {
      type: "settle",
      from: motion.extent,
      to,
      velocity: motion.velocity,
      response: physics.response,
      dampingRatio,
    },
  ]
  if (targetIndex >= 0 && targetIndex !== state.restingIndex) {
    effects.push({
      type: "snap",
      id: config.snapPoints[targetIndex].id,
      reason,
    })
  }
  if (options.outcome) {
    effects.push(options.outcome)
  }
  return { state: settling, effects }
}

// The extent a finger at `fingerExtent` shows: 1:1 between the smallest and
// largest snap points, rubber-banded past the largest, and past the smallest
// when the sheet can't be dismissed.
function constrainExtent(fingerExtent: number, config: SheetConfig) {
  const largest = largestExtent(config)
  const { coefficient, dimension } = band(config)
  if (fingerExtent > largest) {
    return largest + rubberBand(fingerExtent - largest, dimension, coefficient)
  }
  if (config.dismissible) {
    return Math.max(0, fingerExtent)
  }
  const smallest = config.snapPoints[0].extent
  if (fingerExtent < smallest) {
    return (
      smallest - rubberBand(smallest - fingerExtent, dimension, coefficient)
    )
  }
  return fingerExtent
}

function unconstrainExtent(extent: number, config: SheetConfig) {
  const largest = largestExtent(config)
  const { coefficient, dimension } = band(config)
  if (extent > largest) {
    return largest + rubberBandInverse(extent - largest, dimension, coefficient)
  }
  const smallest = config.snapPoints[0].extent
  if (!config.dismissible && extent < smallest) {
    return (
      smallest - rubberBandInverse(smallest - extent, dimension, coefficient)
    )
  }
  return extent
}

function band(config: SheetConfig) {
  return {
    coefficient: config.physics.rubberBand,
    dimension: config.physics.rubberBandDimension ?? config.dimension,
  }
}

// Inside the band, the shown extent moves slower than the finger, so the
// spring starts with the finger's velocity scaled by the band's slope there.
function bandSlope(extent: number, config: SheetConfig) {
  const { coefficient, dimension } = band(config)
  const largest = largestExtent(config)
  const smallest = config.snapPoints[0].extent
  const overshoot =
    extent > largest
      ? extent - largest
      : !config.dismissible && extent < smallest
        ? smallest - extent
        : 0
  if (overshoot <= 0) {
    return 1
  }
  return rubberBandSlope(
    rubberBandInverse(overshoot, dimension, coefficient),
    dimension,
    coefficient
  )
}

function largestExtent(config: SheetConfig) {
  return config.snapPoints[config.snapPoints.length - 1].extent
}

function snapExtents(config: SheetConfig) {
  return config.snapPoints.map((point) => point.extent)
}

export {
  currentMotion,
  initialState,
  largestExtent,
  next,
  type SheetConfig,
  type SheetEffect,
  type SheetEvent,
  type SheetSnapReason,
  type SheetState,
  snapExtents,
  startDragging,
}
