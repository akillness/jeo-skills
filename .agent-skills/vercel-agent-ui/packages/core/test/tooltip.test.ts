import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createHoverIntent } from "../src/foundation/popups/hover"
import { hoverCard } from "../src/components/hover-card/hover-card"
import { tooltip } from "../src/components/tooltip/tooltip"
import { attrs as partAttrs, present } from "../src/foundation/kernel/part"

const pointer = (pointerType = "mouse") =>
  ({ pointerType, clientX: 0, clientY: 0 }) as PointerEvent

describe("tooltip labelling", () => {
  test("a tooltip describes its trigger, from the first render", () => {
    const attrs = partAttrs(tooltip({ id: "t" }).part("trigger", { id: "a" }))
    expect(attrs["aria-describedby"]).toBe("t-content")
    expect(attrs["aria-labelledby"]).toBeUndefined()
  })

  test("type label names the trigger instead", () => {
    const attrs = partAttrs(
      tooltip({ id: "t", type: "label" }).part("trigger", { id: "a" })
    )
    expect(attrs["aria-labelledby"]).toBe("t-content")
    expect(attrs["aria-describedby"]).toBeUndefined()
  })

  test("the content is always present, hidden while closed, so the reference resolves", () => {
    const instance = tooltip({ id: "t" })
    expect(present(instance.part("content", {}))).toBe(true)
    expect(partAttrs(instance.part("content", {}))).toMatchObject({
      role: "tooltip",
      hidden: "",
    })
    instance.api.open()
    expect(partAttrs(instance.part("content", {})).hidden).toBeUndefined()
  })

  test("a shortcut hint reaches the trigger as aria-keyshortcuts", () => {
    const attrs = partAttrs(
      tooltip({ id: "t", shortcut: "mod+s" }).part("trigger", { id: "a" })
    )
    expect(attrs["aria-keyshortcuts"]).toMatch(/^(Meta|Control)\+S$/)
  })

  test("the trigger never writes open attributes, which a menu or popover trigger it's composed with owns", () => {
    const instance = tooltip({ id: "t", defaultOpen: true })
    const attrs = partAttrs(instance.part("trigger", { id: "a" }))
    expect(attrs["data-open"]).toBeUndefined()
    expect(attrs["data-closed"]).toBeUndefined()
  })
})

describe("tooltip groups", () => {
  // The group cools a moment after its last tooltip closes, on this clock.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["performance"] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("opening a tooltip closes the one that's open, with no provider", () => {
    const first = tooltip({ id: "a" })
    const second = tooltip({ id: "b" })
    first.api.open()
    second.api.open()
    expect(first.api.isOpen()).toBe(false)
    expect(second.api.isOpen()).toBe(true)
    second.api.close()
  })

  test("a tooltip that opens while another is warm opens instantly", () => {
    // Earlier tests leave the group warm. It cools once nothing has been open for a moment.
    vi.advanceTimersByTime(450)
    const first = tooltip({ id: "a" })
    const second = tooltip({ id: "b" })
    first.api.open()
    expect(first.get().instant).toBe(false)
    first.api.close()
    second.api.open()
    expect(second.get().instant).toBe(true)
    second.api.close()
  })

  test("a disabled tooltip refuses hover and focus but obeys its controller", () => {
    const instance = tooltip({ id: "t", disabled: true, delay: 0 })
    instance.api.internal.enter(pointer(), "a", undefined)
    expect(instance.api.isOpen()).toBe(false)
    instance.api.open()
    expect(instance.api.isOpen()).toBe(true)
    instance.api.close()
  })
})

describe("hover intent", () => {
  test("opens after the delay, and at once for 0", () => {
    vi.useFakeTimers()
    const close = vi.fn()
    const intent = createHoverIntent({
      trigger: () => undefined,
      popup: () => undefined,
      closesOnLeave: () => true,
      closeDelay: () => 0,
      close,
    })
    const open = vi.fn()
    intent.enter(pointer(), open, 300)
    vi.advanceTimersByTime(299)
    expect(open).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(open).toHaveBeenCalledOnce()
    intent.enter(pointer(), open, 0)
    expect(open).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  test("leaving before the delay drops the open, and touch never counts", () => {
    vi.useFakeTimers()
    const open = vi.fn()
    const intent = createHoverIntent({
      trigger: () => undefined,
      popup: () => undefined,
      closesOnLeave: () => false,
      closeDelay: () => 0,
      close: () => {},
    })
    intent.enter(pointer(), open, 100)
    intent.leave(pointer())
    intent.enter(pointer("touch"), open, 0)
    vi.advanceTimersByTime(200)
    expect(open).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe("hover card", () => {
  test("the trigger carries open attributes and no popup ARIA, since it's a link", () => {
    const instance = hoverCard({ id: "h", defaultOpen: true })
    const attrs = partAttrs(instance.part("trigger", { id: "a" }))
    expect(attrs["data-open"]).toBe("")
    expect(attrs["aria-haspopup"]).toBeUndefined()
    expect(attrs["aria-expanded"]).toBeUndefined()
  })

  test("the content exists only while open, unless kept mounted", () => {
    const instance = hoverCard({ id: "h" })
    expect(present(instance.part("content", {}))).toBe(false)
    expect(present(instance.part("content", { keepMounted: true }))).toBe(true)
  })

  test("an open waiting for its delay never fires once the card has left the page", () => {
    vi.useFakeTimers()
    const onOpenChange = vi.fn()
    const instance = hoverCard({ id: "h", onOpenChange })
    instance.api.internal.hover!.enter(pointer(), "a", undefined)
    instance.destroy()
    vi.advanceTimersByTime(1000)
    expect(onOpenChange).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  test("a canceled change keeps the card closed", () => {
    const instance = hoverCard({
      id: "h",
      onOpenChange: (open, details) => details.cancel(),
    })
    instance.api.open()
    expect(instance.get()).toMatchObject({ open: false, mounted: false })
  })
})

// One popup, several triggers with payloads, like a tooltip for every day of a calendar.
describe("payload changes", () => {
  test("a tooltip reports the payload it opens with, then each trigger that takes it over, with no open change", () => {
    const onOpenChange = vi.fn()
    const onPayloadChange = vi.fn()
    const instance = tooltip({
      id: "t",
      delay: 0,
      onOpenChange,
      onPayloadChange,
    })
    const first = pointer()
    instance.api.internal.enter(first, "mon", "Mon")
    expect(onPayloadChange).toHaveBeenLastCalledWith(
      "Mon",
      expect.objectContaining({ reason: "trigger-hover", event: first })
    )
    const next = pointer()
    instance.api.internal.enter(next, "tue", "Tue")
    expect(onPayloadChange).toHaveBeenLastCalledWith(
      "Tue",
      expect.objectContaining({ reason: "trigger-hover", event: next })
    )
    expect(onPayloadChange).toHaveBeenCalledTimes(2)
    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(instance.get()).toMatchObject({
      open: true,
      trigger: "tue",
      payload: "Tue",
    })
    instance.api.close()
  })

  test("the payload changes before the open, so onOpenChange reads the new one", () => {
    const payloads: unknown[] = []
    const instance = tooltip({
      id: "t",
      delay: 0,
      onOpenChange: (open) => payloads.push(instance.api.getPayload()),
    })
    instance.api.internal.enter(pointer(), "mon", "Mon")
    instance.api.close()
    expect(payloads).toEqual(["Mon", "Mon"])
  })

  test("reopening with the same payload reports no change", () => {
    const onPayloadChange = vi.fn()
    const instance = tooltip({ id: "t", delay: 0, onPayloadChange })
    instance.api.open({ payload: "Mon" })
    instance.api.close()
    instance.api.open({ payload: "Mon" })
    expect(onPayloadChange).toHaveBeenCalledOnce()
    expect(onPayloadChange).toHaveBeenLastCalledWith(
      "Mon",
      expect.objectContaining({ reason: "imperative" })
    )
    instance.api.close()
  })

  test("canceling a payload change keeps the previous payload", () => {
    const instance = tooltip({
      id: "t",
      delay: 0,
      onPayloadChange: (payload, details) =>
        payload === "Tue" && details.cancel(),
    })
    instance.api.internal.enter(pointer(), "mon", "Mon")
    instance.api.internal.enter(pointer(), "tue", "Tue")
    expect(instance.get()).toMatchObject({
      open: true,
      trigger: "tue",
      payload: "Mon",
    })
    instance.api.close()
  })

  test("a hover card reports each link that takes it over", () => {
    const onOpenChange = vi.fn()
    const onPayloadChange = vi.fn()
    const instance = hoverCard({
      id: "h",
      delay: 0,
      onOpenChange,
      onPayloadChange,
    })
    instance.api.internal.hover!.enter(pointer(), "ada", "Ada")
    instance.api.internal.hover!.enter(pointer(), "grace", "Grace")
    expect(onPayloadChange.mock.calls.map(([payload]) => payload)).toEqual([
      "Ada",
      "Grace",
    ])
    expect(onOpenChange).toHaveBeenCalledOnce()
    instance.api.close()
  })
})
