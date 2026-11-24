import { describe, expect, test, vi } from "vitest"
import {
  createListboxController,
  listbox,
} from "../src/components/listbox/listbox-root"
import { attachController } from "../src/foundation/kernel/controller"
import { attrs } from "../src/foundation/kernel/part"

const items = [
  { value: "basil", label: "Basil" },
  { value: "cheese", label: "Cheese" },
  { value: "olive", label: "Olive", disabled: true },
  { value: "onion", label: "Onion" },
]

const itemAttrs = (
  instance: ReturnType<typeof listbox>,
  value: string,
  disabled = false
) => attrs(instance.part("item", { id: value, value, disabled }))

describe("listbox", () => {
  test("the root is a listbox that says how it selects", () => {
    const single = listbox({ id: "l" })
    expect(attrs(single.part("root", {}))).toMatchObject({
      role: "listbox",
      tabindex: "-1",
      "aria-orientation": "vertical",
      "data-orientation": "vertical",
    })
    expect(
      attrs(single.part("root", {}))["aria-multiselectable"]
    ).toBeUndefined()
    const multiple = listbox({
      id: "l",
      multiple: true,
      orientation: "horizontal",
    })
    expect(attrs(multiple.part("root", {}))).toMatchObject({
      "aria-multiselectable": "true",
      "aria-orientation": "horizontal",
    })
  })

  test("options say whether they're selected, as true or false", () => {
    const instance = listbox({ id: "l", defaultValue: "cheese" })
    expect(itemAttrs(instance, "basil")["aria-selected"]).toBe("false")
    expect(itemAttrs(instance, "cheese")).toMatchObject({
      "aria-selected": "true",
      "data-selected": "",
    })
  })

  test("before options bind, the selected one claims the only tab stop", () => {
    const instance = listbox({ id: "l", defaultValue: "cheese" })
    const stops = ["basil", "cheese", "onion"].map(
      (value) => itemAttrs(instance, value).tabindex
    )
    expect(stops).toEqual(["-1", "0", "-1"])
  })

  test("before options bind, with nothing selected, the first enabled one claims the tab stop", () => {
    const instance = listbox({ id: "l" })
    expect(itemAttrs(instance, "olive", true).tabindex).toBe("-1")
    expect(itemAttrs(instance, "onion").tabindex).toBe("0")
    expect(itemAttrs(instance, "basil").tabindex).toBe("-1")
  })

  test("data items know their tab stop at once", () => {
    const instance = listbox({ id: "l", items, defaultValue: "onion" })
    expect(instance.get().stop).toBe("onion")
    expect(listbox({ id: "l", items }).get().stop).toBe("basil")
  })

  test("a disabled listbox has no tab stop", () => {
    const instance = listbox({ id: "l", disabled: true })
    expect(itemAttrs(instance, "basil").tabindex).toBeUndefined()
    expect(attrs(instance.part("root", {}))).toMatchObject({
      "aria-disabled": "true",
      "data-disabled": "",
    })
    expect(attrs(instance.part("root", {})).tabindex).toBe("-1")
  })

  test("selection follows focus in a single list, and waits for a press with several", () => {
    expect(listbox({ id: "l" }).get().activation).toBe("automatic")
    expect(listbox({ id: "l", multiple: true }).get().activation).toBe("manual")
    expect(
      listbox({ id: "l", multiple: true, activation: "automatic" }).get()
        .activation
    ).toBe("automatic")
  })

  test("a press chooses the option", () => {
    const onValueChange = vi.fn()
    const instance = listbox({ id: "l", items, onValueChange })
    instance.api.internal.press("cheese")
    expect(instance.api.getValue()).toBe("cheese")
    expect(onValueChange.mock.calls[0][1].reason).toBe("item-press")
  })

  test("pressing the selected option keeps it, unless the listbox is deselectable", () => {
    const kept = listbox({ id: "l", items, defaultValue: "cheese" })
    kept.api.internal.press("cheese")
    expect(kept.api.getValue()).toBe("cheese")
    const cleared = listbox({
      id: "l",
      items,
      defaultValue: "cheese",
      deselectable: true,
    })
    cleared.api.internal.press("cheese")
    expect(cleared.api.getValue()).toBe(null)
  })

  test("a disabled option can't be chosen", () => {
    const instance = listbox({ id: "l", items })
    instance.api.internal.press("olive")
    expect(instance.api.getValue()).toBe(null)
  })

  test("presses without modifiers toggle with multiple, whatever the activation", () => {
    for (const activation of ["manual", "automatic"] as const) {
      const instance = listbox({ id: "l", items, multiple: true, activation })
      instance.api.internal.press("onion")
      instance.api.internal.press("basil")
      expect(instance.api.getValue()).toEqual(["onion", "basil"])
      instance.api.internal.press("onion")
      expect(instance.api.getValue()).toEqual(["basil"])
    }
  })

  test("a read-only listbox doesn't change", () => {
    const instance = listbox({
      id: "l",
      items,
      readOnly: true,
      defaultValue: "basil",
    })
    instance.api.internal.press("cheese")
    instance.api.setValue("onion")
    expect(instance.api.getValue()).toBe("basil")
  })

  test("a canceled change keeps the value", () => {
    const instance = listbox({
      id: "l",
      items,
      onValueChange: (value, details) => details.cancel(),
    })
    instance.api.internal.press("cheese")
    expect(instance.api.getValue()).toBe(null)
  })

  test("the controller sets, clears and selects every enabled item", () => {
    const controller = createListboxController<string, true>()
    const onValueChange = vi.fn()
    const instance = listbox({
      id: "l",
      items,
      multiple: true,
      controller,
      onValueChange,
    })
    attachController(controller, instance.api)
    controller.selectAll()
    expect(controller.getValue()).toEqual(["basil", "cheese", "onion"])
    controller.clear()
    expect(controller.getValue()).toEqual([])
    controller.setValue(["onion"], { reason: "imperative" })
    expect(controller.getValue()).toEqual(["onion"])
    expect(
      onValueChange.mock.calls.every(
        ([, details]) => details.reason === "imperative"
      )
    ).toBe(true)
  })

  test("a form reset returns to the default value", () => {
    const instance = listbox({ id: "l", items, defaultValue: "basil" })
    instance.api.internal.press("onion")
    instance.api.internal.reset()
    expect(instance.api.getValue()).toBe("basil")
  })

  test("object values are identified by itemToValue and keep their identity", () => {
    const plans = [
      { value: { id: "free", seats: 1 }, label: "Free" },
      { value: { id: "pro", seats: 5 }, label: "Pro" },
    ]
    const instance = listbox({
      id: "l",
      items: plans,
      multiple: true,
      itemToValue: (plan) => plan.id,
    })
    instance.api.internal.press("pro")
    instance.api.internal.press("free")
    expect(instance.api.getValue()).toEqual([plans[1].value, plans[0].value])
    expect((instance.api.getValue() as unknown[])[0]).toBe(plans[1].value)
  })

  test("a data option that holds only its key is matched by its data value", () => {
    const plans = [
      { value: { id: "free", seats: 1 }, label: "Free" },
      { value: { id: "pro", seats: 5 }, label: "Pro" },
    ]
    const instance = listbox({
      id: "l",
      items: plans,
      value: { id: "pro", seats: 5 },
      itemToValue: (plan) => plan.id,
      isItemEqualToValue: (plan, selected) => plan.id === selected.id,
    })
    // A web component's item has its key as a string attribute.
    const selected = (key: string) =>
      attrs(instance.part("item", { id: key, value: key }))["aria-selected"]
    expect(selected("pro")).toBe("true")
    expect(selected("free")).toBe("false")
  })

  test("the hidden input submits the selected keys", () => {
    const instance = listbox({
      id: "l",
      items,
      multiple: true,
      name: "toppings",
      defaultValue: ["basil", "onion"],
    })
    expect(attrs(instance.part("form-input", {}))).toMatchObject({
      value: "basil,onion",
      "aria-hidden": "true",
    })
    expect(
      attrs(instance.part("value-input", { id: "basil", value: "basil" }))
    ).toMatchObject({
      type: "hidden",
      name: "toppings",
      value: "basil",
    })
  })
})
