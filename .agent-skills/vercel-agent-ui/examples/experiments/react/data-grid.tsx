import * as React from "react"
import {
  createChange,
  createGridFocus,
  createInlineEdit,
  createSelection,
  createVirtualizer,
  css,
  definePrimitive,
  type ChangeDetails,
  type GridCell,
  type VirtualItem,
} from "@ui-sdk/core"
import {
  createParts,
  mergeProps,
  renderElement,
  usePart,
  usePrimitive,
  type PartProps,
} from "@ui-sdk/react/primitive"

type DataGridRowData = { id: string } & Record<string, unknown>

type DataGridColumn = {
  key: string
  editable?: boolean
  numeric?: boolean
}

type DataGridSort = {
  col: number
  direction: "ascending" | "descending"
} | null

type DataGridRowsChangeReason = "cell-edit" | "imperative"
type DataGridSelectedChangeReason =
  "item-press" | "list-navigation" | "imperative"

type DataGridOptions = {
  columns: DataGridColumn[]
  rows?: DataGridRowData[]
  defaultRows?: DataGridRowData[]
  onRowsChange?: (
    rows: DataGridRowData[],
    details: ChangeDetails<DataGridRowsChangeReason>
  ) => void
  selected?: string[]
  defaultSelected?: string[]
  onSelectedChange?: (
    selected: string[],
    details: ChangeDetails<DataGridSelectedChangeReason>
  ) => void
  rowHeight?: number
}

type DataGridState = {
  rows: DataGridRowData[]
  sort: DataGridSort
  selected: string[]
  active: GridCell | null
  editing: string | null
}

type DataGridRootState = {
  rows: DataGridRowData[]
  items: VirtualItem[]
  sort: DataGridSort
  selected: number
  editing: string | null
}
type DataGridColumnHeaderState = {
  sort: "ascending" | "descending" | undefined
  active: boolean
}
type DataGridRowState = { row: DataGridRowData; selected: boolean }
type DataGridCellState = { value: unknown; active: boolean; editing: boolean }

const cellId = (rowId: string, col: number) => `${rowId}:${col}`

const dataGrid = /* @__PURE__ */ definePrimitive({
  name: "data-grid",
  options: {
    columns: "value",
    rows: "value",
    defaultRows: "value",
    onRowsChange: "callback",
    selected: "list",
    defaultSelected: "list",
    onSelectedChange: "callback",
    rowHeight: "number",
  },
  state: (options: DataGridOptions): DataGridState => ({
    rows: options.rows ?? options.defaultRows ?? [],
    sort: null,
    selected: options.selected ?? options.defaultSelected ?? [],
    active: null,
    editing: null,
  }),
  sync: (options) => ({
    ...(options.rows === undefined ? {} : { rows: options.rows }),
    ...(options.selected === undefined ? {} : { selected: options.selected }),
  }),
  controlled: ["rows", "selected"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const columns = () => context.options().columns
    const rowHeight = () => context.options().rowHeight ?? 36

    let cache:
      | {
          rows: DataGridRowData[]
          sort: DataGridSort
          sorted: DataGridRowData[]
        }
      | undefined
    const sorted = () => {
      const { rows, sort } = store.get()
      if (cache?.rows === rows && cache.sort === sort) {
        return cache.sorted
      }
      let next = rows
      if (sort) {
        const { key, numeric } = columns()[sort.col]
        const sign = sort.direction === "ascending" ? 1 : -1
        next = [...rows].sort((a, b) =>
          numeric
            ? (Number(a[key]) - Number(b[key])) * sign
            : String(a[key]).localeCompare(String(b[key])) * sign
        )
      }
      cache = { rows, sort, sorted: next }
      return next
    }
    let index:
      | { rows: DataGridRowData[]; byId: Map<string, DataGridRowData> }
      | undefined
    const rowById = (id: string) => {
      const { rows } = store.get()
      if (index?.rows !== rows) {
        index = { rows, byId: new Map(rows.map((row) => [row.id, row])) }
      }
      return index.byId.get(id)
    }
    let scroller: HTMLElement | undefined

    const virtual = createVirtualizer({
      count: () => sorted().length,
      estimate: rowHeight,
      key: (index) => sorted()[index].id,
      overscan: 6,
      scrollMargin: rowHeight(),
      keep: () => {
        const active = store.get().active
        return active && active.row > 0 ? [active.row - 1] : []
      },
    })
    const selection = createSelection(context, {
      key: "selected",
      set: (value, details) => change("selected", value, details),
      order: () => sorted().map((row) => row.id),
      multiple: () => true,
    })
    const grid = createGridFocus<DataGridState>(context, {
      key: "active",
      rows: () => sorted().length + 1,
      cols: () => columns().length,
      pageSize: () =>
        Math.max(
          1,
          Math.floor((scroller?.clientHeight ?? 360) / rowHeight()) - 2
        ),
      reveal: (cell) =>
        cell.row > 0 ? virtual.scrollToIndex(cell.row - 1) : undefined,
      onMove: (cell, { from, shift, event }) => {
        virtual.refresh()
        if (
          shift &&
          cell.row > 0 &&
          from &&
          from.row > 0 &&
          cell.row !== from.row
        ) {
          selection.extend(sorted()[cell.row - 1].id, {
            reason: "list-navigation",
            event,
            from: sorted()[from.row - 1].id,
          })
        }
      },
    })
    const parse = (id: string) => {
      const at = id.lastIndexOf(":")
      return { rowId: id.slice(0, at), col: Number(id.slice(at + 1)) }
    }
    const edit = createInlineEdit<DataGridState>(context, {
      key: "editing",
      value: (id) => {
        const { rowId, col } = parse(id)
        const row = rowById(rowId)
        return row ? String(row[columns()[col].key]) : ""
      },
      commit: (id, text, details) => {
        const { rowId, col } = parse(id)
        const column = columns()[col]
        const value = column.numeric
          ? Number(text.replace(/[$,\s]/g, ""))
          : text.trim()
        if (column.numeric ? !Number.isFinite(value) : !value) {
          return false
        }
        const rows = store
          .get()
          .rows.map((row) =>
            row.id === rowId ? { ...row, [column.key]: value } : row
          )
        return change("rows", rows, {
          reason: "cell-edit",
          event: details.event,
        })
      },
      disabled: (id) => !columns()[parse(id).col].editable,
    })

    const api = {
      virtual,
      grid,
      edit,
      sorted,
      rowById,
      columns,
      rowHeight,
      rowAt: (row: number) => (row > 0 ? sorted()[row - 1]?.id : undefined),
      sortBy(col: number) {
        const { sort } = store.get()
        const next: DataGridSort =
          sort?.col !== col
            ? { col, direction: "ascending" }
            : sort.direction === "ascending"
              ? { col, direction: "descending" }
              : null
        store.set({ sort: next })
        virtual.refresh()
      },
      connect(el: HTMLElement) {
        scroller = el
        const disconnect = virtual.connect(el)
        return () => {
          disconnect()
          scroller = undefined
        }
      },
      cellKeydown(event: KeyboardEvent, cell: GridCell) {
        if (store.get().editing) {
          return
        }
        const rowId = api.rowAt(cell.row)
        if (cell.row === 0 && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          return api.sortBy(cell.col)
        }
        if (rowId && edit.keydown(event, cellId(rowId, cell.col))) {
          return
        }
        if (rowId && event.key === " ") {
          event.preventDefault()
          return selection.toggle(rowId, { reason: "item-press", event })
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "a"
        ) {
          event.preventDefault()
          return selection.toggleAll({ reason: "list-navigation", event })
        }
        grid.keydown(event)
      },
      cellPointerdown(event: PointerEvent, cell: GridCell) {
        if (event.button !== 0 || store.get().editing) {
          return
        }
        const rowId = api.rowAt(cell.row)
        if (rowId && event.shiftKey) {
          const from = store.get().active
          selection.extend(rowId, {
            reason: "item-press",
            event,
            from: api.rowAt(from?.row ?? 0) ?? null,
          })
        } else if (rowId && (event.metaKey || event.ctrlKey)) {
          selection.toggle(rowId, { reason: "item-press", event })
        }
        grid.focus(cell, { reason: "item-press", event })
      },
      inputKeydown(event: KeyboardEvent) {
        const active = store.get().active
        if (!edit.inputKeydown(event) || event.key !== "Tab" || !active) {
          return
        }
        const col = active.col + (event.shiftKey ? -1 : 1)
        if (col >= 0 && col < columns().length) {
          grid.focus(
            { row: active.row, col },
            { reason: "list-navigation", event }
          )
        }
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, Omit<DataGridRootState, "items">>({
      state: (state, { api }) => ({
        rows: api.sorted(),
        selected: state.selected.length,
        sort: state.sort,
        editing: state.editing,
      }),
      attrs: (state, { api }) => ({
        role: "grid",
        "aria-rowcount": String(state.rows.length + 1),
        "aria-colcount": String(api.columns().length),
        "aria-multiselectable": "true",
        style: css({ overflow: "auto", position: "relative" }),
      }),
      bind: (el, { api }) => api.connect(el),
    }),
    header: slot({
      attrs: (_state, { api }) => ({
        role: "row",
        "aria-rowindex": "1",
        style: css({
          position: "sticky",
          top: "0",
          "z-index": "1",
          height: `${api.rowHeight()}px`,
        }),
      }),
    }),
    columnheader: slot<
      { value: string; col: number },
      DataGridColumnHeaderState
    >({
      props: { value: "string", col: "number" },
      state: (state, { props, api }) => ({
        sort: state.sort?.col === props.col ? state.sort.direction : undefined,
        active: api.grid.isActive(state, { row: 0, col: props.col }),
      }),
      attrs: (state, { props, api }) => {
        const cell = { row: 0, col: props.col }
        return {
          role: "columnheader",
          "aria-colindex": String(props.col + 1),
          "aria-sort":
            state.sort?.col === props.col ? state.sort.direction : "none",
          tabindex: api.grid.tabIndex(state, cell),
          "data-active": api.grid.isActive(state, cell) ? "" : undefined,
        }
      },
      on: {
        keydown: (event, { api, props }) =>
          api.cellKeydown(event, { row: 0, col: props.col }),
        pointerdown: (event, { api, props }) =>
          api.cellPointerdown(event, { row: 0, col: props.col }),
        click: (_event, { api, props }) => api.sortBy(props.col),
      },
      bind: (el, { api, props }) =>
        api.grid.bind(el, { row: 0, col: props.col }),
    }),
    body: slot({
      attrs: (state, { api }) => ({
        role: "rowgroup",
        style: css({
          position: "relative",
          height: `${state.rows.length * api.rowHeight()}px`,
        }),
      }),
    }),
    row: slot<
      { value: string; index: number; start: number },
      DataGridRowState
    >({
      props: { value: "string", index: "number", start: "number" },
      state: (state, { key, props, api }) => ({
        row: api.sorted()[props.index],
        selected: state.selected.includes(key),
      }),
      attrs: (state, { key, props, api }) => ({
        role: "row",
        "aria-rowindex": String(props.index + 2),
        "aria-selected": String(state.selected.includes(key)),
        "data-selected": state.selected.includes(key) ? "" : undefined,
        style: css({
          position: "absolute",
          top: "0",
          left: "0",
          right: "0",
          height: `${api.rowHeight()}px`,
          transform: `translateY(${props.start}px)`,
        }),
      }),
    }),
    cell: slot<
      { value: string; row: number; col: number; rowId: string },
      DataGridCellState
    >({
      props: { value: "string", row: "number", col: "number", rowId: "string" },
      state: (state, { props, api }) => ({
        value: api.rowById(props.rowId)?.[api.columns()[props.col].key],
        active:
          state.active?.row === props.row && state.active.col === props.col,
        editing: state.editing === cellId(props.rowId, props.col),
      }),
      attrs: (state, { props, api }) => {
        const cell = { row: props.row, col: props.col }
        return {
          role: "gridcell",
          "aria-colindex": String(props.col + 1),
          "aria-readonly": api.columns()[props.col].editable
            ? undefined
            : "true",
          tabindex: api.grid.tabIndex(state, cell),
          "data-active": api.grid.isActive(state, cell) ? "" : undefined,
          "data-editing":
            state.editing === cellId(props.rowId, props.col) ? "" : undefined,
        }
      },
      on: {
        keydown: (event, { api, props }) => api.cellKeydown(event, props),
        pointerdown: (event, { api, props }) =>
          api.cellPointerdown(event, props),
        dblclick: (event, { api, props }) =>
          api.edit.dblclick(event, cellId(props.rowId, props.col)),
      },
      bind: (el, { api, props }) => api.grid.bind(el, props),
    }),
    editor: slot({
      attrs: () => ({ "aria-label": "Edit cell" }),
      on: {
        keydown: (event, { api }) => api.inputKeydown(event),
        focusout: (event, { api }) => api.edit.end("focus-out", event),
      },
      bind: (el, { api }) => api.edit.bindInput(el as HTMLInputElement),
    }),
  }),
})

const parts = createParts(dataGrid, {
  header: "div",
  body: "div",
  editor: "input",
})

const DataGridRowContext = React.createContext<{
  rowId: string
  index: number
} | null>(null)

function DataGrid({
  columns,
  rows,
  defaultRows,
  onRowsChange,
  selected,
  defaultSelected,
  onSelectedChange,
  rowHeight,
  className,
  style,
  children,
  render,
  ...props
}: DataGridOptions & PartProps<"div", DataGridRootState>) {
  const handle = usePrimitive(dataGrid, {
    columns,
    rows,
    defaultRows,
    onRowsChange,
    selected,
    defaultSelected,
    onSelectedChange,
    rowHeight,
  })
  const { virtual } = handle.api
  const items = React.useSyncExternalStore(
    virtual.subscribe,
    virtual.items,
    virtual.items
  )
  const own = { className, style, children }
  return usePart(
    handle,
    "root",
    {},
    {
      ...props,
      render: (merged, state) =>
        renderElement("div", mergeProps(own, merged), render, {
          ...state,
          items,
        }),
    }
  )
}

const DataGridHeader = parts.Header

function DataGridColumnHeader({
  col,
  ...props
}: { col: number } & PartProps<"div", DataGridColumnHeaderState>) {
  return usePart(dataGrid, "columnheader", { value: String(col), col }, props)
}

const DataGridBody = parts.Body

function DataGridRow({
  item,
  ...props
}: { item: VirtualItem } & PartProps<"div", DataGridRowState>) {
  const row = React.useMemo(
    () => ({ rowId: item.key, index: item.index }),
    [item.key, item.index]
  )
  return (
    <DataGridRowContext.Provider value={row}>
      {usePart(
        dataGrid,
        "row",
        { value: item.key, index: item.index, start: item.start },
        props
      )}
    </DataGridRowContext.Provider>
  )
}

function DataGridCell({
  col,
  ...props
}: { col: number } & PartProps<"div", DataGridCellState>) {
  const row = React.useContext(DataGridRowContext)
  if (!row) {
    throw new Error("DataGridCell must be used inside <DataGridRow>.")
  }
  const part = {
    value: cellId(row.rowId, col),
    row: row.index + 1,
    col,
    rowId: row.rowId,
  }
  return usePart(dataGrid, "cell", part, props)
}

const DataGridEditor = parts.Editor

type Person = {
  id: string
  name: string
  email: string
  role: string
  status: string
  spend: number
}

const columns: (DataGridColumn & { label: string; width: string })[] = [
  { key: "name", label: "Name", editable: true, width: "minmax(10rem,1.4fr)" },
  { key: "email", label: "Email", editable: true, width: "minmax(12rem,2fr)" },
  { key: "role", label: "Role", width: "minmax(6rem,0.8fr)" },
  { key: "status", label: "Status", width: "minmax(6rem,0.8fr)" },
  {
    key: "spend",
    label: "Spend",
    editable: true,
    numeric: true,
    width: "minmax(6rem,0.8fr)",
  },
]

const template = columns.map((column) => column.width).join(" ")
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})
const tones: Record<string, string> = { Active: "#10b981", Invited: "#f59e0b" }

const PersonRow = React.memo(function PersonRow({
  item,
}: {
  item: VirtualItem
}) {
  return (
    <DataGridRow item={item}>
      {columns.map((column, col) => (
        <DataGridCell
          key={column.key}
          col={col}
          data-numeric={column.numeric ? "" : undefined}
        >
          {({ value, editing }) =>
            editing ? (
              <DataGridEditor />
            ) : column.key === "status" ? (
              <span data-slot="row">
                <span
                  data-slot="swatch"
                  aria-hidden="true"
                  style={{
                    background: tones[value as string] ?? "var(--muted)",
                  }}
                />
                {value as string}
              </span>
            ) : (
              <span>
                {column.numeric ? money.format(value as number) : String(value)}
              </span>
            )
          }
        </DataGridCell>
      ))}
    </DataGridRow>
  )
})

function people(count: number): Person[] {
  const first = [
    "Ada",
    "Grace",
    "Linus",
    "Margaret",
    "Alan",
    "Barbara",
    "Ken",
    "Radia",
    "Tim",
    "Frances",
    "Dennis",
    "Hedy",
    "Edsger",
    "Katherine",
    "Guido",
    "Joan",
  ]
  const last = [
    "Lovelace",
    "Hopper",
    "Torvalds",
    "Hamilton",
    "Turing",
    "Liskov",
    "Thompson",
    "Perlman",
    "Berners-Lee",
    "Allen",
    "Ritchie",
    "Lamarr",
    "Dijkstra",
    "Johnson",
    "van Rossum",
    "Clarke",
  ]
  const roles = ["Admin", "Editor", "Viewer", "Billing"]
  const statuses = ["Active", "Active", "Active", "Invited", "Suspended"]
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  return Array.from({ length: count }, (_, i) => {
    const name = `${first[Math.floor(random() * first.length)]} ${last[Math.floor(random() * last.length)]}`
    return {
      id: `p${i + 1}`,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}${i + 1}@example.com`,
      role: roles[Math.floor(random() * roles.length)],
      status: statuses[Math.floor(random() * statuses.length)],
      spend: Math.round(random() * 12000),
    }
  })
}

function Example() {
  const [rows] = React.useState(() => people(10000))
  const [selected, setSelected] = React.useState<string[]>([])
  return (
    <div data-slot="stack">
      <DataGrid
        columns={columns}
        defaultRows={rows}
        selected={selected}
        onSelectedChange={setSelected}
        aria-label="People"
        style={{ "--data-grid-columns": template } as React.CSSProperties}
      >
        {({ items, sort }) => (
          <div data-slot="data-grid-content">
            <DataGridHeader>
              {columns.map((column, col) => (
                <DataGridColumnHeader
                  key={column.key}
                  col={col}
                  data-numeric={column.numeric ? "" : undefined}
                >
                  {column.label}
                  <span data-slot="data-grid-sort" aria-hidden="true">
                    {sort?.col === col
                      ? sort.direction === "ascending"
                        ? "↑"
                        : "↓"
                      : ""}
                  </span>
                </DataGridColumnHeader>
              ))}
            </DataGridHeader>
            <DataGridBody>
              {items.map((item) => (
                <PersonRow key={item.key} item={item} />
              ))}
            </DataGridBody>
          </div>
        )}
      </DataGrid>
      <p data-slot="output">
        {rows.length.toLocaleString()} people.{" "}
        {selected.length
          ? `${selected.length.toLocaleString()} selected.`
          : "Space selects a row."}{" "}
        Enter, F2 or typing edits Name, Email and Spend.
      </p>
    </div>
  )
}

export {
  dataGrid,
  DataGrid,
  DataGridBody,
  type DataGridCellState,
  DataGridCell,
  type DataGridColumn,
  DataGridColumnHeader,
  type DataGridColumnHeaderState,
  DataGridEditor,
  DataGridHeader,
  type DataGridOptions,
  DataGridRow,
  type DataGridRowData,
  type DataGridRootState,
  type DataGridRowsChangeReason,
  type DataGridRowState,
  type DataGridSelectedChangeReason,
  type DataGridSort,
  Example,
}
