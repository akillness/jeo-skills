import { describe, expect, test, vi } from "vitest"
import { moveIndex, stepFor } from "../src/foundation/focus/collection"
import { directionBetween } from "../src/foundation/selection/indicator"
import { idPart } from "../src/foundation/kernel/attrs"
import { renderVersion } from "../src/foundation/kernel/primitive"
import { tabs } from "../src/components/tabs/tabs"
import { attrs, partState, present } from "../src/foundation/kernel/part"
import { kept } from "./kept"

describe("keys", () => {
  test("horizontal lists use left and right, mirrored in right-to-left layouts", () => {
    expect(stepFor("ArrowRight", "horizontal", false)).toBe(1)
    expect(stepFor("ArrowLeft", "horizontal", false)).toBe(-1)
    expect(stepFor("ArrowRight", "horizontal", true)).toBe(-1)
    expect(stepFor("ArrowLeft", "horizontal", true)).toBe(1)
    expect(stepFor("ArrowDown", "horizontal", false)).toBeUndefined()
  })

  test("vertical lists use up and down, whatever the direction", () => {
    expect(stepFor("ArrowDown", "vertical", true)).toBe(1)
    expect(stepFor("ArrowUp", "vertical", false)).toBe(-1)
    expect(stepFor("ArrowRight", "vertical", false)).toBeUndefined()
  })

  test("Home and End go to the ends", () => {
    expect(stepFor("Home", "vertical", false)).toBe("first")
    expect(stepFor("End", "horizontal", true)).toBe("last")
    expect(stepFor("a", "horizontal", false)).toBeUndefined()
  })

  test("moves wrap or stop at the ends", () => {
    expect(moveIndex(3, 1, 4, true)).toBe(0)
    expect(moveIndex(0, -1, 4, true)).toBe(3)
    expect(moveIndex(3, 1, 4, false)).toBe(3)
    expect(moveIndex(0, -1, 4, false)).toBe(0)
    expect(moveIndex(2, "first", 4, true)).toBe(0)
    expect(moveIndex(0, "last", 4, true)).toBe(3)
  })
})

describe("direction", () => {
  test("follows the screen along the list's axis", () => {
    expect(
      directionBetween({ left: 0, top: 0 }, { left: 80, top: 0 }, "horizontal")
    ).toBe("right")
    expect(
      directionBetween({ left: 80, top: 0 }, { left: 0, top: 0 }, "horizontal")
    ).toBe("left")
    expect(
      directionBetween({ left: 0, top: 40 }, { left: 0, top: 0 }, "vertical")
    ).toBe("up")
    expect(
      directionBetween({ left: 0, top: 0 }, { left: 0, top: 40 }, "vertical")
    ).toBe("down")
    expect(directionBetween(undefined, { left: 0, top: 0 }, "horizontal")).toBe(
      "none"
    )
  })
})

describe("ids", () => {
  test("values with spaces still make valid id references", () => {
    expect(idPart("two words")).toBe("two%20words")
    expect(idPart("100%")).toBe("100%25")
    expect(idPart("plain")).toBe("plain")
  })
})

describe("selection", () => {
  test("starts on the default value and renders it", () => {
    const instance = tabs({ id: "t", defaultValue: "b" })
    expect(attrs(instance.part("tab", { value: "b" }))).toMatchObject({
      "aria-selected": "true",
      tabindex: "0",
    })
    expect(attrs(instance.part("tab", { value: "a" }))).toMatchObject({
      "aria-selected": "false",
      tabindex: "-1",
    })
    expect(attrs(instance.part("panel", { value: "a" })).hidden).toBe("")
    expect(attrs(instance.part("panel", { value: "b" })).hidden).toBeUndefined()
  })

  test("pairs tabs and panels by value", () => {
    const instance = tabs({ id: "t", defaultValue: "a" })
    expect(attrs(instance.part("tab", { value: "a" })).id).toBe(
      attrs(instance.part("panel", { value: "a" }))["aria-labelledby"]
    )
  })

  test("changing the orientation renders the parts again", () => {
    const instance = tabs({ id: "t", defaultValue: "a" })
    const version = renderVersion(instance)
    instance.setOptions({ id: "t", defaultValue: "a", orientation: "vertical" })
    expect(renderVersion(instance)).toBeGreaterThan(version)
    expect(attrs(instance.part("list"))).toMatchObject({
      "aria-orientation": "vertical",
      "data-orientation": "vertical",
    })
    expect(partState(instance.part("indicator"))).toMatchObject({
      orientation: "vertical",
    })
  })

  test("only the selected panel is present, unless kept mounted", () => {
    const instance = tabs({ id: "t", defaultValue: "a" })
    expect(present(instance.part("panel", { value: "a" }))).toBe(true)
    expect(present(instance.part("panel", { value: "b" }))).toBe(false)
    expect(
      present(instance.part("panel", { value: "b", keepMounted: true }))
    ).toBe(true)
  })

  test("selecting reports the value and a reason", () => {
    const onValueChange = vi.fn()
    const instance = tabs({ id: "t", defaultValue: "a", onValueChange })
    instance.api.select("b", { reason: "list-navigation" })
    expect(onValueChange).toHaveBeenCalledWith(
      "b",
      expect.objectContaining({ reason: "list-navigation" })
    )
    expect(instance.api.getValue()).toBe("b")
  })

  test("a cancelled change keeps the selection", () => {
    const instance = tabs({
      id: "t",
      defaultValue: "a",
      onValueChange: (value, details) => value === "b" && details.cancel(),
    })
    instance.api.select("b")
    expect(instance.api.getValue()).toBe("a")
  })

  test("controlled tabs wait for the new value", () => {
    const onValueChange = vi.fn()
    const instance = tabs({ id: "t", value: "a", onValueChange })
    instance.api.select("b")
    expect(onValueChange).toHaveBeenCalledOnce()
    expect(instance.api.getValue()).toBe("a")
    instance.setOptions({ id: "t", value: "b", onValueChange })
    expect(instance.api.getValue()).toBe("b")
  })

  test("a controller selects from outside", async () => {
    const { createTabsController } = await import("../src/components/tabs/tabs")
    const controller = createTabsController()
    const instance = kept(tabs({ id: "t", defaultValue: "a", controller }))
    instance.setOptions({ id: "t", defaultValue: "a", controller })
    controller.select("c")
    expect(controller.getValue()).toBe("c")
    expect(attrs(instance.part("tab", { value: "c" }))["aria-selected"]).toBe(
      "true"
    )
  })

  test("a controller reaches only the public api", async () => {
    const { createTabsController } = await import("../src/components/tabs/tabs")
    const controller = createTabsController()
    const instance = tabs({ id: "t", defaultValue: "a", controller })
    expect(instance.api.internal).toBeDefined()
    expect((controller as Record<string, unknown>).internal).toBeUndefined()
  })

  test("a controller never selects a disabled tab, even before tabs bind", () => {
    const onValueChange = vi.fn()
    const instance = tabs({ id: "t", defaultValue: "a", onValueChange })
    // Rendered, but not yet bound to an element.
    attrs(instance.part("tab", { value: "a" }))
    attrs(instance.part("tab", { value: "b", disabled: true }))
    expect(instance.api.select("b")).toBe(false)
    expect(instance.api.getValue()).toBe("a")
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("vertical lists say so", () => {
    const instance = tabs({ id: "t", orientation: "vertical" })
    expect(attrs(instance.part("list"))).toMatchObject({
      role: "tablist",
      "aria-orientation": "vertical",
    })
    expect(
      attrs(tabs({ id: "u" }).part("list"))["aria-orientation"]
    ).toBeUndefined()
  })
})
