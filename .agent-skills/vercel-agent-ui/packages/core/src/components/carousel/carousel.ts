import { dev } from "#dev"
import { checkName } from "#name-check"
import type { CarouselAlign, CarouselSlidesPerPage } from "./carousel-layout"
import {
  carouselApi,
  type CarouselApi,
  snapType,
  type State,
} from "./carousel-api"
import { idPart } from "../../foundation/kernel/attrs"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { orientationOf } from "../../foundation/focus/collection"
import { live } from "../../foundation/kernel/live"

/**
 * Why the page changed: the Previous or Next part, an indicator, arrow keys,
 * a finger or a mouse drag, another kind of scroll (a wheel, a trackpad, focus
 * or find in page bringing a slide into view), rotation, a layout change that
 * removed the page, or a controller.
 * @stable
 */
type CarouselPageChangeReason =
  | "previous-press"
  | "next-press"
  | "item-press"
  | "list-navigation"
  | "swipe"
  | "scroll"
  | "timeout"
  | "content-resize"
  | "imperative"

/**
 * Why rotation started or stopped: the play toggle, keyboard focus moving
 * into the carousel, the user moving it some other way, or a controller.
 * @stable
 */
type CarouselPlayingChangeReason =
  | "toggle-press"
  | "focus-in"
  | "previous-press"
  | "next-press"
  | "item-press"
  | "list-navigation"
  | "swipe"
  | "scroll"
  | "imperative"

/**
 * Options for a controller's page methods.
 * @stable
 */
type CarouselPageOptions = ChangeOptions<CarouselPageChangeReason>

/**
 * Options for a controller's rotation methods.
 * @stable
 */
type CarouselPlayingOptions = ChangeOptions<CarouselPlayingChangeReason>

/**
 * Pages and rotates a carousel from anywhere: buttons outside it, thumbnails,
 * the URL or a test. Pass it as the `controller` option.
 * @stable
 */
function createCarouselController() {
  return createController<{
    /** The current page, from 1. */
    getPage: () => number
    /** How many pages there are, or null before the carousel has measured its slides. */
    getPageCount: () => number | null
    /** Goes to a page, from 1, clamped to the pages there are. Returns false when canceled or already there. */
    setPage: (page: number, options?: CarouselPageOptions) => boolean
    /** Goes to the next page, or the first one after the last with `loop`. Returns false at the end. */
    next: (options?: CarouselPageOptions) => boolean
    /** Goes to the previous page, or the last one before the first with `loop`. Returns false at the start. */
    previous: (options?: CarouselPageOptions) => boolean
    /** Whether there's a next page, always with `loop`. */
    canNext: () => boolean
    /** Whether there's a previous page, always with `loop`. */
    canPrevious: () => boolean
    /** How far the slides have scrolled, from 0 at the first page to 1 at the last, or round the loop. Also `--carousel-progress` on the root. */
    getProgress: () => number
    /** Whether it rotates on its own. */
    isPlaying: () => boolean
    /** Starts or stops rotation. Returns false when canceled or unchanged. */
    setPlaying: (playing: boolean, options?: CarouselPlayingOptions) => boolean
    /** Starts rotation. */
    play: (options?: CarouselPlayingOptions) => boolean
    /** Stops rotation. */
    pause: (options?: CarouselPlayingOptions) => boolean
  }>()
}

/**
 * A controller from `createCarouselController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type CarouselController = ReturnType<typeof createCarouselController>

/**
 * Which way the slides run, which picks the arrow keys and the scroll axis.
 * @stable
 */
type CarouselOrientation = "horizontal" | "vertical"

function slidesPerPageAttribute(attribute: string | null) {
  if (attribute === null) {
    return undefined
  }
  return attribute === "auto" ? "auto" : Number(attribute)
}

/**
 * The options `carousel` takes. A component takes them as props on its root.
 * @stable
 */
type CarouselOptions = {
  /** The current page, from 1. Pass it to control the carousel. */
  page?: number
  /**
   * The page it starts on, from 1, when uncontrolled.
   * @defaultValue 1
   */
  defaultPage?: number
  /** Runs when the page wants to change. `details.reason` says why, and `details.cancel()` stays on the page. */
  onPageChange?: (
    page: number,
    details: ChangeDetails<CarouselPageChangeReason>
  ) => void
  /** Runs once the slides come to rest on a page, after a spring, a drag or a scroll, with that page. Start work there that would stutter the motion. */
  onPageChangeComplete?: (page: number) => void
  /** Whether it rotates through the pages on its own. Pass it to control rotation. */
  playing?: boolean
  /**
   * Whether it starts rotating, when uncontrolled. It doesn't when the user prefers reduced motion; the play toggle still starts it.
   * @defaultValue false
   */
  defaultPlaying?: boolean
  /** Runs when rotation wants to start or stop. Keyboard focus moving in and the user paging stop it, as the carousel pattern asks. */
  onPlayingChange?: (
    playing: boolean,
    details: ChangeDetails<CarouselPlayingChangeReason>
  ) => void
  /**
   * How long each page shows while rotating, in ms. Hovering, a hidden tab and scrolling the carousel out of view pause it.
   * @defaultValue 5000
   */
  interval?: number
  /**
   * Which way the slides scroll, and which arrow keys page.
   * @defaultValue "horizontal"
   */
  orientation?: CarouselOrientation
  /**
   * Where a page lines up in the viewport.
   * @defaultValue "start"
   */
  align?: CarouselAlign
  /**
   * How many slides one page holds: Next moves this many, and each indicator stands for this many. `"auto"` fits as many as the viewport shows.
   * @defaultValue 1
   */
  slidesPerPage?: CarouselSlidesPerPage
  /**
   * Whether the slides go round: Next on the last page goes to the first, which comes in after the last, and a swipe back from the first page reaches the last. With fewer than a page of slides to either side, Next on the last page scrolls back to the first instead.
   * @defaultValue false
   */
  loop?: boolean
  /**
   * Whether a fast swipe can pass over pages. Without it, one swipe moves one page.
   * @defaultValue false
   */
  skipSnaps?: boolean
  /**
   * Whether swipes and drags coast to wherever they stop instead of a page. The nearest page becomes the current one.
   * @defaultValue false
   */
  dragFree?: boolean
  /**
   * Whether swiping, dragging and scrolling move the slides. Without it, only the parts, keys and controllers do.
   * @defaultValue true
   */
  drag?: boolean
  /** Pages the carousel from anywhere. Create one with `createCarouselController()`. */
  controller?: CarouselController
} & PrimitiveOptions

/**
 * Public prop types. Every framework's parts take these, named for the framework.
 * @stable
 */
type CarouselIndicatorProps = {
  /** The page it shows and selects, from 1. Inferred from the indicators' order when left out. */
  page?: number
}

/**
 * Props of the parts that also work outside their carousel: Previous, Next, the indicator group and the play toggle.
 * @stable
 */
type CarouselControlProps = {
  /** The carousel this part drives when it isn't inside one, like buttons in a page header. */
  controller?: CarouselController
}

/**
 * The state the `root` slot of `carousel` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CarouselState = {
  /** The current page, from 1. */
  page: number
  /** How many pages there are, or null before the slides are measured, like on the server. */
  pageCount: number | null
  /** Whether it rotates on its own. */
  playing: boolean
  /** Which way the slides scroll. */
  orientation: CarouselOrientation
}
/**
 * The state the `viewport` slot of `carousel` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CarouselViewportState = {
  /** Which way the slides scroll. */
  orientation: CarouselOrientation
  /** Whether a mouse or pen is dragging the slides. */
  dragging: boolean
}
/**
 * The state the `content` slot of `carousel` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CarouselContentState = {
  /** Which way the slides scroll. */
  orientation: CarouselOrientation
}
/**
 * The state the `item` slot of `carousel` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CarouselItemState = {
  /** The slide's position among the slides, from 0. -1 until it's measured. */
  index: number
  /** Whether the slide belongs to the current page. */
  active: boolean
  /** Whether at least half of the slide shows. Slides out of view are inert. */
  inView: boolean
}
/**
 * The state the `previous` and `next` slots of `carousel` hand `render`
 * functions and state-based class names.
 * @stable
 */
type CarouselStepState = {
  /** Whether there's no page that way, so pressing does nothing. It stays focusable. */
  disabled: boolean
}
/**
 * The state the `previous` slot of `carousel` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CarouselPreviousState = CarouselStepState
/**
 * The state the `next` slot of `carousel` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CarouselNextState = CarouselStepState
/**
 * The state the `indicator-group` slot of `carousel` hands `render` functions
 * and state-based class names.
 * @stable
 */
type CarouselIndicatorGroupState = {
  /** The current page, from 1. */
  page: number
  /** How many pages there are, or null before the slides are measured. */
  pageCount: number | null
}
/**
 * The state the `indicator` slot of `carousel` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CarouselIndicatorState = {
  /** The page it stands for, from 1, or 0 before it's known. */
  page: number
  /** Whether its page is the current one. */
  selected: boolean
}
/**
 * The state the `play-toggle` slot of `carousel` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CarouselPlayToggleState = {
  /** Whether it rotates on its own. */
  playing: boolean
  /** Whether rotation is paused for now: hovered, the tab hidden, scrolled out of view or held. */
  paused: boolean
}

// Development builds warn about parts nobody can name, once they're in the
// page. Call it behind `dev`, so production drops the part names too.
const checkPartName =
  (part: string) =>
  (el: HTMLElement, { id }: { id: string }) => {
    queueMicrotask(
      () => el.isConnected && checkName(el, part, { component: "carousel", id })
    )
  }

// Inline styles a part needs to work at all, as a `style` attribute.
function viewportStyle(state: State) {
  const vertical = state.orientation === "vertical"
  const overflow = state.drag ? "auto" : "hidden"
  return [
    "position:relative",
    `overflow-x:${vertical ? "hidden" : overflow}`,
    `overflow-y:${vertical ? overflow : "hidden"}`,
    `scroll-snap-type:${snapType(state, state.snapping)}`,
    `overscroll-behavior-${vertical ? "y" : "x"}:contain`,
  ].join(";")
}

function itemStyle(state: State) {
  const declarations = ["flex-shrink:0"]
  if (state.slidesPerPage === 1) {
    declarations.push(`scroll-snap-align:${state.align}`)
  }
  if (!state.skipSnaps) {
    declarations.push("scroll-snap-stop:always")
  }
  return declarations.join(";")
}

const contentId = (id: string) => `${id}-content`
const slideId = (id: string, key: string) => `${id}-slide-${idPart(key)}`

const stepAttrs = (disabled: boolean, id: string) => ({
  type: "button",
  "aria-controls": contentId(id),
  "aria-disabled": disabled ? "true" : undefined,
  "data-disabled": disabled ? "" : undefined,
})

const carouselPrimitive = /* @__PURE__ */ definePrimitive({
  name: "carousel",
  options: {
    page: "number",
    defaultPage: "number",
    onPageChange: "callback",
    onPageChangeComplete: "callback",
    playing: "boolean",
    defaultPlaying: "boolean",
    onPlayingChange: "callback",
    interval: "number",
    orientation: "string",
    align: "string",
    slidesPerPage: slidesPerPageAttribute,
    loop: "boolean",
    skipSnaps: "boolean",
    dragFree: "boolean",
    drag: "boolean",
    controller: "value",
  },
  state: (options: CarouselOptions): State => ({
    page: Math.max(1, Math.floor(options.defaultPage ?? 1)),
    playing: options.defaultPlaying ?? false,
    orientation: "horizontal",
    align: "start",
    slidesPerPage: 1,
    loop: false,
    skipSnaps: false,
    dragFree: false,
    drag: true,
    interval: 5000,
    pageCount: null,
    snapping: true,
    indicators: [],
    stop: null,
    pages: [],
    order: [],
    inView: [],
    focused: null,
    dragging: false,
    paused: false,
  }),
  live: ["pages", "order", "inView", "focused", "dragging", "paused"],
  controlled: ["page", "playing"],
  sync: (options) => ({
    orientation: orientationOf(options.orientation, "horizontal"),
    align: options.align ?? "start",
    slidesPerPage: options.slidesPerPage ?? 1,
    loop: options.loop ?? false,
    skipSnaps: options.skipSnaps ?? false,
    dragFree: options.dragFree ?? false,
    drag: options.drag ?? true,
    interval: options.interval ?? 5000,
    ...(options.page === undefined ? {} : { page: options.page }),
    ...(options.playing === undefined ? {} : { playing: options.playing }),
  }),
  api: carouselApi,
  slots: (slot) => ({
    root: slot<{}, CarouselState>({
      role: "region",
      state: (state) => ({
        page: state.page,
        pageCount: state.pageCount,
        playing: state.playing,
        orientation: state.orientation,
      }),
      attrs: (state) => ({
        "aria-roledescription": "carousel",
        "data-orientation": state.orientation,
        "data-playing": state.playing ? "" : undefined,
      }),
      live: live((state) => ({
        "data-paused": state.playing && state.paused ? "" : undefined,
      })),
      bind: (el, { api }) => api.internal.bindRoot(el),
    }),

    viewport: slot<{}, CarouselViewportState>({
      state: (state) => ({
        orientation: state.orientation,
        dragging: state.dragging,
      }),
      attrs: (state) => ({
        "data-orientation": state.orientation,
        style: viewportStyle(state),
      }),
      live: live((state) => ({
        "data-dragging": state.dragging ? "" : undefined,
      })),
      on: {
        keydown: (event, { api }) => api.internal.onViewportKeyDown(event),
      },
      bind: (el, { api }) => api.internal.bindViewport(el),
    }),

    content: slot<{}, CarouselContentState>({
      state: (state) => ({ orientation: state.orientation }),
      attrs: (state, { id }) => ({
        id: contentId(id),
        // Slides coming into view are read out, except while rotating, as the carousel pattern asks.
        "aria-live": state.playing ? "off" : "polite",
        "aria-atomic": "false",
        "data-orientation": state.orientation,
        style:
          state.orientation === "vertical"
            ? "display:flex;flex-direction:column"
            : "display:flex",
      }),
    }),

    item: slot<{}, CarouselItemState>({
      role: "group",
      props: { id: "id" },
      state: (state, { key }) => ({
        index: state.order.indexOf(key),
        active: !!state.pages[state.page - 1]?.includes(key),
        inView: state.inView.includes(key),
      }),
      attrs: (state, { id, key }) => ({
        id: slideId(id, key),
        "aria-roledescription": "slide",
        "data-orientation": state.orientation,
        style: itemStyle(state),
      }),
      // Slides out of view leave the tab order and the accessibility tree,
      // except one that holds focus, until focus leaves it.
      live: live((state, { key }) => {
        const hidden =
          state.pageCount !== null &&
          !state.inView.includes(key) &&
          state.focused !== key
        return {
          inert: hidden ? "" : undefined,
          "aria-hidden": hidden ? "true" : undefined,
          "data-active": state.pages[state.page - 1]?.includes(key)
            ? ""
            : undefined,
          "data-in-view": state.inView.includes(key) ? "" : undefined,
        }
      }),
      bind: (el, { api, key }) => api.internal.bindItem(el, key),
    }),

    previous: slot<{}, CarouselPreviousState>({
      state: (state, { api }) => ({ disabled: !api.internal.canStep(-1) }),
      attrs: (state, { id, api }) => stepAttrs(!api.internal.canStep(-1), id),
      press: ({ api }, event) => {
        api.previous({ reason: "previous-press", event })
      },
      bind: dev ? checkPartName("CarouselPrevious") : undefined,
    }),

    next: slot<{}, CarouselNextState>({
      state: (state, { api }) => ({ disabled: !api.internal.canStep(1) }),
      attrs: (state, { id, api }) => stepAttrs(!api.internal.canStep(1), id),
      press: ({ api }, event) => {
        api.next({ reason: "next-press", event })
      },
      bind: dev ? checkPartName("CarouselNext") : undefined,
    }),

    "indicator-group": slot<{}, CarouselIndicatorGroupState>({
      role: "tablist",
      keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"],
      state: (state) => ({ page: state.page, pageCount: state.pageCount }),
      on: {
        keydown: (event, { api }) => api.internal.onIndicatorKeyDown(event),
      },
    }),

    indicator: slot<CarouselIndicatorProps, CarouselIndicatorState>({
      role: "tab",
      focus: "roving",
      props: { page: "number", id: "id" },
      state: (state, { key, props, api }) => {
        const page = api.internal.indicatorPage(state, key, props)
        return { page, selected: page === state.page }
      },
      attrs: (state, { id, key, props, api }) => {
        const page = api.internal.indicatorPage(state, key, props)
        const selected = page > 0 && page === state.page
        return {
          id: `${id}-indicator-${idPart(key)}`,
          type: "button",
          tabindex: api.internal.roving.tabIndex(state, { key, props }),
          "aria-selected": String(selected),
          "data-selected": selected ? "" : undefined,
          hidden:
            state.pageCount !== null && page > state.pageCount ? "" : undefined,
        }
      },
      live: live((state, { id, key, props, api }) => {
        const page = api.internal.indicatorPage(state, key, props)
        const slides = state.pages[page - 1]
        return {
          "aria-controls":
            slides?.map((slide) => slideId(id, slide)).join(" ") || undefined,
        }
      }),
      press: ({ api, el, key, props }, event) =>
        api.internal.pressIndicator(el, key, props, event),
      bind: (el, part) => part.api.internal.bindIndicator(el, part),
    }),

    "play-toggle": slot<{}, CarouselPlayToggleState>({
      state: (state) => ({ playing: state.playing, paused: state.paused }),
      attrs: (state, { id }) => ({
        type: "button",
        "aria-controls": contentId(id),
        "data-playing": state.playing ? "" : undefined,
      }),
      live: live((state) => ({
        "data-paused": state.playing && state.paused ? "" : undefined,
      })),
      press: ({ api, store }, event) => {
        api.setPlaying(!store.get().playing, { reason: "toggle-press", event })
      },
      bind: dev ? checkPartName("CarouselPlayToggle") : undefined,
    }),
  }),
  agent: {
    actions: ["setPage", "next", "previous", "setPlaying", "play", "pause"],
  },
})

/**
 * The type of `carousel`.
 * @stable
 */
interface CarouselPrimitive extends Named<typeof carouselPrimitive> {}

/**
 * The carousel primitive, with the slots `root`, `viewport`, `content`,
 * `item`, `previous`, `next`, `indicator-group`, `indicator`, `play-toggle`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const carousel: CarouselPrimitive = carouselPrimitive

export {
  carousel,
  type CarouselApi,
  type CarouselContentState,
  type CarouselController,
  type CarouselControlProps,
  type CarouselIndicatorGroupState,
  type CarouselIndicatorProps,
  type CarouselIndicatorState,
  type CarouselItemState,
  type CarouselNextState,
  type CarouselOptions,
  type CarouselOrientation,
  type CarouselPageChangeReason,
  type CarouselPageOptions,
  type CarouselPlayingChangeReason,
  type CarouselPlayingOptions,
  type CarouselPlayToggleState,
  type CarouselPreviousState,
  type CarouselPrimitive,
  type CarouselState,
  type CarouselStepState,
  type CarouselViewportState,
  createCarouselController,
}
export type { CarouselAlign, CarouselSlidesPerPage } from "./carousel-layout"
