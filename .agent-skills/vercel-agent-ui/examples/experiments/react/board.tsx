import * as React from "react"
import {
  createChange,
  createLasso,
  createMove,
  createRovingFocus,
  createSelection,
  css,
  definePrimitive,
  live,
  selects,
  spatialMove,
  type ChangeDetails,
  type LassoDraft,
  type MoveDraft,
  type MovePoint,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type BoardPositions = Record<string, MovePoint>

type BoardState = {
  positions: BoardPositions
  selected: string[]
  focused: string | null
  moving: MoveDraft | null
  lasso: LassoDraft | null
  step: number
  grid: number
}

type BoardPositionsChangeReason = "drag" | "move-key" | "imperative"
type BoardSelectedChangeReason =
  "item-press" | "list-navigation" | "escape-key" | "lasso" | "imperative"

type BoardOptions = {
  positions?: BoardPositions
  defaultPositions?: BoardPositions
  onPositionsChange?: (
    positions: BoardPositions,
    details: ChangeDetails<BoardPositionsChangeReason>
  ) => void
  selected?: string[]
  defaultSelected?: string[]
  onSelectedChange?: (
    selected: string[],
    details: ChangeDetails<BoardSelectedChangeReason>
  ) => void
  step?: number
  grid?: number
}

type BoardCardProps = {
  value: string
  label?: string
  disabled?: boolean
}

type BoardRootState = { selected: number; dragging: boolean }
type BoardCardState = {
  selected: boolean
  disabled: boolean
  x: number
  y: number
}

const board = /* @__PURE__ */ definePrimitive({
  name: "board",
  options: {
    positions: "value",
    defaultPositions: "value",
    onPositionsChange: "callback",
    selected: "list",
    defaultSelected: "list",
    onSelectedChange: "callback",
    step: "number",
    grid: "number",
  },
  state: (options: BoardOptions): BoardState => ({
    positions: options.positions ?? options.defaultPositions ?? {},
    selected: options.selected ?? options.defaultSelected ?? [],
    focused: null,
    moving: null,
    lasso: null,
    step: options.step ?? 10,
    grid: options.grid ?? 1,
  }),
  sync: (options) => ({
    step: options.step ?? 10,
    grid: options.grid ?? 1,
    ...(options.positions === undefined
      ? {}
      : { positions: options.positions }),
    ...(options.selected === undefined ? {} : { selected: options.selected }),
  }),
  controlled: ["positions", "selected"],
  live: ["moving", "lasso"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const card = (key: string) => context.props<BoardCardProps>("card", key)
    const roving = createRovingFocus<BoardState, BoardCardProps>(context, {
      slot: "card",
      key: "focused",
      move: spatialMove(),
      disabled: (item) => !!item.props.disabled,
      preferred: (item) => store.get().selected.includes(item.key),
    })
    const selection = createSelection(context, {
      key: "selected",
      set: (value, details) => change("selected", value, details),
      order: () => roving.items().map((item) => item.key),
      multiple: () => true,
      selectable: (key) => !card(key)?.disabled,
    })
    const move = createMove<BoardState>(context, {
      key: "positions",
      draft: "moving",
      set: (value, details) => change("positions", value, details),
      group: (key) =>
        store.get().selected.includes(key) ? store.get().selected : [key],
      step: () => store.get().grid,
      largeStep: () => store.get().step,
      disabled: (key) => !!card(key)?.disabled,
      label: (key) => card(key)?.label,
    })
    const lasso = createLasso<BoardState>(context, {
      slot: "card",
      draft: "lasso",
      selected: () => store.get().selected,
      set: (keys, details) => change("selected", keys, details),
      selectable: (key) => !card(key)?.disabled,
      message: (count) =>
        `${count} ${count === 1 ? "card" : "cards"} selected.`,
    })

    const api = {
      roving,
      move,
      lasso,
      select(
        keys: string[],
        details: { reason: BoardSelectedChangeReason; event?: Event } = {
          reason: "imperative",
        }
      ) {
        return change("selected", keys, details)
      },
      setPositions(positions: BoardPositions) {
        return change(
          "positions",
          { ...store.get().positions, ...positions },
          { reason: "imperative" }
        )
      },
      cardKeydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (move.keydown(event, key)) {
          return
        }
        const { selected } = store.get()
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "a"
        ) {
          event.preventDefault()
          selection.toggleAll({ reason: "list-navigation", event })
        } else if (event.key === " ") {
          event.preventDefault()
          selection.toggle(key, { reason: "item-press", event })
        } else if (event.key === "Escape" && selected.length) {
          change("selected", [], { reason: "escape-key", event })
        } else {
          const moved = roving.keydown(event, el)
          if (moved?.shift) {
            const next = store.get().selected
            const add = [moved.from, moved.key].filter(
              (k): k is string => !!k && !next.includes(k) && !card(k)?.disabled
            )
            if (add.length) {
              change("selected", [...next, ...add], {
                reason: "list-navigation",
                event,
              })
            }
          }
        }
      },
      cardPointerdown(event: PointerEvent, el: HTMLElement, key: string) {
        if (event.button !== 0) {
          return
        }
        event.stopPropagation()
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
          selection.toggle(key, { reason: "item-press", event })
        } else if (!store.get().selected.includes(key)) {
          selection.choose(key, { reason: "item-press", event })
        }
        move.pointerdown(event, key, el)
      },
      rootPointerdown(event: PointerEvent, el: HTMLElement) {
        if (event.button !== 0 || event.target !== el) {
          return
        }
        if (!event.shiftKey && store.get().selected.length) {
          change("selected", [], { reason: "lasso", event })
        }
        lasso.pointerdown(event, el)
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, BoardRootState>({
      state: (state) => ({
        selected: state.selected.length,
        dragging: !!state.moving,
      }),
      attrs: (_state, { id }) => ({
        role: "listbox",
        "aria-multiselectable": "true",
        "aria-roledescription": "board",
        "aria-describedby": `${id}-instructions`,
        style: css({
          position: "relative",
          "touch-action": "none",
          "user-select": "none",
        }),
      }),
      live: live<BoardState, any, {}>((state) => ({
        "data-lassoing": state.lasso ? "" : undefined,
        "data-dragging": state.moving ? "" : undefined,
      })),
      on: {
        pointerdown: (event, { el, api }) =>
          el && api.rootPointerdown(event, el),
      },
    }),
    card: slot<BoardCardProps, BoardCardState>({
      props: { value: "string", label: "string", disabled: "boolean" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key, props }) => ({
        selected: state.selected.includes(key),
        disabled: !!props.disabled,
        x: state.positions[key]?.x ?? 0,
        y: state.positions[key]?.y ?? 0,
      }),
      attrs: (state, part) => {
        const at = state.positions[part.key] ?? { x: 0, y: 0 }
        const selected = state.selected.includes(part.key)
        return {
          role: "option",
          "aria-roledescription": "card",
          "aria-selected": String(selected),
          "aria-disabled": part.props.disabled ? "true" : undefined,
          tabindex: part.api.roving.tabIndex(state, part),
          "data-selected": selected ? "" : undefined,
          "data-disabled": part.props.disabled ? "" : undefined,
          style: css({
            position: "absolute",
            left: `${at.x}px`,
            top: `${at.y}px`,
            "--board-x": `${at.x}px`,
            "--board-y": `${at.y}px`,
          }),
        }
      },
      live: live<BoardState, any, BoardCardProps>((state, { key, api }) => ({
        "data-dragging": api.move.dragging(state, key) ? "" : undefined,
        "data-lassoed": api.lasso.touches(state, key) ? "" : undefined,
        style: api.move.style(state, key),
      })),
      on: {
        keydown: (event, { el, api, key }) =>
          el && api.cardKeydown(event, el, key),
        pointerdown: (event, { el, api, key }) =>
          el && api.cardPointerdown(event, el, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    lasso: slot({
      attrs: () => ({ "aria-hidden": "true" }),
      live: live<BoardState, any, {}>((state, { api }) => ({
        style: api.lasso.style(state),
      })),
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
})

const parts = createParts(board, {
  root: "div",
  card: "div",
  lasso: "div",
  instructions: "div",
})

const Board = parts.Root

const BoardCard = parts.Card

const BoardLasso = parts.Lasso

const BoardInstructions = parts.Instructions

const cards = [
  {
    value: "research",
    label: "Research",
    note: "Five interviews",
    x: 12,
    y: 12,
    tone: "#0ea5e9",
  },
  {
    value: "sketch",
    label: "Sketch",
    note: "Three directions",
    x: 176,
    y: 36,
    tone: "#f59e0b",
  },
  {
    value: "prototype",
    label: "Prototype",
    note: "Click-through",
    x: 340,
    y: 16,
    tone: "#10b981",
  },
  {
    value: "test",
    label: "Test",
    note: "Five sessions",
    x: 80,
    y: 168,
    tone: "#f43f5e",
  },
  {
    value: "ship",
    label: "Ship",
    note: "Behind a flag",
    x: 268,
    y: 184,
    tone: "#8b5cf6",
  },
]
const defaultPositions = Object.fromEntries(
  cards.map((card) => [card.value, { x: card.x, y: card.y }])
)

function Example() {
  const [selected, setSelected] = React.useState<string[]>([])
  return (
    <div data-slot="stack">
      <Board
        defaultPositions={defaultPositions}
        selected={selected}
        onSelectedChange={setSelected}
        grid={8}
        aria-label="Plan"
      >
        {cards.map((card) => (
          <BoardCard key={card.value} value={card.value} label={card.label}>
            <span data-slot="row">
              <span
                data-slot="swatch"
                aria-hidden="true"
                style={{ background: card.tone }}
              />
              {card.label}
            </span>
            <span data-slot="hint">{card.note}</span>
          </BoardCard>
        ))}
        <BoardLasso />
        <BoardInstructions>
          Arrow keys move to the nearest card. Shift with an arrow adds it to
          the selection. Space selects. Alt with an arrow moves the selection.
        </BoardInstructions>
      </Board>
      <p data-slot="output">
        {selected.length
          ? `Selected: ${selected.join(", ")}`
          : "Drag on empty space to select cards."}
      </p>
    </div>
  )
}

export {
  board,
  Board,
  BoardCard,
  type BoardCardProps,
  type BoardCardState,
  BoardInstructions,
  BoardLasso,
  type BoardOptions,
  type BoardPositions,
  type BoardPositionsChangeReason,
  type BoardRootState,
  type BoardSelectedChangeReason,
  Example,
}
