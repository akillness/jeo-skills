import { css } from "../../foundation/kernel/inline-style"
import { createController } from "../../foundation/kernel/controller"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import { definePrimitive } from "../../foundation/kernel/primitive"
import { onProps } from "../../foundation/kernel/part"
import type {
  Named,
  Part,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { mainAxis, type ScrollAreaType } from "./scroll-area-model"
import {
  createScrollView,
  liveKeys,
  type ScrollAreaModel,
  type ScrollAreaScrollOptions,
} from "./scroll-area-view"
import { orientationOf } from "../../foundation/focus/collection"
import { live } from "../../foundation/kernel/live"

/**
 * Drives a scroll area from outside it. Pass it as the `controller` option.
 * @stable
 */
type ScrollAreaController = ReturnType<typeof createScrollAreaController>

/**
 * Creates a controller that scrolls and reads a scroll area from outside it.
 * Pass it as the `controller` option.
 * @stable
 */
function createScrollAreaController() {
  return createController<{
    /** Scrolls to the end: the bottom, or the inline end when only the horizontal axis overflows. With `stickToEnd`, it sticks to the end again. */
    scrollToEnd: (options?: ScrollAreaScrollOptions) => void
    /** Scrolls to the start: the top, or the inline start when only the horizontal axis overflows. */
    scrollToStart: (options?: ScrollAreaScrollOptions) => void
    /** Whether the view is at the end now, even in a scroll event, before the attributes catch up. */
    isAtEnd: () => boolean
    /** Whether the view is at the start now, even in a scroll event, before the attributes catch up. */
    isAtStart: () => boolean
    /** Whether the view follows the end as the content grows, with `stickToEnd`. */
    isSticking: () => boolean
  }>()
}

/**
 * The options `scrollArea` takes. A component takes them as props on its root.
 * @stable
 */
type ScrollAreaOptions = {
  /**
   * When the scrollbars show: "auto" whenever the content overflows, "always"
   * even when it doesn't, "scroll" while scrolling, and "hover" while
   * scrolling or while the pointer is over the scroll area. Each scrollbar has
   * `data-visible` while it should show; style that.
   * @defaultValue "hover"
   */
  type?: ScrollAreaType
  /**
   * How long scrollbars stay after they stop being needed, in ms, with "scroll" and "hover".
   * @defaultValue 600
   */
  scrollHideDelay?: number
  /**
   * Keeps the end in view while the content grows, like a chat or streamed
   * output: it starts at the bottom and stays there. Scrolling toward the top
   * lets go, and scrolling back to the bottom sticks again.
   * @defaultValue false
   */
  stickToEnd?: boolean
  /** Drives it from anywhere. Create one with `createScrollAreaController()`. */
  controller?: ScrollAreaController
} & PrimitiveOptions

/**
 * The props the `scrollbar` slot of `scrollArea` takes.
 * @stable
 */
type ScrollAreaScrollbarProps = {
  /**
   * The axis the scrollbar scrolls.
   * @defaultValue "vertical"
   */
  orientation?: "vertical" | "horizontal"
}

/**
 * What the root, viewport and content parts' render functions receive.
 * @stable
 */
type ScrollAreaState = {
  /** Whether the content is wider than the viewport. */
  overflowX: boolean
  /** Whether the content is taller than the viewport. */
  overflowY: boolean
  /** Whether the view is at the start of the scroll area: the top, or the inline start when only the horizontal axis overflows. */
  atStart: boolean
  /** Whether the view is at the end of the scroll area: the bottom, or the inline end when only the horizontal axis overflows. */
  atEnd: boolean
  /** Whether the user is scrolling now. */
  scrolling: boolean
  /** Whether a mouse or pen is over the scroll area. */
  hovering: boolean
  /** Whether the view follows the end as the content grows, with `stickToEnd`. */
  sticking: boolean
}

/**
 * What a scrollbar's render functions receive.
 * @stable
 */
type ScrollAreaScrollbarState = {
  /** The axis it scrolls. */
  orientation: "vertical" | "horizontal"
  /** Whether it should show now, by `type`. */
  visible: boolean
  /** Whether its axis is scrolling now. */
  scrolling: boolean
  /** Whether a mouse or pen is over the scroll area. */
  hovering: boolean
  /** Whether its thumb is being dragged. */
  dragging: boolean
}

/**
 * What a thumb's render functions receive.
 * @stable
 */
type ScrollAreaThumbState = {
  /** The axis it scrolls. */
  orientation: "vertical" | "horizontal"
  /** Whether it's being dragged. */
  dragging: boolean
}

/**
 * What the scroll-to-end button's render functions receive.
 * @stable
 */
type ScrollAreaScrollToEndState = {
  /** Whether it should show: the view is away from the end and isn't heading there. */
  visible: boolean
}

type State = ScrollAreaModel

const axisOf = (orientation: ScrollAreaScrollbarProps["orientation"]) =>
  orientation === "horizontal" ? ("x" as const) : ("y" as const)

function alongAxis(
  part: Part<
    any,
    any,
    { orientation?: ScrollAreaScrollbarProps["orientation"] }
  >,
  bindAxis: (axis: "x" | "y") => () => void
) {
  let axis = axisOf(part.props.orientation)
  let unbind = bindAxis(axis)
  const unwatch = onProps(part, () => {
    if (axisOf(part.props.orientation) === axis) {
      return
    }
    unbind()
    axis = axisOf(part.props.orientation)
    unbind = bindAxis(axis)
  })
  return () => {
    unwatch()
    unbind()
  }
}

const atStart = (state: State) =>
  mainAxis(state) === "x" ? state.atXStart : state.atYStart
const atEnd = (state: State) =>
  mainAxis(state) === "x" ? state.atXEnd : state.atYEnd
const hasScrollbars = (state: State) =>
  state.scrollbarsX + state.scrollbarsY > 0
// The scroll-to-end button hides at the end, and as soon as the view heads there.
const endButtonShown = (state: State) =>
  !atEnd(state) && !(state.stickToEnd && state.sticking)

const flag = (value: boolean) => (value ? "" : undefined)

const areaState = (state: State) =>
  ({
    overflowX: state.overflowX,
    overflowY: state.overflowY,
    atStart: atStart(state),
    atEnd: atEnd(state),
    scrolling: state.scrollingX || state.scrollingY,
    hovering: state.hovering,
    sticking: state.stickToEnd && state.sticking,
  }) satisfies ScrollAreaState

// Rendering state, which the server renders too.
const overflowAttrs = (state: State) => ({
  "data-overflow-x": flag(state.overflowX),
  "data-overflow-y": flag(state.overflowY),
})

// Scroll position and input, written without a render.
const scrollAttrs = (state: State) => ({
  "data-at-start": flag(atStart(state)),
  "data-at-end": flag(atEnd(state)),
  "data-at-x-start": flag(state.atXStart),
  "data-at-x-end": flag(state.atXEnd),
  "data-at-y-start": flag(state.atYStart),
  "data-at-y-end": flag(state.atYEnd),
  "data-scrolling": flag(state.scrollingX || state.scrollingY),
  "data-hovering": flag(state.hovering),
  "data-sticking": flag(state.stickToEnd && state.sticking),
})

// The variables written every frame, reset to their initial value inside the
// content for a page that registered them to inherit. They don't otherwise.
const contentShield = Object.fromEntries(
  ["x", "y"].flatMap((axis) =>
    [
      "overflow-" + axis + "-start",
      "overflow-" + axis + "-end",
      "progress-" + axis,
    ].map((name) => [`--scroll-area-${name}`, "initial"])
  )
)

const settings = (options: ScrollAreaOptions) => ({
  type: options.type ?? "hover",
  scrollHideDelay: options.scrollHideDelay ?? 600,
  stickToEnd: options.stickToEnd ?? false,
})

const scrollAreaPrimitive = /* @__PURE__ */ definePrimitive({
  name: "scroll-area",
  options: {
    type: "string",
    scrollHideDelay: "number",
    stickToEnd: "boolean",
    controller: "value",
  },
  state: (options: ScrollAreaOptions): State => ({
    ...settings(options),
    scrollbarsX: 0,
    scrollbarsY: 0,
    counted: false,
    overflowX: false,
    overflowY: false,
    atXStart: true,
    atXEnd: true,
    atYStart: true,
    atYEnd: true,
    scrollingX: false,
    scrollingY: false,
    hovering: false,
    visibleX: false,
    visibleY: false,
    dragging: null,
    sticking: !!options.stickToEnd,
  }),
  live: liveKeys,
  sync: settings,
  // Nothing here is a value a user sets and gets back through a callback.
  controlled: [],
  api: (context) => {
    const { store, onDestroy } = context
    const view = createScrollView(store)
    // stickToEnd turned on later sticks at once, as it does from the start, and
    // turned off stops.
    deriveFromOptions(context, ["sticking"], (synced, state) =>
      synced.stickToEnd === undefined || synced.stickToEnd === state.stickToEnd
        ? undefined
        : { sticking: synced.stickToEnd }
    )
    let { stickToEnd, type, scrollHideDelay } = store.get()
    let destroyed = false
    onDestroy(() => (destroyed = true))
    onDestroy(
      store.subscribe(() => {
        const state = store.get()
        if (
          state.stickToEnd === stickToEnd &&
          state.type === type &&
          state.scrollHideDelay === scrollHideDelay
        ) {
          return
        }
        ;({ stickToEnd, type, scrollHideDelay } = state)
        // Once the options are handed over, so what it measures isn't written beside them.
        queueMicrotask(() => destroyed || view.refresh())
      })
    )
    return {
      scrollToEnd: (options?: ScrollAreaScrollOptions) =>
        view.scrollToEdge("end", options),
      scrollToStart: (options?: ScrollAreaScrollOptions) =>
        view.scrollToEdge("start", options),
      isAtEnd: () => view.isAt("end") ?? atEnd(store.get()),
      isAtStart: () => view.isAt("start") ?? atStart(store.get()),
      isSticking: () => store.get().stickToEnd && store.get().sticking,
      internal: view,
    }
  },
  slots: (slot) => ({
    // Positions the scrollbars, which sit over the viewport's edges.
    root: slot<{}, ScrollAreaState>({
      state: areaState,
      attrs: (state) => ({
        ...overflowAttrs(state),
        style: "position:relative",
      }),
      live: live(scrollAttrs),
      bind: (el, { api }) => api.internal.bindRoot(el),
    }),

    // The native scroller. Its own scrollbars hide once custom ones are on the
    // page, and stay when there are none. On the server, custom ones are assumed.
    viewport: slot<{}, ScrollAreaState>({
      state: areaState,
      attrs: (state) => ({
        ...overflowAttrs(state),
        style: css({
          overflow: "auto",
          "scrollbar-width":
            !state.counted || hasScrollbars(state) ? "none" : undefined,
        }),
      }),
      live: live(scrollAttrs),
      bind: (el, { api }) => api.internal.bindViewport(el),
    }),

    // Wraps the content. It grows wider than the viewport only when there's a
    // horizontal scrollbar, so text truncates as usual otherwise. Scrolling
    // must never restyle the whole content: 4.5ms a frame for 10,000 nodes in
    // Chrome, against 0.03ms for the root alone.
    content: slot<{}, ScrollAreaState>({
      state: areaState,
      attrs: (state) => ({
        ...overflowAttrs(state),
        style: css({
          "min-width": state.scrollbarsX > 0 ? "fit-content" : undefined,
          ...contentShield,
        }),
      }),
      live: live(scrollAttrs),
    }),

    // Hidden from assistive technology: the viewport scrolls natively, which
    // screen readers already use.
    scrollbar: slot<ScrollAreaScrollbarProps, ScrollAreaScrollbarState>({
      props: { orientation: "string" },
      state: (state, { props }) => {
        const axis = axisOf(props.orientation)
        return {
          orientation: orientationOf(props.orientation, "vertical"),
          visible: axis === "x" ? state.visibleX : state.visibleY,
          scrolling: axis === "x" ? state.scrollingX : state.scrollingY,
          hovering: state.hovering,
          dragging: state.dragging === axis,
        }
      },
      attrs: (state, { props }) => {
        const axis = axisOf(props.orientation)
        const overflow = axis === "x" ? state.overflowX : state.overflowY
        return {
          "aria-hidden": "true",
          "data-orientation": orientationOf(props.orientation, "vertical"),
          ...overflowAttrs(state),
          style: css({
            position: "absolute",
            "touch-action": "none",
            "user-select": "none",
            "-webkit-user-select": "none",
            ...(axis === "y"
              ? {
                  top: 0,
                  bottom: "var(--scroll-area-corner-height,0px)",
                  "inset-inline-end": 0,
                }
              : {
                  bottom: 0,
                  "inset-inline-start": 0,
                  "inset-inline-end": "var(--scroll-area-corner-width,0px)",
                }),
            display: overflow || state.type === "always" ? undefined : "none",
          }),
        }
      },
      live: live((state, { props }) => {
        const axis = axisOf(props.orientation)
        const visible = axis === "x" ? state.visibleX : state.visibleY
        return {
          "data-visible": flag(visible),
          "data-scrolling": flag(
            axis === "x" ? state.scrollingX : state.scrollingY
          ),
          "data-hovering": flag(state.hovering),
          "data-dragging": flag(state.dragging === axis),
          // A hidden scrollbar must not catch presses meant for the content under it.
          style: visible ? undefined : "pointer-events:none",
        }
      }),
      bind: (el, part) =>
        alongAxis(part, (axis) => part.api.internal.bindScrollbar(el, axis)),
    }),

    // Sized and moved by CSS variables its scrollbar writes once per frame.
    thumb: slot<ScrollAreaScrollbarProps, ScrollAreaThumbState>({
      props: { orientation: { kind: "string", from: "scrollbar" } },
      state: (state, { props }) => ({
        orientation: orientationOf(props.orientation, "vertical"),
        dragging: state.dragging === axisOf(props.orientation),
      }),
      attrs: (state, { props }) => {
        const axis = axisOf(props.orientation)
        const overflow = axis === "x" ? state.overflowX : state.overflowY
        return {
          "data-orientation": orientationOf(props.orientation, "vertical"),
          style: css(
            axis === "y"
              ? {
                  height: "var(--scroll-area-thumb-height)",
                  transform:
                    "translate3d(0,var(--scroll-area-thumb-offset,0px),0)",
                  display: overflow ? undefined : "none",
                }
              : {
                  width: "var(--scroll-area-thumb-width)",
                  transform:
                    "translate3d(var(--scroll-area-thumb-offset,0px),0,0)",
                  display: overflow ? undefined : "none",
                }
          ),
        }
      },
      live: live((state, { props }) => ({
        "data-dragging": flag(state.dragging === axisOf(props.orientation)),
      })),
      bind: (el, part) =>
        alongAxis(part, (axis) => part.api.internal.bindThumb(el, axis)),
    }),

    // Where the two scrollbars meet. Only there while both show.
    corner: slot({
      attrs: (state) => ({
        "aria-hidden": "true",
        style: css({
          position: "absolute",
          bottom: 0,
          "inset-inline-end": 0,
          width: "var(--scroll-area-corner-width)",
          height: "var(--scroll-area-corner-height)",
          display:
            state.overflowX &&
            state.overflowY &&
            state.scrollbarsX > 0 &&
            state.scrollbarsY > 0
              ? undefined
              : "none",
        }),
      }),
    }),

    // A button that scrolls to the end, like "Jump to latest" in a chat. While
    // it shouldn't show, it's inert, so it can fade out without taking focus.
    "scroll-to-end": slot<{}, ScrollAreaScrollToEndState>({
      state: (state) => ({ visible: endButtonShown(state) }),
      attrs: () => ({ type: "button" }),
      live: live((state) => ({
        "data-visible": flag(endButtonShown(state)),
        inert: flag(!endButtonShown(state)),
      })),
      press: ({ api, el }, event) => {
        // The button goes inert at the end, which would drop focus on the page.
        if (el && el.ownerDocument.activeElement === el) {
          api.internal.focusViewport()
        }
        api.scrollToEnd()
        event?.preventDefault()
      },
    }),
  }),
})

/**
 * The type of `scrollArea`.
 * @stable
 */
interface ScrollAreaPrimitive extends Named<typeof scrollAreaPrimitive> {}

/**
 * The scroll area primitive, with the slots `root`, `viewport`, `content`,
 * `scrollbar`, `thumb`, `corner`, `scroll-to-end`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const scrollArea: ScrollAreaPrimitive = scrollAreaPrimitive

export {
  createScrollAreaController,
  scrollArea,
  type ScrollAreaController,
  type ScrollAreaOptions,
  type ScrollAreaPrimitive,
  type ScrollAreaScrollbarProps,
  type ScrollAreaScrollbarState,
  type ScrollAreaScrollOptions,
  type ScrollAreaScrollToEndState,
  type ScrollAreaState,
  type ScrollAreaThumbState,
  type ScrollAreaType,
}
