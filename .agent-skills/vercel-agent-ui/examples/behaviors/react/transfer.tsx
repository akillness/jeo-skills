import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createTransfer,
  definePrimitive,
  spatialMove,
  type ChangeDetails,
  type TransferDraft,
  type TransferLists,
  type TransferReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

const names: Record<string, string> = { closet: "Closet", bag: "Bag" }

type PackingState = {
  lists: TransferLists
  focused: string | null
  moving: TransferDraft | null
}

type PackingOptions = {
  defaultLists: TransferLists
  onListsChange?: (
    lists: TransferLists,
    details: ChangeDetails<TransferReason>
  ) => void
}

const packing = definePrimitive({
  name: "packing",
  options: { defaultLists: "value", onListsChange: "callback" },
  state: (options: PackingOptions): PackingState => ({
    lists: options.defaultLists,
    focused: null,
    moving: null,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      roving: createRovingFocus<PackingState, { value: string }>(context, {
        slot: "item",
        key: "focused",
        move: spatialMove(),
      }),
      transfer: createTransfer<PackingState>(context, {
        key: "lists",
        draft: "moving",
        set: (value, details) => change("lists", value, details),
      }),
    }
  },
  slots: (slot) => ({
    root: slot<{}, { lists: TransferLists }>({
      state: (state, { api }) => ({ lists: api.transfer.lists(state) }),
    }),
    list: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ role: "listbox" }),
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    item: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        role: "option",
        "aria-selected": String(state.moving?.key === part.key),
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
  }),
})

const parts = createParts(packing, { root: "div", list: "div", item: "div" })

const Packing = parts.Root

const PackingList = parts.List

const PackingItem = parts.Item

function Example() {
  return (
    <Packing
      defaultLists={{
        closet: ["Jacket", "Boots", "Scarf"],
        bag: ["Passport", "Charger"],
      }}
    >
      {({ lists }) =>
        Object.entries(lists).map(([list, items]) => (
          <div key={list} data-slot="transfer-lane">
            <span data-slot="transfer-label">{names[list]}</span>
            <PackingList value={list} aria-label={names[list]}>
              {items.map((item) => (
                <PackingItem key={item} value={item}>
                  {item}
                </PackingItem>
              ))}
            </PackingList>
          </div>
        ))
      }
    </Packing>
  )
}

export { Example }
