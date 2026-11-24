import { describe, expect, test } from "vitest"
import { toolbar } from "../src/components/toolbar/toolbar"
import { attrs as partAttrs, partState } from "../src/foundation/kernel/part"

describe("toolbar", () => {
  test("the root is a horizontal toolbar by default", () => {
    expect(partAttrs(toolbar({ id: "t" }).part("root"))).toMatchObject({
      role: "toolbar",
      "aria-orientation": "horizontal",
      "data-orientation": "horizontal",
      "data-disabled": undefined,
    })
  })

  test("an unknown orientation is horizontal", () => {
    const attrs = partAttrs(
      toolbar({ id: "t", orientation: "Vertical" as "vertical" }).part("root")
    )
    expect(attrs).toMatchObject({
      "aria-orientation": "horizontal",
      "data-orientation": "horizontal",
    })
  })

  test("a new orientation or disabled option reaches the parts", () => {
    const bar = toolbar({ id: "t" })
    bar.setOptions({ id: "t", orientation: "vertical", disabled: true })
    expect(partAttrs(bar.part("root"))).toMatchObject({
      "aria-orientation": "vertical",
      "data-disabled": "",
    })
    expect(partAttrs(bar.part("button", { id: "a" }))).toMatchObject({
      "aria-disabled": "true",
      "data-orientation": "vertical",
    })
  })

  test("separators run across the toolbar", () => {
    expect(partAttrs(toolbar({ id: "t" }).part("separator"))).toMatchObject({
      role: "separator",
      "aria-orientation": "vertical",
      "data-orientation": "vertical",
    })
    expect(
      partAttrs(toolbar({ id: "t", orientation: "vertical" }).part("separator"))
    ).toMatchObject({
      "aria-orientation": "horizontal",
    })
  })

  test("a disabled button stays focusable with aria-disabled", () => {
    expect(
      partAttrs(
        toolbar({ id: "t" }).part("button", { id: "a", disabled: true })
      )
    ).toMatchObject({
      type: "button",
      disabled: undefined,
      "aria-disabled": "true",
      "data-disabled": "",
    })
  })

  test("a disabled field that keeps focus is read only, and one that doesn't is natively disabled", () => {
    const bar = toolbar({ id: "t" })
    expect(
      partAttrs(bar.part("input", { id: "a", disabled: true }))
    ).toMatchObject({
      disabled: undefined,
      readonly: "",
      "aria-disabled": "true",
      "data-disabled": "",
    })
    expect(
      partAttrs(
        bar.part("input", {
          id: "b",
          disabled: true,
          focusableWhenDisabled: false,
        })
      )
    ).toMatchObject({
      disabled: "",
      readonly: undefined,
      "aria-disabled": undefined,
      tabindex: undefined,
    })
  })

  test("a disabled group, or a disabled toolbar, disables its group and the items in it", () => {
    expect(
      partAttrs(toolbar({ id: "t" }).part("group", { id: "g", disabled: true }))
    ).toMatchObject({
      role: "group",
      "data-disabled": "",
    })
    expect(
      partAttrs(toolbar({ id: "t", disabled: true }).part("group", { id: "g" }))
    ).toMatchObject({
      "data-disabled": "",
    })
    expect(
      partAttrs(
        toolbar({ id: "t" }).part("button", { id: "a", groupDisabled: true })
      )
    ).toMatchObject({
      "aria-disabled": "true",
    })
    const disabledLink = { "aria-disabled": "true", "data-disabled": "" }
    expect(
      partAttrs(
        toolbar({ id: "t" }).part("link", { id: "l", groupDisabled: true })
      )
    ).toMatchObject(disabledLink)
    expect(
      partAttrs(toolbar({ id: "t", disabled: true }).part("link", { id: "l" }))
    ).toMatchObject(disabledLink)
  })

  test("a link's state says whether its group or the toolbar disables it", () => {
    expect(partState(toolbar({ id: "t" }).part("link", { id: "l" }))).toEqual({
      disabled: false,
      orientation: "horizontal",
    })
    expect(
      partState(
        toolbar({ id: "t" }).part("link", { id: "l", groupDisabled: true })
      )
    ).toMatchObject({
      disabled: true,
    })
    expect(
      partState(toolbar({ id: "t", disabled: true }).part("link", { id: "l" }))
    ).toMatchObject({
      disabled: true,
    })
  })
})
