import * as React from "react"
import {
  byCell,
  createGridFocus,
  definePrimitive,
  selects,
  type GridCell,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type SeatMapState = { active: GridCell | null }

type SeatMapOptions = { rows: number; cols: number }

const seatMap = definePrimitive({
  name: "seat-map",
  options: { rows: "number", cols: "number" },
  state: (_options: SeatMapOptions): SeatMapState => ({ active: null }),
  api: (context) => ({
    grid: createGridFocus<SeatMapState>(context, {
      key: "active",
      rows: () => context.options().rows,
      cols: () => context.options().cols,
    }),
  }),
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "grid" }) }),
    row: slot<{ id: string }>({
      props: { id: "string" },
      attrs: () => ({ role: "row" }),
    }),
    seat: slot<{ id: string; row: number; col: number }>({
      props: { row: "number", col: "number" },
      selects: selects({ active: byCell }),
      attrs: (state, { props, api }) => ({
        role: "gridcell",
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

const parts = createParts(seatMap, { root: "div", row: "div" })

const SeatMap = parts.Root

const SeatMapRow = parts.Row

function SeatMapSeat({
  row,
  col,
  ...props
}: { row: number; col: number } & PartProps<"div">) {
  return usePart(
    seatMap,
    "seat",
    { id: `${row}:${col}`, row, col },
    props,
    "div"
  )
}

const letters = "ABCD"

function Example() {
  return (
    <SeatMap rows={3} cols={6} aria-label="Seats">
      {[0, 1, 2].map((row) => (
        <SeatMapRow key={row} id={String(row)}>
          {[0, 1, 2, 3, 4, 5].map((col) => (
            <SeatMapSeat
              key={col}
              row={row}
              col={col}
              aria-label={`Seat ${letters[row]}${col + 1}`}
            >
              {letters[row]}
              {col + 1}
            </SeatMapSeat>
          ))}
        </SeatMapRow>
      ))}
    </SeatMap>
  )
}

export {
  Example,
  seatMap,
  SeatMap,
  SeatMapRow,
  SeatMapSeat,
  type SeatMapOptions,
  type SeatMapState,
}
