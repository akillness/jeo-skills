import { describe, expect, test, vi } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { popover } from "../src/components/popover/popover"
import { tooltip } from "../src/components/tooltip/tooltip"

const pointer = () =>
  ({ pointerType: "mouse", clientX: 0, clientY: 0 }) as PointerEvent

describe("why a controlled popup closed", () => {
  const refuseCloses = (open: boolean, details: { cancel: () => void }) => {
    if (!open) {
      details.cancel()
    }
  }

  test("a close the owner canceled leaves nothing for a later close to report", async () => {
    const instance = popover({
      id: "p",
      open: false,
      onOpenChange: refuseCloses,
    })
    const result = instance.api.open()
    instance.setOptions({ id: "p", open: true, onOpenChange: refuseCloses })
    instance.api.close({ reason: "escape-key" })
    instance.setOptions({ id: "p", open: false, onOpenChange: refuseCloses })
    expect(await result).toEqual({
      reason: "imperative",
      source: "programmatic",
    })
  })

  test("a close the owner applies later keeps its reason and return value", async () => {
    const instance = popover({ id: "p", open: false })
    const result = instance.api.open()
    instance.setOptions({ id: "p", open: true })
    instance.api.close({ reason: "escape-key", returnValue: "kept" })
    instance.setOptions({ id: "p", open: false })
    expect(await result).toEqual({
      reason: "escape-key",
      source: "programmatic",
      returnValue: "kept",
    })
  })

  test("a combobox closed by its prop alone reverts its text as imperative, whatever closed it before", () => {
    const reasons: string[] = []
    const options = (open: boolean) => ({
      id: "c",
      open,
      onQueryChange: (_query: string, details: { reason: string }) =>
        reasons.push(details.reason),
    })
    const instance = combobox(options(true))
    instance.api.setQuery("ap")
    instance.api.close({ reason: "escape-key" })
    instance.setOptions(options(false))
    instance.setOptions(options(true))
    instance.api.setQuery("ba")
    instance.setOptions(options(false))
    expect(reasons).toEqual([
      "imperative",
      "escape-key",
      "imperative",
      "imperative",
    ])
  })
})

describe("a controller's event", () => {
  test("reaches onOpenChange, which still hears imperative", () => {
    const onOpenChange = vi.fn()
    const instance = popover({ id: "p", onOpenChange })
    const event = new Event("click")
    instance.api.open({ event })
    expect(onOpenChange).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ reason: "imperative", event })
    )
    instance.api.toggle({ event })
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: "imperative", event })
    )
  })
})

describe("drift the shared steps removed", () => {
  test("onOpenChange hears what closed a popover reported", () => {
    const onOpenChange = vi.fn()
    const instance = popover({ id: "p", defaultOpen: true, onOpenChange })
    instance.api.close({ returnValue: "saved" })
    expect(onOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ returnValue: "saved" })
    )
  })

  test("a tooltip trigger taking over drops the anchor a controller passed", () => {
    const instance = tooltip({ id: "t" })
    const point = { x: 10, y: 20 }
    instance.api.open({ anchor: point })
    expect(instance.api.internal.control.anchor()).toBe(point)
    instance.api.internal.control.show({
      by: "hover",
      reason: "trigger-hover",
      trigger: "b",
      payload: 2,
    })
    expect(instance.get().payload).toBe(2)
    expect(instance.api.internal.control.anchor()).toBeUndefined()
  })

  test("an open given an aborted signal leaves a pending hover open alone", async () => {
    vi.useFakeTimers()
    const instance = popover({ id: "p", openOnHover: true, delay: 100 })
    instance.api.internal.hover!.enter(pointer(), "a")
    const result = await instance.api.open({ signal: AbortSignal.abort() })
    expect(result).toEqual({ reason: "imperative", source: "programmatic" })
    vi.advanceTimersByTime(100)
    expect(instance.get().open).toBe(true)
    vi.useRealTimers()
  })
})
