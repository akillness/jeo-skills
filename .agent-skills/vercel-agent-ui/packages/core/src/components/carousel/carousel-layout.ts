// Where a carousel's pages are, from its slides' measured layout. Pure, so
// it's unit tested without a DOM. Positions are scroll positions along the
// carousel's axis, from the start edge: right to left counts from the right.
import { clamp } from "../../foundation/number/steps"

/**
 * Where a page lines up in the viewport.
 * @stable
 */
type CarouselAlign = "start" | "center" | "end"

/**
 * How many slides one page holds, or `"auto"` for as many as fit.
 * @stable
 */
type CarouselSlidesPerPage = number | "auto"

/** A slide's place along the axis, from the start of the scrollable area. */
type CarouselSlideBox = { start: number; size: number }

/** What the layout is measured from. */
type CarouselGeometry = {
  slides: readonly CarouselSlideBox[]
  /** The viewport's size along the axis, less its scroll padding: where pages line up. */
  snapport: number
  /** The viewport's scroll padding at the start edge. */
  paddingStart: number
  /** The largest scroll position. */
  maxScroll: number
}

/** One page: the slides that scroll in together, and where it rests. */
type CarouselPage = {
  /** Indexes of the slides it holds, in order. */
  slides: number[]
  /** The scroll position it rests at. */
  position: number
  /** The slide the browser snaps to for this page. */
  leader: number
  /** The leader's scroll margin at the start edge, which lines the page up by `align`. */
  margin: number
}

// Pages closer than this share one position, like the last few slides that
// can't scroll to the start because the content ends.
const mergeDistance = 1

/** Groups slides into pages: `count` at a time, or with `"auto"`, as many as fit in the snapport. */
function groupSlides(
  slides: readonly CarouselSlideBox[],
  snapport: number,
  count: CarouselSlidesPerPage
) {
  const groups: number[][] = []
  if (count !== "auto") {
    const size = Math.max(1, Math.floor(count))
    for (let index = 0; index < slides.length; index += size) {
      groups.push(
        slides.slice(index, index + size).map((_, offset) => index + offset)
      )
    }
    return groups
  }
  for (let index = 0; index < slides.length; index++) {
    const group = groups[groups.length - 1]
    const first = group && slides[group[0]]
    const end = slides[index].start + slides[index].size
    // Half a pixel of slack, since measured sizes carry fractions.
    if (first && end - first.start <= snapport + 0.5) {
      group.push(index)
    } else {
      groups.push([index])
    }
  }
  return groups
}

// How far before the snapport's start a page's first slide sits, so the page lines up by `align`.
function alignOffset(align: CarouselAlign, snapport: number, size: number) {
  if (align === "start") {
    return 0
  }
  return align === "center" ? (snapport - size) / 2 : snapport - size
}

/**
 * The carousel's pages. Each rests where the browser would snap its leader,
 * clamped to the scroll range, and pages that would rest at the same place
 * merge into one, so five slides three to a view make three pages.
 */
function carouselPages(
  geometry: CarouselGeometry,
  options: { align: CarouselAlign; slidesPerPage: CarouselSlidesPerPage }
) {
  const { slides, snapport, paddingStart, maxScroll } = geometry
  const pages: CarouselPage[] = []
  for (const group of groupSlides(slides, snapport, options.slidesPerPage)) {
    const first = slides[group[0]]
    const last = slides[group[group.length - 1]]
    const margin = alignOffset(
      options.align,
      snapport,
      last.start + last.size - first.start
    )
    const position = clamp(first.start - margin - paddingStart, 0, maxScroll)
    const previous = pages[pages.length - 1]
    if (previous && Math.abs(position - previous.position) < mergeDistance) {
      previous.slides.push(...group)
      continue
    }
    pages.push({ slides: [...group], position, leader: group[0], margin })
  }
  return pages
}

/**
 * A looping carousel's slides, wherever its rotation puts them: their sizes
 * in their own order, the gap between neighbors, and where the slide shown
 * first starts. The track wraps, so the last slide's neighbor is the first.
 */
type CarouselTrack = { sizes: number[]; gap: number; start: number }

/** Where a looping carousel puts its pages, besides its track. */
type CarouselLoopView = {
  snapport: number
  paddingStart: number
  maxScroll: number
  align: CarouselAlign
  slidesPerPage: CarouselSlidesPerPage
}

/**
 * Reads a looping track from slides measured with slide `first` shown first.
 * Returns null unless the slides sit in that rotation with even gaps, as when
 * the content doesn't lay out by CSS `order`; the carousel rewinds instead.
 */
function measureTrack(slides: readonly CarouselSlideBox[], first: number) {
  if (slides.length < 2 || !slides[first]) {
    return null
  }
  const lead = slides[first]
  const next = slides[(first + 1) % slides.length]
  const track: CarouselTrack = {
    sizes: slides.map((slide) => slide.size),
    gap: next.start - lead.start - lead.size,
    start: lead.start,
  }
  const placed = placeSlides(track, first)
  return placed.every(
    (box, index) => Math.abs(box.start - slides[index].start) < 1
  )
    ? track
    : null
}

/** Where each slide sits when the track shows slide `first` first. */
function placeSlides(track: CarouselTrack, first: number) {
  const count = track.sizes.length
  const boxes: CarouselSlideBox[] = new Array(count)
  let at = track.start
  for (let step = 0; step < count; step++) {
    const index = (first + step) % count
    boxes[index] = { start: at, size: track.sizes[index] }
    at += track.sizes[index] + track.gap
  }
  return boxes
}

// A looping carousel's pages, grouped in the slides' own order.
function loopGroups(track: CarouselTrack, view: CarouselLoopView) {
  return groupSlides(placeSlides(track, 0), view.snapport, view.slidesPerPage)
}

function loopPage(
  boxes: readonly CarouselSlideBox[],
  group: number[],
  view: CarouselLoopView
) {
  const first = boxes[group[0]]
  const last = boxes[group[group.length - 1]]
  const margin = alignOffset(
    view.align,
    view.snapport,
    last.start + last.size - first.start
  )
  return {
    slides: [...group],
    position: first.start - margin - view.paddingStart,
    leader: group[0],
    margin,
  }
}

/**
 * Whether a track is long enough to loop seamlessly: the scroll range holds a
 * page's step to either side of the current page. Two slides one to a view
 * don't, and the carousel rewinds instead.
 */
function canLoop(track: CarouselTrack, view: CarouselLoopView) {
  const groups = loopGroups(track, view)
  if (groups.length < 2) {
    return false
  }
  const boxes = placeSlides(track, 0)
  const length = track.sizes.reduce((sum, size) => sum + size + track.gap, 0)
  let step = 0
  groups.forEach((group, index) => {
    const next = groups[(index + 1) % groups.length]
    step = Math.max(
      step,
      (boxes[next[0]].start - boxes[group[0]].start + length) % length
    )
  })
  return view.maxScroll >= 2 * step - 1
}

/**
 * A looping carousel's pages with slide `first` shown first, which leads a
 * page, so no page splits where the track wraps. Positions aren't clamped or
 * merged: a loop has no ends, and pages far from the current one may lie
 * past the scroll range until the track rotates again.
 */
function loopPages(
  track: CarouselTrack,
  view: CarouselLoopView,
  first: number
) {
  const boxes = placeSlides(track, first)
  return loopGroups(track, view).map((group) => loopPage(boxes, group, view))
}

/**
 * Picks the slide a looping carousel shows first, among the pages' leaders,
 * so the slides showing at scroll position `at` keep the most room on both
 * sides, and with `to`, the page it heads for rests within the scroll range
 * the way it's heading. Returns that slide and how far the scroll position
 * moves to keep the same slides in view, or null when no rotation fits.
 * The current rotation wins ties, and with `lazy`, wins whenever it fits.
 */
function loopRotation(
  track: CarouselTrack,
  view: CarouselLoopView,
  at: { position: number; first: number },
  to?: { page: number; heading: 1 | -1 },
  { lazy = false } = {}
) {
  const groups = loopGroups(track, view)
  const now = placeSlides(track, at.first)
  // The slide at the snapport's start, which stays in place.
  const edge = at.position + view.paddingStart
  let anchor = at.first
  now.forEach((box, index) => {
    if (box.start <= edge + 0.5 && box.start > now[anchor].start) {
      anchor = index
    }
  })
  const leaders = groups.map((group) => group[0])
  if (leaders.includes(at.first)) {
    leaders.unshift(at.first)
  }
  let best: { first: number; delta: number; room: number } | null = null
  for (const first of leaders) {
    const boxes = first === at.first ? now : placeSlides(track, first)
    const delta = boxes[anchor].start - now[anchor].start
    const position = at.position + delta
    let room = Math.min(position, view.maxScroll - position)
    if (to) {
      const target = loopPage(boxes, groups[to.page], view).position
      // It must lie the way the carousel heads, or right where it is.
      if ((target - position) * to.heading < -0.5) {
        continue
      }
      room = Math.min(room, target, view.maxScroll - target)
    }
    if (room < -0.5) {
      continue
    }
    if (!best || room > best.room + 0.5) {
      best = { first, delta, room }
    }
    if (lazy && first === at.first) {
      break
    }
  }
  return best && { first: best.first, delta: best.delta }
}

/** The index of the page resting nearest `position`, or -1 without pages. */
function nearestPage(pages: readonly { position: number }[], position: number) {
  let best = -1
  for (let index = 0; index < pages.length; index++) {
    if (
      best === -1 ||
      Math.abs(pages[index].position - position) <
        Math.abs(pages[best].position - position)
    ) {
      best = index
    }
  }
  return best
}

/**
 * Whether a slide counts as in view at `position`: at least half of it shows,
 * or, for a slide larger than the viewport, it fills at least half of it.
 */
function isSlideInView(
  slide: CarouselSlideBox,
  position: number,
  viewport: number
) {
  const shown =
    Math.min(slide.start + slide.size, position + viewport) -
    Math.max(slide.start, position)
  return shown >= Math.min(slide.size, viewport) / 2 - 0.5
}

/** The page after or before `page` (from 1), wrapping with `loop`. Returns `page` at an end. */
function stepPage(page: number, by: 1 | -1, count: number, loop: boolean) {
  const next = page + by
  if (next >= 1 && next <= count) {
    return next
  }
  if (!loop || count < 2) {
    return page
  }
  return next < 1 ? count : 1
}

export {
  canLoop,
  type CarouselAlign,
  type CarouselGeometry,
  type CarouselLoopView,
  type CarouselPage,
  carouselPages,
  type CarouselSlideBox,
  type CarouselSlidesPerPage,
  type CarouselTrack,
  groupSlides,
  isSlideInView,
  loopPages,
  loopRotation,
  measureTrack,
  nearestPage,
  placeSlides,
  stepPage,
}
