import * as React from "react"
import { createGridFocus, definePrimitive, type GridCell } from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type SheetState = { active: GridCell | null; anchor: GridCell | null }

const sheet = definePrimitive({
  name: "sheet",
  state: (): SheetState => ({ active: null, anchor: null }),
  api: (context) => ({
    grid: createGridFocus<SheetState>(context, {
      key: "active",
      rows: () => 4,
      cols: () => 4,
      onMove: (cell, { from, shift }) => {
        const anchor = context.store.get().anchor ?? from
        context.store.set({ anchor: shift && anchor ? anchor : cell })
      },
    }),
  }),
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "grid", "aria-multiselectable": "true" }),
    }),
    row: slot<{ id: string }>({
      props: { id: "string" },
      attrs: () => ({ role: "row" }),
    }),
    cell: slot<{ id: string; row: number; col: number }>({
      props: { row: "number", col: "number" },
      attrs: (state, { props, api }) => {
        const { active, anchor } = state
        const inside =
          !!active &&
          !!anchor &&
          props.row >= Math.min(active.row, anchor.row) &&
          props.row <= Math.max(active.row, anchor.row) &&
          props.col >= Math.min(active.col, anchor.col) &&
          props.col <= Math.max(active.col, anchor.col)
        return {
          role: "gridcell",
          tabindex: api.grid.tabIndex(state, props),
          "aria-selected": String(inside),
        }
      },
      on: {
        keydown: (event, { api }) => api.grid.keydown(event),
        pointerdown: (event, { api, props }) =>
          api.grid.focus(props, {
            reason: "item-press",
            event,
            shift: event.shiftKey,
          }),
      },
      bind: (el, { api, props }) => api.grid.bind(el, props),
    }),
  }),
})

const parts = createParts(sheet, { root: "div", row: "div" })

const Sheet = parts.Root

const SheetRow = parts.Row

function SheetCell({
  row,
  col,
  ...props
}: { row: number; col: number } & PartProps<"div">) {
  return usePart(sheet, "cell", { id: `${row}:${col}`, row, col }, props, "div")
}

const columns = "ABCD"

function Example() {
  return (
    <Sheet aria-label="Sheet">
      {[0, 1, 2, 3].map((row) => (
        <SheetRow key={row} id={String(row)}>
          {[0, 1, 2, 3].map((col) => (
            <SheetCell key={col} row={row} col={col}>
              {columns[col]}
              {row + 1}
            </SheetCell>
          ))}
        </SheetRow>
      ))}
    </Sheet>
  )
}

export { Example, sheet, Sheet, SheetCell, SheetRow, type SheetState }
