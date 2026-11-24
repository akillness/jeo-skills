import { describe, expect, test, vi } from "vitest"
import {
  checkbox,
  checkboxGroup,
  createCheckboxController,
} from "../src/components/checkbox/checkbox"
import { groupChecked } from "../src/components/checkbox/checkbox-group"
import { field } from "../src/components/field/field"
import { switchPrimitive } from "../src/components/switch/switch"
import { radioStep } from "../src/foundation/focus/collection"
import { radioGroup } from "../src/components/radio/radio"
import { attrs, partState, present } from "../src/foundation/kernel/part"
import { kept } from "./kept"

describe("checkbox", () => {
  test("renders its state as ARIA and data attributes", () => {
    const off = checkbox({ id: "c" })
    expect(attrs(off.part("root"))).toMatchObject({
      role: "checkbox",
      "aria-checked": "false",
      "data-unchecked": "",
      tabindex: "0",
    })
    const mixed = checkbox({ id: "c", defaultChecked: "indeterminate" })
    expect(attrs(mixed.part("root"))).toMatchObject({
      "aria-checked": "mixed",
      "data-indeterminate": "",
    })
    expect(partState(mixed.part("root"))).toEqual({
      checked: false,
      indeterminate: true,
      disabled: false,
      readOnly: false,
      required: false,
    })
  })

  test("an indeterminate checkbox becomes checked, then toggles", () => {
    const onCheckedChange = vi.fn()
    const instance = checkbox({
      id: "c",
      defaultChecked: "indeterminate",
      onCheckedChange,
    })
    instance.api.toggle()
    expect(instance.get().checked).toBe(true)
    instance.api.toggle()
    expect(instance.get().checked).toBe(false)
    expect(
      onCheckedChange.mock.calls.map(([value, details]) => [
        value,
        details.reason,
      ])
    ).toEqual([
      [true, "imperative"],
      [false, "imperative"],
    ])
  })

  test("disabled and read-only checkboxes don't change", () => {
    for (const options of [{ disabled: true }, { readOnly: true }]) {
      const instance = checkbox({ id: "c", ...options })
      instance.api.toggle()
      expect(instance.get().checked).toBe(false)
    }
    expect(
      attrs(checkbox({ id: "c", readOnly: true }).part("root"))["aria-readonly"]
    ).toBe("true")
    expect(
      attrs(checkbox({ id: "c", disabled: true }).part("root"))
    ).toMatchObject({
      disabled: "",
      tabindex: undefined,
    })
  })

  test("controlled checkboxes report changes and wait for the new value", () => {
    const onCheckedChange = vi.fn()
    const instance = checkbox({ id: "c", checked: false, onCheckedChange })
    instance.api.toggle()
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
    expect(instance.get().checked).toBe(false)
    instance.setOptions({ id: "c", checked: true, onCheckedChange })
    expect(instance.get().checked).toBe(true)
  })

  test("a change can be cancelled", () => {
    const instance = checkbox({
      id: "c",
      onCheckedChange: (_, details) => details.cancel(),
    })
    instance.api.toggle()
    expect(instance.get().checked).toBe(false)
  })

  test("the hidden input renders the default checkedness for the server and resets", () => {
    const instance = checkbox({
      id: "c",
      defaultChecked: true,
      name: "terms",
      value: "yes",
      required: true,
    })
    expect(attrs(instance.part("input"))).toMatchObject({
      type: "checkbox",
      name: "terms",
      value: "yes",
      checked: "",
      required: "",
      "aria-hidden": "true",
      tabindex: "-1",
    })
    instance.api.toggle()
    // The attribute is the default, which a reset returns to, not the current state.
    expect(attrs(instance.part("input")).checked).toBe("")
    instance.api.internal.reset()
    expect(instance.get().checked).toBe(true)
  })

  test("a reset returns to the current default, like the native attribute", () => {
    const instance = checkbox({ id: "c", defaultChecked: false })
    instance.setOptions({ id: "c", defaultChecked: true })
    instance.api.internal.reset()
    expect(instance.get().checked).toBe(true)
  })

  test("the indicator shows while checked or indeterminate, or when kept mounted", () => {
    const instance = checkbox({ id: "c" })
    expect(present(instance.part("indicator", {}))).toBe(false)
    expect(present(instance.part("indicator", { keepMounted: true }))).toBe(
      true
    )
    instance.api.setChecked("indeterminate")
    expect(present(instance.part("indicator", {}))).toBe(true)
  })

  test("a controller toggles it from anywhere", () => {
    const controller = createCheckboxController()
    const instance = kept(checkbox({ id: "c", controller }))
    instance.setOptions({ id: "c", controller })
    controller.toggle()
    expect(instance.get().checked).toBe(true)
    expect(controller.getChecked()).toBe(true)
  })

  test("a parent checkbox reflects its group", () => {
    const all = ["a", "b", "c"]
    expect(groupChecked([], all)).toBe(false)
    expect(groupChecked(["a"], all)).toBe("indeterminate")
    expect(groupChecked(["a", "b", "c"], all)).toBe(true)
    expect(groupChecked(["x"], all)).toBe(false)
  })
})

describe("switch", () => {
  test("is a switch with a thumb that follows it", () => {
    const instance = switchPrimitive({ id: "s", defaultChecked: true })
    expect(attrs(instance.part("root"))).toMatchObject({
      role: "switch",
      "aria-checked": "true",
    })
    expect(attrs(instance.part("thumb"))).toMatchObject({ "data-checked": "" })
    instance.api.toggle()
    expect(attrs(instance.part("thumb"))).toMatchObject({
      "data-unchecked": "",
    })
    expect(attrs(instance.part("thumb"))["data-state"]).toBeUndefined()
  })
})

describe("radio group", () => {
  test("arrow keys go forward and back on both axes, mirrored right to left", () => {
    expect(radioStep("ArrowDown", false)).toBe(1)
    expect(radioStep("ArrowRight", false)).toBe(1)
    expect(radioStep("ArrowUp", false)).toBe(-1)
    expect(radioStep("ArrowLeft", false)).toBe(-1)
    expect(radioStep("ArrowLeft", true)).toBe(1)
    expect(radioStep("ArrowRight", true)).toBe(-1)
    expect(radioStep("ArrowDown", true)).toBe(1)
    expect(radioStep("Home", false)).toBeUndefined()
  })

  test("the checked item holds the tab stop", () => {
    const instance = radioGroup({ id: "r", defaultValue: "b" })
    expect(attrs(instance.part("root", { value: "a" }))).toMatchObject({
      "aria-checked": "false",
      tabindex: "-1",
    })
    expect(attrs(instance.part("root", { value: "b" }))).toMatchObject({
      "aria-checked": "true",
      tabindex: "0",
    })
  })

  test("with nothing checked, the server renders one tab stop on the first enabled item", () => {
    const instance = radioGroup({ id: "r" })
    expect(
      attrs(instance.part("root", { value: "a", disabled: true })).tabindex
    ).toBeUndefined()
    expect(attrs(instance.part("root", { value: "b" })).tabindex).toBe("0")
    expect(attrs(instance.part("root", { value: "c" })).tabindex).toBe("-1")
  })

  test("disabled items and groups never select", () => {
    const instance = radioGroup({ id: "r" })
    attrs(instance.part("root", { value: "a", disabled: true }))
    expect(instance.api.setValue("b")).toBe(true)
    const disabled = radioGroup({ id: "r", disabled: true })
    expect(disabled.api.setValue("b")).toBe(false)
    expect(attrs(disabled.part("group"))["aria-disabled"]).toBe("true")
    const readOnly = radioGroup({ id: "r", readOnly: true })
    expect(readOnly.api.setValue("b")).toBe(false)
  })

  test("a reset returns to the default value", () => {
    const instance = radioGroup({ id: "r", defaultValue: "a", name: "plan" })
    expect(attrs(instance.part("input", { value: "a" }))).toMatchObject({
      type: "radio",
      name: "plan",
      checked: "",
    })
    instance.api.setValue("b")
    instance.api.internal.reset()
    expect(instance.get().value).toBe("a")
  })

  test("required radios without a name still validate as one group", () => {
    expect(
      attrs(
        radioGroup({ id: "r", required: true }).part("input", { value: "a" })
      ).name
    ).toBe("r")
    expect(
      attrs(radioGroup({ id: "r" }).part("input", { value: "a" })).name
    ).toBeUndefined()
  })
})

describe("field", () => {
  test("ties the label and control together by id", () => {
    const instance = field({ id: "f" })
    expect(attrs(instance.part("label"))).toMatchObject({
      id: "f-label",
      for: "f-control",
    })
    expect(attrs(instance.part("control"))).toMatchObject({ id: "f-control" })
  })

  test("errors stay hidden until the field is invalid and shown", () => {
    const instance = field({ id: "f" })
    expect(present(instance.part("error", {}))).toBe(false)
    expect(present(instance.part("error", { match: true }))).toBe(true)
    const forced = field({ id: "f", invalid: true })
    expect(present(forced.part("error", {}))).toBe(true)
    expect(attrs(forced.part("control"))).toMatchObject({
      "aria-invalid": "true",
      "data-invalid": "",
    })
  })

  test("a disabled field disables its control", () => {
    expect(
      attrs(field({ id: "f", disabled: true }).part("control"))
    ).toMatchObject({
      disabled: "",
      "data-disabled": "",
    })
  })
})

describe("checkbox group", () => {
  test("children follow the group's value, and a parent follows the children", () => {
    const group = checkboxGroup({
      id: "g",
      defaultValue: ["a"],
      allValues: ["a", "b", "c"],
      name: "letters",
    })
    const child = checkbox({ id: "c", value: "b", group: () => group.api })
    const parent = checkbox({ id: "p", parent: true, group: () => group.api })
    expect(child.get().checked).toBe(false)
    expect(attrs(child.part("input")).name).toBe("letters")
    expect(parent.get().checked).toBe("indeterminate")
    expect(attrs(parent.part("input")).name).toBeUndefined()
    child.api.toggle()
    expect(group.get().value).toEqual(["a", "b"])
  })

  test("a parent checks every value, then none", () => {
    const onValueChange = vi.fn()
    const group = checkboxGroup({
      id: "g",
      defaultValue: ["b"],
      allValues: ["a", "b", "c"],
      onValueChange,
    })
    const parent = checkbox({ id: "p", parent: true, group: () => group.api })
    parent.api.toggle()
    expect(group.get().value).toEqual(["a", "b", "c"])
    parent.setOptions({ id: "p", parent: true, group: () => group.api })
    expect(parent.get().checked).toBe(true)
    parent.api.toggle()
    expect(group.get().value).toEqual([])
    expect(onValueChange).toHaveBeenCalledTimes(2)
  })

  test("values keep the order of all values", () => {
    const group = checkboxGroup({ id: "g", allValues: ["a", "b", "c"] })
    group.api.setValue(["c", "a"])
    expect(group.get().value).toEqual(["a", "c"])
  })

  test("a disabled group changes nothing", () => {
    const group = checkboxGroup({ id: "g", disabled: true, allValues: ["a"] })
    const child = checkbox({ id: "c", value: "a", group: () => group.api })
    expect(attrs(child.part("root")).disabled).toBe("")
    child.api.toggle()
    expect(group.get().value).toEqual([])
  })

  test("a required group validates through one unnamed input", () => {
    const group = checkboxGroup({ id: "g", required: true, name: "letters" })
    expect(attrs(group.part("group-input"))).toMatchObject({
      type: "checkbox",
      required: "",
    })
    expect(attrs(group.part("group-input")).name).toBeUndefined()
    // Its own slot, apart from the checkboxes' inputs.
    expect(attrs(group.part("group-input"))["data-slot"]).toBe(
      "checkbox-group-input"
    )
    expect(attrs(group.part("group")).role).toBe("group")
  })

  test("two checkboxes that share a value, like two without one, warn in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const group = checkboxGroup({ id: "g" })
    const first = { id: "", isConnected: true } as HTMLElement
    const second = { id: "", isConnected: true } as HTMLElement
    group.api.register("on", first, () => false)
    expect(warn).not.toHaveBeenCalled()
    group.api.register("on", second, () => false)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('share the value "on"')
    warn.mockRestore()
  })

  test("a reset returns to the default value", () => {
    const group = checkboxGroup({ id: "g", defaultValue: ["a"] })
    group.api.setValue(["b"])
    group.api.internal.reset()
    expect(group.get().value).toEqual(["a"])
  })
})
