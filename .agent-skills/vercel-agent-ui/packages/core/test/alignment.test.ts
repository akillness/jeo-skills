import { describe, expect, test, vi } from "vitest"
import { scrollToShow } from "../src/foundation/focus/collection"
import { computePlacement } from "../src/foundation/platform/position"
import { physicalSide } from "../src/foundation/platform/sides"
import { menu } from "./menu-parts"
import { popover } from "../src/components/popover/popover"
import { createController } from "../src/foundation/kernel/controller"
import { createDetails } from "../src/foundation/kernel/details"
import { applyAttrs } from "../src/foundation/kernel/live"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { tabs, type TabsController } from "../src/components/tabs/tabs"
import { attrs, partState, press } from "../src/foundation/kernel/part"
import { kept } from "./kept"

describe("change details", () => {
  test("say why, carry extra context and cancel once", () => {
    const details = createDetails(
      { reason: "item-press", value: "grid" },
      "programmatic"
    )
    expect(details).toMatchObject({
      reason: "item-press",
      value: "grid",
      canceled: false,
    })
    expect("cancelled" in details).toBe(false)
    details.cancel()
    expect(details.canceled).toBe(true)
  })
})

describe("controllers", () => {
  test("expose only the component's methods", () => {
    const controller = createController<TabsController>()
    const instance = kept(tabs({ id: "t", defaultValue: "a", controller }))
    instance.setOptions({ id: "t", defaultValue: "a", controller })
    expect(controller.getValue()).toBe("a")
    expect((controller as Record<string, unknown>).attach).toBeUndefined()
    expect((controller as Record<string, unknown>).attached).toBeUndefined()
  })
})

describe("controlled and uncontrolled warnings", () => {
  const thing = definePrimitive({
    name: "thing",
    options: { value: "string", defaultValue: "string" },
    state: (options: { value?: string; defaultValue?: string }) => ({
      value: options.defaultValue ?? "",
    }),
    api: () => ({}),
    slots: () => ({}),
  })

  test("warn once when both a value and a default value are passed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = thing({ id: "a", value: "x", defaultValue: "y" })
    instance.setOptions({ id: "a", value: "x", defaultValue: "y" })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain(
      "`value` and `defaultValue`. Pass one."
    )
    warn.mockRestore()
  })

  test("warn once when a controlled value becomes undefined", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = thing({ id: "b", value: "x" })
    instance.setOptions({ id: "b", value: undefined })
    instance.setOptions({ id: "b", value: "x" })
    instance.setOptions({ id: "b", value: undefined })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain("stopped controlling `value`")
    warn.mockRestore()
  })

  test("stay quiet for a value that arrives later, like a bound variable that starts empty", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = thing({ id: "d" })
    instance.setOptions({ id: "d", value: "x" })
    instance.setOptions({ id: "d", value: "y" })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  test("stay quiet for a value that stays controlled", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = thing({ id: "c", value: "x" })
    instance.setOptions({ id: "c", value: "y" })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe("attributes", () => {
  // A stand-in element, since unit tests have no DOM.
  function element(attributes: Record<string, string> = {}) {
    const values = new Map(Object.entries(attributes))
    return {
      getAttribute: (name: string) => values.get(name) ?? null,
      setAttribute: (name: string, value: string) => values.set(name, value),
      removeAttribute: (name: string) => values.delete(name),
      values,
    }
  }

  test("only remove what they wrote, so an author's own attributes stay", () => {
    const el = element({ disabled: "" })
    applyAttrs(el as unknown as HTMLElement, {
      disabled: undefined,
      "data-open": "",
    })
    applyAttrs(el as unknown as HTMLElement, {
      disabled: undefined,
      "data-open": undefined,
    })
    expect(el.values.get("disabled")).toBe("")
    expect(el.values.has("data-open")).toBe(false)
  })

  test("state is boolean presence attributes", () => {
    const instance = popover({ id: "p", defaultOpen: true })
    expect(attrs(instance.part("trigger"))).toMatchObject({ "data-open": "" })
    expect(attrs(instance.part("content"))).toMatchObject({ "data-open": "" })
    expect(attrs(instance.part("trigger"))["data-state"]).toBeUndefined()
    const closed = popover({ id: "q" })
    expect(attrs(closed.part("trigger"))).toMatchObject({ "data-closed": "" })
    expect(attrs(closed.part("content", { keepMounted: true })).hidden).toBe("")
  })
})

describe("data menus", () => {
  test("checkbox items report through the item and the menu, with details", () => {
    const item = vi.fn()
    const shared = vi.fn()
    const instance = menu({ id: "m", onCheckedChange: shared })
    press(
      instance.part("checkbox-item", { value: "grid", onCheckedChange: item })
    )?.()
    expect(item).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: "item-press" })
    )
    expect(shared).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: "item-press", value: "grid" })
    )
    expect(
      partState(instance.part("checkbox-item", { value: "grid" }))
    ).toMatchObject({ checked: true })
  })

  test("canceling a checkbox change keeps the item as it was", () => {
    const instance = menu({
      id: "n",
      onCheckedChange: (checked, details) => details.cancel(),
    })
    press(instance.part("checkbox-item", { value: "grid" }))?.()
    expect(
      partState(instance.part("checkbox-item", { value: "grid" }))
    ).toMatchObject({ checked: false })
    expect(
      attrs(instance.part("checkbox-item", { value: "grid" }))
    ).toMatchObject({ "data-unchecked": "" })
  })

  test("radio groups report the group they belong to", () => {
    const shared = vi.fn()
    const instance = menu({ id: "r", onValueChange: shared })
    attrs(
      instance.part("radio-group", {
        id: "sort",
        name: "sort",
        defaultValue: "name",
      })
    )
    press(instance.part("radio-item", { group: "sort", value: "date" }))?.()
    expect(shared).toHaveBeenCalledWith(
      "date",
      expect.objectContaining({ group: "sort", reason: "item-press" })
    )
    expect(
      partState(instance.part("radio-group", { id: "sort", name: "sort" }))
    ).toEqual({ value: "date" })
  })

  test("a radio group with nothing selected reports null", () => {
    const instance = menu({ id: "s" })
    expect(
      partState(instance.part("radio-group", { id: "g", name: "g" }))
    ).toEqual({ value: null })
  })
})

describe("popup controllers", () => {
  test("open() resolves once the popup closes, with why and the return value", async () => {
    const instance = popover({ id: "c" })
    const result = instance.api.open({ payload: { row: 3 } })
    expect(instance.api.getPayload()).toEqual({ row: 3 })
    expect(partState(instance.part("content"))).toMatchObject({
      payload: { row: 3 },
    })
    instance.api.close({ returnValue: "saved" })
    await expect(result).resolves.toEqual({
      reason: "imperative",
      source: "programmatic",
      returnValue: "saved",
    })
    // The payload stays while the popup animates out.
    expect(instance.api.getPayload()).toEqual({ row: 3 })
  })

  test("a canceled open resolves at once", async () => {
    const instance = popover({
      id: "d",
      onOpenChange: (open, details) => details.cancel(),
    })
    await expect(instance.api.open()).resolves.toEqual({
      reason: "imperative",
      source: "programmatic",
    })
    expect(instance.api.isOpen()).toBe(false)
  })

  test("setOpen and toggle pass their reason", () => {
    const reasons: string[] = []
    const instance = popover({
      id: "e",
      onOpenChange: (open, details) => reasons.push(details.reason),
    })
    instance.api.setOpen(true, { reason: "imperative" })
    instance.api.toggle({ reason: "trigger-press" })
    expect(reasons).toEqual(["imperative", "trigger-press"])
  })

  test("report when opening and closing finish, without a DOM at once", () => {
    const complete: boolean[] = []
    const instance = menu({
      id: "f",
      onOpenChangeComplete: (open) => complete.push(open),
    })
    instance.api.open()
    instance.api.close()
    expect(complete).toEqual([true, false])
  })

  test("several triggers: only the one that opened the popup is expanded", () => {
    const instance = popover({ id: "g" })
    press(instance.part("trigger", { id: "b", payload: "row b" }))?.()
    expect(attrs(instance.part("trigger", { id: "b" }))).toMatchObject({
      "aria-expanded": "true",
      id: "g-trigger",
    })
    expect(attrs(instance.part("trigger", { id: "a" }))).toMatchObject({
      "aria-expanded": "false",
    })
    expect(attrs(instance.part("trigger", { id: "a" })).id).toBeUndefined()
    expect(instance.api.getPayload()).toBe("row b")
  })
})

describe("positioning", () => {
  const viewport = { width: 1000, height: 800 }
  const anchor = { x: 400, y: 300, width: 100, height: 40 }
  const size = { width: 200, height: 100 }
  const base = {
    align: "center" as const,
    sideOffset: 0,
    alignOffset: 0,
    collisionPadding: 8,
  }

  test("logical sides follow the reading direction", () => {
    expect(physicalSide("start")).toBe("left")
    expect(physicalSide("end", true)).toBe("left")
    expect(
      computePlacement(anchor, size, viewport, { ...base, side: "end" }).side
    ).toBe("right")
    expect(
      computePlacement(anchor, size, viewport, {
        ...base,
        side: "end",
        rtl: true,
      }).side
    ).toBe("left")
  })

  test("a point is a zero-size anchor", () => {
    const placed = computePlacement(
      { x: 100, y: 100, width: 0, height: 0 },
      size,
      viewport,
      {
        ...base,
        side: "bottom",
        align: "start",
      }
    )
    expect(placed).toMatchObject({ x: 100, y: 100, side: "bottom" })
  })
})

describe("tab lists", () => {
  test("scroll only as far as it takes to show the selected tab", () => {
    expect(scrollToShow(0, 300, 100, 80)).toBe(0)
    expect(scrollToShow(0, 300, 280, 80)).toBe(60)
    expect(scrollToShow(200, 300, 100, 80)).toBe(100)
  })
})
