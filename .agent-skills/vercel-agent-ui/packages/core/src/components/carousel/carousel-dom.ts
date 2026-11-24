// What a carousel reads from and writes to its slides: their layout, their
// "1 of 5" labels, their snap areas, and the CSS order that rotates a looping
// track. The decisions are in `carousel-layout.ts`.
import type { CarouselPage } from "./carousel-layout"
import type { CarouselAxis } from "./carousel-motion"
import { layoutOrigin, layoutSize } from "../../foundation/platform/layout"

type Slide = { el: HTMLElement; key: string }

const px = (value: string) => parseFloat(value) || 0

/** Reads each slide's place along the axis, and the viewport's size, range and scroll padding. */
function readCarouselLayout(
  viewport: HTMLElement,
  slides: readonly Slide[],
  axis: CarouselAxis
) {
  const { vertical, rtl } = axis
  const style = getComputedStyle(viewport)
  const size = vertical ? viewport.clientHeight : viewport.clientWidth
  // From layout offsets, so a dialog scaling in around the carousel doesn't skew them.
  const origin = layoutOrigin(viewport)
  return {
    slides: slides.map(({ el, key }) => {
      const at = layoutOrigin(el)
      const box = layoutSize(el)
      const left = at.x - origin.x - viewport.clientLeft
      const top = at.y - origin.y - viewport.clientTop
      if (vertical) {
        return { key, box: { start: top, size: box.height } }
      }
      return {
        key,
        box: { start: rtl ? size - left - box.width : left, size: box.width },
      }
    }),
    viewportSize: size,
    maxScroll: Math.max(
      0,
      (vertical ? viewport.scrollHeight : viewport.scrollWidth) - size
    ),
    paddingStart: px(
      vertical
        ? style.scrollPaddingTop
        : rtl
          ? style.scrollPaddingRight
          : style.scrollPaddingLeft
    ),
    paddingEnd: px(
      vertical
        ? style.scrollPaddingBottom
        : rtl
          ? style.scrollPaddingLeft
          : style.scrollPaddingRight
    ),
  }
}

/**
 * Lays the slides out from slide `first` with CSS `order`, the rest after it
 * in their own order, so a looping track rotates without moving any element
 * in the document. Focus, Tab and screen readers keep the slides' own order.
 */
function writeSlideOrder(slides: readonly Slide[], first: number) {
  slides.forEach(({ el }, index) => {
    const order = (index - first + slides.length) % slides.length
    if (order) {
      el.style.order = String(order)
    } else {
      el.style.removeProperty("order")
    }
  })
}

function clearSlideOrder(slides: readonly Slide[]) {
  for (const { el } of slides) {
    el.style.removeProperty("order")
  }
}

/**
 * Groups snap at their first slide, with a scroll margin that lines the
 * group up, so the browser's snap points are the pages. With one slide to a
 * page, every slide snaps by `align`, written on the server, so this is skipped.
 */
function writeSnapAreas(
  slides: readonly Slide[],
  pages: readonly CarouselPage[],
  vertical: boolean
) {
  const [marginProperty, crossProperty] = vertical
    ? snapMargins
    : [snapMargins[1], snapMargins[0]]
  const leaders = new Map(pages.map((page) => [page.leader, page.margin]))
  slides.forEach(({ el }, index) => {
    el.style.removeProperty(crossProperty)
    const margin = leaders.get(index)
    if (margin === undefined) {
      el.style.setProperty("scroll-snap-align", "none")
      el.style.removeProperty(marginProperty)
      return
    }
    el.style.setProperty("scroll-snap-align", "start")
    el.style.setProperty(marginProperty, `${Math.round(margin * 100) / 100}px`)
  })
}

const snapMargins = [
  "scroll-margin-block-start",
  "scroll-margin-inline-start",
] as const

// Back to one slide a page, each slide snaps by `align` again. The style
// attribute already says so, and a renderer doesn't write it twice.
function clearSnapAreas(slides: readonly Slide[], align: string) {
  for (const { el } of slides) {
    el.style.setProperty("scroll-snap-align", align)
    for (const property of snapMargins) {
      el.style.removeProperty(property)
    }
  }
}

// The "1 of 5" labels the carousel wrote, so binding again knows them from an author's.
const ownLabels = new WeakMap<Element, string>()

/**
 * Labels a slide "1 of 5" unless the author named it, again whenever the
 * slides change. A label written by an earlier bind, like StrictMode's, is
 * still ours.
 */
function labelSlide(
  el: HTMLElement,
  key: string,
  store: {
    get: () => { order: string[] }
    subscribe: (listener: () => void) => () => void
  }
) {
  const own = ownLabels.get(el)
  const authored =
    el.hasAttribute("aria-labelledby") ||
    (el.hasAttribute("aria-label") && el.getAttribute("aria-label") !== own)
  if (authored) {
    return () => {}
  }
  let labelled: string[] | undefined
  const label = () => {
    const { order } = store.get()
    if (order === labelled) {
      return
    }
    labelled = order
    const index = order.indexOf(key)
    if (index < 0) {
      return
    }
    const text = `${index + 1} of ${order.length}`
    ownLabels.set(el, text)
    if (el.getAttribute("aria-label") !== text) {
      el.setAttribute("aria-label", text)
    }
  }
  label()
  return store.subscribe(label)
}

export {
  clearSlideOrder,
  clearSnapAreas,
  labelSlide,
  readCarouselLayout,
  writeSlideOrder,
  writeSnapAreas,
}
