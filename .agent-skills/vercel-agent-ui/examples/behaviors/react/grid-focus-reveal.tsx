import * as React from "react"
import {
  byCell,
  createGridFocus,
  definePrimitive,
  selects,
  type GridCell,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type TimetableState = { active: GridCell | null; first: number }

const count = 100
const shown = 6

const timetable = definePrimitive({
  name: "timetable",
  state: (): TimetableState => ({ active: null, first: 0 }),
  api: (context) => ({
    grid: createGridFocus<TimetableState>(context, {
      key: "active",
      rows: () => count,
      cols: () => 3,
      pageSize: () => shown,
      reveal: ({ row }) => {
        const { first } = context.store.get()
        if (row < first) {
          context.store.set({ first: row })
        } else if (row >= first + shown) {
          context.store.set({ first: row - shown + 1 })
        }
      },
    }),
  }),
  slots: (slot) => ({
    root: slot<{}, { first: number }>({
      state: (state) => ({ first: state.first }),
    }),
    body: slot({
      attrs: () => ({ role: "grid", "aria-rowcount": String(count) }),
    }),
    row: slot<{ id: string; index: number }>({
      props: { index: "number" },
      attrs: (_state, { props }) => ({
        role: "row",
        "aria-rowindex": String(props.index + 1),
      }),
    }),
    cell: slot<{ id: string; row: number; col: number }>({
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

const parts = createParts(timetable, { root: "div", body: "div" })

const Timetable = parts.Root

const TimetableBody = parts.Body

function TimetableRow({
  index,
  ...props
}: { index: number } & PartProps<"div">) {
  return usePart(timetable, "row", { id: String(index), index }, props, "div")
}

function TimetableCell({
  row,
  col,
  ...props
}: { row: number; col: number } & PartProps<"div">) {
  return usePart(
    timetable,
    "cell",
    { id: `${row}:${col}`, row, col },
    props,
    "div"
  )
}

const places = ["Leeds", "York", "Bath", "Hull", "Ely"]
const time = (row: number) => {
  const minutes = 6 * 60 + row * 7
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}
const cellText = (row: number, col: number) =>
  col === 0
    ? time(row)
    : col === 1
      ? places[row % places.length]
      : `Platform ${(row % 4) + 1}`

function Example() {
  return (
    <Timetable>
      {({ first }) => (
        <TimetableBody aria-label="Departures">
          {Array.from({ length: shown }, (_, offset) => first + offset).map(
            (row) => (
              <TimetableRow key={row} index={row}>
                {[0, 1, 2].map((col) => (
                  <TimetableCell key={col} row={row} col={col}>
                    {cellText(row, col)}
                  </TimetableCell>
                ))}
              </TimetableRow>
            )
          )}
        </TimetableBody>
      )}
    </Timetable>
  )
}

export {
  Example,
  timetable,
  Timetable,
  TimetableBody,
  TimetableCell,
  TimetableRow,
  type TimetableState,
}
