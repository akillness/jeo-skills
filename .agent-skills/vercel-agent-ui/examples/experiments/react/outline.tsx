import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createTreeReorder,
  css,
  definePrimitive,
  selects,
  type ChangeDetails,
  type TreeReorderDraft,
  type TreeReorderReason,
  type TreeReorderRow,
} from "@ui-sdk/core"
import { createFlip } from "../flip"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type OutlineExpandedChangeReason = "toggle-press" | "list-navigation" | "drop"

type OutlineOptions = {
  rows?: TreeReorderRow[]
  defaultRows?: TreeReorderRow[]
  onRowsChange?: (
    rows: TreeReorderRow[],
    details: ChangeDetails<TreeReorderReason>
  ) => void
  expanded?: string[]
  defaultExpanded?: string[]
  onExpandedChange?: (
    expanded: string[],
    details: ChangeDetails<OutlineExpandedChangeReason>
  ) => void
}

type OutlineState = {
  rows: TreeReorderRow[]
  expanded: string[]
  focused: string | null
  moving: TreeReorderDraft | null
}

type OutlineRootState = {
  rows: TreeReorderRow[]
  moving: boolean
}
type OutlineItemState = {
  depth: number
  parent: boolean
  expanded: boolean
  moving: boolean
  dragging: boolean
}
type OutlineToggleState = { expanded: boolean; parent: boolean }

const hasChildren = (rows: readonly TreeReorderRow[], index: number) =>
  index >= 0 && (rows[index + 1]?.depth ?? -1) > rows[index].depth

const placesCache = new WeakMap<
  readonly TreeReorderRow[],
  Map<string, { depth: number; parent: boolean }>
>()
function rowPlace(rows: readonly TreeReorderRow[], key: string) {
  let places = placesCache.get(rows)
  if (!places) {
    places = new Map(
      rows.map((row, index) => [
        row.key,
        { depth: row.depth, parent: hasChildren(rows, index) },
      ])
    )
    placesCache.set(rows, places)
  }
  return places.get(key) ?? { depth: 0, parent: false }
}

function visibleRows(
  rows: readonly TreeReorderRow[],
  expanded: readonly string[],
  moving: string | null
) {
  const shown: TreeReorderRow[] = []
  let closed = Infinity
  rows.forEach((row, index) => {
    if (row.depth <= closed) {
      closed = Infinity
    }
    if (row.depth > closed && row.key !== moving) {
      return
    }
    shown.push(row)
    if (
      closed === Infinity &&
      hasChildren(rows, index) &&
      !expanded.includes(row.key)
    ) {
      closed = row.depth
    }
  })
  return shown
}

const outline = /* @__PURE__ */ definePrimitive({
  name: "outline",
  options: {
    rows: "value",
    defaultRows: "value",
    onRowsChange: "callback",
    expanded: "list",
    defaultExpanded: "list",
    onExpandedChange: "callback",
  },
  state: (options: OutlineOptions): OutlineState => ({
    rows: options.rows ?? options.defaultRows ?? [],
    expanded: options.expanded ?? options.defaultExpanded ?? [],
    focused: null,
    moving: null,
  }),
  sync: (options) => ({
    ...(options.rows === undefined ? {} : { rows: options.rows }),
    ...(options.expanded === undefined ? {} : { expanded: options.expanded }),
  }),
  controlled: ["rows", "expanded"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const roving = createRovingFocus<OutlineState, { value: string }>(context, {
      slot: "item",
      key: "focused",
    })
    const setOpen = (
      key: string,
      open: boolean,
      details: { reason: OutlineExpandedChangeReason; event?: Event }
    ) => {
      const { expanded } = store.get()
      if (expanded.includes(key) === open) {
        return false
      }
      return change(
        "expanded",
        open ? [...expanded, key] : expanded.filter((k) => k !== key),
        details
      )
    }
    const tree = createTreeReorder<OutlineState>(context, {
      key: "rows",
      draft: "moving",
      set: (value, details) => {
        if (!change("rows", value, details)) {
          return false
        }
        if (details.parent) {
          setOpen(details.parent, true, {
            reason: "drop",
            event: details.event,
          })
        }
        return true
      },
      indent: () => 20,
      preview: true,
    })
    const flip = createFlip<OutlineState>(context, {
      watch: (state) => tree.rows(state),
    })
    const rowAt = (key: string) => {
      const rows = store.get().rows
      const index = rows.findIndex((row) => row.key === key)
      return { rows, index, row: rows[index] }
    }

    const api = {
      roving,
      tree,
      flip,
      toggle(key: string, event?: Event) {
        setOpen(key, !store.get().expanded.includes(key), {
          reason: "toggle-press",
          event,
        })
      },
      itemKeydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (tree.keydown(event, key)) {
          return
        }
        const { rows, index, row } = rowAt(key)
        const open = store.get().expanded.includes(key)
        const parent = hasChildren(rows, index)
        if (event.key === "ArrowRight" && parent) {
          event.preventDefault()
          if (!open) {
            setOpen(key, true, { reason: "list-navigation", event })
          } else {
            roving.focus(rows[index + 1].key)
          }
        } else if (event.key === "ArrowLeft") {
          event.preventDefault()
          if (parent && open) {
            setOpen(key, false, { reason: "list-navigation", event })
          } else {
            for (let i = index - 1; i >= 0; i--) {
              if (rows[i].depth < row.depth) {
                return roving.focus(rows[i].key)
              }
            }
          }
        } else {
          roving.keydown(event, el)
        }
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, OutlineRootState>({
      state: (state, { api }) => ({
        rows: visibleRows(
          api.tree.rows(state),
          state.expanded,
          state.moving?.key ?? null
        ),
        moving: !!state.moving,
      }),
      attrs: (state, { id }) => ({
        role: "tree",
        "aria-describedby": `${id}-instructions`,
        "data-moving": state.moving ? "" : undefined,
      }),
    }),
    item: slot<{ value: string }, OutlineItemState>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key, api }) => {
        const { depth, parent } = rowPlace(api.tree.rows(state), key)
        return {
          depth,
          parent,
          expanded: state.expanded.includes(key),
          moving: api.tree.moving(state, key),
          dragging: api.tree.dragging(state, key),
        }
      },
      attrs: (state, part) => {
        const { depth, parent } = rowPlace(part.api.tree.rows(state), part.key)
        return {
          role: "treeitem",
          "aria-level": String(depth + 1),
          "aria-expanded": parent
            ? String(state.expanded.includes(part.key))
            : undefined,
          tabindex: part.api.roving.tabIndex(state, part),
          "data-moving": part.api.tree.moving(state, part.key) ? "" : undefined,
          "data-dragging": part.api.tree.dragging(state, part.key)
            ? ""
            : undefined,
          style: css({ "--depth": String(depth), "touch-action": "none" }),
        }
      },
      on: {
        keydown: (event, { el, api, key }) =>
          el && api.itemKeydown(event, el, key),
        pointerdown: (event, { api, key }) => api.tree.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.tree.bind(el, part.key),
          part.api.flip.bind(el, part.key),
        ]
        return () => cleanups.forEach((cleanup) => cleanup?.())
      },
    }),
    toggle: slot<{ value: string }, OutlineToggleState>({
      props: { value: { kind: "string", from: "item" } },
      state: (state, { key, api }) => ({
        expanded: state.expanded.includes(key),
        parent: rowPlace(api.tree.rows(state), key).parent,
      }),
      attrs: (state, { key }) => ({
        "aria-hidden": "true",
        "data-expanded": state.expanded.includes(key) ? "" : undefined,
      }),
      on: {
        pointerdown: (event) => event.preventDefault(),
        click: (event, { api, key }) => api.toggle(key, event),
      },
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
})

const parts = createParts(outline, { root: "div", instructions: "div" })

const OutlineItemContext = React.createContext<string | null>(null)

const Outline = parts.Root

function OutlineItem({
  value,
  ...props
}: { value: string } & PartProps<"div", OutlineItemState>) {
  return (
    <OutlineItemContext.Provider value={value}>
      {usePart(outline, "item", { value }, props)}
    </OutlineItemContext.Provider>
  )
}

function OutlineToggle(props: PartProps<"span", OutlineToggleState>) {
  const value = React.useContext(OutlineItemContext)
  if (value === null) {
    throw new Error("<OutlineToggle> must be used inside <OutlineItem>.")
  }
  return usePart(outline, "toggle", { value }, props, "span")
}

const OutlineInstructions = parts.Instructions

const pages: Record<string, string> = {
  start: "Getting started",
  install: "Install",
  quick: "Quick start",
  guides: "Guides",
  forms: "Forms",
  validation: "Validation",
  actions: "Server actions",
  dialogs: "Dialogs",
  dnd: "Drag and drop",
  reference: "Reference",
  core: "Core",
  react: "React",
  changelog: "Changelog",
}

const defaultRows = [
  { key: "start", depth: 0 },
  { key: "install", depth: 1 },
  { key: "quick", depth: 1 },
  { key: "guides", depth: 0 },
  { key: "forms", depth: 1 },
  { key: "validation", depth: 2 },
  { key: "actions", depth: 2 },
  { key: "dialogs", depth: 1 },
  { key: "dnd", depth: 1 },
  { key: "reference", depth: 0 },
  { key: "core", depth: 1 },
  { key: "react", depth: 1 },
  { key: "changelog", depth: 0 },
]

function Example() {
  return (
    <Outline
      defaultRows={defaultRows}
      defaultExpanded={["start", "guides", "forms"]}
      aria-label="Pages"
    >
      {({ rows }) => (
        <>
          {rows.map((row) => (
            <OutlineItem key={row.key} value={row.key}>
              {({ parent }) => (
                <>
                  <OutlineToggle>
                    {parent && (
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M6 4l4 4-4 4" />
                      </svg>
                    )}
                  </OutlineToggle>
                  <span>{pages[row.key]}</span>
                </>
              )}
            </OutlineItem>
          ))}
          <OutlineInstructions>
            Up and Down move between pages, Right opens a page and Left closes
            it. Space picks a page up with everything under it; then Up and Down
            move it, Left and Right move it out a level and in one, Space drops
            it and Escape puts it back.
          </OutlineInstructions>
        </>
      )}
    </Outline>
  )
}

export {
  Example,
  outline,
  Outline,
  type OutlineExpandedChangeReason,
  OutlineInstructions,
  OutlineItem,
  type OutlineItemState,
  type OutlineOptions,
  type OutlineRootState,
  OutlineToggle,
  type OutlineToggleState,
}
