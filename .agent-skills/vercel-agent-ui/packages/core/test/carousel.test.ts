import { describe, expect, test, vi } from "vitest"
import { createAutoplay } from "../src/components/carousel/carousel-autoplay"
import {
  carouselPages,
  groupSlides,
  isSlideInView,
  canLoop,
  loopPages,
  loopRotation,
  measureTrack,
  nearestPage,
  placeSlides,
  stepPage,
  type CarouselSlideBox,
} from "../src/components/carousel/carousel-layout"
import {
  carousel,
  createCarouselController,
} from "../src/components/carousel/carousel"
import { attachController } from "../src/foundation/kernel/controller"
import { attrs } from "../src/foundation/kernel/part"

// Slides `size` px wide with `gap` px between them, from 0.
function row(count: number, size: number, gap = 0): CarouselSlideBox[] {
  return Array.from({ length: count }, (_, index) => ({
    start: index * (size + gap),
    size,
  }))
}

function geometry(
  slides: CarouselSlideBox[],
  viewport: number,
  paddingStart = 0,
  paddingEnd = 0
) {
  const last = slides[slides.length - 1]
  return {
    slides,
    snapport: viewport - paddingStart - paddingEnd,
    paddingStart,
    maxScroll: Math.max(0, last.start + last.size - viewport),
  }
}

describe("loop", () => {
  // Five slides 300px wide in a 300px viewport, one to a page.
  const view = {
    snapport: 300,
    paddingStart: 0,
    maxScroll: 1200,
    align: "start" as const,
    slidesPerPage: 1,
  }

  test("reads the track from any rotation, and refuses a layout that isn't one", () => {
    const track = measureTrack(row(5, 300, 10), 0)
    expect(track).toEqual({
      sizes: [300, 300, 300, 300, 300],
      gap: 10,
      start: 0,
    })
    // Slide 3 shown first, as CSS order lays it out.
    const rotated = placeSlides(track!, 3)
    expect(rotated.map((box) => box.start)).toEqual([620, 930, 1240, 0, 310])
    expect(measureTrack(rotated, 3)).toEqual(track)
    // Order that didn't apply leaves the slides where they were.
    expect(measureTrack(row(5, 300, 10), 3)).toBeNull()
    expect(measureTrack(row(1, 300), 0)).toBeNull()
  })

  test("pages keep their slides' own order wherever the track starts", () => {
    const track = measureTrack(row(5, 300), 0)!
    const pages = loopPages(track, view, 3)
    expect(pages.map((page) => page.leader)).toEqual([0, 1, 2, 3, 4])
    expect(pages.map((page) => page.position)).toEqual([600, 900, 1200, 0, 300])
  })

  test("at rest, the current page moves mid-track with the same slides in view", () => {
    const track = measureTrack(row(5, 300), 0)!
    // Page 1 at the start: three rotations put it in the middle, and the first wins.
    expect(loopRotation(track, view, { position: 0, first: 0 })).toEqual({
      first: 3,
      delta: 600,
    })
    // Already in the middle, it stays.
    expect(loopRotation(track, view, { position: 600, first: 3 })).toEqual({
      first: 3,
      delta: 0,
    })
  })

  test("a step past the end rotates only when the next page doesn't lie ahead", () => {
    const track = measureTrack(row(5, 300), 0)!
    // On page 5 at the end of an unrotated track, Next heads for page 1.
    expect(
      loopRotation(
        track,
        view,
        { position: 1200, first: 0 },
        { page: 0, heading: 1 },
        { lazy: true }
      )
    ).toEqual({
      first: 2,
      delta: -600,
    })
    // On page 3 mid-track, page 4 lies ahead already.
    expect(
      loopRotation(
        track,
        view,
        { position: 600, first: 0 },
        { page: 3, heading: 1 },
        { lazy: true }
      )
    ).toEqual({ first: 0, delta: 0 })
  })

  test("loops seamlessly only with a page's step of room to either side", () => {
    expect(
      canLoop(measureTrack(row(3, 300), 0)!, { ...view, maxScroll: 600 })
    ).toBe(true)
    // Two slides one to a view rewind.
    expect(
      canLoop(measureTrack(row(2, 300), 0)!, { ...view, maxScroll: 300 })
    ).toBe(false)
    // Five slides three to a view, in pages of one: a 200px range holds 100px each way.
    expect(
      canLoop(measureTrack(row(5, 100), 0)!, { ...view, maxScroll: 200 })
    ).toBe(true)
  })

  test("a track too short to rotate gives no rotation", () => {
    // Two slides three to a view: nothing fits on either side.
    const track = measureTrack(row(2, 100), 0)!
    const wide = { ...view, snapport: 300, maxScroll: 0 }
    expect(
      loopRotation(
        track,
        wide,
        { position: 0, first: 0 },
        { page: 1, heading: -1 }
      )
    ).toBeNull()
  })
})

describe("pages", () => {
  test("one slide to a viewport makes one page per slide", () => {
    const pages = carouselPages(geometry(row(5, 300), 300), {
      align: "start",
      slidesPerPage: 1,
    })
    expect(pages.map((page) => page.position)).toEqual([0, 300, 600, 900, 1200])
    expect(pages.map((page) => page.slides)).toEqual([[0], [1], [2], [3], [4]])
  })

  test("pages that can't reach the start merge, like the last slides of a full row", () => {
    const pages = carouselPages(geometry(row(5, 100), 300), {
      align: "start",
      slidesPerPage: 1,
    })
    expect(pages.map((page) => page.position)).toEqual([0, 100, 200])
    expect(pages[2].slides).toEqual([2, 3, 4])
  })

  test("groups page together and line up at their first slide", () => {
    const pages = carouselPages(geometry(row(6, 100), 300), {
      align: "start",
      slidesPerPage: 3,
    })
    expect(pages.map((page) => page.position)).toEqual([0, 300])
    expect(pages.map((page) => page.leader)).toEqual([0, 3])
  })

  test("auto fits as many slides as the snapport shows", () => {
    expect(groupSlides(row(7, 100, 10), 320, "auto")).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6],
    ])
    // A slide wider than the snapport still makes a page of its own.
    expect(
      groupSlides(
        [
          { start: 0, size: 500 },
          { start: 500, size: 100 },
        ],
        320,
        "auto"
      )
    ).toEqual([[0], [1]])
  })

  test("centered pages sit in the middle, with a margin that lines up the browser's snap", () => {
    const pages = carouselPages(geometry(row(5, 200), 300), {
      align: "center",
      slidesPerPage: 1,
    })
    expect(pages[0]).toMatchObject({ position: 0, margin: 50 })
    expect(pages[1]).toMatchObject({ position: 150, margin: 50 })
    expect(pages.map((page) => page.position)).toEqual([0, 150, 350, 550, 700])
  })

  test("end alignment lines a page up with the viewport's end", () => {
    const pages = carouselPages(geometry(row(4, 100), 250), {
      align: "end",
      slidesPerPage: 1,
    })
    expect(pages.map((page) => page.position)).toEqual([0, 50, 150])
  })

  test("scroll padding moves where pages line up", () => {
    const pages = carouselPages(geometry(row(4, 200), 300, 20, 20), {
      align: "start",
      slidesPerPage: 1,
    })
    expect(pages.map((page) => page.position)).toEqual([0, 180, 380, 500])
  })

  test("the nearest page wins, and none without pages", () => {
    const pages = [{ position: 0 }, { position: 300 }, { position: 600 }]
    expect(nearestPage(pages, 140)).toBe(0)
    expect(nearestPage(pages, 160)).toBe(1)
    expect(nearestPage(pages, 900)).toBe(2)
    expect(nearestPage([], 10)).toBe(-1)
  })
})

describe("slides in view", () => {
  test("a slide counts once at least half of it shows", () => {
    const slide = { start: 300, size: 300 }
    expect(isSlideInView(slide, 0, 300)).toBe(false)
    expect(isSlideInView(slide, 140, 300)).toBe(false)
    expect(isSlideInView(slide, 150, 300)).toBe(true)
    expect(isSlideInView(slide, 300, 300)).toBe(true)
  })

  test("a slide larger than the viewport counts once it fills half of it", () => {
    const slide = { start: 0, size: 1000 }
    expect(isSlideInView(slide, 500, 300)).toBe(true)
    expect(isSlideInView(slide, 850, 300)).toBe(true)
    expect(isSlideInView(slide, 860, 300)).toBe(false)
  })
})

describe("stepping", () => {
  test("stops at the ends, or wraps with loop", () => {
    expect(stepPage(3, 1, 3, false)).toBe(3)
    expect(stepPage(1, -1, 3, false)).toBe(1)
    expect(stepPage(3, 1, 3, true)).toBe(1)
    expect(stepPage(1, -1, 3, true)).toBe(3)
    expect(stepPage(2, 1, 3, false)).toBe(3)
    // One page has nowhere to go, even with loop.
    expect(stepPage(1, 1, 1, true)).toBe(1)
  })
})

describe("rotation timer", () => {
  function timer() {
    vi.useFakeTimers()
    const ticks: number[] = []
    const paused: boolean[] = []
    const autoplay = createAutoplay({
      interval: () => 1000,
      onTick: () => ticks.push(Date.now()),
      onPausedChange: (value) => paused.push(value),
      now: () => Date.now(),
    })
    return { autoplay, ticks, paused }
  }

  test("ticks once per interval while running", () => {
    const { autoplay, ticks } = timer()
    autoplay.setRunning(true)
    vi.advanceTimersByTime(3500)
    expect(ticks).toHaveLength(3)
    autoplay.setRunning(false)
    vi.advanceTimersByTime(3000)
    expect(ticks).toHaveLength(3)
    vi.useRealTimers()
  })

  test("a pause keeps the time left on the page", () => {
    const { autoplay, ticks, paused } = timer()
    autoplay.setRunning(true)
    vi.advanceTimersByTime(600)
    autoplay.setPaused("hover", true)
    vi.advanceTimersByTime(5000)
    expect(ticks).toHaveLength(0)
    autoplay.setPaused("hover", false)
    vi.advanceTimersByTime(399)
    expect(ticks).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(ticks).toHaveLength(1)
    expect(paused).toEqual([true, false])
    vi.useRealTimers()
  })

  test("pauses stack: it resumes once every cause has gone", () => {
    const { autoplay, ticks } = timer()
    autoplay.setRunning(true)
    autoplay.setPaused("hover", true)
    autoplay.setPaused("hidden", true)
    autoplay.setPaused("hover", false)
    vi.advanceTimersByTime(2000)
    expect(ticks).toHaveLength(0)
    expect(autoplay.isPaused()).toBe(true)
    autoplay.setPaused("hidden", false)
    vi.advanceTimersByTime(1000)
    expect(ticks).toHaveLength(1)
    vi.useRealTimers()
  })

  test("a page change gives the new page a full interval", () => {
    const { autoplay, ticks } = timer()
    autoplay.setRunning(true)
    vi.advanceTimersByTime(900)
    autoplay.restart()
    vi.advanceTimersByTime(900)
    expect(ticks).toHaveLength(0)
    vi.advanceTimersByTime(100)
    expect(ticks).toHaveLength(1)
    vi.useRealTimers()
  })
})

describe("server render", () => {
  test("renders the carousel pattern's roles before anything is measured", () => {
    const instance = carousel({ id: "c" })
    expect(attrs(instance.part("root"))).toMatchObject({
      role: "region",
      "aria-roledescription": "carousel",
    })
    expect(attrs(instance.part("item", { id: "a" }))).toMatchObject({
      role: "group",
      "aria-roledescription": "slide",
    })
    expect(attrs(instance.part("content"))).toMatchObject({
      id: "c-content",
      "aria-live": "polite",
    })
  })

  test("the viewport and slides snap natively, so they page before hydration", () => {
    const instance = carousel({ id: "c", align: "center" })
    expect(attrs(instance.part("viewport")).style).toContain(
      "scroll-snap-type:x mandatory"
    )
    expect(attrs(instance.part("item", { id: "a" })).style).toContain(
      "scroll-snap-align:center"
    )
    expect(attrs(instance.part("item", { id: "a" })).style).toContain(
      "scroll-snap-stop:always"
    )
    const free = carousel({ id: "d", skipSnaps: true, slidesPerPage: 2 })
    expect(attrs(free.part("item", { id: "a" })).style).not.toContain(
      "scroll-snap"
    )
  })

  test("Previous starts disabled and Next enabled, both still focusable", () => {
    const instance = carousel({ id: "c" })
    expect(attrs(instance.part("previous"))).toMatchObject({
      "aria-disabled": "true",
      type: "button",
    })
    expect(attrs(instance.part("previous")).disabled).toBeUndefined()
    expect(attrs(instance.part("next"))["aria-disabled"]).toBeUndefined()
  })

  test("indicators with a page select it, and the selected one holds the tab stop", () => {
    const instance = carousel({ id: "c", defaultPage: 2 })
    expect(
      attrs(instance.part("indicator", { id: "a", page: 1 }))
    ).toMatchObject({
      role: "tab",
      "aria-selected": "false",
      tabindex: "-1",
    })
    expect(
      attrs(instance.part("indicator", { id: "b", page: 2 }))
    ).toMatchObject({
      "aria-selected": "true",
      tabindex: "0",
    })
  })

  test("rotation turns the live region off", () => {
    const instance = carousel({ id: "c", defaultPlaying: true })
    expect(attrs(instance.part("content"))["aria-live"]).toBe("off")
    expect(attrs(instance.part("root"))["data-playing"]).toBe("")
  })
})

describe("controller", () => {
  test("pages before measuring, and reports why", () => {
    const controller = createCarouselController()
    const onPageChange = vi.fn()
    const instance = carousel({ id: "c", controller, onPageChange })
    attachController(controller, instance.api)
    expect(controller.getPageCount()).toBeNull()
    expect(controller.next()).toBe(true)
    expect(controller.getPage()).toBe(2)
    expect(onPageChange).toHaveBeenLastCalledWith(
      2,
      expect.objectContaining({ reason: "imperative" })
    )
    expect(controller.previous({ reason: "previous-press" })).toBe(true)
    expect(onPageChange).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ reason: "previous-press" })
    )
    expect(controller.previous()).toBe(false)
  })

  test("before measuring, there's always a next page, no previous one on the first, and no progress", () => {
    const controller = createCarouselController()
    const instance = carousel({ id: "c", controller, loop: true })
    attachController(controller, instance.api)
    expect(controller.canNext()).toBe(true)
    expect(controller.canPrevious()).toBe(false)
    expect(controller.getProgress()).toBe(0)
  })

  test("a canceled change stays on the page", () => {
    const controller = createCarouselController()
    const instance = carousel({
      id: "c",
      controller,
      onPageChange: (_page, details) => details.cancel(),
    })
    attachController(controller, instance.api)
    expect(controller.setPage(3)).toBe(false)
    expect(controller.getPage()).toBe(1)
  })

  test("paging by the user stops rotation, with the same reason", () => {
    const onPlayingChange = vi.fn()
    const instance = carousel({
      id: "c",
      defaultPlaying: true,
      onPlayingChange,
    })
    instance.api.next({ reason: "next-press" })
    expect(instance.api.isPlaying()).toBe(false)
    expect(onPlayingChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: "next-press" })
    )
  })

  test("a controller's paging leaves rotation running", () => {
    const instance = carousel({ id: "c", defaultPlaying: true })
    instance.api.next()
    expect(instance.api.isPlaying()).toBe(true)
  })
})
