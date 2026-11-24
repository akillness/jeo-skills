import * as React from "react"
import {
  byCell,
  byCellRange,
  cellsToText,
  createCellRange,
  createGridFocus,
  definePrimitive,
  selects,
  textToCells,
  type CellRange,
  type GridCell,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type PricesOptions = { onCopy?: (text: string) => void }

type PricesState = {
  active: GridCell | null
  range: CellRange | null
  cells: string[][]
}

const start = [
  ["Tea", "3", "12"],
  ["Coffee", "4", "9"],
  ["Cake", "5", "4"],
  ["", "", ""],
]
const rows = start.length
const cols = start[0].length

const prices = definePrimitive({
  name: "prices",
  options: { onCopy: "callback" },
  state: (_options: PricesOptions): PricesState => ({
    active: null,
    range: null,
    cells: start,
  }),
  api: (context) => {
    const { store } = context
    const grid = createGridFocus<PricesState>(context, {
      key: "active",
      rows: () => rows,
      cols: () => cols,
    })
    const range = createCellRange<PricesState>(context, {
      key: "range",
      grid,
      rows: () => rows,
      cols: () => cols,
    })
    return {
      grid,
      range,
      copy(event: ClipboardEvent) {
        const state = store.get()
        const text = range.text(state, ({ row, col }) => state.cells[row][col])
        event.preventDefault()
        event.clipboardData?.setData("text/plain", text)
        context.options().onCopy?.(text)
      },
      paste(event: ClipboardEvent) {
        const state = store.get()
        const bounds = range.bounds(state)
        if (!bounds) {
          return
        }
        event.preventDefault()
        const pasted = textToCells(
          event.clipboardData?.getData("text/plain") ?? ""
        )
        const cells = state.cells.map((row) => [...row])
        pasted.forEach((values, r) =>
          values.forEach((value, c) => {
            const row = bounds.top + r
            const col = bounds.left + c
            if (row < rows && col < cols) {
              cells[row][col] = value
            }
          })
        )
        store.set({ cells })
      },
      copyAll() {
        const text = cellsToText(store.get().cells)
        context.options().onCopy?.(text)
        navigator.clipboard?.writeText(text).catch(() => {})
      },
    }
  },
  slots: (slot) => ({
    root: slot({}),
    grid: slot({
      attrs: () => ({
        role: "grid",
        style: "user-select:none;touch-action:none",
      }),
      on: {
        copy: (event, { api }) => api.copy(event as ClipboardEvent),
        paste: (event, { api }) => api.paste(event as ClipboardEvent),
      },
    }),
    row: slot<{ id: string }>({
      props: { id: "string" },
      attrs: () => ({ role: "row" }),
    }),
    cell: slot<{ id: string; row: number; col: number }, { text: string }>({
      props: { row: "number", col: "number" },
      selects: selects({ active: byCell, range: byCellRange }),
      state: (state, { props }) => ({
        text: state.cells[props.row][props.col],
      }),
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
    copyAll: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.copyAll(),
    }),
  }),
})

const parts = createParts(prices, {
  root: "div",
  grid: "div",
  row: "div",
  copyAll: "button",
})

const Prices = parts.Root

const PricesGrid = parts.Grid

const PricesRow = parts.Row

function PricesCell({
  row,
  col,
  ...props
}: { row: number; col: number } & PartProps<"div", { text: string }>) {
  return usePart(
    prices,
    "cell",
    { id: `${row}:${col}`, row, col },
    props,
    "div"
  )
}

const PricesCopyAll = parts.CopyAll

function Example() {
  const log = useLog()
  return (
    <Prices onCopy={(text: string) => log(`Copied ${JSON.stringify(text)}`)}>
      <div data-slot="stack">
        <div data-slot="controls">
          <PricesCopyAll data-size="sm">Copy Whole Sheet</PricesCopyAll>
        </div>
        <PricesGrid aria-label="Prices">
          {start.map((cells, r) => (
            <PricesRow key={r} id={String(r)}>
              {cells.map((_, c) => (
                <PricesCell key={c} row={r} col={c}>
                  {({ text }) => text}
                </PricesCell>
              ))}
            </PricesRow>
          ))}
        </PricesGrid>
      </div>
    </Prices>
  )
}

export {
  Example,
  prices,
  Prices,
  PricesCell,
  PricesCopyAll,
  PricesGrid,
  PricesRow,
  type PricesOptions,
  type PricesState,
}
