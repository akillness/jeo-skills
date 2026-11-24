import { describe, expect, test } from "vitest"
import {
  createResizableController,
  resizable,
} from "../src/components/resizable/resizable"
import { handleBounds } from "../src/components/resizable/resizable-layout"
import { expectNoMissedUpdates, fakeElement, type Part } from "./selects"
import { attrs, liveAttrs, subscribe } from "../src/foundation/kernel/part"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"
import { kept } from "./kept"

// Panels select on their own size, and handles on their own value, hover and
// drag, so a move reaches the parts it changes, not every one.

// A document whose listeners a test calls itself, for the page-wide hover
// tracking every handle registers with. Frames run at once.
function fakeDocument() {
  const listeners: Record<string, (event: unknown) => void> = {}
  const listen = (type: string, listener: (event: unknown) => void) =>
    (listeners[type] = listener)
  const doc = {
    addEventListener: listen,
    removeEventListener() {},
    documentElement: { addEventListener: listen },
    defaultView: {
      requestAnimationFrame: (run: () => void) => (run(), 0),
      cancelAnimationFrame() {},
      CSSStyleSheet: class {
        replaceSync() {}
      },
    },
    adoptedStyleSheets: [],
    elementFromPoint: () => null,
  }
  return {
    doc,
    hover: (x: number) =>
      listeners.pointermove({
        clientX: x,
        clientY: 50,
        pointerType: "mouse",
        buttons: 0,
      }),
    leave: () => listeners.pointerleave({}),
  }
}

// A handle as thin as a line at `x`, in a fake document.
function handleElement(index: number, x: number, doc: unknown) {
  return Object.assign(fakeElement(index, "DIV"), {
    ownerDocument: doc,
    getBoundingClientRect: () => ({
      left: x,
      right: x,
      top: 0,
      bottom: 100,
      width: 0,
      height: 100,
    }),
  })
}

function group(
  options: Parameters<typeof resizable>[0],
  count: number,
  instance = resizable(options)
) {
  const ids = Array.from({ length: count }, (_, index) => `p${index}`)
  instance.api.internal.setPanels(
    ids,
    ids.map((_, index) => (index === 1 ? { minSize: 10, maxSize: 60 } : {}))
  )
  instance.api.internal.setHandles(
    Object.fromEntries(ids.slice(1).map((_, index) => [`h${index}`, index]))
  )
  instance.api.internal.setSpace(1000)
  return { instance, ids }
}

describe("resizable panels and handles select on what they show", () => {
  test("no part misses a change", async () => {
    const controller = createResizableController()
    const options = { id: "g", controller }
    const instance = kept(resizable(options))
    instance.setOptions(options)
    const { api } = instance
    const { doc, hover, leave } = fakeDocument()
    const unbind = [0, 1, 2].map((index) =>
      api.internal.bindHandle(
        handleElement(index, (index + 1) * 250, doc),
        instance.part("handle", { id: `h${index}` })
      )
    )
    // Binding reads the page's panels a microtask later. There are none, so
    // the test sets them after.
    await Promise.resolve()
    group(options, 4, instance)
    const parts: Part[] = [
      { slot: "root", props: {} },
      ...["p0", "p1", "p2", "p3"].map((id) => ({
        slot: "panel",
        props: { id },
      })),
      { slot: "panel", props: { id: "gone" } },
      { slot: "handle", props: { id: "h0" } },
      { slot: "handle", props: { id: "h1" } },
      { slot: "handle", props: { id: "h2", disabled: true } },
    ]
    for (const part of parts) {
      attrs((instance as PrimitiveInstance).part(part.slot, part.props))
    }
    const key = (name: string) =>
      ({ key: name, shiftKey: false, preventDefault() {} }) as KeyboardEvent
    const heard = await expectNoMissedUpdates(instance, parts, [
      ["start a drag", () => api.internal.startDrag(0, "h0")],
      ["drag", () => api.internal.dragBy(5)],
      ["drag further", () => api.internal.dragBy(10)],
      ["drag back past the start", () => api.internal.dragBy(-20)],
      ["end the drag", () => api.internal.endDrag()],
      [
        "an arrow key",
        () => api.internal.keydown(key("ArrowRight"), "h1", {} as HTMLElement),
      ],
      [
        "Home",
        () => api.internal.keydown(key("Home"), "h1", {} as HTMLElement),
      ],
      ["the key comes up", () => api.internal.commitKeys()],
      ["hover a handle", () => hover(250)],
      ["hover another handle", () => hover(500)],
      ["the pointer leaves", () => leave()],
      ["resize a panel", () => controller.resize("p3", 10)],
      ["set the layout", () => controller.setLayout([10, 20, 30, 40])],
      ["the group shrinks", () => api.internal.setSpace(500)],
      [
        "a panel can collapse",
        () =>
          api.internal.setPanels(
            ["p0", "p1", "p2", "p3"],
            [{ minSize: 20, collapsible: true }, {}, {}, {}]
          ),
      ],
      ["collapse it", () => controller.collapse("p0")],
      ["expand it", () => controller.expand("p0")],
      [
        "Enter collapses it",
        () => api.internal.keydown(key("Enter"), "h0", {} as HTMLElement),
      ],
      [
        "drag it open",
        () => {
          api.internal.startDrag(0, "h0")
          api.internal.dragBy(30)
          api.internal.endDrag()
        },
      ],
      [
        "vertical",
        () => instance.setOptions({ ...options, orientation: "vertical" }),
      ],
      [
        "a panel changes its bounds",
        () =>
          api.internal.setPanels(
            ["p0", "p1", "p2", "p3"],
            [{ maxSize: 20 }, {}, {}, {}]
          ),
      ],
      [
        "a panel leaves",
        () => api.internal.setPanels(["p0", "p1", "p3"], [{}, {}, {}]),
      ],
      ["the handles follow", () => api.internal.setHandles({ h0: 0, h1: 1 })],
      [
        "disable the group",
        () => instance.setOptions({ ...options, disabled: true }),
      ],
    ])
    // The two panels beside the handle, the two handles whose values moved, and the root.
    expect(heard["drag"]).toBe(5)
    // The handle that leaves the hover, the one that takes it, and the root.
    expect(heard["hover another handle"]).toBe(3)
    unbind.forEach((cleanup) => cleanup?.())
  })

  test("a hover reads which handles are disabled again", async () => {
    const instance = resizable({ id: "g" })
    const { doc, hover } = fakeDocument()
    const unbind = [0, 1].map((index) =>
      instance.api.internal.bindHandle(
        handleElement(index, (index + 1) * 300, doc),
        instance.part("handle", { id: `h${index}` })
      )
    )
    await Promise.resolve()
    group({ id: "g" }, 3, instance)
    attrs(instance.part("handle", { id: "h0" }))
    attrs(instance.part("handle", { id: "h1" }))
    const free = instance.api.internal.handleValue("h0")!.max
    // A framework passes a handle's new props as it renders, which changes
    // nothing in the group's state. The first handle's panel now stops at it.
    attrs(instance.part("handle", { id: "h1", disabled: true }))
    hover(300)
    const { layout, constraints } = instance.get()
    const max = instance.api.internal.handleValue("h0")!.max
    expect(max).toBeCloseTo(
      handleBounds(layout, constraints, 0, [false, true]).max,
      9
    )
    expect(max).toBeLessThan(free)
    unbind.forEach((cleanup) => cleanup?.())
  })

  test("a move works out which handles are locked once, not once per handle", () => {
    const readsPerMove = (count: number) => {
      const reads = { count: 0 }
      const { instance } = group({ id: "g" }, count)
      const handles = Array.from({ length: count - 1 }, (_, index) => ({
        id: `h${index}`,
        get disabled() {
          reads.count++
          return false
        },
      }))
      // Each handle writes its live attributes on every change it hears, as a bound one does.
      for (const props of handles) {
        attrs(instance.part("handle", props))
        subscribe(instance.part("handle", props), () =>
          liveAttrs(instance.part("handle", props))
        )
      }
      instance.api.internal.startDrag(0, "h0")
      reads.count = 0
      instance.api.internal.dragBy(5)
      return reads.count / handles.length
    }
    // Once for the move and once for the handles' values, however many handles there are.
    expect(readsPerMove(10)).toBeLessThanOrEqual(2)
    expect(readsPerMove(200)).toBeLessThanOrEqual(2)
  })
})
