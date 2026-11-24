import { describe, expect, test, vi } from "vitest"
import {
  collapsible,
  createCollapsibleController,
} from "../src/components/collapsible/collapsible"
import { attrs, partState, present } from "../src/foundation/kernel/part"
import { kept } from "./kept"

describe("collapsible", () => {
  test("renders closed by default, with the panel out of the page", () => {
    const instance = collapsible({ id: "x" })
    expect(attrs(instance.part("trigger"))).toMatchObject({
      id: "x-trigger",
      type: "button",
      "aria-expanded": "false",
      "data-closed": "",
    })
    expect(present(instance.part("panel"))).toBe(false)
  })

  test("open renders the panel and the open attributes", () => {
    const instance = collapsible({ id: "x", defaultOpen: true })
    expect(present(instance.part("panel"))).toBe(true)
    expect(attrs(instance.part("panel"))).toMatchObject({
      id: "x-panel",
      hidden: undefined,
      "data-open": "",
    })
    expect(attrs(instance.part("root"))["data-open"]).toBe("")
    expect(partState(instance.part("trigger"))).toEqual({
      open: true,
      disabled: false,
    })
  })

  test("a kept or findable panel stays in the page, hidden", () => {
    const instance = collapsible({ id: "x" })
    expect(present(instance.part("panel", { keepMounted: true }))).toBe(true)
    expect(attrs(instance.part("panel", { keepMounted: true })).hidden).toBe("")
    expect(
      attrs(instance.part("panel", { hiddenUntilFound: true })).hidden
    ).toBe("until-found")
  })

  test("toggling calls back with the reason, and can be canceled", () => {
    const onOpenChange = vi.fn()
    const instance = collapsible({ id: "x", onOpenChange })
    instance.api.toggle({ reason: "trigger-press" })
    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: "trigger-press" })
    )
    expect(instance.api.isOpen()).toBe(true)
    const canceling = collapsible({
      id: "y",
      onOpenChange: (_open, details) => details.cancel(),
    })
    expect(canceling.api.open()).toBe(false)
    expect(canceling.api.isOpen()).toBe(false)
  })

  test("a controlled collapsible waits for its new value", () => {
    const onOpenChange = vi.fn()
    const instance = collapsible({ id: "x", open: false, onOpenChange })
    instance.api.open()
    expect(onOpenChange).toHaveBeenCalledWith(true, expect.anything())
    expect(instance.api.isOpen()).toBe(false)
    instance.setOptions({ id: "x", open: true, onOpenChange })
    expect(instance.api.isOpen()).toBe(true)
  })

  test("disabled marks every part and keeps the trigger focusable", () => {
    const instance = collapsible({ id: "x", disabled: true })
    expect(attrs(instance.part("trigger"))).toMatchObject({
      "aria-disabled": "true",
      "data-disabled": "",
    })
    expect(attrs(instance.part("trigger")).disabled).toBeUndefined()
    expect(attrs(instance.part("root"))["data-disabled"]).toBe("")
  })

  test("a controller drives it from anywhere", () => {
    const controller = createCollapsibleController()
    const instance = kept(collapsible({ id: "x", controller }))
    instance.setOptions({ id: "x", controller })
    controller.open()
    expect(controller.isOpen()).toBe(true)
    controller.setOpen(false)
    expect(instance.api.isOpen()).toBe(false)
  })

  test("only the opening find in page caused shows at once", () => {
    const onOpenChange = vi.fn()
    const instance = collapsible({ id: "x", open: false, onOpenChange })
    instance.api.open({ reason: "find-in-page" })
    instance.setOptions({ id: "x", open: true, onOpenChange })
    expect(instance.api.internal.opening()).toBe("instant")
    instance.api.internal.settled(true)
    instance.setOptions({ id: "x", open: false, onOpenChange })
    instance.api.internal.settled(false)
    // A parent's own toggle, not a press or find in page.
    instance.setOptions({ id: "x", open: true, onOpenChange })
    expect(instance.api.internal.opening()).toBe("animate")
  })

  test("a canceled find in page doesn't stop the next opening from animating", () => {
    const onOpenChange = (
      _open: boolean,
      details: { reason: string; cancel: () => void }
    ) => {
      if (details.reason === "find-in-page") {
        details.cancel()
      }
    }
    const instance = collapsible({ id: "x", open: false, onOpenChange })
    expect(instance.api.open({ reason: "find-in-page" })).toBe(false)
    instance.setOptions({ id: "x", open: true, onOpenChange })
    expect(instance.api.internal.opening()).toBe("animate")
  })

  test("a find in page a controlled parent ignores doesn't make its own opening later show at once", () => {
    vi.useFakeTimers()
    const onOpenChange = vi.fn()
    const instance = collapsible({ id: "x", open: false, onOpenChange })
    instance.api.open({ reason: "find-in-page" })
    expect(onOpenChange).toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    instance.setOptions({ id: "x", open: true, onOpenChange })
    expect(instance.api.internal.opening()).toBe("animate")
    vi.useRealTimers()
  })

  test("nothing calls back on mount", () => {
    const onOpenChange = vi.fn()
    const onOpenChangeComplete = vi.fn()
    collapsible({
      id: "x",
      defaultOpen: true,
      onOpenChange,
      onOpenChangeComplete,
    })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onOpenChangeComplete).not.toHaveBeenCalled()
  })
})
