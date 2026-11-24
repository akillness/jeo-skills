// @vitest-environment jsdom
// The blocks for canvases, previews, strokes and page timelines: pan and
// zoom, connecting ports, previewing before choosing, which
// way a stroke points, and recording and taking back changes through the
// agent bridge. Through the public entries only; `bind` from the kernel
// stands in for an adapter.
import { afterEach, describe, expect, test, vi } from "vitest"
import { checkbox } from "../src/components/checkbox/checkbox"
import { input } from "../src/components/input/input"
import { slider } from "../src/components/slider/slider"
import {
  createConnect,
  createLasso,
  createPreview,
  createViewport,
  css,
  definePrimitive,
  type ConnectDraft,
  type LassoDraft,
  type Viewport,
} from "../src/index"
import { createAgent } from "../src/page/agent/agent"
import { sectorOf } from "../src/foundation/motion/gesture"
import {
  createHistory,
  describeEntry,
  stageChanges,
} from "../src/page/history/history"
import { bind } from "../src/foundation/kernel/part"
import { withSource } from "../src/foundation/kernel/details"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON() {},
  }) as DOMRect

describe("sectorOf", () => {
  test("picks the wedge a stroke points into, clockwise from the top", () => {
    expect(sectorOf(0, -40, 4)).toBe(0)
    expect(sectorOf(40, 2, 4)).toBe(1)
    expect(sectorOf(0, 40, 4)).toBe(2)
    expect(sectorOf(-40, 0, 4)).toBe(3)
    expect(sectorOf(30, -30, 8)).toBe(1)
  })

  test("points nowhere inside the dead zone", () => {
    expect(sectorOf(3, 4, 8)).toBe(-1)
    expect(sectorOf(3, 4, 8, { deadZone: 2 })).toBe(3)
  })
})

// A canvas: a surface 400 by 300 at the page's top left, panned and zoomed.
type CanvasState = { viewport: Viewport; connecting: ConnectDraft | null }
const canvas = definePrimitive({
  name: "canvas",
  options: { connect: "value", canConnect: "value" },
  state: (options: {
    connect?: (from: string, to: string) => boolean
    canConnect?: (from: string, to: string) => boolean
  }): CanvasState => ({
    viewport: { x: 0, y: 0, zoom: 1 },
    connecting: null,
  }),
  live: ["viewport", "connecting"],
  api: (context) => {
    const viewport = createViewport<CanvasState>(context, {
      key: "viewport",
      surface: () => context.element("surface"),
    })
    const connect = createConnect<CanvasState>(context, {
      slot: "port",
      draft: "connecting",
      connect: (from, to) => context.options().connect?.(from, to) ?? true,
      canConnect: (from, to) =>
        context.options().canConnect?.(from, to) ?? true,
      point: viewport.toCanvas,
    })
    return { viewport, connect }
  },
  slots: (slot) => ({
    surface: slot({
      on: { wheel: (event, { api }) => api.viewport.wheel(event) },
    }),
    port: slot<{ value: string }>({ props: { value: "string" } }),
  }),
})

function mountCanvas(
  options: Parameters<typeof canvas>[0] = { id: "c" },
  ports: Record<string, [number, number]> = {}
) {
  const instance = canvas(options)
  const surface = document.createElement("div")
  surface.getBoundingClientRect = () => rect(0, 0, 400, 300)
  document.body.append(surface)
  cleanups.push(bind(instance.part("surface", {}), surface))
  for (const [key, [x, y]] of Object.entries(ports)) {
    const el = document.createElement("span")
    // Ports sit at canvas points, so their boxes follow the viewport.
    el.getBoundingClientRect = () => {
      const at = instance.api.viewport.toScreen({ x, y })
      return rect(at.x - 4, at.y - 4, 8, 8)
    }
    surface.append(el)
    cleanups.push(bind(instance.part("port", { value: key }), el))
  }
  cleanups.push(() => instance.destroy())
  return { instance, surface }
}

describe("createViewport", () => {
  test("converts screen points to canvas points and back", () => {
    const { instance } = mountCanvas()
    instance.api.viewport.setViewport({ x: 50, y: 20, zoom: 2 })
    expect(instance.api.viewport.toCanvas(150, 120)).toEqual({ x: 50, y: 50 })
    expect(instance.api.viewport.toScreen({ x: 50, y: 50 })).toEqual({
      x: 150,
      y: 120,
    })
    expect(instance.api.viewport.visible()).toEqual({
      left: -25,
      top: -10,
      right: 175,
      bottom: 140,
    })
  })

  test("zooms around a point, keeping the canvas under it still, within bounds", () => {
    const { instance } = mountCanvas()
    const before = instance.api.viewport.toCanvas(100, 100)
    instance.api.viewport.zoomTo(2, { x: 100, y: 100 })
    expect(instance.api.viewport.toCanvas(100, 100)).toEqual(before)
    instance.api.viewport.zoomTo(100)
    expect(instance.api.viewport.get().zoom).toBe(4)
  })

  test("fits a box, and reveals one with the least pan", () => {
    const { instance } = mountCanvas()
    instance.api.viewport.fit(
      { left: 0, top: 0, right: 800, bottom: 600 },
      { padding: 0 }
    )
    expect(instance.api.viewport.get()).toEqual({ x: 0, y: 0, zoom: 0.5 })
    instance.api.viewport.setViewport({ x: 0, y: 0, zoom: 1 })
    instance.api.viewport.reveal(
      { left: 450, top: 10, right: 500, bottom: 40 },
      { padding: 0 }
    )
    expect(instance.api.viewport.get()).toEqual({ x: -100, y: 0, zoom: 1 })
  })

  test("the wheel pans, and with Ctrl it zooms at the pointer", () => {
    const { instance, surface } = mountCanvas()
    surface.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: 10,
        deltaY: 30,
        bubbles: true,
        cancelable: true,
      })
    )
    expect(instance.get().viewport).toEqual({ x: -10, y: -30, zoom: 1 })
    surface.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -20,
        ctrlKey: true,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      })
    )
    expect(instance.get().viewport.zoom).toBeCloseTo(Math.exp(0.2))
  })

  test("+, - and 0 zoom from the keyboard", () => {
    const { instance } = mountCanvas()
    const key = (key: string) =>
      instance.api.viewport.keydown(
        new KeyboardEvent("keydown", { key, cancelable: true })
      )
    expect(key("+")).toBe(true)
    expect(instance.get().viewport.zoom).toBe(1.25)
    key("0")
    expect(instance.get().viewport.zoom).toBe(1)
    expect(key("a")).toBe(false)
  })

  test("style is one transform for the world", () => {
    const { instance } = mountCanvas()
    expect(
      instance.api.viewport.style({
        viewport: { x: 5, y: 6, zoom: 2 },
        connecting: null,
      })
    ).toContain("transform:translate(5px,6px) scale(2)")
  })
})

describe("createViewport bindFindable", () => {
  // jsdom keeps no scroll position: store what's set, like a browser that can scroll this far.
  const scrollable = (el: HTMLElement) => {
    const at = { left: 0, top: 0 }
    Object.defineProperties(el, {
      scrollLeft: {
        get: () => at.left,
        set: (value: number) => (at.left = value),
        configurable: true,
      },
      scrollTop: {
        get: () => at.top,
        set: (value: number) => (at.top = value),
        configurable: true,
      },
    })
    return el
  }
  const scrollTo = (el: HTMLElement, left: number, top: number) => {
    el.scrollLeft = left
    el.scrollTop = top
    el.dispatchEvent(new Event("scroll"))
  }
  const state = (instance: ReturnType<typeof mountCanvas>["instance"]) =>
    ({ viewport: instance.api.viewport.get(), connecting: null }) as CanvasState

  test("rests the surface far from its origin, with the world offset to match, until it's unbound", () => {
    const { instance, surface } = mountCanvas()
    scrollable(surface)
    const unbind = instance.api.viewport.bindFindable(surface)
    const spacer = surface.lastElementChild as HTMLElement
    expect(spacer.getAttribute("aria-hidden")).toBe("true")
    expect(spacer.style).toMatchObject({
      position: "absolute",
      visibility: "hidden",
    })
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([100000, 100000])
    expect(instance.api.viewport.style(state(instance))).toContain(
      "transform:translate(100000px,100000px) scale(1)"
    )
    unbind()
    expect(spacer.isConnected).toBe(false)
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([0, 0])
    expect(instance.api.viewport.style(state(instance))).toContain(
      "transform:translate(0px,0px) scale(1)"
    )
  })

  test("a scroll the browser makes, like to a find in page match, becomes a pan, and the surface goes back to rest", () => {
    const { instance, surface } = mountCanvas()
    scrollable(surface)
    cleanups.push(instance.api.viewport.bindFindable(surface))
    instance.api.viewport.setViewport({ x: 10, y: 20, zoom: 2 })
    // Toward something to the right and above the view.
    scrollTo(surface, 100300, 99880)
    const panned = instance.api.viewport.get()
    expect(panned).toEqual({ x: -290, y: 140, zoom: 2 })
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([100000, 100000])
    // Its own reset is no pan.
    surface.dispatchEvent(new Event("scroll"))
    expect(instance.api.viewport.get()).toBe(panned)
  })

  test("reports a pan as find-in-page, or as focus-in when focus moved into the pane", async () => {
    const seen: string[] = []
    const board = definePrimitive({
      name: "board",
      state: (): { viewport: Viewport } => ({
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
      live: ["viewport"],
      api: (context) => ({
        viewport: createViewport<{ viewport: Viewport }>(context, {
          key: "viewport",
          surface: () => context.element("root"),
          set: (value, details) => {
            seen.push(details.reason)
            context.store.set({ viewport: value })
            return true
          },
        }),
      }),
      slots: (slot) => ({ root: slot({}) }),
    })
    const instance = board({ id: "b" })
    const surface = scrollable(document.createElement("div"))
    document.body.append(surface)
    cleanups.push(bind(instance.part("root", {}), surface), () =>
      instance.destroy()
    )
    cleanups.push(instance.api.viewport.bindFindable(surface))
    scrollTo(surface, 99500, 100000)
    expect(seen).toEqual(["find-in-page"])
    expect(instance.api.viewport.get()).toEqual({ x: 500, y: 0, zoom: 1 })
    const node = document.createElement("button")
    surface.append(node)
    node.focus()
    scrollTo(surface, 100200, 100000)
    expect(seen).toEqual(["find-in-page", "focus-in"])
    await new Promise((resolve) => requestAnimationFrame(resolve))
    scrollTo(surface, 100000, 100300)
    expect(seen).toEqual(["find-in-page", "focus-in", "find-in-page"])
  })

  test("a pane bound while hidden rests once it shows, and a lost rest doesn't pan", () => {
    // Like a pane in a closed tab: no box, so it can't scroll until it shows.
    let shown = false
    const at = { left: 0, top: 0 }
    let resized: (() => void) | undefined
    const original = window.ResizeObserver
    window.ResizeObserver = class {
      constructor(callback: () => void) {
        resized = callback
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver
    cleanups.push(() => (window.ResizeObserver = original))
    const { instance, surface } = mountCanvas()
    Object.defineProperties(surface, {
      scrollLeft: {
        get: () => at.left,
        set: (value: number) => shown && (at.left = value),
        configurable: true,
      },
      scrollTop: {
        get: () => at.top,
        set: (value: number) => shown && (at.top = value),
        configurable: true,
      },
    })
    cleanups.push(instance.api.viewport.bindFindable(surface))
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([0, 0])
    // While it can't scroll, the world isn't offset, so nothing is lost if it shows without a resize.
    expect(instance.api.viewport.style(state(instance))).toContain(
      "transform:translate(0px,0px)"
    )
    shown = true
    resized!()
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([100000, 100000])
    expect(instance.api.viewport.style(state(instance))).toContain(
      "transform:translate(100000px,100000px)"
    )
    // Hidden and shown again, the browser forgot the scroll; a scroll event then finds it at the origin.
    at.left = 0
    at.top = 0
    surface.dispatchEvent(new Event("scroll"))
    expect(instance.api.viewport.get()).toEqual({ x: 0, y: 0, zoom: 1 })
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([100000, 100000])
  })

  test("right to left, the pane rests on the negative side, and the world follows", () => {
    const { instance, surface } = mountCanvas()
    const at = { left: 0, top: 0 }
    // Right to left, scrollLeft runs from 0 down; a positive one clamps to 0.
    Object.defineProperties(surface, {
      scrollLeft: {
        get: () => at.left,
        set: (value: number) => (at.left = Math.min(0, value)),
        configurable: true,
      },
      scrollTop: {
        get: () => at.top,
        set: (value: number) => (at.top = value),
        configurable: true,
      },
    })
    const computed = window.getComputedStyle
    vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) =>
      el === surface
        ? ({ direction: "rtl" } as CSSStyleDeclaration)
        : computed(el, pseudo)
    )
    cleanups.push(() => vi.restoreAllMocks())
    cleanups.push(instance.api.viewport.bindFindable(surface))
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([-100000, 100000])
    expect(instance.api.viewport.style(state(instance))).toContain(
      "transform:translate(-100000px,100000px)"
    )
    // Toward something to the left: further negative.
    scrollTo(surface, -100250, 100000)
    expect(instance.api.viewport.get()).toEqual({ x: 250, y: 0, zoom: 1 })
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([-100000, 100000])
  })

  test("unbinding before the next frame leaves the pane unbound", async () => {
    const { instance, surface } = mountCanvas()
    scrollable(surface)
    const unbind = instance.api.viewport.bindFindable(surface)
    scrollTo(surface, 100300, 100000)
    unbind()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(surface.querySelector('[aria-hidden="true"]')).toBeNull()
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([0, 0])
    expect(instance.api.viewport.style(state(instance))).toContain(
      "transform:translate(-300px,0px)"
    )
  })

  test("a scroll clamped because the spacer went missing puts it back without panning", () => {
    const { instance, surface } = mountCanvas()
    scrollable(surface)
    cleanups.push(instance.api.viewport.bindFindable(surface))
    // Like a framework replacing the surface's children.
    surface.replaceChildren()
    scrollTo(surface, 0, 0)
    expect(instance.api.viewport.get()).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(surface.lastElementChild?.getAttribute("aria-hidden")).toBe("true")
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([100000, 100000])
  })
})

describe("createConnect", () => {
  const ports: Record<string, [number, number]> = {
    "a.out": [100, 50],
    "b.in": [300, 50],
    "c.in": [100, 200],
  }

  test("the keyboard starts from a port, arrows go to the nearest target that way, Enter connects", () => {
    const connect = vi.fn(() => true)
    const { instance } = mountCanvas(
      { id: "c", connect, canConnect: (_from, to) => to.endsWith(".in") },
      ports
    )
    const key = (key: string) =>
      instance.api.connect.keydown(
        new KeyboardEvent("keydown", { key, cancelable: true })
      )
    expect(instance.api.connect.start("a.out")).toBe(true)
    expect(instance.get().connecting).toMatchObject({
      from: "a.out",
      to: null,
      keyboard: true,
    })
    key("ArrowDown")
    expect(instance.get().connecting).toMatchObject({
      to: "c.in",
      x: 100,
      y: 200,
    })
    key("ArrowLeft")
    // Nothing lies left of c.in, so it stays.
    expect(instance.get().connecting?.to).toBe("c.in")
    key("ArrowRight")
    key("Enter")
    expect(connect).toHaveBeenCalledWith("a.out", "b.in")
    expect(instance.get().connecting).toBeNull()
  })

  test("Escape lets go without connecting, and role marks each port", () => {
    const connect = vi.fn(() => true)
    const { instance } = mountCanvas(
      { id: "c", connect, canConnect: (_from, to) => to.endsWith(".in") },
      ports
    )
    instance.api.connect.start("a.out")
    const state = instance.get()
    expect(instance.api.connect.role(state, "a.out")).toBe("source")
    expect(instance.api.connect.role(state, "b.in")).toBe("candidate")
    instance.api.connect.keydown(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    )
    expect(instance.get().connecting).toBeNull()
    expect(connect).not.toHaveBeenCalled()
  })

  test("a port no target can take doesn't start", () => {
    const { instance } = mountCanvas(
      { id: "c", canConnect: () => false },
      ports
    )
    expect(instance.api.connect.start("a.out")).toBe(false)
  })
})

describe("createPreview", () => {
  type PeekState = { value: string | null; preview: string | null }
  const peek = definePrimitive({
    name: "peek",
    options: { onPreview: "callback" },
    state: (_options: {
      onPreview?: (key: string | null, reason: string) => void
    }): PeekState => ({
      value: "light",
      preview: null,
    }),
    api: (context) => ({
      preview: createPreview<PeekState>(context, {
        key: "preview",
        slot: "option",
        value: () => context.store.get().value,
        set: (value, details) => {
          context.options().onPreview?.(value, details.reason)
          context.store.set({ preview: value })
          return true
        },
        choose: (key) => (context.store.set({ value: key }), true),
        disabled: (key) => key === "off",
      }),
    }),
    slots: (slot) => ({
      option: slot<{ value: string }>({ props: { value: "string" } }),
    }),
  })

  test("shows an option without choosing it, and Enter keeps it", () => {
    const onPreview = vi.fn()
    const instance = peek({ id: "p", onPreview })
    instance.api.preview.show("dark", { reason: "list-navigation" })
    expect(instance.get()).toEqual({ value: "light", preview: "dark" })
    instance.api.preview.keydown(
      new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
      "dark"
    )
    expect(instance.get()).toEqual({ value: "dark", preview: null })
    expect(onPreview.mock.calls.map((call) => call[1])).toEqual([
      "list-navigation",
      "item-press",
    ])
  })

  test("Escape puts the page back; the chosen and disabled options preview as nothing", () => {
    const instance = peek({ id: "p" })
    instance.api.preview.show("dark")
    instance.api.preview.keydown(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
      "dark"
    )
    expect(instance.get().preview).toBeNull()
    expect(instance.api.preview.show("light")).toBe(false)
    expect(instance.api.preview.show("off")).toBe(false)
  })
})

// A checkbox in a label, bound the way an adapter binds it.
function mountCheckbox(id: string, text: string) {
  const instance = checkbox({ id })
  const label = document.createElement("label")
  const el = document.createElement("button")
  label.append(el, text)
  document.body.append(label)
  const unbind = bind(instance.part("root"), el)
  cleanups.push(() => {
    unbind()
    instance.destroy()
  })
  return instance
}

// A text field named by `aria-label`, bound the same way.
function mountInput(label: string) {
  const instance = input({ id: label })
  const el = document.createElement("input")
  el.setAttribute("aria-label", label)
  document.body.append(el)
  const unbind = bind(instance.part("root"), el)
  cleanups.push(() => {
    unbind()
    instance.destroy()
  })
  return instance
}

// A password field, whose values the bridge reports as "[redacted]".
function mountPassword(label: string) {
  const instance = input({ id: label })
  const el = Object.assign(document.createElement("input"), {
    type: "password",
  })
  el.setAttribute("aria-label", label)
  document.body.append(el)
  const unbind = bind(instance.part("root"), el)
  cleanups.push(() => {
    unbind()
    instance.destroy()
  })
  return instance
}

describe("createLasso", () => {
  type BoardState = { selected: string[]; lasso: LassoDraft | null }
  const board = definePrimitive({
    name: "lasso-board",
    options: { selected: "list", locked: "string" },
    state: (options: { selected?: string[]; locked?: string }): BoardState => ({
      selected: options.selected ?? [],
      lasso: null,
    }),
    live: ["lasso"],
    api: (context) => {
      const set = vi.fn((selected: string[]) => {
        context.store.set({ selected })
        return true
      })
      const lasso = createLasso<BoardState>(context, {
        slot: "card",
        draft: "lasso",
        selected: () => context.store.get().selected,
        set,
        selectable: (key) => key !== context.options().locked,
      })
      return { lasso, set }
    },
    slots: (slot) => ({
      card: slot<{ value: string }>({ props: { value: "string" } }),
    }),
  })
  const pointer = (
    type: string,
    clientX: number,
    clientY: number,
    shiftKey = false
  ) =>
    new PointerEvent(type, {
      clientX,
      clientY,
      shiftKey,
      button: 0,
      isPrimary: true,
      bubbles: true,
    })
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

  // A surface at (100, 100) with cards at its corners and middle.
  function mount(options: { selected?: string[]; locked?: string } = {}) {
    const instance = board({ id: "b", ...options })
    cleanups.push(() => instance.destroy())
    const surface = document.createElement("div")
    surface.getBoundingClientRect = () => rect(100, 100, 400, 300)
    document.body.append(surface)
    const places = {
      a: [110, 110],
      b: [400, 110],
      c: [110, 300],
      d: [280, 200],
    }
    for (const [value, [left, top]] of Object.entries(places)) {
      const el = document.createElement("div")
      el.getBoundingClientRect = () => rect(left, top, 60, 40)
      surface.append(el)
      cleanups.push(bind(instance.part("card", { value }), el))
    }
    return { instance, surface }
  }

  test("a rectangle selects every card it touches, once, when the pointer lifts", async () => {
    const { instance, surface } = mount()
    const { lasso, set } = instance.api
    lasso.pointerdown(pointer("pointerdown", 105, 105), surface)
    document.dispatchEvent(pointer("pointermove", 300, 215))
    await frame()
    // Relative to the surface, and it touches a and d.
    expect(instance.get().lasso).toEqual({
      left: 5,
      top: 5,
      right: 200,
      bottom: 115,
      keys: ["a", "d"],
    })
    expect(lasso.touches(instance.get(), "d")).toBe(true)
    expect(lasso.style(instance.get())).toBe(
      "position:absolute;pointer-events:none;left:5px;top:5px;width:195px;height:110px"
    )
    expect(set).not.toHaveBeenCalled()
    document.dispatchEvent(pointer("pointerup", 300, 215))
    expect(set).toHaveBeenCalledTimes(1)
    expect(instance.get().selected).toEqual(["a", "d"])
    expect(lasso.style(instance.get())).toBe("display:none")
  })

  test("Shift adds to the selection, and cards that can't be selected are skipped", async () => {
    const { instance, surface } = mount({ selected: ["b"], locked: "c" })
    instance.api.lasso.pointerdown(
      pointer("pointerdown", 105, 495, true),
      surface
    )
    // Up and to the right, over c and d.
    document.dispatchEvent(pointer("pointermove", 300, 200, true))
    await frame()
    document.dispatchEvent(pointer("pointerup", 300, 200, true))
    expect(instance.get().selected).toEqual(["b", "d"])
  })

  test("Escape lets go without selecting, and keeps the press from anything around it", async () => {
    const { instance, surface } = mount({ selected: ["b"] })
    const outside = vi.fn()
    document.addEventListener("keydown", outside)
    cleanups.push(() => document.removeEventListener("keydown", outside))
    instance.api.lasso.pointerdown(pointer("pointerdown", 105, 105), surface)
    document.dispatchEvent(pointer("pointermove", 300, 215))
    await frame()
    surface.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    expect(instance.get().lasso).toBeNull()
    expect(outside).not.toHaveBeenCalled()
    document.dispatchEvent(pointer("pointerup", 300, 215))
    expect(instance.api.set).not.toHaveBeenCalled()
    expect(instance.get().selected).toEqual(["b"])
  })

  test("a second finger pressing the surface mid-rectangle leaves it to the first finger", async () => {
    const { instance, surface } = mount()
    const { lasso, set } = instance.api
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
      })
    lasso.pointerdown(touch("pointerdown", 105, 105, 1), surface)
    document.dispatchEvent(touch("pointermove", 300, 215, 1))
    await frame()
    lasso.pointerdown(touch("pointerdown", 450, 350, 2), surface)
    document.dispatchEvent(touch("pointerup", 450, 350, 2))
    expect(set).not.toHaveBeenCalled()
    document.dispatchEvent(touch("pointerup", 300, 215, 1))
    expect(set).toHaveBeenCalledTimes(1)
    expect(instance.get().selected).toEqual(["a", "d"])
  })

  test("a press that doesn't move past the threshold selects nothing", () => {
    const { instance, surface } = mount({ selected: ["a"] })
    instance.api.lasso.pointerdown(pointer("pointerdown", 300, 300), surface)
    document.dispatchEvent(pointer("pointerup", 301, 301))
    expect(instance.api.set).not.toHaveBeenCalled()
    expect(instance.get().selected).toEqual(["a"])
  })
})

describe("css", () => {
  test("joins declarations into a style attribute, skipping empty ones", () => {
    expect(
      css({ position: "absolute", left: 0, "--zoom": 1.5, top: undefined })
    ).toBe("position:absolute;left:0;--zoom:1.5")
    expect(css({ top: undefined })).toBe("")
  })
})

describe("createHistory", () => {
  test("records changes with their source, seeks back and forth, and undoes only the agent's", async () => {
    const agent = createAgent()
    const wifi = mountCheckbox("wifi", "Wi-Fi")
    const bluetooth = mountCheckbox("bluetooth", "Bluetooth")
    const history = createHistory(agent, { keys: ["checked"] })
    cleanups.push(history.destroy)
    const heard = vi.fn()
    history.subscribe(heard)
    wifi.api.setChecked(true, { reason: "imperative" })
    await agent.act({
      steps: [{ ref: "Bluetooth", action: "setChecked", args: [true] }],
    })
    expect(
      history
        .entries()
        .map((entry) => [
          entry.label,
          entry.value,
          entry.previous,
          entry.source,
        ])
    ).toEqual([
      ["Wi-Fi", true, false, "programmatic"],
      ["Bluetooth", true, false, "agent"],
    ])
    expect(heard).toHaveBeenCalled()
    expect(history.entries().map(describeEntry)).toEqual([
      "You set Wi-Fi to true",
      "Agent set Bluetooth to true",
    ])

    await history.seek(0)
    expect([wifi.get().checked, bluetooth.get().checked]).toEqual([
      false,
      false,
    ])
    expect(history.entries()).toHaveLength(2)
    await history.seek(2)
    expect([wifi.get().checked, bluetooth.get().checked]).toEqual([true, true])

    await history.undoSource("agent")
    expect([wifi.get().checked, bluetooth.get().checked]).toEqual([true, false])
    expect(history.entries()[1].reverted).toBe(true)
  })

  test("a drag that commits is one entry, and every step without coalescing", () => {
    const agent = createAgent()
    const settled = createHistory(agent)
    const steps = createHistory(agent, { coalesce: false })
    cleanups.push(settled.destroy, steps.destroy)
    const instance = slider({ id: "volume" })
    cleanups.push(() => instance.destroy())
    // As a mouse, since jsdom sends no trusted events.
    withSource("mouse", () => {
      instance.api.internal.begin(0, 0)
      instance.api.internal.move(20)
      instance.api.internal.move(40)
      instance.api.internal.end()
    })
    expect(
      settled
        .entries()
        .map((entry) => [entry.value, entry.previous, entry.reason])
    ).toEqual([[40, 0, "drag"]])
    expect(
      steps.entries().map((entry) => [entry.value, entry.previous])
    ).toEqual([
      [20, 0],
      [40, 20],
    ])
  })

  test("a change made from the past drops the future", async () => {
    const agent = createAgent()
    const wifi = mountCheckbox("wifi", "Wi-Fi")
    const history = createHistory(agent, { keys: ["checked"] })
    cleanups.push(history.destroy)
    wifi.api.setChecked(true, { reason: "imperative" })
    wifi.api.setChecked(false, { reason: "imperative" })
    await history.seek(1)
    expect(wifi.get().checked).toBe(true)
    wifi.api.setChecked(false, { reason: "imperative" })
    expect(history.entries()).toHaveLength(2)
    expect(history.position()).toBe(2)
  })

  test("keeps a person's changes made while an undo waits for permission", async () => {
    const asked: ((allowed: boolean) => void)[] = []
    // A person confirms each step that empties a field, like the undo's.
    const agent = createAgent({
      allow: (step) =>
        step.args[0] !== "" ||
        new Promise<boolean>((resolve) => asked.push(resolve)),
    })
    const name = mountInput("Name")
    const email = mountInput("Email")
    const notes = mountInput("Notes")
    const history = createHistory(agent)
    cleanups.push(history.destroy)
    await agent.act({
      steps: [
        { ref: "Name", action: "setValue", args: ["Ada"] },
        { ref: "Email", action: "setValue", args: ["ada@example.com"] },
      ],
    })

    const undone = history.undoSource("agent")
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    // While Name's undo waits: a field the undo leaves alone, and Email, which it hasn't reached.
    notes.api.setValue("Call back")
    email.api.setValue("ada@work.example")
    asked[0](true)
    expect(await undone).toMatchObject([{ key: "value", value: "" }])
    expect([name.get().value, email.get().value, notes.get().value]).toEqual([
      "",
      "ada@work.example",
      "Call back",
    ])
    expect(
      history.entries().map((entry) => [describeEntry(entry), entry.reverted])
    ).toEqual([
      ["Agent set Name to Ada", true],
      ["Agent set Email to ada@example.com", undefined],
      ["You set Notes to Call back", undefined],
      ["You set Email to ada@work.example", undefined],
    ])
  })

  test("a refused restore leaves its entries applied and resolves with what stayed", async () => {
    // The person refuses every uncheck.
    const agent = createAgent({ allow: (step) => step.args[0] !== false })
    const wifi = mountCheckbox("wifi", "Wi-Fi")
    const history = createHistory(agent, { keys: ["checked"] })
    cleanups.push(history.destroy)
    await agent.act({
      steps: [{ ref: "Wi-Fi", action: "setChecked", args: [true] }],
    })

    expect(await history.undoSource("agent")).toMatchObject([
      { key: "checked", value: false },
    ])
    expect(history.entries()[0].reverted).toBeUndefined()
    expect(await history.seek(0)).toHaveLength(1)
    expect(history.position()).toBe(1)
    expect(wifi.get().checked).toBe(true)
  })

  test("a seek puts back the controls still on the page and resolves with the ones that left", async () => {
    const agent = createAgent()
    const wifi = mountCheckbox("wifi", "Wi-Fi")
    const bluetooth = mountCheckbox("bluetooth", "Bluetooth")
    const history = createHistory(agent, { keys: ["checked"] })
    cleanups.push(history.destroy)
    wifi.api.setChecked(true, { reason: "imperative" })
    bluetooth.api.setChecked(true, { reason: "imperative" })
    // Wi-Fi leaves the page.
    document.querySelector("label")?.remove()

    expect(await history.seek(0)).toEqual([
      { ref: history.entries()[0].ref, key: "checked", value: false },
    ])
    expect(bluetooth.get().checked).toBe(false)
    expect(history.position()).toBe(0)
  })

  test("a password's change is marked redacted, and seeking or undoing leaves it and reports it", async () => {
    const agent = createAgent()
    const password = mountPassword("Password")
    const history = createHistory(agent)
    cleanups.push(history.destroy)
    password.api.setValue("hunter2")
    await agent.act({
      steps: [{ ref: "Password", action: "setValue", args: ["hunter3"] }],
    })
    expect(
      history
        .entries()
        .map((entry) => [entry.value, entry.previous, entry.redacted])
    ).toEqual([
      ["[redacted]", "[redacted]", true],
      ["[redacted]", "[redacted]", true],
    ])

    expect(await history.undoSource("agent")).toMatchObject([{ key: "value" }])
    expect(password.get().value).toBe("hunter3")
    expect(history.entries()[1].reverted).toBeUndefined()
    expect(await history.seek(0)).toMatchObject([{ key: "value" }])
    expect(password.get().value).toBe("hunter3")
    expect(history.position()).toBe(2)
  })
})

describe("stageChanges", () => {
  test("revert leaves a filled password field as staged and resolves with it", async () => {
    const agent = createAgent()
    const pin = mountPassword("PIN")
    const name = mountInput("Name")
    pin.api.setValue("1234")
    const staged = await stageChanges(agent, [
      { ref: "PIN", value: "9999" },
      { ref: "Name", value: "Ada" },
    ])
    expect(staged.applied.map((change) => change.before)).toEqual([
      "[redacted]",
      "",
    ])
    expect(await staged.revert()).toMatchObject([
      { key: "value", before: "[redacted]", value: "9999" },
    ])
    expect([pin.get().value, name.get().value]).toEqual(["9999", ""])
  })

  test("finds a control by ref past the snapshot's limit", async () => {
    const agent = createAgent()
    const fields = Array.from({ length: 120 }, (_, i) =>
      mountInput(`Field ${i}`)
    )
    const found = await agent.query({ text: "Field 119" })
    const ref = Array.isArray(found) ? found[0].ref : ""
    const staged = await stageChanges(agent, [{ ref, value: "Ada" }])
    expect(staged.applied).toHaveLength(1)
    expect(fields[119].get().value).toBe("Ada")
  })

  test("puts values on through the bridge and reverts them", async () => {
    const agent = createAgent()
    const wifi = mountCheckbox("wifi", "Wi-Fi")
    const staged = await stageChanges(agent, [
      { ref: "Wi-Fi", key: "checked", value: true },
      { ref: "Nothing here", value: 1 },
    ])
    expect(wifi.get().checked).toBe(true)
    expect(staged.applied).toHaveLength(1)
    await staged.revert()
    expect(wifi.get().checked).toBe(false)
  })
})
