// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { resizable } from "../src/components/resizable/resizable"
import { bind, liveAttrs } from "../src/foundation/kernel/part"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

test("a panel whose minimum grows past its size while mounted grows to it", async () => {
  const instance = resizable({ id: "g" })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = () => root.appendChild(document.createElement("div"))
  cleanups.push(
    bind(
      instance.part("panel", { id: "a", defaultSize: 20, minSize: 10 }),
      element()
    )!
  )
  cleanups.push(bind(instance.part("handle", { id: "h" }), element())!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element())!)
  await Promise.resolve()
  expect(instance.api.getLayout()).toEqual([20, 80])
  instance.part("panel", { id: "a", defaultSize: 20, minSize: 40 })
  await Promise.resolve()
  expect(instance.api.getLayout()).toEqual([40, 60])
  expect(liveAttrs(instance.part("handle", { id: "h" }))["aria-valuemin"]).toBe(
    "40"
  )
})

test("a controlled layout is asked to grow a panel whose minimum grows past it", async () => {
  const onLayoutChange = vi.fn()
  const instance = resizable({ id: "g", layout: [20, 80], onLayoutChange })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = () => root.appendChild(document.createElement("div"))
  cleanups.push(
    bind(instance.part("panel", { id: "a", minSize: 10 }), element())!
  )
  cleanups.push(bind(instance.part("handle", { id: "h" }), element())!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element())!)
  await Promise.resolve()
  instance.part("panel", { id: "a", minSize: 40 })
  await Promise.resolve()
  expect(onLayoutChange).toHaveBeenCalledTimes(1)
  expect(onLayoutChange).toHaveBeenCalledWith(
    [40, 60],
    expect.objectContaining({ reason: "resize" })
  )
})

test("a controlled owner that ignores a bounds resize can still be asked for a later one", async () => {
  const onLayoutChange = vi.fn()
  const instance = resizable({ id: "g", layout: [20, 80], onLayoutChange })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = () => root.appendChild(document.createElement("div"))
  cleanups.push(
    bind(instance.part("panel", { id: "a", minSize: 10 }), element())!
  )
  cleanups.push(bind(instance.part("handle", { id: "h" }), element())!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element())!)
  await Promise.resolve()
  instance.part("panel", { id: "a", minSize: 40 })
  await Promise.resolve()
  instance.part("panel", { id: "a", minSize: 10 })
  await Promise.resolve()
  onLayoutChange.mockClear()
  instance.api.resize("a", 40)
  expect(onLayoutChange).toHaveBeenCalledWith(
    [40, 60],
    expect.objectContaining({ reason: "imperative" })
  )
})

test("bounds that change on two panels in one render ask a controlled owner once, after the render", async () => {
  const onLayoutChange = vi.fn()
  const instance = resizable({ id: "g", layout: [20, 80], onLayoutChange })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = () => root.appendChild(document.createElement("div"))
  cleanups.push(
    bind(instance.part("panel", { id: "a", minSize: 10 }), element())!
  )
  cleanups.push(bind(instance.part("handle", { id: "h" }), element())!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element())!)
  await Promise.resolve()
  instance.part("panel", { id: "a", minSize: 40 })
  instance.part("panel", { id: "b", maxSize: 50 })
  expect(onLayoutChange).not.toHaveBeenCalled()
  await Promise.resolve()
  expect(onLayoutChange).toHaveBeenCalledTimes(1)
  expect(onLayoutChange).toHaveBeenCalledWith(
    [50, 50],
    expect.objectContaining({ reason: "resize" })
  )
})

test("a group that shrinks as a panel's pixel minimum changes fits the new minimum to the new size", async () => {
  let width = 1000
  const instance = resizable({ id: "g" })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const panel = () => {
    const el = root.appendChild(document.createElement("div"))
    el.getBoundingClientRect = () => new DOMRect(0, 0, width / 2, 10)
    return el
  }
  cleanups.push(
    bind(
      instance.part("panel", { id: "a", defaultSize: 40, minSize: "300px" }),
      panel()
    )!
  )
  cleanups.push(
    bind(
      instance.part("handle", { id: "h" }),
      root.appendChild(document.createElement("div"))
    )!
  )
  cleanups.push(bind(instance.part("panel", { id: "b" }), panel())!)
  await Promise.resolve()
  expect(instance.api.getLayout()).toEqual([40, 60])
  width = 500
  instance.part("panel", { id: "a", defaultSize: 40, minSize: "100px" })
  await Promise.resolve()
  expect(instance.api.getLayout()).toEqual([40, 60])
  expect(liveAttrs(instance.part("handle", { id: "h" }))["aria-valuemin"]).toBe(
    "20"
  )
})

test("a collapsed panel whose collapsedSize changes while mounted takes the new size", async () => {
  const instance = resizable({ id: "g" })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = () => root.appendChild(document.createElement("div"))
  const a = {
    id: "a",
    defaultSize: 40,
    minSize: 20,
    collapsible: true,
    collapsedSize: 0,
  }
  cleanups.push(bind(instance.part("panel", a), element())!)
  cleanups.push(bind(instance.part("handle", { id: "h" }), element())!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element())!)
  await Promise.resolve()
  instance.api.collapse("a")
  expect(instance.api.getLayout()).toEqual([0, 100])
  instance.part("panel", { ...a, collapsedSize: 10 })
  await Promise.resolve()
  expect(instance.api.getLayout()).toEqual([10, 90])
})

function mountDragging(options: Parameters<typeof resizable>[0] = { id: "g" }) {
  const instance = resizable(options)
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = () => root.appendChild(document.createElement("div"))
  cleanups.push(
    bind(
      instance.part("panel", { id: "a", defaultSize: 20, minSize: 10 }),
      element()
    )!
  )
  cleanups.push(bind(instance.part("handle", { id: "h" }), element())!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element())!)
  return instance
}

test("a bounds change during a drag the owner cancels keeps the uncontrolled layout", async () => {
  const instance = mountDragging({
    id: "g",
    onLayoutChange: (_layout, details) => details.cancel(),
  })
  await Promise.resolve()
  instance.api.internal.startDrag(0, "h")
  instance.part("panel", { id: "a", defaultSize: 20, minSize: 40 })
  await Promise.resolve()
  expect(instance.api.getLayout()).toEqual([20, 80])
  instance.api.internal.endDrag()
  expect(instance.api.getLayout()).toEqual([20, 80])
})

test("a bounds change during a drag fits the next move and the drag's end, asking the owner each time", async () => {
  const onLayoutChange = vi.fn()
  const onLayoutCommit = vi.fn()
  const instance = mountDragging({ id: "g", onLayoutChange, onLayoutCommit })
  await Promise.resolve()
  instance.api.internal.startDrag(0, "h")
  instance.part("panel", { id: "a", defaultSize: 20, minSize: 40 })
  await Promise.resolve()
  expect(onLayoutChange).not.toHaveBeenCalled()
  instance.api.internal.dragBy(5)
  expect(instance.api.getLayout()).toEqual([40, 60])
  expect(onLayoutChange).toHaveBeenLastCalledWith(
    [40, 60],
    expect.objectContaining({ reason: "drag" })
  )
  instance.part("panel", { id: "a", defaultSize: 20, minSize: 50 })
  await Promise.resolve()
  instance.api.internal.endDrag()
  expect(instance.api.getLayout()).toEqual([50, 50])
  expect(onLayoutChange).toHaveBeenLastCalledWith(
    [50, 50],
    expect.objectContaining({ reason: "drag" })
  )
  expect(onLayoutCommit).toHaveBeenCalledTimes(1)
  expect(onLayoutCommit).toHaveBeenCalledWith(
    [50, 50],
    expect.objectContaining({ reason: "drag" })
  )
})

test("space that changes a pixel minimum during a drag fits at the drag's end", async () => {
  const onLayoutChange = vi.fn()
  const instance = resizable({ id: "g", onLayoutChange })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = () => root.appendChild(document.createElement("div"))
  cleanups.push(
    bind(
      instance.part("panel", { id: "a", defaultSize: 20, minSize: "100px" }),
      element()
    )!
  )
  cleanups.push(bind(instance.part("handle", { id: "h" }), element())!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element())!)
  await Promise.resolve()
  instance.api.internal.setSpace(1000)
  expect(instance.api.getLayout()).toEqual([20, 80])
  instance.api.internal.startDrag(0, "h")
  instance.api.internal.setSpace(250)
  expect(instance.api.getLayout()).toEqual([20, 80])
  instance.api.internal.endDrag()
  expect(instance.api.getLayout()).toEqual([40, 60])
  expect(onLayoutChange).toHaveBeenLastCalledWith(
    [40, 60],
    expect.objectContaining({ reason: "drag" })
  )
})

test("a group that grows as a panel's pixel minimum changes fits the new minimum to the new size", async () => {
  let width = 500
  const instance = resizable({ id: "g" })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const panel = () => {
    const el = root.appendChild(document.createElement("div"))
    el.getBoundingClientRect = () => new DOMRect(0, 0, width / 2, 10)
    return el
  }
  cleanups.push(
    bind(
      instance.part("panel", { id: "a", defaultSize: 40, minSize: "100px" }),
      panel()
    )!
  )
  cleanups.push(
    bind(
      instance.part("handle", { id: "h" }),
      root.appendChild(document.createElement("div"))
    )!
  )
  cleanups.push(bind(instance.part("panel", { id: "b" }), panel())!)
  await Promise.resolve()
  width = 1000
  instance.part("panel", { id: "a", defaultSize: 40, minSize: "300px" })
  await Promise.resolve()
  expect(instance.api.getLayout()).toEqual([40, 60])
  expect(liveAttrs(instance.part("handle", { id: "h" }))["aria-valuemin"]).toBe(
    "30"
  )
})

test("a render that keeps a panel's size props measures nothing", async () => {
  const instance = resizable({ id: "g" })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const measured = vi.fn(() => new DOMRect(0, 0, 250, 10))
  const panel = () => {
    const el = root.appendChild(document.createElement("div"))
    el.getBoundingClientRect = measured
    return el
  }
  cleanups.push(
    bind(
      instance.part("panel", { id: "a", defaultSize: 40, minSize: "100px" }),
      panel()
    )!
  )
  cleanups.push(
    bind(
      instance.part("handle", { id: "h" }),
      root.appendChild(document.createElement("div"))
    )!
  )
  cleanups.push(bind(instance.part("panel", { id: "b" }), panel())!)
  await Promise.resolve()
  measured.mockClear()
  instance.part("panel", { id: "a", defaultSize: 40, minSize: "100px" })
  instance.part("panel", { id: "b" })
  await Promise.resolve()
  expect(measured).not.toHaveBeenCalled()
  expect(instance.api.getLayout()).toEqual([40, 60])
})

test("disabling a group as its drag ends on new bounds commits and saves once", async () => {
  const saved = new Map<string, string>()
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => void saved.set(key, value)),
  }
  const onLayoutCommit = vi.fn()
  const options = { id: "g", autoSaveId: "editor", storage, onLayoutCommit }
  const instance = mountDragging(options)
  await Promise.resolve()
  instance.api.internal.startDrag(0, "h")
  instance.api.internal.dragBy(5)
  instance.part("panel", { id: "a", defaultSize: 20, minSize: 40 })
  await Promise.resolve()
  instance.setOptions({ ...options, disabled: true })
  expect(instance.api.getLayout()).toEqual([40, 60])
  expect(onLayoutCommit).toHaveBeenCalledTimes(1)
  expect(storage.setItem).toHaveBeenCalledTimes(1)
})

// The docs: "`disabled` on a handle fixes it in place", as the group's `disabled` does mid-drag.
test("a handle disabled mid-drag stops following the pointer, like a disabled group", async () => {
  const onLayoutCommit = vi.fn()
  const instance = resizable({ id: "g", onLayoutCommit })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = (left: number, width: number) => {
    const el = root.appendChild(document.createElement("div"))
    el.getBoundingClientRect = () => new DOMRect(left, 0, width, 10)
    return el
  }
  cleanups.push(
    bind(instance.part("panel", { id: "a", defaultSize: 50 }), element(0, 50))!
  )
  const handle = element(50, 2)
  cleanups.push(bind(instance.part("handle", { id: "h" }), handle)!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element(52, 50))!)
  await Promise.resolve()
  const pointer = (type: string, clientX: number) =>
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX,
      clientY: 5,
      bubbles: true,
      cancelable: true,
    })
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
  handle.dispatchEvent(pointer("pointerdown", 51))
  document.dispatchEvent(pointer("pointermove", 61))
  await frame()
  expect(instance.api.getLayout()).toEqual([60, 40])
  instance.part("handle", { id: "h", disabled: true })
  document.dispatchEvent(pointer("pointermove", 81))
  await frame()
  expect(instance.api.getLayout()).toEqual([60, 40])
  expect(instance.get().dragging).toBeNull()
  expect(onLayoutCommit).toHaveBeenCalledTimes(1)
})

// A drag's page-wide cursor and `user-select: none` last only while it runs, as a release clears them.
test("a group disabled mid-drag gives the page back its cursor, text selection and iframes", async () => {
  const options = { id: "g" }
  const instance = resizable(options)
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = (left: number, width: number) => {
    const el = root.appendChild(document.createElement("div"))
    el.getBoundingClientRect = () => new DOMRect(left, 0, width, 10)
    return el
  }
  cleanups.push(
    bind(instance.part("panel", { id: "a", defaultSize: 50 }), element(0, 50))!
  )
  const handle = element(50, 2)
  cleanups.push(bind(instance.part("handle", { id: "h" }), handle)!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element(52, 50))!)
  await Promise.resolve()
  const pageStyle = () =>
    [
      ...(document.adoptedStyleSheets ?? []).flatMap((sheet) =>
        [...sheet.cssRules].map((rule) => rule.cssText)
      ),
      ...[...document.querySelectorAll("style")].map(
        (style) => style.textContent
      ),
    ].join("\n")
  handle.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 51,
      clientY: 5,
      bubbles: true,
      cancelable: true,
    })
  )
  expect(pageStyle()).toContain("user-select")
  instance.setOptions({ ...options, disabled: true })
  expect(instance.get().dragging).toBeNull()
  document.dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      bubbles: true,
    })
  )
  expect(pageStyle()).not.toContain("user-select")
  expect(pageStyle()).not.toContain("resize")
})

// Each write of the page-wide drag sheet restyles the whole page, and a touch has no cursor to show.
test("a touch drag resizes without writing the page's cursor and selection styles", async () => {
  const instance = resizable({ id: "g" })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  const element = (left: number, width: number) => {
    const el = root.appendChild(document.createElement("div"))
    el.getBoundingClientRect = () => new DOMRect(left, 0, width, 10)
    return el
  }
  cleanups.push(
    bind(instance.part("panel", { id: "a", defaultSize: 50 }), element(0, 50))!
  )
  const handle = element(50, 2)
  cleanups.push(bind(instance.part("handle", { id: "h" }), handle)!)
  cleanups.push(bind(instance.part("panel", { id: "b" }), element(52, 50))!)
  await Promise.resolve()
  const pageStyle = () =>
    [
      ...(document.adoptedStyleSheets ?? []).flatMap((sheet) =>
        [...sheet.cssRules].map((rule) => rule.cssText)
      ),
      ...[...document.querySelectorAll("style")].map(
        (style) => style.textContent
      ),
    ].join("\n")
  const pointer = (type: string, clientX: number) =>
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX,
      clientY: 5,
      bubbles: true,
      cancelable: true,
    })
  handle.dispatchEvent(pointer("pointerdown", 51))
  expect(instance.get().dragging).toBe("h")
  expect(pageStyle()).not.toContain("resize")
  document.dispatchEvent(pointer("pointermove", 61))
  await new Promise((resolve) => requestAnimationFrame(resolve))
  expect(instance.api.getLayout()).toEqual([60, 40])
  expect(pageStyle()).not.toContain("user-select")
  document.dispatchEvent(pointer("pointerup", 61))
  expect(instance.get().dragging).toBeNull()
  expect(pageStyle()).not.toContain("resize")
})

// The document's press listener runs on every tap, so one outside every group reads no layout.
test("a press outside every group measures no handle", async () => {
  const instance = resizable({ id: "g" })
  const root = document.body.appendChild(document.createElement("div"))
  cleanups.push(bind(instance.part("root", {}), root)!)
  cleanups.push(
    bind(
      instance.part("panel", { id: "a", defaultSize: 50 }),
      root.appendChild(document.createElement("div"))
    )!
  )
  const handle = root.appendChild(document.createElement("div"))
  const measure = vi.fn(() => new DOMRect(50, 0, 2, 10))
  handle.getBoundingClientRect = measure
  cleanups.push(bind(instance.part("handle", { id: "h" }), handle)!)
  cleanups.push(
    bind(
      instance.part("panel", { id: "b" }),
      root.appendChild(document.createElement("div"))
    )!
  )
  await Promise.resolve()
  measure.mockClear()
  const outside = document.body.appendChild(document.createElement("button"))
  outside.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 51,
      clientY: 5,
      bubbles: true,
      cancelable: true,
    })
  )
  expect(measure).not.toHaveBeenCalled()
  expect(instance.get().dragging).toBeNull()
})
