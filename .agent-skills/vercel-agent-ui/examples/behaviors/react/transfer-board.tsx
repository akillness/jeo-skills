import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createTransfer,
  definePrimitive,
  spatialMove,
  transferMessage,
  type TransferDraft,
  type TransferLists,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { CheckIcon } from "lucide-react"

type BoardState = {
  lists: TransferLists
  focused: string | null
  moving: TransferDraft | null
}

const columns: Record<string, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
}
const blocked = "Billing"
const tags: Record<string, string> = {
  Search: "Feature",
  Billing: "Blocked",
  Login: "Bug",
  Docs: "Chore",
  Icons: "Design",
}

const board = definePrimitive({
  name: "board",
  state: (): BoardState => ({
    lists: {
      done: ["Icons"],
      todo: ["Search", "Billing", "Login"],
      doing: ["Docs"],
    },
    focused: null,
    moving: null,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      roving: createRovingFocus<BoardState, { value: string }>(context, {
        slot: "card",
        key: "focused",
        move: spatialMove(),
      }),
      transfer: createTransfer<BoardState>(context, {
        key: "lists",
        draft: "moving",
        set: (value, details) => change("lists", value, details),
        order: () => ["todo", "doing", "done"],
        accepts: (key, list) =>
          list !== "doing" ||
          context.store.get().lists.doing.filter((card) => card !== key)
            .length < 2,
        disabled: (key) => key === blocked,
        label: (key) => key,
        listLabel: (list) => columns[list],
        message: (message) =>
          message.type === "drop"
            ? `${message.label} is in ${message.list} now.`
            : transferMessage(message),
        createAutoScroll: false,
      }),
    }
  },
  slots: (slot) => ({
    root: slot<{}, { lists: TransferLists }>({
      state: (state, { api }) => ({ lists: api.transfer.lists(state) }),
    }),
    column: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ role: "listbox" }),
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    card: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        role: "option",
        "aria-selected": String(part.api.transfer.moving(state, part.key)),
        "aria-disabled": part.key === blocked ? "true" : undefined,
        tabindex: part.api.roving.tabIndex(state, part),
        "data-dragging": part.api.transfer.dragging(state, part.key)
          ? ""
          : undefined,
        style: "touch-action:none;user-select:none",
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          api.transfer.keydown(event, key) || api.roving.keydown(event, el!),
        pointerdown: (event, { api, key }) =>
          api.transfer.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.transfer.bindItem(el, part.key),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
    finish: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, part) => ({
        type: "button",
        tabindex: "-1",
        "aria-label": `Move ${part.key} to Done`,
      }),
      on: { pointerdown: (event) => event.preventDefault() },
      press: ({ api, key }) => api.transfer.move(key, "done", 0),
    }),
  }),
})

const parts = createParts(board, {
  root: "div",
  column: "div",
  card: "div",
  finish: "button",
})

const Board = parts.Root

const BoardColumn = parts.Column

const BoardCard = parts.Card

const BoardFinish = parts.Finish

function Example() {
  return (
    <Board>
      {({ lists }) =>
        Object.keys(columns).map((list) => (
          <div key={list} data-slot="transfer-lane">
            <span data-slot="transfer-label">
              {columns[list]}
              {list === "doing" && <span>Max 2</span>}
            </span>
            <BoardColumn value={list} aria-label={columns[list]}>
              {lists[list].map((card) => (
                <BoardCard key={card} value={card}>
                  {card}
                  <div data-slot="transfer-meta">
                    {tags[card]}
                    {list !== "done" && card !== blocked && (
                      <BoardFinish value={card}>
                        <CheckIcon aria-hidden="true" />
                      </BoardFinish>
                    )}
                  </div>
                </BoardCard>
              ))}
            </BoardColumn>
          </div>
        ))
      }
    </Board>
  )
}

export { Example }
