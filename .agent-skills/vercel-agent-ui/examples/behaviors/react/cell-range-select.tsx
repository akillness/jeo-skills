import * as React from "react"
import {
  byCell,
  byCellRange,
  createCellRange,
  createChange,
  createGridFocus,
  definePrimitive,
  selects,
  type CellRange,
  type GridCell,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type LedgerState = { active: GridCell | null; range: CellRange | null }

const values = [
  [4, 8, 15, 16],
  [23, 42, 7, 1],
  [9, 3, 12, 5],
]
const rows = values.length
const cols = values[0].length
const letters = "ABCD"

const nameOf = (row: number, col: number) => `${letters[col]}${row + 1}`

const shortcuts: Record<string, string> = {
  "column-b": "Column B",
  "rows-1-2": "Rows 1 and 2",
  block: "B2 to C3",
  all: "All",
}

const ledgerGrid = definePrimitive({
  name: "ledger-grid",
  state: (): LedgerState => ({ active: null, range: null }),
  api: (context) => {
    const change = createChange(context)
    const grid = createGridFocus<LedgerState>(context, {
      key: "active",
      rows: () => rows,
      cols: () => cols,
    })
    const range = createCellRange<LedgerState>(context, {
      key: "range",
      grid,
      rows: () => rows,
      cols: () => cols,
      set: (value, details) => change("range", value, details),
      message: ({ top, left, bottom, right }) =>
        `${nameOf(top, left)} to ${nameOf(bottom, right)} selected`,
    })
    return {
      grid,
      range,
      pick(shortcut: string) {
        if (shortcut === "column-b") {
          range.selectColumns(1)
        } else if (shortcut === "rows-1-2") {
          range.selectRows(0, 1)
        } else if (shortcut === "block") {
          range.select({ anchor: { row: 1, col: 1 }, end: { row: 2, col: 2 } })
        } else {
          range.selectAll()
        }
      },
    }
  },
  slots: (slot) => ({
    grid: slot({
      attrs: () => ({
        role: "grid",
        style: "user-select:none;touch-action:none",
      }),
    }),
    row: slot<{ id: string }>({
      props: { id: "string" },
      attrs: () => ({ role: "row" }),
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
    shortcut: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.pick(key),
    }),
    summary: slot<{}, { text: string }>({
      state: (state, { api }) => {
        const bounds = api.range.bounds(state)
        if (!bounds) {
          return { text: "Nothing selected" }
        }
        let big = 0
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            if (
              api.range.contains(state, { row, col }) &&
              values[row][col] > 10
            ) {
              big++
            }
          }
        }
        const name = `${nameOf(bounds.top, bounds.left)}:${nameOf(bounds.bottom, bounds.right)}`
        return { text: `${name}, ${big} over 10` }
      },
    }),
  }),
})

const parts = createParts(ledgerGrid, {
  grid: "div",
  row: "div",
  shortcut: "button",
  summary: "p",
})

const LedgerGrid = parts.Root

const LedgerGridGrid = parts.Grid

const LedgerGridRow = parts.Row

function LedgerGridCell({
  row,
  col,
  ...props
}: { row: number; col: number } & PartProps<"div">) {
  return usePart(
    ledgerGrid,
    "cell",
    { id: `${row}:${col}`, row, col },
    props,
    "div"
  )
}

const LedgerGridShortcut = parts.Shortcut

const LedgerGridSummary = parts.Summary

function Example() {
  return (
    <LedgerGrid>
      <div data-slot="stack">
        <div data-slot="controls">
          {Object.entries(shortcuts).map(([value, label]) => (
            <LedgerGridShortcut data-size="sm" key={value} value={value}>
              {label}
            </LedgerGridShortcut>
          ))}
        </div>
        <LedgerGridGrid aria-label="Ledger">
          {values.map((row, r) => (
            <LedgerGridRow key={r} id={String(r)}>
              {row.map((value, c) => (
                <LedgerGridCell key={c} row={r} col={c}>
                  {value}
                </LedgerGridCell>
              ))}
            </LedgerGridRow>
          ))}
        </LedgerGridGrid>
        <LedgerGridSummary data-summary>{({ text }) => text}</LedgerGridSummary>
      </div>
    </LedgerGrid>
  )
}

export {
  Example,
  ledgerGrid,
  LedgerGrid,
  LedgerGridCell,
  LedgerGridGrid,
  LedgerGridRow,
  LedgerGridShortcut,
  LedgerGridSummary,
  type LedgerState,
}
