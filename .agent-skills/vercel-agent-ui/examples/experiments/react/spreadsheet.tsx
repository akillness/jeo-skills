import * as React from "react"
import {
  createCellRange,
  createChange,
  createGridFocus,
  createInlineEdit,
  css,
  definePrimitive,
  textToCells,
  type CellBounds,
  type CellRange,
  type ChangeDetails,
  type GridCell,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type SpreadsheetCells = Record<string, string>

type SpreadsheetCellsChangeReason =
  "cell-edit" | "clear" | "paste" | "cut" | "imperative"

type SpreadsheetOptions = {
  rows: number
  cols: number
  cells?: SpreadsheetCells
  defaultCells?: SpreadsheetCells
  onCellsChange?: (
    cells: SpreadsheetCells,
    details: ChangeDetails<SpreadsheetCellsChangeReason>
  ) => void
}

type SpreadsheetState = {
  cells: SpreadsheetCells
  active: GridCell | null
  range: CellRange | null
  editing: string | null
}

type SpreadsheetGridState = { editing: boolean }
type SpreadsheetNameBoxState = { selection: string }
type SpreadsheetFormulaBarState = { formula: string }
type SpreadsheetSummaryState = {
  range: boolean
  sum: number
  average: number
  count: number
}
type SpreadsheetHeaderState = { selected: boolean }
type SpreadsheetCellState = {
  value: string
  raw: string
  numeric: boolean
  active: boolean
  selected: boolean
  editing: boolean
}

const columnName = (col: number) => String.fromCharCode(65 + col)
const cellName = ({ row, col }: GridCell) => `${columnName(col)}${row + 1}`
const parseName = (name: string): GridCell => ({
  row: Number(name.slice(1)) - 1,
  col: name.charCodeAt(0) - 65,
})
const rangeName = ({ top, left, bottom, right }: CellBounds) => {
  const start = cellName({ row: top, col: left })
  return top === bottom && left === right
    ? start
    : `${start}:${cellName({ row: bottom, col: right })}`
}
const covers = (
  bounds: CellBounds | null,
  axis: "row" | "col",
  index: number
) =>
  !!bounds &&
  (axis === "row"
    ? index >= bounds.top && index <= bounds.bottom
    : index >= bounds.left && index <= bounds.right)
const format = (value: number | string) =>
  typeof value === "number"
    ? Number.isFinite(value)
      ? String(Number(value.toFixed(2)))
      : "#DIV/0!"
    : value

const functions: Record<string, (values: number[]) => number> = {
  SUM: (values) => values.reduce((a, b) => a + b, 0),
  AVERAGE: (values) => values.reduce((a, b) => a + b, 0) / values.length,
  MIN: (values) => Math.min(...values),
  MAX: (values) => Math.max(...values),
  COUNT: (values) => values.length,
}

function evaluate(
  formula: string,
  read: (name: string) => number | string,
  size: { rows: number; cols: number }
) {
  const tokens =
    formula
      .toUpperCase()
      .match(/\d+(\.\d+)?|[A-Z]+\d+(:[A-Z]+\d+)?|[A-Z]+|[-+*/(),]/g) ?? []
  let at = 0
  const next = () => tokens[at++]
  const expect = (token: string) => {
    if (next() !== token) {
      throw new Error("syntax")
    }
  }
  const number = (value: number | string) => {
    if (typeof value === "string" && value !== "") {
      throw new Error("value")
    }
    return Number(value || 0)
  }
  const numbers = (token: string) => {
    if (!token.includes(":")) {
      return [number(read(token))]
    }
    const [from, to] = token.split(":").map(parseName)
    const values: number[] = []
    const bottom = Math.min(size.rows - 1, Math.max(from.row, to.row))
    const right = Math.min(size.cols - 1, Math.max(from.col, to.col))
    for (let row = Math.min(from.row, to.row); row <= bottom; row++) {
      for (let col = Math.min(from.col, to.col); col <= right; col++) {
        const value = read(cellName({ row, col }))
        if (typeof value === "number") {
          values.push(value)
        }
      }
    }
    return values
  }
  function sum(): number {
    let value = product()
    while (tokens[at] === "+" || tokens[at] === "-") {
      value = next() === "+" ? value + product() : value - product()
    }
    return value
  }
  function product(): number {
    let value = unary()
    while (tokens[at] === "*" || tokens[at] === "/") {
      value = next() === "*" ? value * unary() : value / unary()
    }
    return value
  }
  function unary(): number {
    if (tokens[at] === "-") {
      next()
      return -unary()
    }
    const token = next()
    if (token === undefined) {
      throw new Error("syntax")
    }
    if (token === "(") {
      const value = sum()
      expect(")")
      return value
    }
    if (/^\d/.test(token)) {
      return Number(token)
    }
    if (functions[token]) {
      expect("(")
      const values: number[] = []
      do {
        const arg = tokens[at]
        if (
          /^[A-Z]+\d+/.test(arg ?? "") &&
          (tokens[at + 1] === "," || tokens[at + 1] === ")")
        ) {
          next()
          values.push(...numbers(arg))
        } else {
          values.push(sum())
        }
      } while (tokens[at] === "," && next())
      expect(")")
      return functions[token](values)
    }
    if (/^[A-Z]\d+$/.test(token)) {
      return number(read(token))
    }
    throw new Error("syntax")
  }
  const value = sum()
  if (at !== tokens.length) {
    throw new Error("syntax")
  }
  return value
}

const spreadsheet = /* @__PURE__ */ definePrimitive({
  name: "spreadsheet",
  options: {
    rows: "number",
    cols: "number",
    cells: "value",
    defaultCells: "value",
    onCellsChange: "callback",
  },
  state: (options: SpreadsheetOptions): SpreadsheetState => ({
    cells: options.cells ?? options.defaultCells ?? {},
    active: null,
    range: null,
    editing: null,
  }),
  sync: (options) =>
    options.cells === undefined ? {} : { cells: options.cells },
  controlled: ["cells"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const rows = () => context.options().rows
    const cols = () => Math.min(26, context.options().cols)

    let cache:
      | {
          cells: SpreadsheetCells
          rows: number
          cols: number
          values: Map<string, number | string>
        }
      | undefined
    const valueOf = (name: string): number | string => {
      const { cells } = store.get()
      if (
        cache?.cells !== cells ||
        cache.rows !== rows() ||
        cache.cols !== cols()
      ) {
        cache = { cells, rows: rows(), cols: cols(), values: new Map() }
      }
      const values = cache.values
      if (values.has(name)) {
        return values.get(name)!
      }
      const raw = cells[name] ?? ""
      let value: number | string = raw
      if (raw.startsWith("=")) {
        values.set(name, "#CYCLE!")
        try {
          value = evaluate(
            raw.slice(1),
            (ref) => {
              const result = valueOf(ref)
              if (typeof result === "string" && result.startsWith("#")) {
                throw new Error(result)
              }
              return result
            },
            { rows: rows(), cols: cols() }
          )
        } catch (error) {
          const message = (error as Error).message
          value = message.startsWith("#")
            ? message
            : message === "value"
              ? "#VALUE!"
              : "#ERROR!"
        }
      } else if (raw.trim() !== "" && Number.isFinite(Number(raw))) {
        value = Number(raw)
      }
      values.set(name, value)
      return value
    }
    const write = (
      entries: [string, string][],
      details: { reason: SpreadsheetCellsChangeReason; event?: Event }
    ) => {
      const cells = { ...store.get().cells }
      for (const [name, raw] of entries) {
        if (raw === "") {
          delete cells[name]
        } else {
          cells[name] = raw
        }
      }
      return change("cells", cells, details)
    }

    const grid = createGridFocus<SpreadsheetState>(context, {
      key: "active",
      rows,
      cols,
      pageSize: () => 10,
    })
    const range = createCellRange<SpreadsheetState>(context, {
      key: "range",
      grid,
      rows,
      cols,
    })
    const edit = createInlineEdit<SpreadsheetState>(context, {
      key: "editing",
      value: (name) => store.get().cells[name] ?? "",
      commit: (name, text, details) =>
        write([[name, text.trim()]], {
          reason: "cell-edit",
          event: details.event,
        }),
    })
    const selectedNames = () => {
      const bounds = range.bounds(store.get())
      const names: string[] = []
      if (bounds) {
        for (let row = bounds.top; row <= bounds.bottom; row++) {
          for (let col = bounds.left; col <= bounds.right; col++) {
            names.push(cellName({ row, col }))
          }
        }
      }
      return names
    }
    const copy = (event: ClipboardEvent) => {
      const text = range.text(store.get(), (cell) =>
        format(valueOf(cellName(cell)))
      )
      event.clipboardData?.setData("text/plain", text)
      event.preventDefault()
    }

    const api = {
      grid,
      range,
      edit,
      rows,
      cols,
      valueOf,
      headerPointerdown(
        event: PointerEvent,
        axis: "row" | "col",
        index: number
      ) {
        if (event.button !== 0) {
          return
        }
        event.preventDefault()
        const active = grid.active()
        const from = event.shiftKey && active ? active[axis] : index
        if (!event.shiftKey || !active) {
          grid.focus(
            axis === "row" ? { row: index, col: 0 } : { row: 0, col: index }
          )
        }
        if (axis === "row") {
          range.selectRows(from, index, { reason: "item-press", event })
        } else {
          range.selectColumns(from, index, { reason: "item-press", event })
        }
      },
      cellKeydown(event: KeyboardEvent, cell: GridCell) {
        if (store.get().editing) {
          return
        }
        if (
          (event.key === "Delete" || event.key === "Backspace") &&
          !event.metaKey &&
          !event.ctrlKey
        ) {
          event.preventDefault()
          return write(
            selectedNames().map((name) => [name, ""]),
            { reason: "clear", event }
          )
        }
        if (edit.keydown(event, cellName(cell))) {
          return
        }
        range.keydown(event)
      },
      cellPointerdown(event: PointerEvent, cell: GridCell, name: string) {
        if (store.get().editing !== name) {
          range.pointerdown(event, cell)
        }
      },
      editorKeydown(event: KeyboardEvent) {
        const active = grid.active()
        const key = event.key
        if (
          !edit.inputKeydown(event) ||
          !active ||
          (key !== "Enter" && key !== "Tab")
        ) {
          return
        }
        const step = event.shiftKey ? -1 : 1
        const next =
          key === "Enter"
            ? { row: active.row + step, col: active.col }
            : { row: active.row, col: active.col + step }
        grid.focus(next, { reason: "list-navigation", event })
        range.select(null, { reason: "list-navigation", event })
      },
      copy(event: ClipboardEvent) {
        if (!store.get().editing) {
          copy(event)
        }
      },
      cut(event: ClipboardEvent) {
        if (store.get().editing) {
          return
        }
        copy(event)
        write(
          selectedNames().map((name) => [name, ""]),
          { reason: "cut", event }
        )
      },
      paste(event: ClipboardEvent) {
        const text = event.clipboardData?.getData("text/plain")
        const bounds = range.bounds(store.get())
        if (store.get().editing || !text || !bounds) {
          return
        }
        event.preventDefault()
        const pasted = textToCells(text)
        const entries: [string, string][] = []
        pasted.forEach((cells, r) =>
          cells.forEach((raw, c) => {
            const cell = { row: bounds.top + r, col: bounds.left + c }
            if (cell.row < rows() && cell.col < cols()) {
              entries.push([cellName(cell), raw.trim()])
            }
          })
        )
        write(entries, { reason: "paste", event })
        const last = {
          row: Math.min(rows() - 1, bounds.top + pasted.length - 1),
          col: Math.min(
            cols() - 1,
            bounds.left + Math.max(...pasted.map((row) => row.length)) - 1
          ),
        }
        range.select(
          { anchor: { row: bounds.top, col: bounds.left }, end: last },
          { reason: "imperative" }
        )
      },
      summary(state: SpreadsheetState) {
        if (!state.range) {
          return { range: false, sum: 0, average: 0, count: 0 }
        }
        const numbers = selectedNames()
          .map(valueOf)
          .filter((value): value is number => typeof value === "number")
        const sum = numbers.reduce((a, b) => a + b, 0)
        return {
          range: true,
          sum,
          average: numbers.length ? sum / numbers.length : 0,
          count: numbers.length,
        }
      },
    }
    return api
  },
  slots: (slot) => ({
    grid: slot<{}, SpreadsheetGridState>({
      state: (state) => ({ editing: !!state.editing }),
      attrs: (_state, { api }) => ({
        role: "grid",
        "aria-rowcount": String(api.rows() + 1),
        "aria-colcount": String(api.cols() + 1),
        "aria-multiselectable": "true",
        style: css({
          display: "grid",
          "grid-template-columns": `auto repeat(${api.cols()}, minmax(0, 1fr))`,
        }),
      }),
      on: {
        copy: (event, { api }) => api.copy(event),
        cut: (event, { api }) => api.cut(event),
        paste: (event, { api }) => api.paste(event),
      },
    }),
    name: slot<{}, SpreadsheetNameBoxState>({
      state: (state, { api }) => {
        const bounds = api.range.bounds(state)
        return { selection: bounds ? rangeName(bounds) : "A1" }
      },
      attrs: () => ({ "aria-label": "Selection" }),
    }),
    formula: slot<{}, SpreadsheetFormulaBarState>({
      state: (state) => ({
        formula: state.active
          ? (state.cells[cellName(state.active)] ?? "")
          : "",
      }),
      attrs: () => ({ "aria-label": "Formula" }),
    }),
    summary: slot<{}, SpreadsheetSummaryState>({
      state: (state, { api }) => api.summary(state),
      attrs: () => ({ role: "status" }),
    }),
    row: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, { key }) => ({
        role: "row",
        "aria-rowindex": String(Number(key) + 2),
        style: css({ display: "contents" }),
      }),
    }),
    corner: slot({
      attrs: () => ({ role: "columnheader", "aria-label": "Select all" }),
      on: {
        pointerdown: (event, { api }) => {
          event.preventDefault()
          api.range.selectAll({ reason: "item-press", event })
        },
      },
    }),
    columnheader: slot<{ value: string }, SpreadsheetHeaderState>({
      props: { value: "string" },
      state: (state, { key, api }) => ({
        selected:
          !!state.range && covers(api.range.bounds(state), "col", Number(key)),
      }),
      attrs: (state, { key, api }) => ({
        role: "columnheader",
        "aria-colindex": String(Number(key) + 2),
        "data-selected":
          state.range && covers(api.range.bounds(state), "col", Number(key))
            ? ""
            : undefined,
      }),
      on: {
        pointerdown: (event, { api, key }) =>
          api.headerPointerdown(event, "col", Number(key)),
      },
    }),
    rowheader: slot<{ value: string }, SpreadsheetHeaderState>({
      props: { value: "string" },
      state: (state, { key, api }) => ({
        selected:
          !!state.range && covers(api.range.bounds(state), "row", Number(key)),
      }),
      attrs: (state, { key, api }) => ({
        role: "rowheader",
        "aria-colindex": "1",
        "data-selected":
          state.range && covers(api.range.bounds(state), "row", Number(key))
            ? ""
            : undefined,
      }),
      on: {
        pointerdown: (event, { api, key }) =>
          api.headerPointerdown(event, "row", Number(key)),
      },
    }),
    cell: slot<{ id: string; row: number; col: number }, SpreadsheetCellState>({
      props: { row: "number", col: "number" },
      state: (state, { key, props, api }) => {
        const value = api.valueOf(key)
        return {
          value: format(value),
          raw: state.cells[key] ?? "",
          numeric: typeof value === "number",
          active: api.grid.isActive(state, props),
          selected: api.range.contains(state, props),
          editing: state.editing === key,
        }
      },
      attrs: (state, { key, props, api }) => ({
        role: "gridcell",
        "aria-colindex": String(props.col + 2),
        "aria-label": `${key}${state.cells[key] ? `, ${format(api.valueOf(key))}` : ""}`,
        tabindex: api.grid.tabIndex(state, props),
        "data-active": api.grid.isActive(state, props) ? "" : undefined,
        "data-editing": state.editing === key ? "" : undefined,
        "data-numeric": typeof api.valueOf(key) === "number" ? "" : undefined,
        ...api.range.cellAttrs(state, props),
      }),
      on: {
        keydown: (event, { api, props }) => api.cellKeydown(event, props),
        pointerdown: (event, { api, props, key }) =>
          api.cellPointerdown(event, props, key),
        dblclick: (event, { api, key }) => api.edit.dblclick(event, key),
      },
      bind: (el, { api, props }) => api.range.bind(el, props),
    }),
    editor: slot({
      attrs: () => ({
        "aria-label": "Edit cell",
        autocomplete: "off",
        spellcheck: "false",
      }),
      on: {
        keydown: (event, { api }) => api.editorKeydown(event),
        focusout: (event, { api }) => api.edit.end("focus-out", event),
      },
      bind: (el, { api }) => api.edit.bindInput(el as HTMLInputElement),
    }),
  }),
})

const parts = createParts(spreadsheet, {
  grid: "div",
  name: "output",
  formula: "output",
  summary: "div",
  corner: "div",
  editor: "input",
})

const Spreadsheet = parts.Root

const SpreadsheetGrid = parts.Grid

const SpreadsheetNameBox = parts.Name

const SpreadsheetFormulaBar = parts.Formula

const SpreadsheetSummary = parts.Summary

function SpreadsheetRow({
  value,
  ...props
}: { value: number } & PartProps<"div">) {
  return usePart(spreadsheet, "row", { value: String(value) }, props)
}

const SpreadsheetCorner = parts.Corner

function SpreadsheetColumnHeader({
  value,
  ...props
}: { value: number } & PartProps<"div", SpreadsheetHeaderState>) {
  return usePart(spreadsheet, "columnheader", { value: String(value) }, props)
}

function SpreadsheetRowHeader({
  value,
  ...props
}: { value: number } & PartProps<"div", SpreadsheetHeaderState>) {
  return usePart(spreadsheet, "rowheader", { value: String(value) }, props)
}

function SpreadsheetCell({
  row,
  col,
  ...props
}: { row: number; col: number } & PartProps<"div", SpreadsheetCellState>) {
  return usePart(
    spreadsheet,
    "cell",
    { id: cellName({ row, col }), row, col },
    props
  )
}

const SpreadsheetEditor = parts.Editor

const budget: SpreadsheetCells = {
  A1: "Item",
  B1: "Jan",
  C1: "Feb",
  D1: "Mar",
  E1: "Total",
  A2: "Rent",
  B2: "1200",
  C2: "1200",
  D2: "1200",
  E2: "=SUM(B2:D2)",
  A3: "Food",
  B3: "420",
  C3: "385",
  D3: "460",
  E3: "=SUM(B3:D3)",
  A4: "Travel",
  B4: "90",
  C4: "240",
  D4: "65",
  E4: "=SUM(B4:D4)",
  A5: "Total",
  B5: "=SUM(B2:B4)",
  C5: "=SUM(C2:C4)",
  D5: "=SUM(D2:D4)",
  E5: "=SUM(E2:E4)",
  A6: "Average",
  E6: "=AVERAGE(B5:D5)",
}

const ROWS = 12
const COLS = 6

function Example() {
  return (
    <Spreadsheet rows={ROWS} cols={COLS} defaultCells={budget}>
      <div data-slot="spreadsheet-frame">
        <div data-slot="row">
          <SpreadsheetNameBox>
            {({ selection }) => selection}
          </SpreadsheetNameBox>
          <SpreadsheetFormulaBar>
            {({ formula }) => formula}
          </SpreadsheetFormulaBar>
        </div>
        <SpreadsheetGrid aria-label="Budget">
          <SpreadsheetRow value={-1}>
            <SpreadsheetCorner />
            {Array.from({ length: COLS }, (_, col) => (
              <SpreadsheetColumnHeader key={col} value={col}>
                {columnName(col)}
              </SpreadsheetColumnHeader>
            ))}
          </SpreadsheetRow>
          {Array.from({ length: ROWS }, (_, row) => (
            <SpreadsheetRow key={row} value={row}>
              <SpreadsheetRowHeader value={row}>{row + 1}</SpreadsheetRowHeader>
              {Array.from({ length: COLS }, (_, col) => (
                <SpreadsheetCell key={col} row={row} col={col}>
                  {({ value, editing }) =>
                    editing ? <SpreadsheetEditor /> : value
                  }
                </SpreadsheetCell>
              ))}
            </SpreadsheetRow>
          ))}
        </SpreadsheetGrid>
        <SpreadsheetSummary>
          {({ range, sum, average, count }) =>
            range
              ? `Sum ${format(sum)} · Average ${format(average)} · Count ${count}`
              : "Drag, or Shift with the arrows, to select a range. Type to edit, and copy and paste with other spreadsheets."
          }
        </SpreadsheetSummary>
      </div>
    </Spreadsheet>
  )
}

export {
  Example,
  Spreadsheet,
  SpreadsheetCell,
  type SpreadsheetCellState,
  type SpreadsheetCells,
  type SpreadsheetCellsChangeReason,
  SpreadsheetColumnHeader,
  SpreadsheetCorner,
  SpreadsheetEditor,
  SpreadsheetFormulaBar,
  type SpreadsheetFormulaBarState,
  SpreadsheetGrid,
  type SpreadsheetGridState,
  type SpreadsheetHeaderState,
  SpreadsheetNameBox,
  type SpreadsheetNameBoxState,
  type SpreadsheetOptions,
  SpreadsheetRow,
  SpreadsheetRowHeader,
  SpreadsheetSummary,
  type SpreadsheetSummaryState,
  spreadsheet,
}
