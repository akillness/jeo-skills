// A seamless loop. The slides rotate with CSS `order`, at rest and
// whenever a move would run out of slides, so the current page always has
// slides on both sides, for native scrolling and fingers as for buttons and
// springs. Nothing moves in the document, so focus, iframes and frameworks
// are untouched, which clones or DOM moves would not leave them. The geometry
// is pure, in `carousel-layout.ts`.
import { clearSlideOrder, writeSlideOrder } from "./carousel-dom"
import {
  canLoop,
  loopPages,
  loopRotation,
  measureTrack,
  nearestPage,
  type CarouselLoopView,
  type CarouselPage,
  type CarouselSlideBox,
  type CarouselTrack,
} from "./carousel-layout"
import type { CarouselMotion } from "./carousel-motion"

type Slide = { el: HTMLElement; key: string }

function createCarouselLoop(options: {
  slides: () => Slide[]
  /** The viewport's motion, while it's bound. */
  motion: () => CarouselMotion | undefined
  /** The pages, and their indexes in the order they rest, as last laid out. */
  pages: () => readonly CarouselPage[]
  visual: () => readonly number[]
  /** Measures again, after a rotation wrote the slides' order. */
  measure: () => void
}) {
  let track: CarouselTrack | null = null
  let view: CarouselLoopView | undefined
  // The slide shown first, and whether the slides carry an order to clear.
  let firstKey: string | null = null
  let ordered = false
  let rotating = false
  // The content doesn't lay out by CSS order, so the carousel rewinds.
  let unsupported = false

  const shownFirst = (slides: Slide[]) =>
    Math.max(
      0,
      slides.findIndex((slide) => slide.key === firstKey)
    )

  function reset(slides: Slide[]) {
    firstKey = null
    if (!ordered) {
      return
    }
    ordered = false
    clearSlideOrder(slides)
  }

  function rotate(
    to?: { page: number; heading: 1 | -1 },
    { lazy = false } = {}
  ) {
    const motion = options.motion()
    if (!track || !view || !motion || motion.isHeld()) {
      return
    }
    const slides = options.slides()
    const first = shownFirst(slides)
    const position = motion.position()
    const pick = loopRotation(track, view, { position, first }, to, { lazy })
    if (!pick || pick.first === first) {
      return
    }
    const before = options.visual()
    const key = slides[pick.first].key
    firstKey = key
    rotating = true
    try {
      options.measure()
    } finally {
      rotating = false
    }
    // The slides didn't follow the order, and the measure reset it.
    if (firstKey !== key) {
      return
    }
    const after = options.visual()
    motion.shift(position, pick.delta, (index) =>
      index < 0 ? index : after.indexOf(before[index])
    )
  }

  return {
    /** Whether the carousel loops seamlessly now. */
    isActive: () => track !== null,
    /** Whether a rotation is measuring, which keeps the scroll position for it. */
    isRotating: () => rotating,
    /**
     * Writes the slides' order for the current rotation before a measure, and
     * returns the slide shown first, or undefined when it doesn't loop.
     */
    prepare(slides: Slide[], loops: boolean) {
      if (!loops || unsupported) {
        reset(slides)
        return undefined
      }
      const first = shownFirst(slides)
      if (first > 0) {
        writeSlideOrder(slides, first)
        ordered = true
      } else if (ordered) {
        ordered = false
        clearSlideOrder(slides)
      }
      return first
    },
    /**
     * A looping carousel's pages from measured slides, with `first` shown
     * first, or null when it can't loop seamlessly and rewinds instead.
     */
    layout(
      boxes: readonly CarouselSlideBox[],
      next: CarouselLoopView,
      first: number | undefined
    ) {
      view = next
      track = first === undefined ? null : measureTrack(boxes, first)
      if (first && !track) {
        unsupported = true
      }
      if (track && !canLoop(track, view)) {
        track = null
      }
      // A rotation that didn't hold goes back to the slides' own order on the next measure.
      if (first && !track) {
        firstKey = null
      }
      return track && loopPages(track, view, first ?? 0)
    },
    /** Clears the rotation, when the viewport goes. */
    reset(slides: Slide[]) {
      reset(slides)
      unsupported = false
    },
    /**
     * Rotates, if it must, so the page at `index` lies ahead the way the
     * carousel heads: `heading`, the step's way, or else the short way round.
     */
    rotateToward(index: number, heading?: 1 | -1) {
      const motion = options.motion()
      if (!track || !motion) {
        return
      }
      const pages = options.pages()
      const at = motion.position()
      const ahead =
        (index - nearestPage(pages, at) + pages.length) % pages.length
      const way =
        ahead === 0
          ? Math.sign(pages[index].position - at)
          : (heading ?? (ahead <= pages.length / 2 ? 1 : -1))
      rotate({ page: index, heading: way < 0 ? -1 : 1 }, { lazy: true })
    },
    /** Rotates at rest, so the current page sits mid-track. */
    recenter() {
      if (track && !rotating && !options.motion()?.isMoving()) {
        rotate()
      }
    },
  }
}

export { createCarouselLoop }
