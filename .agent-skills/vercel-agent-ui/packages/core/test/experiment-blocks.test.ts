// @vitest-environment jsdom
// The blocks added for components nobody has built yet: spatial focus, 2D
// moves, layers of any shape, events that aren't state, and observing with
// the value before. Through the public entries only; `bind` from the kernel
// stands in for an adapter.
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  bindLayer,
  createChange,
  createMove,
  definePrimitive,
  dispatch,
  nearestInDirection,
  createRovingFocus,
  spatialMove,
  type ChangeDetails,
  type MovePoint,
} from "../src/index"
import {
  createVelocityTracker,
  projectDistance,
  solveSpring,
} from "../src/foundation/motion/gesture"
import { bind } from "../src/foundation/kernel/part"
import { elementOf, observe } from "../src/page/observe/observe"

afterEach(() => {
  document.body.innerHTML = ""
})

const box = (left: number, top: number, size = 10) => ({
  left,
  top,
  right: left + size,
  bottom: top + size,
})

describe("nearestInDirection", () => {
  const cards = [
    { key: "right", rect: box(100, 0) },
    { key: "far-right-aligned", rect: box(300, 0) },
    { key: "down-right", rect: box(60, 80) },
    { key: "left", rect: box(-100, 0) },
  ]

  test("goes to the nearest box straight ahead", () => {
    expect(nearestInDirection(box(0, 0), cards, [1, 0])).toBe("right")
    expect(nearestInDirection(box(0, 0), cards, [-1, 0])).toBe("left")
  })

  test("prefers the cone ahead over a closer box off to the side", () => {
    expect(nearestInDirection(box(0, 0), cards, [0, 1])).toBe("down-right")
    expect(
      nearestInDirection(
        box(0, 0),
        [
          { key: "a", rect: box(40, 60) },
          { key: "b", rect: box(5, 120) },
        ],
        [0, 1]
      )
    ).toBe("b")
  })

  test("returns undefined when nothing lies that way", () => {
    expect(nearestInDirection(box(0, 0), cards, [0, -1])).toBeUndefined()
  })
})

// A board: items placed in 2D, spatial arrows, Alt nudges.
type BoardState = {
  positions: Record<string, MovePoint>
  focused: string | null
  moving: null
}
const board = definePrimitive({
  name: "board",
  options: { defaultPositions: "value", onPositionsChange: "callback" },
  state: (options: {
    defaultPositions: Record<string, MovePoint>
    onPositionsChange?: (
      value: Record<string, MovePoint>,
      details: ChangeDetails<"drag" | "move-key" | "imperative">
    ) => void
  }): BoardState => ({
    positions: options.defaultPositions,
    focused: null,
    moving: null,
  }),
  live: ["moving"],
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<BoardState, { value: string }>(context, {
      slot: "card",
      key: "focused",
      move: spatialMove(),
    })
    const move = createMove<BoardState>(context, {
      key: "positions",
      draft: "moving",
      set: (value, details) => change("positions", value, details),
      step: () => 10,
      largeStep: () => 50,
    })
    return { roving, move }
  },
  slots: (slot) => ({
    card: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          api.move.keydown(event, key) || api.roving.keydown(event, el!),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

describe("spatialMove and createMove", () => {
  function setup() {
    const onPositionsChange = vi.fn()
    const positions = {
      a: { x: 0, y: 0 },
      b: { x: 200, y: 0 },
      c: { x: 20, y: 150 },
    }
    const instance = board({
      id: "b",
      defaultPositions: positions,
      onPositionsChange,
    })
    const els = Object.fromEntries(
      Object.keys(positions).map((key) => {
        const el = document.createElement("div")
        el.tabIndex = -1
        el.getBoundingClientRect = () => {
          const at = instance.get().positions[key]
          return {
            ...box(at.x, at.y, 50),
            x: at.x,
            y: at.y,
            width: 50,
            height: 50,
            toJSON() {},
          } as DOMRect
        }
        document.body.append(el)
        bind(instance.part("card", { value: key }), el)
        return [key, el]
      })
    )
    return { instance, els, onPositionsChange }
  }

  test("arrows go to the nearest card on screen", async () => {
    const { els } = setup()
    await Promise.resolve()
    els.a.focus()
    els.a.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    )
    await new Promise((resolve) => setTimeout(resolve))
    expect(document.activeElement).toBe(els.c)
    els.c.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    )
    await new Promise((resolve) => setTimeout(resolve))
    expect(document.activeElement).toBe(els.b)
  })

  test("Alt with an arrow nudges the card a step, Shift a large step, in one change each", () => {
    const { instance, els, onPositionsChange } = setup()
    els.a.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        altKey: true,
        bubbles: true,
      })
    )
    expect(instance.get().positions.a).toEqual({ x: 10, y: 0 })
    els.a.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        altKey: true,
        shiftKey: true,
        bubbles: true,
      })
    )
    expect(instance.get().positions.a).toEqual({ x: 10, y: 50 })
    expect(onPositionsChange).toHaveBeenCalledTimes(2)
    expect(onPositionsChange.mock.calls[0][1].reason).toBe("move-key")
  })

  test("moveBy moves a group and reports imperative", () => {
    const { instance, onPositionsChange } = setup()
    instance.api.move.moveBy(["a", "c"], 5, -5)
    expect(instance.get().positions).toMatchObject({
      a: { x: 5, y: -5 },
      c: { x: 25, y: 145 },
      b: { x: 200, y: 0 },
    })
    expect(onPositionsChange.mock.calls[0][1].reason).toBe("imperative")
  })

  test("a drag follows the pointer from the press, threshold included, and commits once", () => {
    const { instance, els, onPositionsChange } = setup()
    const pointer = (type: string, clientX: number, clientY: number) =>
      new PointerEvent(type, {
        clientX,
        clientY,
        button: 0,
        isPrimary: true,
        bubbles: true,
      })
    instance.api.move.pointerdown(pointer("pointerdown", 10, 10), "a", els.a)
    document.dispatchEvent(pointer("pointermove", 60, 30))
    document.dispatchEvent(pointer("pointerup", 60, 30))
    expect(instance.get().positions.a).toEqual({ x: 50, y: 20 })
    expect(onPositionsChange).toHaveBeenCalledTimes(1)
    expect(onPositionsChange.mock.calls[0][1].reason).toBe("drag")
  })

  test("a second finger pressing another card mid-drag leaves the first card following the first finger", async () => {
    const { instance, els, onPositionsChange } = setup()
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
    instance.api.move.pointerdown(touch("pointerdown", 10, 10, 1), "a", els.a)
    document.dispatchEvent(touch("pointermove", 40, 10, 1))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    instance.api.move.pointerdown(touch("pointerdown", 210, 10, 2), "b", els.b)
    document.dispatchEvent(touch("pointerup", 210, 10, 2))
    expect(onPositionsChange).not.toHaveBeenCalled()
    document.dispatchEvent(touch("pointermove", 60, 30, 1))
    document.dispatchEvent(touch("pointerup", 60, 30, 1))
    expect(instance.get().positions.a).toEqual({ x: 50, y: 20 })
    expect(instance.get().moving).toBeNull()
    expect(onPositionsChange).toHaveBeenCalledTimes(1)
  })

  test("a second finger landing before the first has moved past the threshold leaves the card to the first finger", async () => {
    const { instance, els } = setup()
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
    instance.api.move.pointerdown(touch("pointerdown", 10, 10, 1), "a", els.a)
    instance.api.move.pointerdown(touch("pointerdown", 210, 10, 2), "b", els.b)
    document.dispatchEvent(touch("pointermove", 40, 10, 1))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(instance.get().moving).toEqual({ keys: ["a"], dx: 30, dy: 0 })
    document.dispatchEvent(touch("pointerup", 40, 10, 1))
  })

  test("style gives dragged items their offset", () => {
    const { instance } = setup()
    const state = {
      ...instance.get(),
      moving: { keys: ["a"], dx: 4, dy: 6 },
    } as never
    expect(instance.api.move.style(state, "a")).toContain("translate:4px 6px")
    expect(instance.api.move.style(state, "b")).toBeUndefined()
  })
})

describe("dispatch", () => {
  test("calls the option with change details, and reports a cancel", () => {
    const onAction = vi.fn(
      (_value: string, details: ChangeDetails<"item-press">) => details.cancel()
    )
    const context = { options: () => ({ onAction }) }
    expect(
      dispatch(context, "onAction", "share", { reason: "item-press" })
    ).toBe(true)
    expect(onAction.mock.calls[0][0]).toBe("share")
    expect(onAction.mock.calls[0][1]).toMatchObject({
      reason: "item-press",
      source: "programmatic",
    })
    expect(
      dispatch({ options: () => ({}) }, "onAction", "x", {
        reason: "item-press",
      })
    ).toBe(false)
  })
})

describe("bindLayer", () => {
  test("Escape and an outside press ask the topmost layer to close", () => {
    const outer = document.createElement("div")
    const inner = document.createElement("div")
    const outside = document.createElement("button")
    document.body.append(outer, inner, outside)
    const closeOuter = vi.fn()
    const closeInner = vi.fn()
    const offOuter = bindLayer(outer, { onDismiss: closeOuter })
    const offInner = bindLayer(inner, { onDismiss: closeInner })
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(closeInner).toHaveBeenCalledWith(
      "escape-key",
      expect.any(KeyboardEvent)
    )
    expect(closeOuter).not.toHaveBeenCalled()
    offInner()
    outside.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true })
    )
    expect(closeOuter).toHaveBeenCalledWith("outside-press", expect.anything())
    offOuter()
  })

  test("a modal layer swallows the click of the press that closed it, even as the last layer", () => {
    const panel = document.createElement("div")
    const outside = document.createElement("button")
    const clicked = vi.fn()
    outside.addEventListener("click", clicked)
    document.body.append(panel, outside)
    // Closing removes the layer at once, as a framework unmounting it does.
    const off: () => void = bindLayer(panel, {
      modal: true,
      onDismiss: () => off(),
    })
    outside.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    )
    outside.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: 1,
      })
    )
    expect(clicked).not.toHaveBeenCalled()
    // The next press is the page's again.
    outside.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    )
    outside.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: 1,
      })
    )
    expect(clicked).toHaveBeenCalledOnce()
  })

  test("a layer in an iframe hears Escape and outside presses there", () => {
    const frame = document.body.appendChild(document.createElement("iframe"))
    const doc = frame.contentDocument!
    const panel = doc.body.appendChild(doc.createElement("div"))
    const outside = doc.body.appendChild(doc.createElement("button"))
    // The iframe's own event classes, as its document's events are.
    const view = frame.contentWindow as typeof window
    const dismissed = vi.fn()
    const off = bindLayer(panel, { onDismiss: (reason) => dismissed(reason) })
    panel.dispatchEvent(
      new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
    outside.dispatchEvent(
      new view.PointerEvent("pointerdown", { bubbles: true, composed: true })
    )
    expect(dismissed.mock.calls).toEqual([["escape-key"], ["outside-press"]])
    off()
  })
})

describe("observe", () => {
  const toggle = definePrimitive({
    name: "toggle",
    options: { onPressedChange: "callback" },
    state: (_options: {
      onPressedChange?: (
        pressed: boolean,
        details: ChangeDetails<"press">
      ) => void
    }) => ({
      pressed: false,
    }),
    api: (context) => {
      const change = createChange(context)
      return {
        press: () =>
          change("pressed", !context.store.get().pressed, { reason: "press" }),
      }
    },
    slots: (slot) => ({
      root: slot({ attrs: () => ({ "aria-label": "Bold" }) }),
    }),
  })

  test("reports the value before, scopes to an element, and finds a component's element", () => {
    const panel = document.createElement("section")
    const elsewhere = document.createElement("section")
    document.body.append(panel, elsewhere)
    const all = vi.fn()
    const inPanel = vi.fn()
    const stopAll = observe(all)
    const stopPanel = observe(inPanel, { within: panel })
    const a = toggle({ id: "a" })
    const b = toggle({ id: "b" })
    const elA = panel.appendChild(document.createElement("button"))
    const elB = elsewhere.appendChild(document.createElement("button"))
    bind(a.part("root", {}), elA)
    bind(b.part("root", {}), elB)
    a.api.press()
    b.api.press()
    expect(all).toHaveBeenCalledTimes(2)
    expect(all.mock.calls[0][0]).toMatchObject({
      key: "pressed",
      value: true,
      previous: false,
    })
    expect(inPanel).toHaveBeenCalledTimes(1)
    expect(elementOf(all.mock.calls[0][0].ref)).toBe(elA)
    stopAll()
    stopPanel()
  })
})

describe("gesture", () => {
  test("a flick has velocity, a stop before release has none", () => {
    const tracker = createVelocityTracker()
    for (let t = 0; t <= 50; t += 10) {
      tracker.add(t, t * 2)
    }
    expect(tracker.velocity(50)).toBeCloseTo(2, 1)
    expect(tracker.velocity(200)).toBe(0)
  })

  test("a throw lands further the faster it goes, and a spring settles at its target", () => {
    expect(projectDistance(2, 0.998)).toBeGreaterThan(projectDistance(1, 0.998))
    const spring = solveSpring(0.3, 1, 100, 0)
    expect(spring.position(0)).toBeCloseTo(100)
    expect(Math.abs(spring.position(2000))).toBeLessThan(0.5)
  })
})
