import { describe, expect, test, vi } from "vitest"
import { fieldSet } from "../src/components/field/field"
import { input, inputGroup, textarea } from "../src/components/input/input"
import { attrs, partState, present } from "../src/foundation/kernel/part"

describe("field set", () => {
  test("renders disabled natively and marks every part", () => {
    const instance = fieldSet({ id: "s", disabled: true })
    expect(attrs(instance.part("set"))).toMatchObject({
      disabled: "",
      "data-disabled": "",
      "data-slot": "field-set",
    })
    expect(attrs(instance.part("legend"))).toMatchObject({
      id: "s-legend",
      "data-disabled": "",
    })
    expect(attrs(instance.part("description"))).toMatchObject({
      id: "s-description",
      "data-disabled": "",
    })
    instance.setOptions({ id: "s", disabled: false })
    expect(attrs(instance.part("set")).disabled).toBeUndefined()
    expect(partState(instance.part("legend"))).toEqual({ disabled: false })
  })
})

describe("input", () => {
  test("marks whether it holds text, and the native states it's given", () => {
    expect(attrs(input({ id: "i" }).part("root"))).toEqual({
      "data-slot": "input",
    })
    expect(
      attrs(
        input({ id: "i", defaultValue: "Ada" }).part("root", {
          disabled: true,
          required: true,
        })
      )
    ).toEqual({
      "data-slot": "input",
      "data-filled": "",
      "data-disabled": "",
      "data-required": "",
    })
    expect(
      partState(
        textarea({ id: "t", value: "" }).part("root", { readOnly: true })
      )
    ).toEqual({
      filled: false,
      disabled: false,
      readOnly: true,
      required: false,
    })
  })

  test("reports changes with their reason, and cancel keeps the value", () => {
    const onValueChange = vi.fn()
    const instance = input({ id: "i", defaultValue: "Ada", onValueChange })
    instance.api.setValue("Grace")
    instance.api.clear()
    expect(
      onValueChange.mock.calls.map(([value, details]) => [
        value,
        details.reason,
      ])
    ).toEqual([
      ["Grace", "imperative"],
      ["", "imperative"],
    ])
    expect(attrs(instance.part("root"))["data-filled"]).toBeUndefined()
    const canceling = input({
      id: "c",
      defaultValue: "Ada",
      onValueChange: (_, details) => details.cancel(),
    })
    canceling.api.clear()
    expect(canceling.api.getValue()).toBe("Ada")
  })

  test("a controlled input waits for its new value", () => {
    const onValueChange = vi.fn()
    const instance = input({ id: "i", value: "Ada", onValueChange })
    instance.api.setValue("Grace")
    expect(onValueChange).toHaveBeenCalledWith(
      "Grace",
      expect.objectContaining({ reason: "imperative" })
    )
    expect(instance.api.getValue()).toBe("Ada")
    instance.setOptions({ id: "i", value: "", onValueChange })
    expect(attrs(instance.part("root"))["data-filled"]).toBeUndefined()
  })

  test("a clear button shows only while there's text it can clear", () => {
    const group = inputGroup({ id: "g" })
    expect(attrs(group.part("group"))).toEqual({ "data-slot": "input-group" })
    expect(present(group.part("clear"))).toBe(false)
    expect(attrs(group.part("clear"))).toMatchObject({
      "data-slot": "input-clear",
      type: "button",
    })
  })
})
