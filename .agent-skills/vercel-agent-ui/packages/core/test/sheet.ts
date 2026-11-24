import { definePrimitive } from "../src/foundation/kernel/primitive"
import { selects } from "../src/foundation/kernel/selects"
import {
  byCell,
  createGridFocus,
  type GridCell,
} from "../src/foundation/focus/grid-focus"
import {
  byCellRange,
  createCellRange,
  type CellRange,
} from "../src/foundation/selection/cell-range"

// A spreadsheet's grid, whose cells read the active cell and the range by name.
type SheetState = { active: GridCell | null; range: CellRange | null }

const byRow = {
  values: ({ props }: { props: { row: number } }) => [`row ${props.row}`],
  moved(
    previous: GridCell | null,
    next: GridCell | null,
    notify: (name: string) => void
  ) {
    notify(`row ${previous?.row}`)
    notify(`row ${next?.row}`)
  },
}

const sheet = definePrimitive({
  name: "sheet",
  options: { rows: "number", cols: "number", disabled: "value" },
  state: (_options: {
    rows: number
    cols: number
    disabled?: (cell: GridCell) => boolean
  }): SheetState => ({
    active: null,
    range: null,
  }),
  api: (context) => {
    const rows = () => context.options().rows
    const cols = () => context.options().cols
    const disabled = (cell: GridCell) =>
      context.options().disabled?.(cell) ?? false
    const grid = createGridFocus(context, {
      key: "active",
      rows,
      cols,
      disabled,
    })
    const range = createCellRange(context, { key: "range", grid, rows, cols })
    return { grid, range, store: context.store }
  },
  slots: (slot) => ({
    cell: slot<{ row: number; col: number }>({
      props: { row: "number", col: "number" },
      selects: selects({ active: byCell, range: byCellRange }),
      attrs: (state, { props, api }) => ({
        tabindex: api.grid.tabIndex(state, props),
        "data-active": api.grid.isActive(state, props) ? "" : undefined,
        ...api.range.cellAttrs(state, props),
      }),
    }),
    // Reads the active cell by another reader, which shares the cells' key.
    rowHeader: slot<{ row: number }>({
      props: { row: "number" },
      selects: selects({ active: byRow, range: [] }),
      attrs: (state, { props }) => ({
        "data-active": state.active?.row === props.row ? "" : undefined,
      }),
    }),
  }),
})

export { sheet }
