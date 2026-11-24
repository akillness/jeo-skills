import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  alertDialog,
  createConfirm,
  type ConfirmEntry,
} from "../src/components/dialog/dialog"
import {
  swipeAxis,
  swipeOffset,
  swipeOutcome,
} from "../src/components/toast/swipe"
import { createOverlays } from "../src/page/overlays/overlays"
import { attachController } from "../src/foundation/kernel/controller"
import {
  focusAfterClose,
  stackLayout,
  swipeDirections,
} from "../src/components/toast/toast-dom"
import { createToastTimers } from "../src/components/toast/toast-timers"
import { toastRegion } from "../src/components/toast/toast"
import {
  createToaster,
  toasterInternals,
} from "../src/components/toast/toaster"
import { press } from "../src/foundation/kernel/part"

const quiet = () => createToaster({ overlays: createOverlays() })

describe("the queue", () => {
  test("a message or options make a toast, newest first, with an id", () => {
    const toast = quiet()
    const first = toast("Saved")
    const second = toast({ title: "Deleted", description: "report.pdf" })
    expect(toast.toasts().map((item) => item.id)).toEqual([second, first])
    expect(toast.toasts()[1]).toMatchObject({
      title: "Saved",
      type: "default",
      duration: 5000,
    })
    expect(toast.toasts()[0]).toMatchObject({
      title: "Deleted",
      description: "report.pdf",
    })
  })

  test("a message with options merges them", () => {
    const toast = quiet()
    toast("Saved", { description: "Just now", duration: 1000 })
    expect(toast.toasts()[0]).toMatchObject({
      title: "Saved",
      description: "Just now",
      duration: 1000,
    })
  })

  test("framework elements are content, not options", () => {
    const toast = createToaster<unknown>({ overlays: createOverlays() })
    const element = { $$typeof: Symbol.for("react.element"), props: {} }
    toast(element)
    expect(toast.toasts()[0].title).toBe(element)
  })

  test("shorthands set the type, errors are assertive and loading stays", () => {
    const toast = quiet()
    toast.error("Failed")
    toast.loading("Saving")
    toast.success("Saved")
    const [success, loading, error] = toast.toasts()
    expect(success).toMatchObject({
      type: "success",
      priority: "polite",
      duration: 5000,
    })
    expect(loading).toMatchObject({ type: "loading", duration: Infinity })
    expect(error).toMatchObject({ type: "error", priority: "assertive" })
  })

  test("the toaster's duration is the default, and Infinity stays", () => {
    const toast = createToaster({ duration: 8000, overlays: createOverlays() })
    toast("A")
    toast("B", { duration: Infinity })
    expect(toast.toasts().map((item) => item.duration)).toEqual([
      Infinity,
      8000,
    ])
  })

  test("a toast with an id that's showing is updated, not added again", () => {
    const toast = quiet()
    toast("Uploading", { id: "upload" })
    toast("Uploaded", { id: "upload" })
    expect(toast.toasts()).toHaveLength(1)
    expect(toast.toasts()[0]).toMatchObject({
      id: "upload",
      title: "Uploaded",
      version: 2,
    })
  })

  test("update changes a showing toast and never brings back a closed one", () => {
    const toast = quiet()
    const id = toast("Saving")
    expect(toast.update(id, { title: "Saved", type: "success" })).toBe(true)
    expect(toast.toasts()[0]).toMatchObject({ title: "Saved", type: "success" })
    toast.dismiss(id)
    expect(toast.update(id, "Again")).toBe(false)
    expect(toast.toasts()).toHaveLength(0)
  })

  test("dismiss closes one toast by id, or all of them, and reports why", () => {
    const toast = quiet()
    const reasons: string[] = []
    const a = toast("A", {
      onDismiss: ({ reason }) => reasons.push(`a:${reason}`),
    })
    toast("B", { onDismiss: ({ reason }) => reasons.push(`b:${reason}`) })
    toast("C")
    toast.dismiss(a)
    expect(toast.toasts().map((item) => item.title)).toEqual(["C", "B"])
    toast.dismiss()
    expect(toast.toasts()).toHaveLength(0)
    expect(reasons).toEqual(["a:imperative", "b:imperative"])
  })

  test("onDismiss can keep a toast", () => {
    const toast = quiet()
    const id = toast("Unsaved", {
      onDismiss: (details) => details.reason === "swipe" && details.cancel(),
    })
    expect(toasterInternals(toast).close(id, "swipe")).toBe(false)
    expect(toast.toasts()).toHaveLength(1)
    expect(toasterInternals(toast).close(id, "close-press")).toBe(true)
  })

  test("a promise toast loads, then shows the result with a fresh duration", async () => {
    const toast = quiet()
    let resolve!: (value: string) => void
    const id = toast.promise(new Promise<string>((done) => (resolve = done)), {
      loading: "Saving",
      success: (name) => `Saved ${name}`,
      error: "Failed",
    })
    expect(toast.toasts()[0]).toMatchObject({
      id,
      type: "loading",
      duration: Infinity,
    })
    resolve("report.pdf")
    await Promise.resolve()
    expect(toast.toasts()[0]).toMatchObject({
      id,
      type: "success",
      title: "Saved report.pdf",
      duration: 5000,
    })
  })

  test("a rejected promise turns into an error", async () => {
    const toast = quiet()
    toast.promise(() => Promise.reject(new Error("offline")), {
      loading: "Saving",
      error: (error) => ({
        title: "Failed",
        description: (error as Error).message,
      }),
    })
    await new Promise((done) => setTimeout(done))
    expect(toast.toasts()[0]).toMatchObject({
      type: "error",
      title: "Failed",
      description: "offline",
    })
  })

  test("a promise toast dismissed while loading stays closed", async () => {
    const toast = quiet()
    let resolve!: () => void
    const id = toast.promise(new Promise<void>((done) => (resolve = done)), {
      loading: "Saving",
      success: "Saved",
    })
    toast.dismiss(id)
    resolve()
    await Promise.resolve()
    expect(toast.toasts()).toHaveLength(0)
  })

  test("the first toast asks the overlay host for a region, unless the app placed one", () => {
    const overlays = createOverlays()
    const toast = createToaster({ overlays })
    toast("A")
    toast("B")
    expect(overlays.entries().map((entry) => entry.type)).toEqual(["toaster"])

    const other = createOverlays()
    const placed = createToaster({ overlays: other })
    toasterInternals(placed).attachRegion(true)
    placed("A")
    expect(other.entries()).toHaveLength(0)
  })
})

describe("timers", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const shown = (id: string, duration = 4000, version = 1, held = false) => ({
    id,
    version,
    duration,
    held,
  })

  test("a shown toast expires after its duration", () => {
    const expired: string[] = []
    const timers = createToastTimers((id) => expired.push(id))
    timers.update([shown("a")], new Set(["a"]))
    vi.advanceTimersByTime(3999)
    expect(expired).toEqual([])
    vi.advanceTimersByTime(1)
    expect(expired).toEqual(["a"])
  })

  test("Infinity never expires", () => {
    const expired: string[] = []
    const timers = createToastTimers((id) => expired.push(id))
    timers.update([shown("a", Infinity)], new Set(["a"]))
    vi.advanceTimersByTime(1e9)
    expect(expired).toEqual([])
  })

  test("pausing keeps the time left, and resuming continues from it", () => {
    const expired: string[] = []
    const timers = createToastTimers((id) => expired.push(id))
    timers.update([shown("a")], new Set(["a"]))
    vi.advanceTimersByTime(1000)
    timers.pause("item-hover")
    vi.advanceTimersByTime(10_000)
    expect(timers.remaining("a")).toBe(3000)
    timers.resume("item-hover")
    vi.advanceTimersByTime(2999)
    expect(expired).toEqual([])
    vi.advanceTimersByTime(1)
    expect(expired).toEqual(["a"])
  })

  test("pause reasons hold separately: one clearing never resumes while another holds", () => {
    const expired: string[] = []
    const timers = createToastTimers((id) => expired.push(id))
    timers.update([shown("a", 1000)], new Set(["a"]))
    timers.pause("item-hover")
    timers.pause("window-blur")
    timers.resume("item-hover")
    vi.advanceTimersByTime(5000)
    expect(expired).toEqual([])
    timers.resume("window-blur")
    vi.advanceTimersByTime(1000)
    expect(expired).toEqual(["a"])
  })

  test("a toast pushed out of view waits with its time, and one never shown never starts", () => {
    const expired: string[] = []
    const timers = createToastTimers((id) => expired.push(id))
    timers.update([shown("a", 2000)], new Set(["a", "b"]))
    vi.advanceTimersByTime(500)
    timers.update([shown("b", 2000)], new Set(["a", "b"]))
    vi.advanceTimersByTime(10_000)
    expect(expired).toEqual(["b"])
    expect(timers.remaining("a")).toBe(1500)
    timers.update([shown("a", 2000)], new Set(["a"]))
    vi.advanceTimersByTime(1500)
    expect(expired).toEqual(["b", "a"])
  })

  test("an update restarts the countdown, and a held toast waits", () => {
    const expired: string[] = []
    const timers = createToastTimers((id) => expired.push(id))
    timers.update([shown("a", 1000)], new Set(["a"]))
    vi.advanceTimersByTime(900)
    timers.update([shown("a", 1000, 2)], new Set(["a"]))
    vi.advanceTimersByTime(900)
    expect(expired).toEqual([])
    timers.update([shown("a", 1000, 2, true)], new Set(["a"]))
    vi.advanceTimersByTime(5000)
    expect(expired).toEqual([])
    timers.update([shown("a", 1000, 2)], new Set(["a"]))
    vi.advanceTimersByTime(100)
    expect(expired).toEqual(["a"])
  })

  test("a canceled timeout counts the full duration again, and a pause only pauses it", () => {
    const expired: string[] = []
    let cancel = true
    const timers = createToastTimers((id) => {
      expired.push(id)
      return !cancel
    })
    timers.update([shown("a", 1000)], new Set(["a"]))
    vi.advanceTimersByTime(1000)
    expect(expired).toEqual(["a"])
    expect(timers.remaining("a")).toBe(1000)
    cancel = false
    vi.advanceTimersByTime(400)
    timers.pause("item-hover")
    timers.resume("item-hover")
    expect(expired).toEqual(["a"])
    vi.advanceTimersByTime(599)
    expect(expired).toEqual(["a"])
    vi.advanceTimersByTime(1)
    expect(expired).toEqual(["a", "a"])
  })

  test("a duration changed from Infinity to a number starts counting", () => {
    const expired: string[] = []
    const timers = createToastTimers((id) => expired.push(id))
    timers.update([shown("a", Infinity)], new Set(["a"]))
    vi.advanceTimersByTime(10_000)
    timers.update([shown("a", 1000, 2)], new Set(["a"]))
    vi.advanceTimersByTime(1000)
    expect(expired).toEqual(["a"])
  })
})

describe("swipe", () => {
  test("directions follow the side, and the alignment in the writing direction", () => {
    expect(swipeDirections("bottom", "end", false)).toEqual(["down", "right"])
    expect(swipeDirections("bottom", "end", true)).toEqual(["down", "left"])
    expect(swipeDirections("top", "start", false)).toEqual(["up", "left"])
    expect(swipeDirections("top", "center", false)).toEqual(["up"])
  })

  test("a press becomes a swipe past a few pixels, on an axis with a direction", () => {
    expect(swipeAxis(3, 2, ["down"])).toBeUndefined()
    expect(swipeAxis(0, 20, ["down"])).toBe("y")
    expect(swipeAxis(20, 2, ["down"])).toBeNull()
    expect(swipeAxis(20, 2, ["down", "right"])).toBe("x")
  })

  test("movement toward a direction is free, and against it resists", () => {
    expect(swipeOffset(0, 50, "y", ["down"])).toEqual({ x: 0, y: 50 })
    const against = swipeOffset(0, -50, "y", ["down"]).y
    expect(against).toBeLessThan(0)
    expect(against).toBeGreaterThan(-15)
  })

  test("far enough or fast enough dismisses, toward allowed directions only", () => {
    const still = {
      velocityX: 0,
      velocityY: 0,
      directions: ["down", "right"] as const,
    }
    expect(
      swipeOutcome({ ...still, directions: [...still.directions], x: 0, y: 45 })
    ).toBe("down")
    expect(
      swipeOutcome({ ...still, directions: [...still.directions], x: 0, y: 20 })
    ).toBeNull()
    expect(
      swipeOutcome({
        ...still,
        directions: [...still.directions],
        x: 0,
        y: 20,
        velocityY: 0.5,
      })
    ).toBe("down")
    expect(
      swipeOutcome({
        ...still,
        directions: [...still.directions],
        x: -80,
        y: 0,
        velocityX: -2,
      })
    ).toBeNull()
  })
})

describe("stacking and focus", () => {
  test("offsets add up the heights in front, and closing toasts keep their place", () => {
    const heights = new Map([
      ["c", 60],
      ["b", 40],
      ["a", 50],
    ])
    const stack = stackLayout(
      [
        { id: "c", index: 0, leaving: false },
        { id: "b", index: 1, leaving: true },
        { id: "a", index: 1, leaving: false },
      ],
      heights
    )
    expect([...stack.layout]).toEqual([
      ["c", { index: 0, offset: 0 }],
      ["a", { index: 1, offset: 60 }],
    ])
    expect(stack).toMatchObject({ front: 60, total: 110 })
  })

  test("focus goes to the next toast, else the one before, else back", () => {
    expect(focusAfterClose(["a", "b", "c"], "b", "page")).toBe("c")
    expect(focusAfterClose(["a", "b", "c"], "c", "page")).toBe("b")
    expect(focusAfterClose(["a"], "a", "page")).toBe("page")
  })
})

describe("confirm", () => {
  test("without an alert dialog of yours, the overlay host renders one and it answers", async () => {
    const overlays = createOverlays()
    const confirm = createConfirm({ overlays })
    const answer = confirm({ title: "Delete it?" })
    await Promise.resolve()
    const [entry] = overlays.entries()
    expect(entry.type).toBe("confirm")
    const data = entry.data as ConfirmEntry
    expect(data.payload).toEqual({ title: "Delete it?" })
    // What the host does: render an alert dialog with the controller, then open it.
    const instance = alertDialog({ id: "host", controller: data.controller })
    attachController(data.controller, instance.api)
    data.open()
    press(instance.part("close", { value: "confirm" }))?.()
    expect(await answer).toBe(true)
    data.done()
    expect(overlays.entries()).toHaveLength(0)
  })

  test("questions the host renders wait for the one before", async () => {
    const overlays = createOverlays()
    const confirm = createConfirm({ overlays })
    const first = confirm({ title: "First?" })
    const second = confirm({ title: "Second?" })
    await Promise.resolve()
    expect(overlays.entries()).toHaveLength(1)
    ;(overlays.entries()[0].data as ConfirmEntry).done()
    expect(await first).toBe(false)
    await Promise.resolve()
    expect((overlays.entries()[0].data as ConfirmEntry).payload).toEqual({
      title: "Second?",
    })
    ;(overlays.entries()[0].data as ConfirmEntry).done()
    expect(await second).toBe(false)
  })
})

describe("buttons", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve))

  test("a press that succeeds leaves no entry, and a failed one goes with its toast", async () => {
    const toaster = quiet()
    const region = toastRegion({ id: "r", toaster })
    const disconnect = region.api.internal.connect()
    const id = toaster("Saved", { duration: Infinity })
    region.api.internal.press(
      "action-1",
      id,
      () => Promise.resolve(),
      false,
      "action"
    )
    expect(Object.keys(region.get().buttons)).toEqual(["action-1"])
    await settle()
    expect(region.get().buttons).toEqual({})
    region.api.internal.press(
      "action-2",
      id,
      () => Promise.reject("offline"),
      false,
      "action"
    )
    await settle()
    expect(region.get().buttons).toEqual({
      "action-2": { pending: false, error: "offline" },
    })
    toaster.dismiss(id)
    await settle()
    expect(region.get().buttons).toEqual({})
    disconnect()
    region.destroy()
  })
})

describe("debug", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve))

  test("an action going pending and failing logs, like a change", async () => {
    const log = vi.spyOn(console, "debug").mockImplementation(() => {})
    const toaster = quiet()
    const region = toastRegion({ id: "r", toaster, debug: true })
    const disconnect = region.api.internal.connect()
    const id = toaster("Saved", { duration: Infinity })
    region.api.internal.press(
      "a",
      id,
      () => Promise.reject("offline"),
      false,
      "action"
    )
    await settle()
    expect(log.mock.calls.map(([line]) => String(line))).toEqual([
      expect.stringContaining("toast#r pending: true (action"),
      expect.stringContaining("toast#r pending: false (action"),
      expect.stringContaining("toast#r error: offline (action"),
    ])
    disconnect()
    region.destroy()
    log.mockRestore()
  })
})

test("a second copy of core finds the shared toast's internals", async () => {
  const first = await import("../src/components/toast/toaster")
  vi.resetModules()
  const second = await import("../src/components/toast/toaster")
  expect(second.toasterInternals).not.toBe(first.toasterInternals)
  expect(second.toast).toBe(first.toast)
  expect(() => second.toasterInternals(second.toast)).not.toThrow()
  expect(() => first.toasterInternals(second.createToaster())).not.toThrow()
})
