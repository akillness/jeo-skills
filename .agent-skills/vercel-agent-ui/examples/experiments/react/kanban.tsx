import * as React from "react"
import {
  createChange,
  createUndoStack,
  createRovingFocus,
  createTransfer,
  css,
  definePrimitive,
  matchesShortcut,
  selects,
  spatialMove,
  type ChangeDetails,
  type TransferDraft,
  type TransferLists,
  type TransferReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type KanbanListsChangeReason = TransferReason | "undo" | "redo"

type KanbanOptions = {
  lists?: TransferLists
  defaultLists?: TransferLists
  onListsChange?: (
    lists: TransferLists,
    details: ChangeDetails<KanbanListsChangeReason>
  ) => void
  limits?: Record<string, number>
  labels?: Record<string, string>
}

type KanbanState = {
  lists: TransferLists
  moving: TransferDraft | null
  focused: string | null
  canUndo: boolean
  canRedo: boolean
}

type KanbanRootState = {
  lists: TransferLists
  moving: boolean
}
type KanbanColumnState = { cards: string[]; full: boolean }
type KanbanCardState = { moving: boolean; dragging: boolean }
type KanbanActionState = { disabled: boolean }

const kanban = /* @__PURE__ */ definePrimitive({
  name: "kanban",
  options: {
    lists: "value",
    defaultLists: "value",
    onListsChange: "callback",
    limits: "value",
    labels: "value",
  },
  state: (options: KanbanOptions): KanbanState => ({
    lists: options.lists ?? options.defaultLists ?? {},
    moving: null,
    focused: null,
    canUndo: false,
    canRedo: false,
  }),
  sync: (options) =>
    options.lists === undefined ? {} : { lists: options.lists },
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const stack = createUndoStack(store.get().lists)
    const roving = createRovingFocus<KanbanState, { value: string }>(context, {
      slot: "card",
      key: "focused",
      move: spatialMove(),
    })
    const syncStack = () =>
      store.set({ canUndo: stack.canUndo(), canRedo: stack.canRedo() })
    const limit = (list: string) => context.options().limits?.[list]
    const transfer = createTransfer<KanbanState>(context, {
      key: "lists",
      draft: "moving",
      set: (value, details) => {
        if (!change("lists", value, details)) {
          return false
        }
        stack.record(value)
        syncStack()
        return true
      },
      order: () => Object.keys(store.get().lists),
      accepts: (_key, list) => {
        const most = limit(list)
        return most === undefined || store.get().lists[list].length < most
      },
      listLabel: (list) => context.options().labels?.[list],
    })
    const travel = (
      lists: TransferLists | undefined,
      reason: "undo" | "redo",
      event?: Event
    ) => {
      if (lists) {
        change("lists", lists, { reason, event })
      }
      syncStack()
    }
    const api = {
      roving,
      transfer,
      limit,
      undo: (event?: Event) => travel(stack.undo(), "undo", event),
      redo: (event?: Event) => travel(stack.redo(), "redo", event),
      cardKeydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (!transfer.keydown(event, key)) {
          roving.keydown(event, el)
        }
      },
      rootKeydown(event: KeyboardEvent) {
        if (store.get().moving) {
          return
        }
        if (matchesShortcut(event, "mod+z")) {
          api.undo(event)
        } else if (
          matchesShortcut(event, "mod+shift+z") ||
          matchesShortcut(event, "control+y")
        ) {
          api.redo(event)
        } else {
          return
        }
        event.preventDefault()
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, KanbanRootState>({
      state: (state, { api }) => ({
        lists: api.transfer.lists(state),
        moving: !!state.moving,
      }),
      attrs: (_state, { id }) => ({
        role: "application",
        "aria-roledescription": "board",
        "aria-describedby": `${id}-instructions`,
      }),
      on: { keydown: (event, { api }) => api.rootKeydown(event) },
    }),
    column: slot<{ value: string }, KanbanColumnState>({
      props: { value: "string" },
      state: (state, { api, key }) => {
        const cards = api.transfer.lists(state)[key] ?? []
        const most = api.limit(key)
        return { cards, full: most !== undefined && cards.length >= most }
      },
      attrs: () => ({ role: "list" }),
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    card: slot<{ value: string }, KanbanCardState>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key, api }) => ({
        moving: api.transfer.moving(state, key),
        dragging: api.transfer.dragging(state, key),
      }),
      attrs: (state, part) => ({
        role: "listitem",
        "aria-roledescription": "card",
        tabindex: part.api.roving.tabIndex(state, part),
        "data-moving": part.api.transfer.moving(state, part.key)
          ? ""
          : undefined,
        "data-dragging": part.api.transfer.dragging(state, part.key)
          ? ""
          : undefined,
        style: css({ "touch-action": "none" }),
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          el && api.cardKeydown(event, el, key),
        pointerdown: (event, { api, key }) =>
          api.transfer.pointerdown(event, key),
      },
      bind: (el, part) => {
        const unbindRoving = part.api.roving.bind(el, part)
        const unbindTransfer = part.api.transfer.bindItem(el, part.key)
        return () => {
          unbindRoving?.()
          unbindTransfer()
        }
      },
    }),
    undo: slot<{}, KanbanActionState>({
      state: (state) => ({ disabled: !state.canUndo }),
      attrs: (state) => ({
        type: "button",
        disabled: state.canUndo ? undefined : "",
      }),
      press: ({ api }, event) => api.undo(event),
    }),
    redo: slot<{}, KanbanActionState>({
      state: (state) => ({ disabled: !state.canRedo }),
      attrs: (state) => ({
        type: "button",
        disabled: state.canRedo ? undefined : "",
      }),
      press: ({ api }, event) => api.redo(event),
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
})

const parts = createParts(kanban, {
  root: "div",
  column: "div",
  card: "div",
  undo: "button",
  redo: "button",
  instructions: "div",
})

const Kanban = parts.Root

const KanbanColumn = parts.Column

const KanbanCard = parts.Card

const KanbanUndo = parts.Undo

const KanbanRedo = parts.Redo

const KanbanInstructions = parts.Instructions

const cards: Record<string, { title: string; tag: string; tone: string }> = {
  c1: { title: "Virtual list", tag: "Core", tone: "#0ea5e9" },
  c2: { title: "Grid focus", tag: "Core", tone: "#0ea5e9" },
  c3: { title: "Inline edit", tag: "Core", tone: "#0ea5e9" },
  c4: { title: "Chat log", tag: "Demo", tone: "#8b5cf6" },
  c5: { title: "Kanban", tag: "Demo", tone: "#8b5cf6" },
  c6: { title: "Color picker", tag: "Demo", tone: "#8b5cf6" },
  c7: { title: "Context menu", tag: "Demo", tone: "#8b5cf6" },
  c8: { title: "Docs for agents", tag: "Docs", tone: "#f59e0b" },
  c9: { title: "Size check", tag: "Infra", tone: "#10b981" },
  c10: { title: "Unit tests", tag: "Infra", tone: "#10b981" },
  c11: { title: "Selection toolbar", tag: "Demo", tone: "#8b5cf6" },
  c12: { title: "Auto scroll", tag: "Core", tone: "#0ea5e9" },
  c13: { title: "Undo history", tag: "Core", tone: "#0ea5e9" },
  c14: { title: "Morning summary", tag: "Docs", tone: "#f59e0b" },
}

const columns = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "Doing" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
]

const defaultLists = {
  todo: ["c6", "c7", "c11", "c8", "c14", "c9"],
  doing: ["c4", "c5"],
  review: ["c12", "c13"],
  done: ["c1", "c2", "c3", "c10"],
}

const limits = { doing: 3 }
const labels = Object.fromEntries(
  columns.map((column) => [column.value, column.label])
)

function Example() {
  return (
    <Kanban
      defaultLists={defaultLists}
      limits={limits}
      labels={labels}
      aria-label="Sprint"
    >
      {({ lists }) => (
        <>
          <div data-slot="row">
            <KanbanUndo>Undo</KanbanUndo>
            <KanbanRedo>Redo</KanbanRedo>
          </div>
          <div data-slot="kanban-board">
            {columns.map((column) => {
              const limit = limits[column.value as keyof typeof limits]
              const count = lists[column.value]?.length ?? 0
              return (
                <section
                  key={column.value}
                  aria-labelledby={`kanban-${column.value}`}
                  data-slot="kanban-lane"
                >
                  <h3 id={`kanban-${column.value}`}>
                    {column.label}
                    <span
                      data-full={
                        limit !== undefined && count >= limit ? "" : undefined
                      }
                    >
                      {count}
                      {limit === undefined ? "" : ` / ${limit}`}
                    </span>
                  </h3>
                  <KanbanColumn
                    value={column.value}
                    aria-labelledby={`kanban-${column.value}`}
                  >
                    {({ cards: keys }) =>
                      keys.map((key) => (
                        <KanbanCard key={key} value={key}>
                          <span>{cards[key].title}</span>
                          <span data-slot="hint">
                            <span
                              aria-hidden="true"
                              data-slot="kanban-tone"
                              style={
                                {
                                  "--tone": cards[key].tone,
                                } as React.CSSProperties
                              }
                            />
                            {cards[key].tag}
                          </span>
                        </KanbanCard>
                      ))
                    }
                  </KanbanColumn>
                </section>
              )
            })}
          </div>
          <KanbanInstructions>
            Arrow keys move to the nearest card. Space picks a card up; then
            arrows move it within and between columns, Space drops it and Escape
            puts it back. Control or Command with Z undoes.
          </KanbanInstructions>
        </>
      )}
    </Kanban>
  )
}

export {
  Example,
  kanban,
  Kanban,
  type KanbanActionState,
  KanbanCard,
  type KanbanCardState,
  KanbanColumn,
  type KanbanColumnState,
  KanbanInstructions,
  type KanbanListsChangeReason,
  type KanbanOptions,
  KanbanRedo,
  type KanbanRootState,
  KanbanUndo,
}
