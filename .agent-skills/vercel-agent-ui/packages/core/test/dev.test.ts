import { afterEach, describe, expect, test, vi } from "vitest"
import type { DevEvent } from "../src/foundation/kernel/dev"
import { button } from "../src/components/button/button"
import { popover } from "../src/components/popover/popover"
import { slider } from "../src/components/slider/slider"
import { attrs } from "../src/foundation/kernel/part"
import { definePrimitive } from "../src/foundation/kernel/primitive"

const hookKey = Symbol.for("ui-sdk.devtools@1")
const realm = globalThis as Record<symbol, unknown> & {
  __UI_SDK__?: { changes: (filter?: object) => unknown[] }
}

function listen() {
  const events: DevEvent[] = []
  realm[hookKey] = { emit: (event: DevEvent) => events.push(event) }
  return events
}

afterEach(() => {
  delete realm[hookKey]
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("devtools hook", () => {
  test("hears instances and every change, with its reason and source", () => {
    const events = listen()
    const instance = popover({ id: "p1" })
    instance.api.open()
    instance.api.close({ reason: "close-press" })
    instance.destroy()
    expect(events.map((event) => event.type)).toEqual([
      "instance",
      "change",
      "change",
      "instance",
    ])
    expect(events[1]).toMatchObject({
      type: "change",
      component: "popover",
      id: "p1",
      key: "open",
      value: true,
      reason: "imperative",
      source: "programmatic",
      canceled: false,
      controlled: false,
    })
    expect(events[3]).toMatchObject({
      type: "instance",
      action: "destroy",
      id: "p1",
    })
  })

  test("hears a commit, with its reason and source", () => {
    const events = listen()
    const instance = slider({ id: "s1" })
    instance.api.internal.begin(0, 0)
    instance.api.internal.move(60)
    instance.api.internal.end()
    expect(events.filter((event) => event.type === "commit")).toEqual([
      {
        type: "commit",
        component: "slider",
        id: "s1",
        key: "value",
        value: 60,
        reason: "drag",
        source: "programmatic",
      },
    ])
  })

  test("hears a button's action going pending and failing, which no one can refuse", async () => {
    const events = listen()
    const instance = button({
      id: "b1",
      action: () => Promise.reject(new Error("Offline")),
    })
    instance.api.internal.press()
    await new Promise((resolve) => setTimeout(resolve))
    expect(
      events
        .filter((event) => event.type === "change")
        .map(({ key, value, reason, source, canceled, controlled }) => [
          key,
          String(value),
          reason,
          source,
          canceled,
          controlled,
        ])
    ).toEqual([
      ["pending", "true", "action", "programmatic", false, false],
      ["pending", "false", "action", "programmatic", false, false],
      ["error", "Error: Offline", "action", "programmatic", false, false],
    ])
  })

  test("details.event.preventDefault() in a change callback warns once that the change went on", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = popover({
      id: "p5",
      onOpenChange: (_open, details) => details.event?.preventDefault(),
    })
    const press = () => new Event("click", { cancelable: true }) as MouseEvent
    instance.api.internal.control.show({
      reason: "trigger-press",
      event: press(),
    })
    instance.api.internal.control.hide({
      reason: "trigger-press",
      event: press(),
    })
    expect(instance.api.isOpen()).toBe(false)
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining(
        "popover#p5: `details.event.preventDefault()` in `onOpenChange` stopped the browser's default, not the change."
      ),
    ])
  })

  test("details.cancel() with the event's preventDefault() doesn't warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = popover({
      id: "p6",
      onOpenChange: (_open, details) => {
        details.event?.preventDefault()
        details.cancel()
      },
    })
    instance.api.internal.control.show({
      reason: "trigger-press",
      event: new Event("click", { cancelable: true }) as MouseEvent,
    })
    expect(instance.api.isOpen()).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  test("the console view lists changes by component", () => {
    const instance = popover({ id: "p2" })
    instance.api.open()
    expect(realm.__UI_SDK__?.changes({ id: "p2" })).toHaveLength(1)
  })

  test("a controlled value the owner never passes back warns once, naming the instance", () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = popover({ id: "p3", open: false })
    instance.api.open()
    vi.advanceTimersByTime(1500)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain(
      "popover#p3: asked to open (`imperative`, `programmatic`)"
    )
  })

  test("a controlled value passed back after a slow navigation doesn't warn", () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = popover({ id: "p5", open: false })
    instance.api.open()
    vi.advanceTimersByTime(600)
    instance.setOptions({ id: "p5", open: true })
    vi.advanceTimersByTime(1500)
    expect(warn).not.toHaveBeenCalled()
  })

  test("a controlled value passed back doesn't warn", () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = popover({ id: "p4", open: false })
    instance.api.open()
    instance.setOptions({ id: "p4", open: true })
    vi.advanceTimersByTime(1500)
    expect(warn).not.toHaveBeenCalled()
  })

  test("a controlled value passed back and changed again before the check doesn't warn", () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = popover({ id: "p5", open: false })
    instance.api.open()
    instance.setOptions({ id: "p5", open: true })
    vi.advanceTimersByTime(50)
    instance.setOptions({ id: "p5", open: false })
    vi.advanceTimersByTime(500)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe("missing slots", () => {
  test("a slot no one defined warns once for its primitive, however often its parts read it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const thing = definePrimitive({
      name: "thing",
      state: () => ({}),
      api: () => ({}),
      slots: () => ({}),
    })
    for (const id of ["w1", "w2"]) {
      const part = thing({ id }).part("missing" as never)
      attrs(part)
      attrs(part)
    }
    const warned = warn.mock.calls.filter(([message]) =>
      String(message).includes('"missing" part')
    )
    expect(warned).toHaveLength(1)
  })
})
