import * as React from "react"
import {
  byCell,
  byCellRange,
  createCellRange,
  createGridFocus,
  definePrimitive,
  selects,
  type CellRange,
  type GridCell,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type SheetState = { active: GridCell | null; range: CellRange | null }

type SheetOptions = { rows: number; cols: number }

type SheetSummaryState = {
  top: number
  left: number
  bottom: number
  right: number
}

const sheet = definePrimitive({
  name: "sheet",
  options: { rows: "number", cols: "number" },
  state: (_options: SheetOptions): SheetState => ({
    active: null,
    range: null,
  }),
  api: (context) => {
    const rows = () => context.options().rows
    const cols = () => context.options().cols
    const grid = createGridFocus<SheetState>(context, {
      key: "active",
      rows,
      cols,
    })
    return {
      grid,
      range: createCellRange<SheetState>(context, {
        key: "range",
        grid,
        rows,
        cols,
      }),
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({
        role: "grid",
        style: "user-select:none;touch-action:none",
      }),
    }),
    row: slot<{ id: string }>({
      props: { id: "string" },
      attrs: () => ({ role: "row" }),
    }),
    summary: slot<{}, SheetSummaryState>({
      state: (state, { api }) => {
        const bounds = state.active && api.range.bounds(state)
        return bounds ?? { top: -1, left: -1, bottom: -1, right: -1 }
      },
      attrs: () => ({ "aria-live": "polite" }),
    }),
    cell: slot<{ id: string; row: number; col: number }>({
      props: { row: "number", col: "number" },
      selects: selects({ active: byCell, range: byCellRange }),
      attrs: (state, { props, api }) => ({
        role: "gridcell",
        tabindex: api.grid.tabIndex(state, props),
        ...api.range.cellAttrs(state, props),
      }),
      on: {
        keydown: (event, { api }) => api.range.keydown(event),
        pointerdown: (event, { api, props }) =>
          api.range.pointerdown(event, props),
      },
      bind: (el, { api, props }) => api.range.bind(el, props),
    }),
  }),
})

const parts = createParts(sheet, { root: "div", row: "div", summary: "p" })

const Sheet = parts.Root

const SheetRow = parts.Row

function SheetCell({
  row,
  col,
  ...props
}: { row: number; col: number } & PartProps<"div">) {
  return usePart(sheet, "cell", { id: `${row}:${col}`, row, col }, props, "div")
}

const SheetSummary = parts.Summary

const values = [
  [4, 8, 15, 16],
  [23, 42, 7, 1],
  [9, 3, 12, 5],
]

function Example() {
  return (
    <Sheet rows={3} cols={4} aria-label="Numbers">
      {values.map((row, r) => (
        <SheetRow key={r} id={String(r)}>
          {row.map((value, c) => (
            <SheetCell key={c} row={r} col={c}>
              {value}
            </SheetCell>
          ))}
        </SheetRow>
      ))}
      <SheetSummary>
        {({ top, left, bottom, right }) => {
          let total = 0
          for (let row = Math.max(top, 0); row <= bottom; row++) {
            for (let col = Math.max(left, 0); col <= right; col++) {
              total += values[row][col]
            }
          }
          return `Total: ${total}`
        }}
      </SheetSummary>
    </Sheet>
  )
}

export {
  Example,
  sheet,
  Sheet,
  SheetCell,
  SheetRow,
  SheetSummary,
  type SheetOptions,
  type SheetState,
  type SheetSummaryState,
}
