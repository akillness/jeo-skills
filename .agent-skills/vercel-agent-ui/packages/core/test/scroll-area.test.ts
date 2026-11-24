import { describe, expect, test } from "vitest"
import {
  createScrollAreaController,
  scrollArea,
} from "../src/components/scroll-area/scroll-area"
import {
  draggedPosition,
  edgesOf,
  followsEnd,
  minThumbSize,
  overflows,
  pageDirection,
  pageLength,
  positionAt,
  scrollbarShown,
  scrollsTowardStart,
  thumbGeometry,
  wheelPixels,
} from "../src/components/scroll-area/scroll-area-model"
import { attrs, liveAttrs, partState } from "../src/foundation/kernel/part"
import { kept } from "./kept"

const list = { position: 0, client: 200, scroll: 1000 }

describe("scroll area geometry", () => {
  test("a thumb is as long as the visible share of the content", () => {
    expect(thumbGeometry(list, 200)).toEqual({ size: 40, offset: 0 })
  })

  test("a thumb moves along the rest of the track as the content scrolls", () => {
    expect(thumbGeometry({ ...list, position: 400 }, 200).offset).toBe(80)
    expect(thumbGeometry({ ...list, position: 800 }, 200).offset).toBe(160)
  })

  test("a thumb never shrinks below the minimum, and still reaches the end", () => {
    const long = { position: 99_800, client: 200, scroll: 100_000 }
    expect(thumbGeometry(long, 200)).toEqual({
      size: minThumbSize,
      offset: 200 - minThumbSize,
    })
  })

  test("a rubber band past either end keeps the thumb in the track", () => {
    expect(thumbGeometry({ ...list, position: -50 }, 200).offset).toBe(0)
    expect(thumbGeometry({ ...list, position: 900 }, 200).offset).toBe(160)
  })

  test("a thumb without a track or content has no size", () => {
    expect(thumbGeometry(list, 0)).toEqual({ size: 0, offset: 0 })
    expect(thumbGeometry({ position: 0, client: 0, scroll: 0 }, 200)).toEqual({
      size: 0,
      offset: 0,
    })
  })

  test("dragging the thumb scrolls as far along the content as along the track", () => {
    expect(draggedPosition(0, 80, list, 200)).toBe(400)
    expect(draggedPosition(400, -1000, list, 200)).toBe(0)
    expect(draggedPosition(400, 1000, list, 200)).toBe(800)
  })

  test("a thumb as long as its track doesn't move or divide by zero", () => {
    expect(
      draggedPosition(0, 50, { position: 0, client: 200, scroll: 200 }, 200)
    ).toBe(0)
    expect(positionAt(50, { position: 0, client: 200, scroll: 200 }, 200)).toBe(
      0
    )
  })

  test("a point on the track centers the thumb there", () => {
    expect(positionAt(100, list, 200)).toBe(400)
    expect(positionAt(0, list, 200)).toBe(0)
    expect(positionAt(200, list, 200)).toBe(800)
  })

  test("a press before or after the thumb pages that way, and on it doesn't", () => {
    const thumb = { offset: 80, size: 40 }
    expect(pageDirection(10, thumb)).toBe(-1)
    expect(pageDirection(150, thumb)).toBe(1)
    expect(pageDirection(100, thumb)).toBe(0)
    expect(pageLength(200)).toBe(175)
  })
})

describe("scroll area edges", () => {
  test("content within a pixel of an edge is at that edge", () => {
    expect(edgesOf({ ...list, position: 0.6 }).atStart).toBe(true)
    expect(edgesOf({ ...list, position: 799.4 }).atEnd).toBe(true)
    expect(edgesOf({ ...list, position: 798 }).atEnd).toBe(false)
  })

  test("edges report the distance to each end and the progress", () => {
    expect(edgesOf({ ...list, position: 200 })).toEqual({
      before: 200,
      after: 600,
      atStart: false,
      atEnd: false,
      progress: 0.25,
    })
  })

  test("content that fits is at both ends and doesn't overflow", () => {
    const fits = { position: 0, client: 200, scroll: 200.4 }
    expect(overflows(fits)).toBe(false)
    expect(edgesOf(fits)).toMatchObject({
      atStart: true,
      atEnd: true,
      before: 0,
      after: 0,
      progress: 0,
    })
    expect(overflows(list)).toBe(true)
  })

  test("a Firefox wheel in lines or pages scrolls as far as one in pixels", () => {
    expect(wheelPixels(3, 1, 16, 200)).toBe(48)
    expect(wheelPixels(1, 2, 16, 200)).toBe(200)
    expect(wheelPixels(53, 0, 16, 200)).toBe(53)
  })
})

describe("scrollbar visibility", () => {
  const idle = {
    overflow: true,
    hovering: false,
    scrolling: false,
    dragging: false,
  }

  test("always shows even without overflow", () => {
    expect(scrollbarShown("always", { ...idle, overflow: false })).toBe(true)
  })

  test("auto shows whenever there's overflow", () => {
    expect(scrollbarShown("auto", idle)).toBe(true)
    expect(scrollbarShown("auto", { ...idle, overflow: false })).toBe(false)
  })

  test("scroll shows while scrolling or dragging, not on hover", () => {
    expect(scrollbarShown("scroll", idle)).toBe(false)
    expect(scrollbarShown("scroll", { ...idle, hovering: true })).toBe(false)
    expect(scrollbarShown("scroll", { ...idle, scrolling: true })).toBe(true)
    expect(scrollbarShown("scroll", { ...idle, dragging: true })).toBe(true)
  })

  test("hover shows on hover too, but never without overflow", () => {
    expect(scrollbarShown("hover", { ...idle, hovering: true })).toBe(true)
    expect(
      scrollbarShown("hover", { ...idle, hovering: true, overflow: false })
    ).toBe(false)
  })
})

describe("sticking to the end", () => {
  test("moving away from the end lets go, whatever moved it", () => {
    expect(followsEnd(true, { delta: -40, after: 40 })).toBe(false)
  })

  test("content growing or the end being reached keeps following", () => {
    expect(followsEnd(true, { delta: 0, after: 300 })).toBe(true)
    expect(followsEnd(true, { delta: 120, after: 0 })).toBe(true)
    // Content shrinking clamps the position toward the start, at the end.
    expect(followsEnd(true, { delta: -100, after: 0 })).toBe(true)
  })

  test("reaching the end while moving toward it follows again, and nothing else does", () => {
    expect(followsEnd(false, { delta: 30, after: 0.5 })).toBe(true)
    expect(followsEnd(false, { delta: 30, after: 20 })).toBe(false)
    expect(followsEnd(false, { delta: -100, after: 0 })).toBe(false)
  })

  test("keys that scroll toward the start let go, but not while typing", () => {
    expect(scrollsTowardStart("PageUp", false, false)).toBe(true)
    expect(scrollsTowardStart("ArrowUp", false, false)).toBe(true)
    expect(scrollsTowardStart(" ", true, false)).toBe(true)
    expect(scrollsTowardStart(" ", false, false)).toBe(false)
    expect(scrollsTowardStart("ArrowUp", false, true)).toBe(false)
  })
})

describe("scroll area parts", () => {
  test("the server assumes custom scrollbars, so native ones never flash", () => {
    const area = scrollArea({ id: "a" })
    expect(attrs(area.part("viewport")).style).toContain("scrollbar-width:none")
    expect(attrs(area.part("viewport")).style).toContain("overflow:auto")
  })

  test("scrollbars are hidden from assistive technology and hidden without overflow", () => {
    const area = scrollArea({ id: "a" })
    expect(attrs(area.part("scrollbar"))["aria-hidden"]).toBe("true")
    expect(attrs(area.part("scrollbar")).style).toContain("display:none")
    expect(attrs(area.part("corner"))["aria-hidden"]).toBe("true")
  })

  test("type always shows the scrollbar even without overflow", () => {
    const area = scrollArea({ id: "a", type: "always" })
    expect(attrs(area.part("scrollbar")).style).not.toContain("display:none")
  })

  test("a horizontal scrollbar runs along the bottom, short of the corner", () => {
    const area = scrollArea({ id: "a" })
    const style = attrs(
      area.part("scrollbar", { orientation: "horizontal" })
    ).style
    expect(style).toContain("bottom:0")
    expect(style).toContain(
      "inset-inline-end:var(--scroll-area-corner-width,0px)"
    )
    expect(
      attrs(area.part("scrollbar", { orientation: "horizontal" }))[
        "data-orientation"
      ]
    ).toBe("horizontal")
  })

  test("sticking to the end, it follows from the start, and its button starts hidden", () => {
    const area = scrollArea({ id: "a", stickToEnd: true })
    expect(area.api.isSticking()).toBe(true)
    expect(liveAttrs(area.part("scroll-to-end"))).toMatchObject({ inert: "" })
    expect(partState(area.part("root"))).toMatchObject({
      sticking: true,
      atEnd: true,
    })
  })

  test("a controller reads the area it's attached to", () => {
    const controller = createScrollAreaController()
    kept(scrollArea({ id: "a", controller }))
    expect(controller.isAtEnd()).toBe(true)
    expect(controller.isSticking()).toBe(false)
  })
})
