import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createTreeReorder,
  css,
  definePrimitive,
  type ChangeDetails,
  type TreeReorderDraft,
  type TreeReorderReason,
  type TreeReorderRow,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type PagesState = {
  rows: TreeReorderRow[]
  focused: string | null
  moving: TreeReorderDraft | null
}

type PagesOptions = {
  defaultRows: TreeReorderRow[]
  onRowsChange?: (
    rows: TreeReorderRow[],
    details: ChangeDetails<TreeReorderReason>
  ) => void
}

const pages = definePrimitive({
  name: "pages",
  options: { defaultRows: "value", onRowsChange: "callback" },
  state: (options: PagesOptions): PagesState => ({
    rows: options.defaultRows,
    focused: null,
    moving: null,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      roving: createRovingFocus<PagesState, { value: string }>(context, {
        slot: "row",
        key: "focused",
      }),
      tree: createTreeReorder<PagesState>(context, {
        key: "rows",
        draft: "moving",
        set: (value, details) => change("rows", value, details),
        indent: () => 20,
        preview: true,
      }),
    }
  },
  slots: (slot) => ({
    root: slot<{}, { rows: TreeReorderRow[] }>({
      state: (state, { api }) => ({ rows: api.tree.rows(state) }),
      attrs: () => ({ role: "tree" }),
    }),
    row: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => {
        const depth =
          part.api.tree.rows(state).find((row) => row.key === part.key)
            ?.depth ?? 0
        return {
          role: "treeitem",
          "aria-level": String(depth + 1),
          tabindex: part.api.roving.tabIndex(state, part),
          "data-moving": part.api.tree.moving(state, part.key) ? "" : undefined,
          style: css({
            "--depth": String(depth),
            "touch-action": "none",
            "user-select": "none",
          }),
        }
      },
      on: {
        keydown: (event, { el, api, key }) =>
          api.tree.keydown(event, key) || api.roving.keydown(event, el!),
        pointerdown: (event, { api, key }) => api.tree.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.tree.bind(el, part.key),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
  }),
})

const parts = createParts(pages, { root: "div", row: "div" })

const Pages = parts.Root

const PagesRow = parts.Row

const outline = [
  { key: "Guides", depth: 0 },
  { key: "Install", depth: 1 },
  { key: "Forms", depth: 1 },
  { key: "Reference", depth: 0 },
  { key: "Hooks", depth: 1 },
  { key: "Changelog", depth: 0 },
]

function Example() {
  return (
    <Pages aria-label="Pages" defaultRows={outline}>
      {({ rows }) =>
        rows.map((row) => (
          <PagesRow key={row.key} value={row.key}>
            {row.key}
          </PagesRow>
        ))
      }
    </Pages>
  )
}

export { Example }
