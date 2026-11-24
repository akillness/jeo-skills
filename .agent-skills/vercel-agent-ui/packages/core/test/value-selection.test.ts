// A `setOptions` caller that changes its selected list in place hands the
// same array over again, so selection reads its items, not its identity.
// Renderers hand over a copy instead (`createListSnapshots`).
import { expect, test } from "vitest"
import { listbox } from "../src/components/listbox/listbox-root"
import { attrs } from "../src/foundation/kernel/part"

const items = ["basil", "cheese", "olive"].map((value) => ({
  value,
  label: value,
}))

function selectedList(value: string[]) {
  const options = { id: "l", items, multiple: true, value }
  const instance = listbox(options)
  return {
    selection: instance.api.internal.selection,
    selected: (key: string) =>
      attrs(instance.part("item", { id: key, value: key }))["aria-selected"] ===
      "true",
    // A new options object with the same array.
    handOver: () => instance.setOptions({ ...options }),
  }
}

test("an item pushed into the selected list is selected", () => {
  const value = ["basil"]
  const { selection, selected, handOver } = selectedList(value)
  expect(selected("cheese")).toBe(false)
  value.push("cheese")
  handOver()
  expect(selected("cheese")).toBe(true)
  expect(selection.keys()).toEqual(["basil", "cheese"])
})

test("an item spliced out of the selected list is unselected", () => {
  const value = ["basil", "cheese"]
  const { selection, selected, handOver } = selectedList(value)
  expect(selected("basil")).toBe(true)
  value.splice(0, 1)
  handOver()
  expect(selected("basil")).toBe(false)
  expect(selection.keys()).toEqual(["cheese"])
})

test("a selected list reordered in place submits in its new order", () => {
  const value = ["basil", "cheese", "olive"]
  const { selection, handOver } = selectedList(value)
  expect(selection.keys()).toEqual(["basil", "cheese", "olive"])
  value.reverse()
  handOver()
  expect(selection.keys()).toEqual(["olive", "cheese", "basil"])
})

test("an object pushed into the selected list matches its item through isItemEqualToValue", () => {
  const plans = [
    { value: { id: "free" }, label: "Free" },
    { value: { id: "pro" }, label: "Pro" },
  ]
  const value = [{ id: "free" }]
  const options = {
    id: "l",
    items: plans,
    multiple: true,
    value,
    itemToValue: (plan: { id: string }) => plan.id,
    isItemEqualToValue: (plan: { id: string }, selected: { id: string }) =>
      plan.id === selected.id,
  }
  const instance = listbox(options)
  const { selection } = instance.api.internal
  expect(selection.isSelected("pro", plans[1].value)).toBe(false)
  value.push({ id: "pro" })
  instance.setOptions({ ...options })
  expect(selection.isSelected("pro", plans[1].value)).toBe(true)
  expect(selection.keys()).toEqual(["free", "pro"])
})
