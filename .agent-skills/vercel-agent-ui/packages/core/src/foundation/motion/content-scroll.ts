// The hand-off between moving the sheet and scrolling a scroll area inside
// it, in one gesture: content scrolled down scrolls back to its top before a
// pull moves the sheet, and a push past the largest snap point scrolls the
// content on. Sheets with scroll areas pass this to the machine as
// `config.contentScroll`; a carousel, whose finger never lands on a scroll
// area the machine knows about, doesn't, and doesn't carry it.
import { handoff } from "./handoff"
import {
  initialState,
  largestExtent,
  startDragging,
  type SheetConfig,
  type SheetEffect,
  type SheetEvent,
  type SheetState,
} from "./machine"

type Move = Extract<SheetEvent, { type: "move" }>
type Dragging = Extract<SheetState, { phase: "dragging" }>

const none: SheetEffect[] = []

const contentScroll = {
  // Past the slop, whether the scroll area under the finger takes the gesture.
  // Returns the scrolling state when it does.
  claim(
    state: Extract<SheetState, { phase: "pending" }>,
    event: Move,
    towardMore: boolean,
    config: SheetConfig
  ) {
    if (!event.scroll) {
      return
    }
    const owner = handoff({
      towardMore,
      scrollAtStart: event.scroll.atStart,
      atLargest: state.extent >= largestExtent(config) - 0.5,
      expandOnScroll: config.expandOnScroll,
    })
    if (owner !== "scroll") {
      return
    }
    return {
      phase: "scrolling" as const,
      extent: state.extent,
      restingIndex: state.restingIndex,
      lastY: event.y,
    }
  },

  // A move while the content scrolls. The content reached its top while the
  // finger keeps pulling down: the rest of the same gesture moves the sheet.
  move(state: Extract<SheetState, { phase: "scrolling" }>, event: Move) {
    const isMovingDown = event.y > state.lastY
    if (isMovingDown && event.scroll?.atStart) {
      return { state: startDragging(state, event.y), effects: none }
    }
    return { state: { ...state, lastY: event.y }, effects: none }
  },

  // A drag move the content takes, or undefined when the sheet moves.
  // `delta` is positive when the finger moves up, and `fingerExtent` is where
  // the finger would put the sheet.
  drag(
    state: Dragging,
    event: Move,
    delta: number,
    fingerExtent: number,
    config: SheetConfig
  ) {
    const scroll = event.scroll
    if (!scroll) {
      return
    }
    if (
      state.isScrollingContent &&
      (delta > 0 ? !scroll.atEnd : !scroll.atStart)
    ) {
      const effects: SheetEffect[] = [{ type: "scroll", delta }]
      return { state: { ...state, lastY: event.y }, effects }
    }
    const largest = largestExtent(config)
    if (!(
      delta > 0 &&
      fingerExtent > largest &&
      state.extent <= largest &&
      !scroll.atEnd
    )) {
      return
    }
    // The sheet reached its largest snap point while the finger keeps going
    // up: the rest of the travel scrolls the content, in the same gesture.
    const effects: SheetEffect[] = [
      { type: "scroll", delta: fingerExtent - largest },
    ]
    if (state.extent !== largest) {
      effects.unshift({ type: "move", extent: largest })
    }
    const scrolling = {
      ...state,
      extent: largest,
      anchorY: event.y,
      anchorExtent: largest,
      lastY: event.y,
      isScrollingContent: true,
    }
    return { state: scrolling, effects }
  },

  // A release while the content scrolls: the sheet reached its largest snap
  // point on the way, rests there, and the content coasts.
  release(
    state: Dragging,
    event: Extract<SheetEvent, { type: "up" }>,
    config: SheetConfig
  ) {
    if (!state.isScrollingContent) {
      return
    }
    const largestIndex = config.snapPoints.length - 1
    const effects: SheetEffect[] = [
      { type: "fling-scroll", velocity: -event.velocity },
    ]
    if (state.restingIndex !== largestIndex) {
      effects.push({
        type: "snap",
        id: config.snapPoints[largestIndex].id,
        reason: "swipe",
      })
    }
    return { state: initialState(state.extent, largestIndex), effects }
  },
}

type ContentScroll = typeof contentScroll

export { contentScroll, type ContentScroll }
