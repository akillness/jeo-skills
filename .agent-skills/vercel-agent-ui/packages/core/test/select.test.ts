import { describe, expect, test, vi } from "vitest"
import { select } from "../src/components/select/select"

const fruits = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
]

describe("select headless", () => {
  test("clearing a read-only or disabled select keeps its value", () => {
    const readOnly = select({
      id: "r",
      items: fruits,
      defaultValue: "apple",
      readOnly: true,
    })
    readOnly.api.clear()
    expect(readOnly.api.getValue()).toBe("apple")
    const disabled = select({
      id: "d",
      items: fruits,
      defaultValue: "apple",
      disabled: true,
    })
    disabled.api.clear()
    expect(disabled.api.getValue()).toBe("apple")
  })

  test("a canceled clear keeps the value", () => {
    const instance = select({
      id: "s",
      items: fruits,
      defaultValue: "banana",
      onValueChange: (_value, details) => details.cancel(),
    })
    instance.api.clear({ reason: "clear-press" })
    expect(instance.api.getValue()).toBe("banana")
  })

  test("a controller hands its event to onValueChange", () => {
    const onValueChange = vi.fn()
    const instance = select({ id: "s", items: fruits, onValueChange })
    const event = new Event("click")
    instance.api.setValue("apple", { reason: "imperative", event })
    expect(onValueChange).toHaveBeenCalledWith(
      "apple",
      expect.objectContaining({ reason: "imperative", event })
    )
  })
})
