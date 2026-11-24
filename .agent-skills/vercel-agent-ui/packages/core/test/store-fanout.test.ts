import { expect, test } from "vitest"
import { budgets } from "../../../tests/perf/budgets"
import { menu } from "./menu-parts"
import { toolbar } from "../src/components/toolbar/toolbar"
import { fakeElement } from "./selects"
import { sheet } from "./sheet"
import { press, subscribe } from "../src/foundation/kernel/part"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"

// Same bound at every size, so work that grows with the item count fails at
// the larger ones.
for (const n of [10, 500, 2000]) {
  test(`a highlight change notifies two items (n=${n})`, () => {
    const instance = menu({ id: "m" })
    let notified = 0
    for (let i = 0; i < n; i++) {
      subscribe(instance.part("item", { value: `item-${i}` }), () => notified++)
    }
    instance.api.internal.highlight("item-1", { focus: false })
    notified = 0
    instance.api.internal.highlight("item-2", { focus: false })
    expect(notified).toBe(budgets["menu.arrow-key"].notified)
  })

  test(`a checkbox toggle notifies its item and its indicator (n=${n})`, () => {
    const instance = menu({ id: "m" })
    const notified = new Set<string>()
    const watch = (slot: string, props: Record<string, unknown>) =>
      subscribe((instance as PrimitiveInstance).part(slot, props), () =>
        notified.add(`${slot} ${JSON.stringify(props)}`)
      )
    watch("trigger", {})
    watch("content", {})
    for (let i = 0; i < n; i++) {
      watch("item", { value: `item-${i}` })
    }
    watch("separator", { id: "separator" })
    watch("checkbox-item", { value: "wrap" })
    watch("item-indicator", {
      id: "wrap-check",
      item: "checkbox-item",
      itemKey: "wrap",
    })
    watch("checkbox-item", { value: "minimap" })
    watch("item-indicator", {
      id: "minimap-check",
      item: "checkbox-item",
      itemKey: "minimap",
    })
    press(instance.part("checkbox-item", { value: "wrap" }))?.()
    expect(notified.size).toBeLessThanOrEqual(budgets["menu.checkbox"].notified)
    expect([...notified]).toEqual([
      'checkbox-item {"value":"wrap"}',
      'item-indicator {"id":"wrap-check","item":"checkbox-item","itemKey":"wrap"}',
    ])
  })

  const sheetCells = (n: number) => {
    const instance = sheet({ id: "s", rows: n, cols: 10 })
    const notified = new Set<string>()
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < 10; col++) {
        subscribe(
          (instance as PrimitiveInstance).part("cell", {
            id: `${row}:${col}`,
            row,
            col,
          }),
          () => notified.add(`${row}:${col}`)
        )
      }
    }
    return { ...instance.api, notified }
  }

  test(`a move in a grid notifies the cell it leaves and the one it lands on (n=${n})`, () => {
    const { grid, notified } = sheetCells(n)
    grid.focus({ row: 0, col: 0 })
    notified.clear()
    grid.focus({ row: 1, col: 0 })
    expect(notified.size).toBe(budgets["grid.arrow-key"].notified)
  })

  test(`a range growing by a row notifies that row and the one that was its bottom edge (n=${n})`, () => {
    const { grid, range, notified } = sheetCells(n)
    grid.focus({ row: 1, col: 0 })
    range.select({ anchor: { row: 1, col: 0 }, end: { row: 2, col: 4 } })
    notified.clear()
    range.select({ anchor: { row: 1, col: 0 }, end: { row: 3, col: 4 } })
    expect(notified.size).toBe(budgets["grid.extend"].notified)
  })

  test(`a toolbar button rendered as another element notifies only itself (n=${n})`, () => {
    const instance = toolbar({ id: "t" })
    let notified = 0
    for (let i = 0; i < n; i++) {
      subscribe(
        (instance as PrimitiveInstance).part("button", { value: `b${i}` }),
        () => notified++
      )
    }
    // Every button renders as a div, like a toolbar of custom elements, one
    // by one as they bind.
    for (let i = 0; i < n; i++) {
      instance.api.internal.setElement(
        `b${i}`,
        Object.assign(fakeElement(i, "DIV"), { matches: () => false })
      )
    }
    expect(notified).toBe(n * budgets["toolbar.arrow-key"].notifiedPerPart)
  })
}
