// What a carousel does: paging and rotation, measuring the slides and moving
// the viewport. The indicators are in `carousel-indicators.ts`, the keys in
// `carousel-keyboard.ts`, the seamless loop in `carousel-loop.ts`, DOM reads and
// writes in `carousel-dom.ts`, and the parts and their attributes in
// `carousel.ts`.
import { afterBind } from "../../foundation/kernel/after-bind"
import { dev } from "#dev"
import { checkName } from "#name-check"
import { clamp } from "../../foundation/number/steps"
import { createAutoplay } from "./carousel-autoplay"
import {
  clearSnapAreas,
  labelSlide,
  readCarouselLayout,
  writeSnapAreas,
} from "./carousel-dom"
import { carouselIndicators } from "./carousel-indicators"
import { carouselKeys } from "./carousel-keyboard"
import {
  carouselPages,
  isSlideInView,
  nearestPage,
  stepPage,
  type CarouselAlign,
  type CarouselPage,
  type CarouselSlideBox,
  type CarouselSlidesPerPage,
} from "./carousel-layout"
import { createCarouselLoop } from "./carousel-loop"
import { createCarouselMotion, type CarouselMotion } from "./carousel-motion"
import type {
  CarouselOptions,
  CarouselOrientation,
  CarouselPageChangeReason,
  CarouselPageOptions,
  CarouselPlayingChangeReason,
  CarouselPlayingOptions,
} from "./carousel"
import { isFocusFromKeyboard } from "../../foundation/kernel/modality"
import { isRTL } from "../../foundation/platform/env"
import { prefersReducedMotion } from "../../foundation/platform/platform"
import { bindTabStop } from "../../foundation/focus/tabbable"
import { sheetPhysics } from "../../foundation/motion/physics"
import { on } from "../../foundation/kernel/events"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { createChange } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"

/** A measured layout, read from the DOM. */
type CarouselMeasure = {
  /** Each slide's key and place, in order along the axis. */
  slides: readonly { key: string; box: CarouselSlideBox }[]
  /** The viewport's size along the axis. */
  viewportSize: number
  /** The largest scroll position. */
  maxScroll: number
  /** The viewport's scroll padding at each end. */
  paddingStart?: number
  paddingEnd?: number
  /** The slide shown first, when the slides rotate for a seamless loop. */
  first?: number
}

type State = {
  page: number
  playing: boolean
  orientation: CarouselOrientation
  align: CarouselAlign
  slidesPerPage: CarouselSlidesPerPage
  loop: boolean
  skipSnaps: boolean
  dragFree: boolean
  drag: boolean
  interval: number
  pageCount: number | null
  // Off while the carousel moves itself, so the browser doesn't snap each frame.
  snapping: boolean
  // Indicator keys in document order, for indicators without a `page`.
  indicators: string[]
  // The indicator that holds the tab stop.
  stop: string | null
  // Live: slide keys per page, slide keys in order, slides in view, the slide
  // holding focus, a drag, and a rotation pause.
  pages: string[][]
  order: string[]
  inView: string[]
  focused: string | null
  dragging: boolean
  paused: boolean
}

const userReasons = new Set<string>([
  "previous-press",
  "next-press",
  "item-press",
  "list-navigation",
  "swipe",
  "scroll",
])

// Carousel physics: the sheet's springs, with UIScrollView's rubber band
// against the viewport's own size.
const physics = {
  ...sheetPhysics.ios,
  rubberBand: 0.55,
  rubberBandDimension: null,
}

function onVisibilityChange(doc: Document, listener: () => void) {
  doc.addEventListener("visibilitychange", listener)
  return () => doc.removeEventListener("visibilitychange", listener)
}

function snapType(
  state: Pick<State, "orientation" | "dragFree">,
  snapping: boolean
) {
  if (!snapping || state.dragFree) {
    return "none"
  }
  return `${state.orientation === "vertical" ? "y" : "x"} mandatory`
}

/**
 * `carousel`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface CarouselApi extends ReturnType<typeof carouselApiBody> {}

function carouselApiBody(
  context: PrimitiveContext<CarouselOptions, State, string>
) {
  const { id, store, options, element, onDestroy } = context
  const change = createChange(context)
  let layout: CarouselPage[] = []
  // Page indexes in the order they rest along the axis, which a looping
  // track rotates. The motion's snap points go in this order.
  let visual: number[] = []
  let boxes: CarouselSlideBox[] = []
  let maxScroll = 0
  let viewportSize = 0
  let measured = false
  let measureQueued = false
  // Watches the viewport and every slide while the viewport is bound.
  let resizeObserver: ResizeObserver | undefined
  // Direction comes from computed style, so it's read when measuring and on
  // input, never on each frame of a spring. Turning it resizes nothing, so
  // input that finds it turned measures again.
  let isRtl = false
  // What moves the viewport while it's bound, and what a looping track rotates under.
  let motion: CarouselMotion | undefined
  // Which way a step heads, 1 or -1, for the loop to rotate toward it.
  let heading: 1 | -1 | undefined
  const readDirection = () =>
    (isRtl = isRTL(element("viewport") ?? element("root")))
  const turned = () =>
    measured && isRtl !== isRTL(element("viewport") ?? element("root"))
  const followDirection = () => {
    if (turned()) {
      measure()
    }
    return isRtl
  }
  const axis = () => ({
    vertical: store.get().orientation === "vertical",
    rtl: isRtl,
  })
  const loop = createCarouselLoop({
    slides: () => elements(context, "item"),
    motion: () => motion,
    pages: () => layout,
    visual: () => visual,
    measure,
  })

  const autoplay = createAutoplay({
    interval: () => store.get().interval,
    // Rotation always wraps: it's a rotation, whatever `loop` says about the buttons.
    onTick: () => {
      const { page, pageCount } = store.get()
      if (pageCount) {
        go(stepPage(page, 1, pageCount, true), "timeout", undefined, 1)
      }
    },
    onPausedChange: (paused) => store.set({ paused }),
  })
  onDestroy(autoplay.destroy)

  const pageCount = () => store.get().pageCount
  const canStep = (by: 1 | -1) => {
    const { page, loop } = store.get()
    const count = pageCount()
    if (count === null) {
      return by === 1 || page > 1
    }
    return stepPage(page, by, count, loop) !== page
  }

  // The next or previous page, wrapping with `loop`. Before the pages are
  // measured, it steps freely forward and down to the first.
  function step(
    by: 1 | -1,
    { reason = "imperative", event }: CarouselPageOptions = {}
  ) {
    const { page, loop } = store.get()
    const count = pageCount()
    const target = count === null ? page + by : stepPage(page, by, count, loop)
    return target !== page && target >= 1 && go(target, reason, event, by)
  }

  // Changes the page for a reason. A change the user made stops rotation.
  // `by` is the step that led here, which a loop moves along.
  function go(
    page: number,
    reason: CarouselPageChangeReason,
    event?: Event,
    by?: 1 | -1
  ) {
    followDirection()
    const count = pageCount()
    const target =
      count === null ? Math.max(1, page) : Math.min(Math.max(1, page), count)
    if (userReasons.has(reason) && store.get().playing) {
      change("playing", false, {
        reason: reason as CarouselPlayingChangeReason,
        event,
      })
    }
    if (target === store.get().page) {
      return false
    }
    heading = by
    const changed = change("page", target, { reason, event })
    heading = undefined
    // A canceled change, or a controlled page that stayed, moves back.
    if (!changed || store.get().page !== target) {
      queueMicrotask(followPage)
    }
    return changed
  }

  function setPlaying(
    playing: boolean,
    { reason = "imperative", event }: CarouselPlayingOptions = {}
  ) {
    return change("playing", playing, { reason, event })
  }

  // Scrolls to the current page, if the viewport isn't there. A spring on
  // its way somewhere else turns toward it; the user's own scroll or drag
  // settles it later.
  function followPage({ animate = true } = {}) {
    if (
      loop.isRotating() ||
      !motion ||
      !measured ||
      motion.isHeld() ||
      (!animate && motion.isMoving())
    ) {
      return
    }
    const index = store.get().page - 1
    if (!layout[index]) {
      return
    }
    if (animate) {
      loop.rotateToward(index, heading)
    }
    const position = clamp(layout[index].position, 0, maxScroll)
    if (Math.abs(motion.position() - position) >= 1 || !store.get().snapping) {
      motion.moveTo(visual.indexOf(index), { animate })
    }
  }

  let snapAreas = false
  // Reads the slides' layout from the DOM.
  function measure() {
    measureQueued = false
    const viewport = element("viewport")
    const slides = elements(context, "item")
    if (!viewport || !viewport.isConnected) {
      return
    }
    // Slides that bound before they were in the page, as Vue binds them, get watched now.
    for (const { el } of slides) {
      resizeObserver?.observe(el)
    }
    readDirection()
    // A loop rotates the slides, unless they don't lay out by CSS order, and
    // then it rewinds.
    const first = loop.prepare(
      slides,
      store.get().loop && slides.length > 1 && motion !== undefined
    )
    // Read after writing the order, to check the slides follow it.
    applyLayout({ ...readCarouselLayout(viewport, slides, axis()), first })
    // Slides that didn't rotate, or a track too short to, lay out in their own order.
    if (first && !loop.isActive()) {
      return measure()
    }
    if (store.get().slidesPerPage !== 1) {
      writeSnapAreas(slides, layout, axis().vertical)
      snapAreas = true
    } else if (snapAreas) {
      clearSnapAreas(slides, store.get().align)
      snapAreas = false
    }
    loop.recenter()
  }

  // Works out the pages from a measured layout, and keeps the current page in view.
  function applyLayout(measure: CarouselMeasure) {
    const { paddingStart = 0, paddingEnd = 0, first } = measure
    viewportSize = measure.viewportSize
    maxScroll = measure.maxScroll
    boxes = measure.slides.map((slide) => slide.box)
    const { align, slidesPerPage } = store.get()
    const snapport = viewportSize - paddingStart - paddingEnd
    layout =
      loop.layout(
        boxes,
        { snapport, paddingStart, maxScroll, align, slidesPerPage },
        first
      ) ??
      carouselPages(
        { slides: boxes, snapport, paddingStart, maxScroll },
        { align, slidesPerPage }
      )
    visual = layout
      .map((_, index) => index)
      .sort((a, b) => layout[a].position - layout[b].position)
    const keys = measure.slides.map((slide) => slide.key)
    store.set({
      pageCount: layout.length || null,
      order: keys,
      pages: layout.map((page) => page.slides.map((index) => keys[index])),
    })
    const { page } = store.get()
    if (layout.length && page > layout.length) {
      // The first measure picks a default, which is not a change.
      if (measured) {
        go(layout.length, "content-resize")
      } else {
        store.set({ page: layout.length })
      }
    }
    measured = layout.length > 0
    // A rotation keeps the slides in view, and moves the scroll position itself.
    if (loop.isRotating()) {
      return
    }
    // New layout keeps the current page in place, without animating.
    followPage({ animate: false })
    updateInView()
  }

  function queueMeasure() {
    if (measureQueued) {
      return
    }
    measureQueued = true
    afterBind(measure)
  }

  function updateInView() {
    if (!motion) {
      return
    }
    const at = motion.position()
    const { order } = store.get()
    const inView = order.filter(
      (_, index) =>
        boxes[index] && isSlideInView(boxes[index], at, viewportSize)
    )
    store.set({ inView })
    writeProgress()
  }

  // How far along the slides are: by scroll position, or round a looping
  // track by page, since its scroll position moves with each rotation.
  function progress() {
    if (!motion || !layout.length) {
      return 0
    }
    const at = motion.position()
    if (!loop.isActive()) {
      return maxScroll > 0 ? clamp(at / maxScroll, 0, 1) : 0
    }
    // Positions keep sub-pixel offsets, but Firefox can stop the scroll a hair
    // short of one, which read as the slide before it, all but finished.
    let step = 0
    while (
      step < visual.length - 1 &&
      layout[visual[step + 1]].position <= at + 0.5
    ) {
      step++
    }
    const from = layout[visual[step]].position
    const to =
      step < visual.length - 1 ? layout[visual[step + 1]].position : from
    const fraction = to > from ? clamp((at - from) / (to - from), 0, 1) : 0
    return ((visual[step] + fraction) / layout.length) % 1
  }

  // `--carousel-progress` on the root, for progress bars in CSS. Compared in
  // ten-thousandths, so a scroll frame that doesn't change it writes nothing.
  let writtenProgress = -1
  function writeProgress() {
    const root = element("root")
    if (!root) {
      return
    }
    const value = Math.round(progress() * 10000)
    if (value === writtenProgress) {
      return
    }
    writtenProgress = value
    root.style.setProperty("--carousel-progress", (value / 10000).toFixed(4))
  }

  // The slides came to rest: a looping track recenters, and the page is complete.
  function rested() {
    if (!motion || motion.isMoving()) {
      return
    }
    loop.recenter()
    options().onPageChangeComplete?.(store.get().page)
  }

  function onScrollRest(
    position: number,
    cause: { touch: boolean; event?: Event }
  ) {
    const wasRtl = isRtl
    if (followDirection() !== wasRtl && motion) {
      position = motion.position()
    }
    updateInView()
    const index = nearestPage(layout, position)
    if (index === -1) {
      return
    }
    const reason = cause.touch ? "swipe" : "scroll"
    if (index + 1 !== store.get().page) {
      go(index + 1, reason, cause.event)
    }
    if (!store.get().dragFree) {
      followPage()
    }
    rested()
  }

  function bindViewport(viewport: HTMLElement) {
    const cleanups: (() => void)[] = []
    const viewportMotion = createCarouselMotion({
      viewport,
      content: () => element("content"),
      axis,
      // In the order they rest, within the scroll range.
      positions: () =>
        visual.map((index) => clamp(layout[index].position, 0, maxScroll)),
      maxScroll: () => maxScroll,
      viewportSize: () => viewportSize,
      physics: () => ({ ...physics, skipSnapPoints: store.get().skipSnaps }),
      canDrag: () => store.get().drag,
      dragFree: () => store.get().dragFree,
      reducedMotion: prefersReducedMotion,
      setSnapping: (snapping) => {
        // Written at once too, since the next frame's scroll must not snap.
        viewport.style.setProperty(
          "scroll-snap-type",
          snapType(store.get(), snapping)
        )
        store.set({ snapping })
      },
      onRelease: (index, event) => go(visual[index] + 1, "swipe", event),
      onScrollRest,
      onSettle: () => {
        if (!store.get().dragFree) {
          followPage()
        }
        rested()
      },
      onDragChange: (dragging) => {
        store.set({ dragging })
        autoplay.setPaused("drag", dragging)
      },
      onScroll: updateInView,
    })
    motion = viewportMotion
    cleanups.push(viewportMotion.destroy, () => {
      if (motion === viewportMotion) {
        motion = undefined
      }
      loop.reset(elements(context, "item"))
    })
    cleanups.push(
      on(viewport, "pointerdown", followDirection, { capture: true })
    )
    // A finger down pauses rotation; the swipe it makes stops it.
    cleanups.push(
      on(viewport, "touchstart", () => autoplay.setPaused("touch", true), {
        passive: true,
      }),
      on(viewport, "touchend", () => autoplay.setPaused("touch", false), {
        passive: true,
      }),
      on(viewport, "touchcancel", () => autoplay.setPaused("touch", false), {
        passive: true,
      })
    )
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(queueMeasure)
      observer.observe(viewport)
      resizeObserver = observer
      cleanups.push(() => {
        observer.disconnect()
        if (resizeObserver === observer) {
          resizeObserver = undefined
        }
      })
    }
    // Content that can't take focus still needs a tab stop to scroll by keyboard.
    const tabStop = bindTabStop(viewport, () => true, { skipWhenHolding: true })
    cleanups.push(tabStop.stop)
    measured = false
    queueMeasure()
    return () => cleanups.forEach((cleanup) => cleanup())
  }

  // `--carousel-interval` on the root, for progress bars timed in CSS.
  function writeInterval(root = element("root")) {
    root?.style.setProperty("--carousel-interval", `${store.get().interval}ms`)
  }

  function bindRoot(root: HTMLElement) {
    writeInterval(root)
    if (dev) {
      queueMicrotask(
        () =>
          root.isConnected &&
          checkName(root, "Carousel", { component: "carousel", id })
      )
    }
    const cleanups = [
      // Rotation pauses under the mouse, and stops when keyboard focus moves in.
      on(root, "pointerenter", (event) => {
        if (event.pointerType === "mouse") {
          autoplay.setPaused("hover", true)
        }
      }),
      on(root, "pointerleave", (event) => {
        if (event.pointerType === "mouse") {
          autoplay.setPaused("hover", false)
        }
      }),
      on(root, "focusin", (event) => {
        const from = event.relatedTarget as Node | null
        if (
          store.get().playing &&
          isFocusFromKeyboard() &&
          !(from && root.contains(from))
        ) {
          setPlaying(false, { reason: "focus-in", event })
        }
      }),
      onVisibilityChange(root.ownerDocument, () =>
        autoplay.setPaused(
          "hidden",
          root.ownerDocument.visibilityState === "hidden"
        )
      ),
    ]
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1]
        if (entry) {
          autoplay.setPaused("offscreen", !entry.isIntersecting)
        }
      })
      observer.observe(root)
      cleanups.push(() => observer.disconnect())
    }
    cleanups.push(runRotation(prefersReducedMotion()))
    return () => cleanups.forEach((cleanup) => cleanup())
  }

  // Starts rotating if it should, for as long as the root is in the page.
  // Rotation that would start by default doesn't when the user prefers less motion.
  function runRotation(reducedMotion: boolean) {
    if (
      store.get().playing &&
      options().playing === undefined &&
      reducedMotion
    ) {
      store.set({ playing: false })
    }
    autoplay.setRunning(store.get().playing)
    return () => autoplay.setRunning(false)
  }

  // Reacts to page and rotation changes from any source: a part, a key, a
  // scroll, a controller or a controlled value.
  let previous = store.get()
  store.subscribe(() => {
    const state = store.get()
    const before = previous
    previous = state
    if (state.playing !== before.playing) {
      autoplay.setRunning(state.playing)
    }
    if (state.interval !== before.interval) {
      writeInterval()
    }
    if (state.page !== before.page) {
      autoplay.restart()
      // A controlled page can arrive while an adapter hands over props, so a turn measures later, which follows the page.
      if (turned()) {
        queueMeasure()
      } else {
        followPage()
      }
    }
    if (
      state.slidesPerPage !== before.slidesPerPage ||
      state.align !== before.align
    ) {
      queueMeasure()
    }
    if (
      state.orientation !== before.orientation ||
      state.loop !== before.loop
    ) {
      queueMeasure()
    }
  })

  const indicators = carouselIndicators(context, go)
  const onViewportKeyDown = carouselKeys(context, go, followDirection)

  const api = {
    getPage: () => store.get().page,
    getPageCount: pageCount,
    setPage: (
      page: number,
      { reason = "imperative", event }: CarouselPageOptions = {}
    ) => go(page, reason, event),
    next: (options?: CarouselPageOptions) => step(1, options),
    canNext: () => canStep(1),
    canPrevious: () => canStep(-1),
    getProgress: progress,
    previous: (options?: CarouselPageOptions) => step(-1, options),
    isPlaying: () => store.get().playing,
    setPlaying: (playing: boolean, options?: CarouselPlayingOptions) =>
      setPlaying(playing, options),
    play: (options?: CarouselPlayingOptions) => setPlaying(true, options),
    pause: (options?: CarouselPlayingOptions) => setPlaying(false, options),
    internal: {
      id,
      canStep,
      ...indicators,
      bindRoot,
      bindViewport,
      onViewportKeyDown,
      bindItem(el: HTMLElement, key: string) {
        resizeObserver?.observe(el)
        queueMeasure()
        const cleanups = [
          labelSlide(el, key, store),
          on(el, "focusin", () => store.set({ focused: key })),
          on(el, "focusout", (event) => {
            if (
              !el.contains(event.relatedTarget as Node | null) &&
              store.get().focused === key
            ) {
              store.set({ focused: null })
            }
          }),
        ]
        return () => {
          cleanups.forEach((cleanup) => cleanup())
          resizeObserver?.unobserve(el)
          if (store.get().focused === key) {
            store.set({ focused: null })
          }
          queueMeasure()
        }
      },
    },
  }

  return api
}

const carouselApi: (
  ...args: Parameters<typeof carouselApiBody>
) => CarouselApi = carouselApiBody

export { carouselApi, type CarouselApi, snapType, type State }
