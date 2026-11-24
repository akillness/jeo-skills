// Renderers hand a data list like `items` over through a framework memo, so
// it reaches the instance as a new list only when the framework says
// something in it changed. A manual memo stands in for the framework here.
import { expect, test } from "vitest"
import { listbox } from "../src/components/listbox/listbox-root"
import { createListSnapshots } from "../src/foundation/kernel/controlled-lists"

// Every memo runs again after `changed()`, as a framework's would once
// something it read changed.
function manualMemos() {
  const stale: (() => void)[] = []
  const memo = <Value>(compute: () => Value) => {
    let value: { current: Value } | undefined
    stale.push(() => (value = undefined))
    return () => (value ??= { current: compute() }).current
  }
  return { memo, changed: () => stale.forEach((mark) => mark()) }
}

function dataListbox() {
  const items = [
    { value: "a", label: "Alpha", disabled: false },
    { value: "b", label: "Beta", disabled: false },
  ]
  const options = () => ({ id: "l", items })
  const { memo, changed } = manualMemos()
  const snapshot = createListSnapshots(listbox, memo)
  const instance = listbox(snapshot(options()))
  const handOver = () => {
    const next = snapshot(options())
    instance.setOptions(next)
    return next.items
  }
  const engine = instance.api.internal.listbox
  return { items, changed, handOver, engine }
}

test("a data list changed in place reaches the instance as a new list", () => {
  const { items, changed, handOver, engine } = dataListbox()
  items[1].disabled = true
  items[1].label = "Changed"
  changed()
  const handed = handOver()
  expect(handed).not.toBe(items)
  expect(handed).toEqual(items)
  expect(engine.find("b")?.disabled).toBe(true)
  expect(engine.labelOf("b")).toBe("Changed")
})

test("a data list handed over with nothing changed in it keeps its identity", () => {
  const { items, handOver } = dataListbox()
  expect(handOver()).toBe(items)
  expect(handOver()).toBe(items)
})
