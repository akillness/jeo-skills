// @vitest-environment jsdom
// A grid cell a keyed renderer moves to another row, keeping its element,
// is found at its new row: arrow keys land on the cell that is there now.
import { createGridFocus, definePrimitive, type GridCell } from "@ui-sdk/core"
import { expect, test } from "vitest"
import { createParts } from "../src/define-element"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

const sortedGrid = definePrimitive({
  name: "sorted-grid",
  options: { rows: "number" },
  state: (_options: { rows?: number }) => ({ active: null as GridCell | null }),
  api: (context) => ({
    grid: createGridFocus(context, {
      key: "active",
      rows: () => context.options().rows ?? 0,
      cols: () => 1,
    }),
  }),
  slots: (slot) => ({
    root: slot({ role: "grid", keys: { none: "Each cell handles them." } }),
    cell: slot<{ row: number; col: number }>({
      props: { row: "number", col: "number" },
      role: "gridcell",
      focus: "roving",
      keys: ["ArrowUp", "ArrowDown"],
      attrs: (state, { props, api }) => ({
        tabindex: api.grid.tabIndex(state, props),
      }),
      on: {
        keydown: (event, { api }) => api.grid.keydown(event),
        pointerdown: (event, { api, props }) =>
          api.grid.focus(props, { reason: "item-press", event }),
      },
      bind: (el, { api, props }) => api.grid.bind(el, props),
    }),
  }),
})

createParts(sortedGrid, {
  root: { tag: "test-sorted-grid", display: "block" },
  cell: { tag: "test-sorted-grid-cell", display: "block" },
})

test("a cell moved to another row is reached there by the arrow keys", async () => {
  document.body.innerHTML = `<test-sorted-grid rows="3">
    <test-sorted-grid-cell id="a" row="0" col="0">A</test-sorted-grid-cell>
    <test-sorted-grid-cell id="b" row="1" col="0">B</test-sorted-grid-cell>
    <test-sorted-grid-cell id="c" row="2" col="0">C</test-sorted-grid-cell>
  </test-sorted-grid>`
  await wait()
  const grid = document.querySelector("test-sorted-grid")!
  const cell = (id: string) => document.getElementById(id)!
  const press = (el: HTMLElement, key: string) =>
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))

  cell("a").dispatchEvent(new Event("pointerdown", { bubbles: true }))
  press(cell("a"), "ArrowDown")
  expect(document.activeElement).toBe(cell("b"))

  // Sorted descending: C, B, A. The renderer reorders the same elements.
  grid.prepend(cell("c"))
  grid.append(cell("a"))
  cell("c").setAttribute("row", "0")
  cell("a").setAttribute("row", "2")
  await wait()
  expect([...grid.children].map((el) => el.getAttribute("row"))).toEqual([
    "0",
    "1",
    "2",
  ])

  cell("c").dispatchEvent(new Event("pointerdown", { bubbles: true }))
  expect(document.activeElement).toBe(cell("c"))
  press(cell("c"), "ArrowDown")
  expect(document.activeElement).toBe(cell("b"))
  press(cell("b"), "ArrowDown")
  expect(document.activeElement).toBe(cell("a"))
})
