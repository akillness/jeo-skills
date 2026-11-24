import { describe, expect, test } from "vitest"
import { segmentedControl } from "../src/components/segmented-control/segmented-control"
import { attrs } from "../src/foundation/kernel/part"

describe("segmented control", () => {
  test("the root is the radio group, horizontal unless it says otherwise", () => {
    const root = attrs(segmentedControl({ id: "s" }).part("root", {}))
    expect(root).toMatchObject({
      role: "radiogroup",
      "aria-orientation": "horizontal",
    })
    const vertical = attrs(
      segmentedControl({ id: "s", orientation: "vertical" }).part("root", {})
    )
    expect(vertical).toMatchObject({
      "aria-orientation": "vertical",
      "data-orientation": "vertical",
    })
  })

  test("items are radios, checked by the value", () => {
    const instance = segmentedControl({ id: "s", defaultValue: "grid" })
    expect(attrs(instance.part("item", { value: "grid" }))).toMatchObject({
      role: "radio",
      "aria-checked": "true",
    })
    expect(attrs(instance.part("item", { value: "list" }))).toMatchObject({
      "aria-checked": "false",
    })
  })

  test("a change to orientation reaches the root and the indicator", () => {
    const instance = segmentedControl({ id: "s" })
    instance.setOptions({ id: "s", orientation: "vertical" })
    expect(attrs(instance.part("root", {}))).toMatchObject({
      "aria-orientation": "vertical",
    })
    expect(attrs(instance.part("indicator", {}))).toMatchObject({
      "data-orientation": "vertical",
    })
  })
})
