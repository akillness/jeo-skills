// @vitest-environment jsdom
// The blocks under calendars, spreadsheets, croppers and mail lists: ranges
// on tracks, ranges of cells, boxes resized by their edges, and rows swiped
// aside to their actions. Through the public entry only.
import { afterEach, describe, expect, test, vi } from "vitest"
import { setAnnouncer } from "../src/foundation/platform/announce"
import {
  cellsToText,
  createCellRange,
  createGridFocus,
  createResize,
  createSpans,
  createSwipeActions,
  definePrimitive,
  isSpanFree,
  stackSpans,
  textToCells,
  type CellRange,
  type GridCell,
  type ResizeBox,
  type ResizeDraft,
  type SwipeDraft,
  type SwipeOpen,
  type Span,
  type SpansDraft,
} from "../src/index"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

const key = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", {
    key,
    cancelable: true,
    bubbles: true,
    ...init,
  })

const pointer = (type: string, clientX: number, clientY: number) =>
  new PointerEvent(type, {
    clientX,
    clientY,
    button: 0,
    isPrimary: true,
    bubbles: true,
    cancelable: true,
  })

// An element at a fixed place, as jsdom has no layout.
function box(
  left: number,
  top: number,
  width: number,
  height: number,
  parent: Element = document.body
) {
  const el = document.createElement("div")
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }) as DOMRect
  parent.append(el)
  return el
}

describe("stackSpans and isSpanFree", () => {
  test("overlapping spans share their track's width, and touching ones don't overlap", () => {
    const lanes = stackSpans([
      { id: "a", track: "mon", start: 0, end: 60 },
      { id: "b", track: "mon", start: 30, end: 90 },
      { id: "c", track: "mon", start: 60, end: 120 },
      { id: "d", track: "mon", start: 120, end: 180 },
      { id: "e", track: "tue", start: 30, end: 60 },
    ])
    expect(Object.fromEntries(lanes)).toEqual({
      a: { lane: 0, lanes: 2 },
      b: { lane: 1, lanes: 2 },
      // c starts where a ends, so it takes a's lane.
      c: { lane: 0, lanes: 2 },
      d: { lane: 0, lanes: 1 },
      e: { lane: 0, lanes: 1 },
    })
    const spans = [{ id: "a", track: "mon", start: 0, end: 60 }]
    expect(
      isSpanFree(spans, { id: "b", track: "mon", start: 60, end: 90 })
    ).toBe(true)
    expect(
      isSpanFree(spans, { id: "b", track: "mon", start: 59, end: 90 })
    ).toBe(false)
    expect(
      isSpanFree(spans, { id: "b", track: "tue", start: 0, end: 90 })
    ).toBe(true)
  })
})

describe("createSpans", () => {
  type Event = Span & { title: string }
  type CalendarState = { events: Event[]; draft: SpansDraft<Event> | null }
  let made = 0
  const calendar = definePrimitive({
    name: "calendar",
    options: { events: "value", overlap: "boolean" },
    state: (options: {
      events: Event[]
      overlap?: boolean
    }): CalendarState => ({
      events: options.events,
      draft: null,
    }),
    sync: (options) => ({ events: options.events }),
    api: (context) => {
      const set = vi.fn((value: Event[], _details: object) => {
        context.store.set({ events: value })
        return true
      })
      const spans = createSpans<CalendarState, Event>(context, {
        key: "events",
        draft: "draft",
        set,
        min: () => 0,
        max: () => 1440,
        step: () => 15,
        size: () => 60,
        tracks: () => ["mon", "tue", "wed"],
        overlap: context.options().overlap,
        createAutoScroll: false,
        create: (span) => ({
          ...span,
          id: `new-${++made}`,
          title: "New event",
        }),
        label: (span) =>
          `${span.title}, ${span.track} ${span.start} to ${span.end}`,
      })
      return { spans, set }
    },
    slots: (slot) => ({
      span: slot<{ value: string }>({ props: { value: "string" } }),
    }),
  })

  const standup: Event = {
    id: "a",
    track: "mon",
    start: 540,
    end: 570,
    title: "Standup",
  }

  test("arrows move a span a step, Shift moves its end, across moves its day, each in one change", () => {
    const instance = calendar({ id: "c", events: [standup] })
    cleanups.push(() => instance.destroy())
    const { spans, set } = instance.api
    spans.keydown(key("ArrowDown"), "a")
    expect(instance.get().events[0]).toMatchObject({ start: 555, end: 585 })
    spans.keydown(key("ArrowDown", { shiftKey: true }), "a")
    expect(instance.get().events[0]).toMatchObject({ start: 555, end: 600 })
    // The end never comes closer to the start than a step.
    spans.keydown(key("ArrowUp", { shiftKey: true }), "a")
    spans.keydown(key("ArrowUp", { shiftKey: true }), "a")
    spans.keydown(key("ArrowUp", { shiftKey: true }), "a")
    expect(instance.get().events[0]).toMatchObject({ start: 555, end: 570 })
    spans.keydown(key("ArrowRight"), "a")
    expect(instance.get().events[0].track).toBe("tue")
    expect(set).toHaveBeenCalledTimes(5)
    expect(set.mock.calls.at(-1)![1]).toMatchObject({
      reason: "move-key",
      id: "a",
      action: "move",
    })
    spans.keydown(key("Delete"), "a")
    expect(instance.get().events).toEqual([])
  })

  test("a span can't overlap another when overlap is off", () => {
    const instance = calendar({
      id: "c",
      overlap: false,
      events: [
        standup,
        { id: "b", track: "mon", start: 600, end: 660, title: "Review" },
      ],
    })
    cleanups.push(() => instance.destroy())
    const { spans } = instance.api
    spans.keydown(key("ArrowDown"), "a")
    spans.keydown(key("ArrowDown"), "a")
    expect(instance.get().events[0]).toMatchObject({ start: 570, end: 600 })
    // Touching Review, so the next step would overlap it.
    spans.keydown(key("ArrowDown"), "a")
    expect(instance.get().events[0]).toMatchObject({ start: 570, end: 600 })
  })

  test("a drag moves a span across days in a draft, and only the drop commits", () => {
    const instance = calendar({ id: "c", events: [standup] })
    cleanups.push(() => instance.destroy())
    const { spans, set } = instance.api
    // Three days side by side, each 1440 pixels tall: a pixel a minute.
    const days = ["mon", "tue", "wed"].map((day, i) => {
      const el = box(i * 100, 0, 100, 1440)
      cleanups.push(spans.bindTrack(el, day))
      return el
    })
    const event = box(0, 540, 100, 30, days[0])
    cleanups.push(spans.bindSpan(event, "a"))
    spans.spanPointerdown(pointer("pointerdown", 50, 550), "a")
    // Down 62 pixels, in Tuesday: 9:00 plus 62 minutes snaps to 10:00.
    document.dispatchEvent(pointer("pointermove", 150, 612))
    document.dispatchEvent(pointer("pointerup", 150, 612))
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][1]).toMatchObject({
      reason: "drag",
      id: "a",
      action: "move",
    })
    expect(instance.get().events[0]).toMatchObject({
      track: "tue",
      start: 600,
      end: 630,
    })
  })

  test("a drop keeps the spans the owner changed during the drag, and a deleted span ends it", async () => {
    const review: Event = {
      id: "b",
      track: "wed",
      start: 600,
      end: 660,
      title: "Review",
    }
    const instance = calendar({ id: "c", events: [standup] })
    cleanups.push(() => instance.destroy())
    const { spans, set } = instance.api
    const days = ["mon", "tue", "wed"].map((day, i) => {
      const el = box(i * 100, 0, 100, 1440)
      cleanups.push(spans.bindTrack(el, day))
      return el
    })
    cleanups.push(spans.bindSpan(box(0, 540, 100, 30, days[0]), "a"))
    spans.spanPointerdown(pointer("pointerdown", 50, 550), "a")
    document.dispatchEvent(pointer("pointermove", 150, 612))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    instance.setOptions({ id: "c", events: [standup, review] })
    document.dispatchEvent(pointer("pointerup", 150, 612))
    expect(set.mock.calls[0][0]).toEqual([
      { ...standup, track: "tue", start: 600, end: 630 },
      review,
    ])

    spans.spanPointerdown(pointer("pointerdown", 150, 610), "a")
    document.dispatchEvent(pointer("pointermove", 250, 700))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    instance.setOptions({ id: "c", events: [review] })
    expect(instance.get().draft).toBeNull()
    document.dispatchEvent(pointer("pointerup", 250, 700))
    expect(set).toHaveBeenCalledTimes(1)
    expect(instance.get().events).toEqual([review])
  })

  test("a span the owner puts where a drag would drop ends the drag when overlap is off", async () => {
    const review: Event = {
      id: "b",
      track: "tue",
      start: 600,
      end: 660,
      title: "Review",
    }
    const instance = calendar({ id: "c", overlap: false, events: [standup] })
    cleanups.push(() => instance.destroy())
    const { spans, set } = instance.api
    const days = ["mon", "tue", "wed"].map((day, i) => {
      const el = box(i * 100, 0, 100, 1440)
      cleanups.push(spans.bindTrack(el, day))
      return el
    })
    cleanups.push(spans.bindSpan(box(0, 540, 100, 30, days[0]), "a"))
    spans.spanPointerdown(pointer("pointerdown", 50, 550), "a")
    document.dispatchEvent(pointer("pointermove", 150, 612))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    instance.setOptions({ id: "c", overlap: false, events: [standup, review] })
    expect(instance.get().draft).toBeNull()
    document.dispatchEvent(pointer("pointerup", 150, 612))
    expect(set).not.toHaveBeenCalled()
  })

  test("a drag on an edge resizes, and Escape puts it back", () => {
    const instance = calendar({ id: "c", events: [standup] })
    cleanups.push(() => instance.destroy())
    const { spans, set } = instance.api
    cleanups.push(spans.bindTrack(box(0, 0, 100, 1440), "mon"))
    const event = box(0, 540, 100, 30)
    const edge = box(0, 566, 100, 4, event)
    edge.dataset.spanEdge = "end"
    cleanups.push(spans.bindSpan(event, "a"))
    spans.spanPointerdown(
      Object.defineProperty(pointer("pointerdown", 50, 568), "target", {
        value: edge,
      }),
      "a"
    )
    document.dispatchEvent(pointer("pointermove", 50, 640))
    document.dispatchEvent(pointer("pointerup", 50, 640))
    expect(instance.get().events[0]).toMatchObject({ start: 540, end: 645 })
    expect(set.mock.calls[0][1]).toMatchObject({ action: "resize" })

    spans.spanPointerdown(
      Object.defineProperty(pointer("pointerdown", 50, 640), "target", {
        value: edge,
      }),
      "a"
    )
    document.dispatchEvent(pointer("pointermove", 50, 700))
    document.dispatchEvent(key("Escape"))
    expect(instance.get().draft).toBeNull()
    expect(instance.get().events[0]).toMatchObject({ end: 645 })
  })

  test("a drag on an empty track draws a span, and a click makes one of the default size", async () => {
    made = 0
    const instance = calendar({ id: "c", events: [] })
    cleanups.push(() => instance.destroy())
    const { spans, set } = instance.api
    const day = box(0, 0, 100, 1440)
    cleanups.push(spans.bindTrack(day, "mon"))
    spans.trackPointerdown(
      Object.defineProperty(pointer("pointerdown", 50, 487), "target", {
        value: day,
      }),
      "mon"
    )
    // Upward from 8:07: from the slot it started in, 8:00, back to 7:00.
    document.dispatchEvent(pointer("pointermove", 50, 425))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    // The draft renders the span before anything commits.
    expect(set).not.toHaveBeenCalled()
    expect(spans.spans(instance.get())[0]).toMatchObject({
      start: 420,
      end: 495,
    })
    document.dispatchEvent(pointer("pointermove", 50, 560))
    document.dispatchEvent(pointer("pointerup", 50, 560))
    expect(instance.get().events).toEqual([
      { id: "new-1", track: "mon", start: 480, end: 570, title: "New event" },
    ])
    expect(set.mock.calls[0][1]).toMatchObject({ action: "draw" })

    spans.trackPointerdown(
      Object.defineProperty(pointer("pointerdown", 50, 905), "target", {
        value: day,
      }),
      "mon"
    )
    document.dispatchEvent(pointer("pointerup", 50, 905))
    expect(instance.get().events[1]).toMatchObject({ start: 900, end: 960 })
  })

  test("a press on a span that bubbles to its track still moves the span", () => {
    const instance = calendar({ id: "c", events: [standup] })
    cleanups.push(() => instance.destroy())
    const { spans } = instance.api
    const day = box(0, 0, 100, 1440)
    cleanups.push(spans.bindTrack(day, "mon"))
    const event = box(0, 540, 100, 30, day)
    cleanups.push(spans.bindSpan(event, "a"))
    const down = Object.defineProperty(
      pointer("pointerdown", 50, 550),
      "target",
      { value: event }
    )
    spans.spanPointerdown(down, "a")
    spans.trackPointerdown(down, "mon")
    document.dispatchEvent(pointer("pointermove", 50, 612))
    document.dispatchEvent(pointer("pointerup", 50, 612))
    expect(instance.get().events[0]).toMatchObject({
      track: "mon",
      start: 600,
      end: 630,
    })
  })

  test("a press the browser takes over for a scroll makes no span", () => {
    const instance = calendar({ id: "c", events: [] })
    cleanups.push(() => instance.destroy())
    const { spans, set } = instance.api
    const day = box(0, 0, 100, 1440)
    cleanups.push(spans.bindTrack(day, "mon"))
    spans.trackPointerdown(
      Object.defineProperty(pointer("pointerdown", 50, 905), "target", {
        value: day,
      }),
      "mon"
    )
    document.dispatchEvent(pointer("pointercancel", 50, 905))
    expect(set).not.toHaveBeenCalled()
    expect(instance.get().events).toEqual([])
    // A tap on the still-empty track then makes one span of the default size.
    spans.trackPointerdown(
      Object.defineProperty(pointer("pointerdown", 50, 905), "target", {
        value: day,
      }),
      "mon"
    )
    document.dispatchEvent(pointer("pointerup", 50, 905))
    expect(set).toHaveBeenCalledTimes(1)
    expect(instance.get().events).toHaveLength(1)
  })

  test("a press on a span the browser takes over says nothing and changes nothing", () => {
    const instance = calendar({ id: "c", events: [standup] })
    const heard: string[] = []
    setAnnouncer((text) => heard.push(text))
    cleanups.push(
      () => instance.destroy(),
      () => setAnnouncer(undefined)
    )
    const { spans, set } = instance.api
    const day = box(0, 0, 100, 1440)
    cleanups.push(spans.bindTrack(day, "mon"))
    cleanups.push(spans.bindSpan(box(0, 540, 100, 30, day), "a"))
    spans.spanPointerdown(pointer("pointerdown", 50, 550), "a")
    document.dispatchEvent(pointer("pointercancel", 50, 550))
    expect(heard).toEqual([])
    expect(set).not.toHaveBeenCalled()
    expect(instance.get().draft).toBeNull()
  })

  test("spanStyle places a span along its track and in its lane", () => {
    const instance = calendar({ id: "c", events: [standup] })
    cleanups.push(() => instance.destroy())
    expect(instance.api.spans.spanStyle(standup, { lane: 1, lanes: 2 })).toBe(
      "position:absolute;top:37.5%;height:2.08%;inset-inline-start:50%;width:50%;--span-start:0.375;--span-size:0.020833333333333332"
    )
  })
})

describe("createResize", () => {
  type CropState = {
    boxes: Record<string, ResizeBox>
    draft: ResizeDraft | null
  }
  type CropOptions = { boxes: Record<string, ResizeBox>; aspect?: number }
  const crop = definePrimitive({
    name: "crop",
    options: { boxes: "value", aspect: "number" },
    state: (options: CropOptions): CropState => ({
      boxes: options.boxes,
      draft: null,
    }),
    live: ["draft"],
    api: (context) => {
      const set = vi.fn(
        (value: Record<string, ResizeBox>, _details: object) => {
          context.store.set({ boxes: value })
          return true
        }
      )
      const resize = createResize<CropState>(context, {
        boxes: (state) => state.boxes,
        draft: "draft",
        set,
        min: () => ({ width: 20, height: 20 }),
        bounds: () => ({ left: 0, top: 0, right: 400, bottom: 300 }),
        aspect: () => context.options().aspect,
        label: () => "Crop",
        step: () => 10,
        largeStep: () => 50,
      })
      return { resize, set }
    },
    slots: (slot) => ({
      box: slot<{ value: string }>({ props: { value: "string" } }),
    }),
  })
  const start = { x: 100, y: 100, width: 100, height: 50 }
  const mount = (options: Partial<CropOptions> = {}) => {
    const instance = crop({ id: "c", boxes: { a: start }, ...options })
    cleanups.push(() => instance.destroy())
    return instance
  }

  test("arrows on a handle move its edges, within the minimum size, one change each", () => {
    const instance = mount()
    const { resize, set } = instance.api
    expect(resize.keydown(key("ArrowRight"), "a", "se")).toBe(true)
    expect(instance.get().boxes.a).toEqual({
      x: 100,
      y: 100,
      width: 110,
      height: 50,
    })
    resize.keydown(key("ArrowUp", { shiftKey: true }), "a", "nw")
    expect(instance.get().boxes.a).toEqual({
      x: 100,
      y: 50,
      width: 110,
      height: 100,
    })
    // An edge handle moves along its own axis only.
    expect(resize.keydown(key("ArrowUp"), "a", "e")).toBe(false)
    // Shrinking stops at the minimum, from the side that moved.
    for (let i = 0; i < 5; i++) {
      resize.keydown(key("ArrowRight", { shiftKey: true }), "a", "w")
    }
    expect(instance.get().boxes.a).toEqual({
      x: 190,
      y: 50,
      width: 20,
      height: 100,
    })
    // Two steps reach the minimum, and the ones after change nothing.
    expect(set).toHaveBeenCalledTimes(4)
    expect(set.mock.calls[0][1]).toMatchObject({ reason: "resize-key" })
  })

  test("the box's own move ignores presses and keys from the handles inside it", () => {
    const instance = mount()
    const { resize, set } = instance.api
    const el = box(100, 100, 100, 50)
    const handle = document.createElement("div")
    handle.setAttribute("data-resize-handle", "se")
    el.append(handle)
    const from = <E extends Event>(event: E) =>
      Object.defineProperty(event, "target", { value: handle })
    expect(resize.keydown(from(key("ArrowRight")), "a", "move")).toBe(false)
    resize.pointerdown(from(pointer("pointerdown", 200, 150)), "a", "move", el)
    document.dispatchEvent(pointer("pointermove", 260, 160))
    document.dispatchEvent(pointer("pointerup", 260, 160))
    expect(set).not.toHaveBeenCalled()
    expect(resize.keydown(key("ArrowRight"), "a", "move")).toBe(true)
    expect(instance.get().boxes.a).toEqual({
      x: 110,
      y: 100,
      width: 100,
      height: 50,
    })
  })

  test("a box stays inside its bounds, moved or resized", () => {
    const instance = mount()
    const { resize } = instance.api
    resize.resizeBy("a", "move", 1000, -1000)
    expect(instance.get().boxes.a).toEqual({
      x: 300,
      y: 0,
      width: 100,
      height: 50,
    })
    resize.resizeBy("a", "sw", -1000, 1000)
    expect(instance.get().boxes.a).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    })
  })

  test("a ratio holds on corners and edges, and an edge grows about the middle", () => {
    const instance = mount({ aspect: 2 })
    const { resize } = instance.api
    resize.resizeBy("a", "se", 40, 0)
    expect(instance.get().boxes.a).toEqual({
      x: 100,
      y: 100,
      width: 140,
      height: 70,
    })
    resize.resizeBy("a", "s", 0, 10)
    expect(instance.get().boxes.a).toEqual({
      x: 90,
      y: 100,
      width: 160,
      height: 80,
    })
    // Against the right of the bounds, the box grows only as far as the ratio allows there.
    resize.resizeBy("a", "ne", 1000, -1000)
    expect(instance.get().boxes.a).toEqual({
      x: 90,
      y: 25,
      width: 310,
      height: 155,
    })
  })

  test("a press on a handle that bubbles to its box still resizes from the handle", () => {
    const instance = mount()
    const { resize } = instance.api
    const el = box(100, 100, 100, 50)
    const handle = box(196, 146, 8, 8, el)
    handle.setAttribute("data-resize-handle", "")
    const down = Object.defineProperty(
      pointer("pointerdown", 200, 150),
      "target",
      { value: handle }
    )
    resize.pointerdown(down, "a", "se", handle)
    resize.pointerdown(down, "a", "move", el)
    document.dispatchEvent(pointer("pointermove", 260, 160))
    document.dispatchEvent(pointer("pointerup", 260, 160))
    expect(instance.get().boxes.a).toEqual({
      x: 100,
      y: 100,
      width: 160,
      height: 60,
    })
  })

  test("a drag resizes in a draft as custom properties, Escape puts it back, and the drop commits once", () => {
    const instance = mount()
    const { resize, set } = instance.api
    const el = box(100, 100, 100, 50)
    // Without a ratio, Shift on a corner keeps the box's own.
    resize.pointerdown(pointer("pointerdown", 200, 150), "a", "se", el)
    document.dispatchEvent(pointer("pointermove", 260, 160))
    document.dispatchEvent(pointer("pointerup", 260, 160))
    expect(instance.get().boxes.a).toEqual({
      x: 100,
      y: 100,
      width: 160,
      height: 60,
    })
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][1]).toMatchObject({ reason: "drag" })
    expect(instance.get().draft).toBeNull()

    resize.pointerdown(pointer("pointerdown", 150, 120), "a", "move", el)
    document.dispatchEvent(pointer("pointermove", 170, 140))
    return new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        expect(resize.dragging(instance.get(), "a")).toBe("move")
        expect(resize.box(instance.get(), "a")).toEqual({
          x: 120,
          y: 120,
          width: 160,
          height: 60,
        })
        expect(resize.style(instance.get(), "a")).toBe(
          "--resize-x:120px;--resize-y:120px;--resize-width:160px;--resize-height:60px"
        )
        // The committed box underneath, read through the custom properties.
        expect(resize.boxStyle(instance.get(), "a")).toBe(
          "position:absolute;left:var(--resize-x, 100px);top:var(--resize-y, 100px);width:var(--resize-width, 160px);height:var(--resize-height, 60px)"
        )
        document.dispatchEvent(key("Escape"))
        expect(instance.get().draft).toBeNull()
        document.dispatchEvent(pointer("pointerup", 170, 140))
        expect(instance.get().boxes.a).toEqual({
          x: 100,
          y: 100,
          width: 160,
          height: 60,
        })
        expect(set).toHaveBeenCalledTimes(1)
        resolve()
      })
    )
  })

  test("a second finger pressing another box mid-drag leaves both boxes to the first finger", async () => {
    const instance = mount({
      boxes: { a: start, b: { x: 250, y: 200, width: 50, height: 50 } },
    })
    const { resize, set } = instance.api
    const touch = (
      type: string,
      clientX: number,
      clientY: number,
      pointerId: number
    ) =>
      new PointerEvent(type, {
        clientX,
        clientY,
        pointerId,
        pointerType: "touch",
        isPrimary: pointerId === 1,
        button: 0,
        bubbles: true,
        cancelable: true,
      })
    const a = box(100, 100, 100, 50)
    const b = box(250, 200, 50, 50)
    resize.pointerdown(touch("pointerdown", 200, 150, 1), "a", "se", a)
    document.dispatchEvent(touch("pointermove", 240, 160, 1))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    resize.pointerdown(touch("pointerdown", 260, 210, 2), "b", "move", b)
    document.dispatchEvent(touch("pointerup", 260, 210, 2))
    expect(instance.get().boxes.b).toEqual({
      x: 250,
      y: 200,
      width: 50,
      height: 50,
    })
    document.dispatchEvent(touch("pointermove", 260, 170, 1))
    document.dispatchEvent(touch("pointerup", 260, 170, 1))
    expect(instance.get().boxes.a).toEqual({
      x: 100,
      y: 100,
      width: 160,
      height: 70,
    })
    expect(set).toHaveBeenCalledTimes(1)
  })

  test("Shift on a corner drag keeps the box's ratio, and handles carry their cursor", () => {
    const instance = mount()
    const { resize } = instance.api
    const el = box(100, 100, 100, 50)
    resize.pointerdown(pointer("pointerdown", 200, 150), "a", "se", el)
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 300,
        clientY: 160,
        shiftKey: true,
        isPrimary: true,
        bubbles: true,
      })
    )
    document.dispatchEvent(pointer("pointerup", 300, 160))
    expect(instance.get().boxes.a).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    })
    expect(resize.handleAttrs("ne")).toEqual({
      "data-resize-handle": "ne",
      style: "cursor:nesw-resize;touch-action:none",
    })
  })
})

describe("createCellRange", () => {
  type SheetState = { active: GridCell | null; range: CellRange | null }
  const sheet = definePrimitive({
    name: "sheet",
    state: (_options: {}): SheetState => ({ active: null, range: null }),
    api: (context) => {
      const grid = createGridFocus<SheetState>(context, {
        key: "active",
        rows: () => 5,
        cols: () => 4,
      })
      const set = vi.fn((range: CellRange | null, _details: object) => {
        context.store.set({ range })
        return true
      })
      const range = createCellRange<SheetState>(context, {
        key: "range",
        grid,
        rows: () => 5,
        cols: () => 4,
        set,
      })
      return { grid, range, set }
    },
    slots: (slot) => ({
      cell: slot<{ row: number; col: number }>({
        props: { row: "number", col: "number" },
      }),
    }),
  })
  const mount = () => {
    const instance = sheet({ id: "s" })
    cleanups.push(() => instance.destroy())
    instance.api.grid.focus({ row: 1, col: 1 })
    return instance
  }
  const bounds = (instance: ReturnType<typeof mount>) =>
    instance.api.range.bounds(instance.get())

  test("Shift with the arrows grows the range from the active cell, which keeps focus", () => {
    const instance = mount()
    const { range, grid } = instance.api
    expect(bounds(instance)).toEqual({ top: 1, left: 1, bottom: 1, right: 1 })
    range.keydown(key("ArrowRight", { shiftKey: true }))
    range.keydown(key("ArrowDown", { shiftKey: true }))
    expect(bounds(instance)).toEqual({ top: 1, left: 1, bottom: 2, right: 2 })
    // Back past the anchor flips the range around it.
    range.keydown(key("ArrowLeft", { shiftKey: true }))
    range.keydown(key("ArrowLeft", { shiftKey: true }))
    expect(bounds(instance)).toEqual({ top: 1, left: 0, bottom: 2, right: 1 })
    expect(grid.active()).toEqual({ row: 1, col: 1 })
    // Control goes to the grid's edge.
    range.keydown(key("ArrowDown", { shiftKey: true, ctrlKey: true }))
    expect(bounds(instance)).toEqual({ top: 1, left: 0, bottom: 4, right: 1 })
    expect(instance.api.set.mock.calls[0][1]).toMatchObject({
      reason: "list-navigation",
    })
  })

  test("an arrow alone moves the active cell and drops the range, and Escape drops it too", () => {
    const instance = mount()
    const { range, grid } = instance.api
    range.keydown(key("ArrowRight", { shiftKey: true }))
    expect(range.keydown(key("ArrowDown"))).toBe(true)
    expect(grid.active()).toEqual({ row: 2, col: 1 })
    expect(instance.get().range).toBeNull()
    range.keydown(key("ArrowRight", { shiftKey: true }))
    range.keydown(key("Escape"))
    expect(bounds(instance)).toEqual({ top: 2, left: 1, bottom: 2, right: 1 })
    // Escape with nothing to drop is left to whatever else handles it.
    const escape = key("Escape")
    expect(range.keydown(escape)).toBe(false)
    expect(escape.defaultPrevented).toBe(false)
  })

  test("Space with Shift takes rows, with Control columns, and Control+A every cell", () => {
    const instance = mount()
    const { range } = instance.api
    range.keydown(key("ArrowDown", { shiftKey: true }))
    range.keydown(key(" ", { shiftKey: true }))
    expect(bounds(instance)).toEqual({ top: 1, left: 0, bottom: 2, right: 3 })
    range.keydown(key("Escape"))
    range.keydown(key(" ", { ctrlKey: true }))
    expect(bounds(instance)).toEqual({ top: 0, left: 1, bottom: 4, right: 1 })
    range.keydown(key("a", { metaKey: true }))
    expect(bounds(instance)).toEqual({ top: 0, left: 0, bottom: 4, right: 3 })
    expect(instance.api.grid.active()).toEqual({ row: 1, col: 1 })
  })

  test("Control+A announces every cell when the range is controlled", () => {
    const controlled = definePrimitive({
      name: "sheet",
      state: (_options: {}): SheetState => ({ active: null, range: null }),
      api: (context) => {
        const grid = createGridFocus<SheetState>(context, {
          key: "active",
          rows: () => 5,
          cols: () => 4,
        })
        const range = createCellRange<SheetState>(context, {
          key: "range",
          grid,
          rows: () => 5,
          cols: () => 4,
          set: () => true,
        })
        return { grid, range }
      },
      slots: (slot) => ({ cell: slot({}) }),
    })
    const instance = controlled({ id: "s" })
    const heard: string[] = []
    setAnnouncer((text) => heard.push(text))
    cleanups.push(
      () => instance.destroy(),
      () => setAnnouncer(undefined)
    )
    instance.api.grid.focus({ row: 1, col: 1 })
    instance.api.range.keydown(key("a", { ctrlKey: true }))
    expect(heard).toEqual(["5 rows by 4 columns selected"])
  })

  test("cells say whether they're selected and which sides of the range they sit on", () => {
    const instance = mount()
    const { range } = instance.api
    // The active cell alone isn't a range.
    expect(range.cellAttrs(instance.get(), { row: 1, col: 1 })).toEqual({
      "aria-selected": "false",
    })
    range.select({ anchor: { row: 1, col: 1 }, end: { row: 3, col: 2 } })
    expect(range.cellAttrs(instance.get(), { row: 1, col: 1 })).toEqual({
      "aria-selected": "true",
      "data-selected": "",
      "data-range-edge": "top left",
    })
    expect(
      range.cellAttrs(instance.get(), { row: 2, col: 2 })["data-range-edge"]
    ).toBe("right")
    expect(
      range.cellAttrs(instance.get(), { row: 2, col: 1 })["data-range-edge"]
    ).toBe("left")
    expect(range.cellAttrs(instance.get(), { row: 0, col: 1 })).toEqual({
      "aria-selected": "false",
    })
    // Ranges past the grid are kept inside it.
    range.select({ anchor: { row: -2, col: 1 }, end: { row: 9, col: 9 } })
    expect(bounds(instance)).toEqual({ top: 0, left: 1, bottom: 4, right: 3 })
  })

  test("a drag paints the range to the cell under the pointer, and Shift with a press stretches it", () => {
    const instance = mount()
    const { range, set } = instance.api
    const cells = new Map<string, HTMLElement>()
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const el = box(col * 50, row * 20, 50, 20)
        cells.set(`${row}:${col}`, el)
        cleanups.push(range.bind(el, { row, col }))
      }
    }
    const under = vi.fn((x: number, y: number) => {
      const el = cells.get(`${Math.floor(y / 20)}:${Math.floor(x / 50)}`)
      return el ? [el] : []
    })
    document.elementsFromPoint = under
    const start = cells.get("0:0")!
    const down = pointer("pointerdown", 10, 10)
    start.dispatchEvent(down)
    Object.defineProperty(down, "currentTarget", { value: start })
    range.pointerdown(down, { row: 0, col: 0 })
    expect(instance.api.grid.active()).toEqual({ row: 0, col: 0 })
    document.dispatchEvent(pointer("pointermove", 120, 50))
    document.dispatchEvent(pointer("pointerup", 120, 50))
    expect(bounds(instance)).toEqual({ top: 0, left: 0, bottom: 2, right: 2 })
    expect(set.mock.calls.at(-1)![1]).toMatchObject({ reason: "drag" })

    const shift = new PointerEvent("pointerdown", {
      button: 0,
      shiftKey: true,
      cancelable: true,
    })
    range.pointerdown(shift, { row: 4, col: 1 })
    expect(bounds(instance)).toEqual({ top: 0, left: 0, bottom: 4, right: 1 })
    expect(instance.api.grid.active()).toEqual({ row: 0, col: 0 })
  })

  test("a drag paints from a press inside a cell, when the event's currentTarget is the document", () => {
    const instance = mount()
    const { range } = instance.api
    const cells = new Map<string, HTMLElement>()
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const el = box(col * 50, row * 20, 50, 20)
        cells.set(`${row}:${col}`, el)
        cleanups.push(range.bind(el, { row, col }))
      }
    }
    document.elementsFromPoint = (x: number, y: number) => {
      const el = cells.get(`${Math.floor(y / 20)}:${Math.floor(x / 50)}`)
      return el ? [el] : []
    }
    const label = document.createElement("span")
    cells.get("0:0")!.append(label)
    const down = pointer("pointerdown", 10, 10)
    label.dispatchEvent(down)
    Object.defineProperty(down, "currentTarget", { value: document })
    range.pointerdown(down, { row: 0, col: 0 })
    document.dispatchEvent(pointer("pointermove", 120, 50))
    document.dispatchEvent(pointer("pointerup", 120, 50))
    expect(bounds(instance)).toEqual({ top: 0, left: 0, bottom: 2, right: 2 })
  })

  test("a range reads as tab-separated text, which reads back as cells", () => {
    const instance = mount()
    const { range } = instance.api
    range.select({ anchor: { row: 0, col: 0 }, end: { row: 1, col: 1 } })
    const text = range.text(instance.get(), ({ row, col }) =>
      row === 1 && col === 1 ? 'a "b"\tc' : `${row}${col}`
    )
    expect(text).toBe('00\t01\n10\t"a ""b""\tc"')
    expect(textToCells(text)).toEqual([
      ["00", "01"],
      ["10", 'a "b"\tc'],
    ])
    // Spreadsheets end a copy with a newline, and Windows with a return too.
    expect(textToCells("1\t2\r\n3\t4\r\n")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ])
    expect(cellsToText([["one"]])).toBe("one")
  })
})

describe("createSwipeActions", () => {
  type MailState = { open: SwipeOpen | null; swiping: SwipeDraft | null }
  const mail = definePrimitive({
    name: "mail",
    state: (_options: {}): MailState => ({ open: null, swiping: null }),
    live: ["swiping"],
    api: (context) => {
      const archived = vi.fn((_key: string, _side: string) => true)
      const swipe = createSwipeActions<MailState>(context, {
        key: "open",
        draft: "swiping",
        onFullSwipe: (key, side) => archived(key, side),
      })
      return { swipe, archived }
    },
    slots: (slot) => ({
      row: slot<{ value: string }>({ props: { value: "string" } }),
    }),
  })
  // A row 400 wide with 160 of actions on its end, two buttons, and none on its start.
  const mount = () => {
    const instance = mail({ id: "m" })
    cleanups.push(() => instance.destroy())
    const row = box(0, 0, 400, 60)
    row.tabIndex = 0
    const actions = box(240, 0, 160, 60, row)
    actions.innerHTML = "<button>Flag</button><button>Delete</button>"
    cleanups.push(
      instance.api.swipe.bindRow(row, "a"),
      instance.api.swipe.bindActions(actions, "a", "end")
    )
    return { instance, swipe: instance.api.swipe, row, actions }
  }
  // Pointer events a set time apart, so a swipe's speed is known.
  let time = 0
  const at = (type: string, x: number, ms: number) => {
    time += ms
    const event = pointer(type, x, 30)
    Object.defineProperty(event, "timeStamp", { value: time })
    return event
  }
  const swipe = (
    target: { swipe: { pointerdown: Function }; row: HTMLElement },
    path: number[],
    ms = 50
  ) => {
    target.swipe.pointerdown(at("pointerdown", 300, 0), "a", target.row)
    for (const x of path) {
      document.dispatchEvent(at("pointermove", x, ms))
    }
    document.dispatchEvent(at("pointerup", path[path.length - 1], ms))
  }

  test("a slow swipe past half the actions opens them, and short of half snaps back", () => {
    const row = mount()
    const { instance } = row
    swipe(row, [290, 270, 250, 240, 235])
    expect(instance.get().open).toBeNull()
    swipe(row, [290, 260, 230, 210, 205, 200])
    expect(instance.get().open).toEqual({ key: "a", side: "end" })
    expect(row.swipe.offset(instance.get(), "a")).toBe(-160)
    expect(row.swipe.actionsAttrs(instance.get(), "a", "end")).toEqual({
      "data-side": "end",
      inert: undefined,
    })
    // Nothing on the start side, so a swipe the other way only resists.
    expect(row.swipe.actionsAttrs(instance.get(), "a", "start").inert).toBe("")
  })

  test("a swipe moves the row in a live draft, and a flick decides whichever way it went", () => {
    const row = mount()
    const { instance, swipe: actions } = row
    actions.pointerdown(at("pointerdown", 300, 0), "a", row.row)
    document.dispatchEvent(at("pointermove", 280, 50))
    return new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        expect(actions.contentAttrs(instance.get(), "a")).toEqual({
          style: "--swipe-x:-20px",
          "data-swipe": "end",
          "data-swiping": "",
          "data-full": undefined,
        })
        // A flick: 30 pixels in 10 milliseconds.
        document.dispatchEvent(at("pointermove", 250, 10))
        document.dispatchEvent(at("pointerup", 250, 1))
        expect(instance.get().open).toEqual({ key: "a", side: "end" })
        expect(instance.get().swiping).toBeNull()
        // From open, a flick back closes it.
        actions.pointerdown(at("pointerdown", 100, 0), "a", row.row)
        document.dispatchEvent(at("pointermove", 115, 50))
        document.dispatchEvent(at("pointermove", 140, 10))
        document.dispatchEvent(at("pointerup", 140, 1))
        expect(instance.get().open).toBeNull()
        resolve()
      })
    )
  })

  test("a second finger pressing another row mid-swipe leaves the first row to the first finger", async () => {
    const { instance, swipe: actions, row } = mount()
    const other = box(0, 60, 400, 60)
    cleanups.push(
      actions.bindRow(other, "b"),
      actions.bindActions(box(240, 60, 160, 60, other), "b", "end")
    )
    const touch = (type: string, x: number, pointerId: number) => {
      time += 50
      const event = new PointerEvent(type, {
        clientX: x,
        clientY: 30,
        pointerId,
        pointerType: "touch",
        isPrimary: pointerId === 1,
        button: 0,
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, "timeStamp", { value: time })
      return event
    }
    actions.pointerdown(touch("pointerdown", 300, 1), "a", row)
    document.dispatchEvent(touch("pointermove", 280, 1))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    actions.pointerdown(touch("pointerdown", 300, 2), "b", other)
    document.dispatchEvent(touch("pointerup", 300, 2))
    for (const x of [260, 230, 210, 200]) {
      document.dispatchEvent(touch("pointermove", x, 1))
    }
    document.dispatchEvent(touch("pointerup", 200, 1))
    expect(instance.get().open).toEqual({ key: "a", side: "end" })
    expect(instance.get().swiping).toBeNull()
  })

  test("a second finger outside an open row leaves the first finger's swipe of it where it is", async () => {
    const { instance, swipe: actions, row } = mount()
    const other = box(0, 60, 400, 60)
    cleanups.push(actions.bindRow(other, "b"))
    const touch = (type: string, x: number, pointerId: number) => {
      time += 50
      const event = new PointerEvent(type, {
        clientX: x,
        clientY: 30,
        pointerId,
        pointerType: "touch",
        isPrimary: pointerId === 1,
        button: 0,
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, "timeStamp", { value: time })
      return event
    }
    actions.show("a", "end")
    actions.pointerdown(touch("pointerdown", 100, 1), "a", row)
    document.dispatchEvent(touch("pointermove", 120, 1))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const offset = actions.offset(instance.get(), "a")
    other.dispatchEvent(touch("pointerdown", 300, 2))
    expect(actions.offset(instance.get(), "a")).toBe(offset)
    expect(instance.get().open).toEqual({ key: "a", side: "end" })
  })

  test("a swipe cut short by its component going away puts the row back", async () => {
    const { instance, swipe: actions, row } = mount()
    actions.pointerdown(at("pointerdown", 300, 0), "a", row)
    document.dispatchEvent(at("pointermove", 260, 50))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(instance.get().swiping).not.toBeNull()
    instance.destroy()
    expect(instance.get().swiping).toBeNull()
    // The pointer no longer reaches it.
    document.dispatchEvent(at("pointermove", 200, 50))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(instance.get().swiping).toBeNull()
  })

  test("a long swipe runs the first action, and only then", () => {
    const row = mount()
    const { instance } = row
    swipe(row, [280, 200, 120, 60, 50])
    expect(instance.api.archived).toHaveBeenCalledWith("a", "end")
    expect(instance.get().open).toBeNull()
  })

  test("Left and Right open the actions and move through them, and Escape closes them", () => {
    const { instance, swipe: actions, row } = mount()
    const [flag, remove] = row.querySelectorAll("button")
    row.focus()
    // Right would swipe toward the start, where there's nothing.
    expect(actions.keydown(key("ArrowRight"), "a")).toBe(false)
    expect(actions.keydown(key("ArrowLeft"), "a")).toBe(true)
    expect(instance.get().open).toEqual({ key: "a", side: "end" })
    expect(document.activeElement).toBe(flag)
    actions.keydown(
      Object.defineProperty(key("ArrowRight"), "target", { value: flag }),
      "a"
    )
    expect(document.activeElement).toBe(remove)
    // Past the last stays put; back toward the row's content from the first closes.
    actions.keydown(
      Object.defineProperty(key("ArrowRight"), "target", { value: remove }),
      "a"
    )
    expect(document.activeElement).toBe(remove)
    actions.keydown(
      Object.defineProperty(key("ArrowLeft"), "target", { value: remove }),
      "a"
    )
    actions.keydown(
      Object.defineProperty(key("ArrowLeft"), "target", { value: flag }),
      "a"
    )
    expect(instance.get().open).toBeNull()
    expect(document.activeElement).toBe(row)

    actions.keydown(key("ArrowLeft"), "a")
    actions.keydown(key("Escape"), "a")
    expect(instance.get().open).toBeNull()
    expect(document.activeElement).toBe(row)
  })

  test("a press anywhere but the open row closes it", () => {
    const { instance, swipe: actions, row } = mount()
    actions.show("a", "end")
    row.querySelector("button")!.dispatchEvent(pointer("pointerdown", 250, 30))
    expect(instance.get().open).toEqual({ key: "a", side: "end" })
    document.body.dispatchEvent(pointer("pointerdown", 600, 300))
    expect(instance.get().open).toBeNull()
  })
})

// `disabled`: "Whether a row can't be swiped", which `show` and a new press already respect.
test("a row disabled mid-swipe neither opens nor runs its full-swipe action on release", () => {
  type MailState = { open: SwipeOpen | null; swiping: SwipeDraft | null }
  let locked = false
  const archived = vi.fn(() => true)
  const mail = definePrimitive({
    name: "mail",
    state: (_options: {}): MailState => ({ open: null, swiping: null }),
    live: ["swiping"],
    api: (context) => ({
      swipe: createSwipeActions<MailState>(context, {
        key: "open",
        draft: "swiping",
        onFullSwipe: archived,
        disabled: () => locked,
      }),
    }),
    slots: (slot) => ({
      row: slot<{ value: string }>({ props: { value: "string" } }),
    }),
  })
  const instance = mail({ id: "m" })
  cleanups.push(() => instance.destroy())
  const row = box(0, 0, 400, 60)
  const actions = box(240, 0, 160, 60, row)
  actions.innerHTML = "<button>Delete</button>"
  const { swipe } = instance.api
  cleanups.push(swipe.bindRow(row, "a"), swipe.bindActions(actions, "a", "end"))
  swipe.pointerdown(pointer("pointerdown", 390, 30), "a", row)
  document.dispatchEvent(pointer("pointermove", 370, 30))
  document.dispatchEvent(pointer("pointermove", 100, 30))
  locked = true
  document.dispatchEvent(pointer("pointerup", 100, 30))
  expect(archived).not.toHaveBeenCalled()
  expect(instance.get().open).toBeNull()
  expect(swipe.show("a", "end")).toBe(false)
})
