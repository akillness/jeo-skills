import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createTreeReorder,
  css,
  definePrimitive,
  subtreeEnd,
  treeReorderMessage,
  type TreeReorderDraft,
  type TreeReorderRow,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FolderIcon,
  InboxIcon,
} from "lucide-react"

type FoldersState = {
  rows: TreeReorderRow[]
  focused: string | null
  moving: TreeReorderDraft | null
}

const counts: Record<string, number> = {
  Inbox: 12,
  Work: 4,
  Reports: 2,
  Drafts: 1,
  Personal: 7,
  Travel: 3,
}

const folders = definePrimitive({
  name: "folders",
  state: (): FoldersState => ({
    rows: [
      { key: "Inbox", depth: 0 },
      { key: "Work", depth: 0 },
      { key: "Reports", depth: 1 },
      { key: "Drafts", depth: 1 },
      { key: "Personal", depth: 0 },
      { key: "Travel", depth: 1 },
    ],
    focused: null,
    moving: null,
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const tree = createTreeReorder<FoldersState>(context, {
      key: "rows",
      draft: "moving",
      set: (value, details) => change("rows", value, details),
      indent: () => 16,
      maxDepth: () => 1,
      disabled: (key) => key === "Inbox",
      label: (key) => key,
      message: (message) =>
        message.type === "drop"
          ? `${message.label} moved, level ${message.level}.`
          : treeReorderMessage(message),
    })
    return {
      roving: createRovingFocus<FoldersState, { value: string }>(context, {
        slot: "row",
        key: "focused",
      }),
      tree,
      shift(key: string, by: number) {
        const rows = store.get().rows
        const index = rows.findIndex((row) => row.key === key)
        const after = rows[subtreeEnd(rows, index)]?.key ?? null
        tree.move(key, after, rows[index].depth + by)
      },
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
        const rows = part.api.tree.rows(state)
        const index = rows.findIndex((row) => row.key === part.key)
        return {
          role: "treeitem",
          "aria-level": String(rows[index].depth + 1),
          tabindex: part.api.roving.tabIndex(state, part),
          "data-moving": part.api.tree.moving(state, part.key) ? "" : undefined,
          "data-dragging": part.api.tree.dragging(state, part.key)
            ? ""
            : undefined,
          "data-parent": subtreeEnd(rows, index) > index + 1 ? "" : undefined,
          style: css({
            "--depth": String(rows[index].depth),
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
    indent: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, part) => ({
        type: "button",
        tabindex: "-1",
        "aria-label": `Indent ${part.key}`,
      }),
      on: { pointerdown: (event) => event.preventDefault() },
      press: ({ api, key }) => api.shift(key, 1),
    }),
    outdent: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, part) => ({
        type: "button",
        tabindex: "-1",
        "aria-label": `Outdent ${part.key}`,
      }),
      on: { pointerdown: (event) => event.preventDefault() },
      press: ({ api, key }) => api.shift(key, -1),
    }),
  }),
})

const parts = createParts(folders, {
  root: "div",
  row: "div",
  indent: "button",
  outdent: "button",
})

const Folders = parts.Root

const FoldersRow = parts.Row

const FoldersIndent = parts.Indent

const FoldersOutdent = parts.Outdent

function Example() {
  return (
    <Folders aria-label="Folders">
      {({ rows }) =>
        rows.map((row) => (
          <FoldersRow key={row.key} value={row.key}>
            {row.key === "Inbox" ? (
              <InboxIcon aria-hidden="true" />
            ) : (
              <FolderIcon aria-hidden="true" />
            )}
            <span>{row.key}</span>
            <span data-slot="hint">{counts[row.key]}</span>
            {row.key !== "Inbox" && (
              <>
                <FoldersOutdent value={row.key}>
                  <ArrowLeftIcon aria-hidden="true" />
                </FoldersOutdent>
                <FoldersIndent value={row.key}>
                  <ArrowRightIcon aria-hidden="true" />
                </FoldersIndent>
              </>
            )}
          </FoldersRow>
        ))
      }
    </Folders>
  )
}

export { Example }
