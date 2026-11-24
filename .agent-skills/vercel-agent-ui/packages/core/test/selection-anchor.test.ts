import { expect, test } from "vitest"
import { createStore } from "../src/foundation/kernel/store"
import { createSelection } from "../src/foundation/selection/selection-model"

test("setAnchor starts the next range where focus is, keeping the selection", () => {
  const store = createStore({ value: [] as string[] }, [])
  const order = ["r1", "r2", "r3", "r4", "r5", "r6"]
  const selection = createSelection(
    { store, options: () => ({}), onDestroy: () => {} },
    {
      key: "value",
      set: (value) => (store.set({ value }), true),
      order: () => order,
      multiple: () => true,
    }
  )
  const why = { reason: "item-press" } as const
  selection.toggle("r1", why)
  selection.setAnchor("r4")
  expect(selection.anchor()).toBe("r4")
  expect(store.get().value).toEqual(["r1"])
  selection.extend("r5", why)
  expect(store.get().value).toEqual(["r1", "r4", "r5"])
  selection.setAnchor(null)
  expect(selection.anchor()).toBeNull()
})
