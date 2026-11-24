import * as React from "react"
import {
  createChange,
  createReorder,
  createRovingFocus,
  definePrimitive,
  type ChangeDetails,
  type ReorderDraft,
  type ReorderReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type RankingState = {
  value: string[]
  focused: string | null
  moving: ReorderDraft | null
}

type RankingOptions = {
  defaultValue: string[]
  onValueChange?: (
    value: string[],
    details: ChangeDetails<ReorderReason>
  ) => void
}

const ranking = definePrimitive({
  name: "ranking",
  options: { defaultValue: "list", onValueChange: "callback" },
  state: (options: RankingOptions): RankingState => ({
    value: options.defaultValue,
    focused: null,
    moving: null,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      roving: createRovingFocus<RankingState, { value: string }>(context, {
        slot: "item",
        key: "focused",
      }),
      reorder: createReorder<RankingState>(context, {
        slot: "item",
        key: "value",
        draft: "moving",
        label: (key) => key,
        set: (value, details) => change("value", value, details),
      }),
    }
  },
  slots: (slot) => ({
    root: slot<{}, { order: string[] }>({
      state: (state, { api }) => ({ order: api.reorder.order(state) }),
      attrs: () => ({
        role: "listbox",
        "aria-roledescription": "sortable list",
      }),
    }),
    item: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        role: "option",
        "aria-roledescription": "sortable item",
        "aria-selected": String(state.moving?.key === part.key),
        tabindex: part.api.roving.tabIndex(state, part),
        "data-grabbed": state.moving?.key === part.key ? "" : undefined,
        style: "touch-action:none;user-select:none",
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          api.reorder.keydown(event, key) || api.roving.keydown(event, el!),
        pointerdown: (event, { api, key }) =>
          api.reorder.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.reorder.bind(el, part),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
  }),
})

const parts = createParts(ranking, { root: "div", item: "div" })

const Ranking = parts.Root

const RankingItem = parts.Item

function Example() {
  return (
    <Ranking
      aria-label="Favorite seasons"
      defaultValue={["Spring", "Summer", "Autumn", "Winter"]}
    >
      {({ order }) =>
        order.map((season, index) => (
          <RankingItem key={season} value={season}>
            <span data-slot="hint">{index + 1}</span>
            {season}
          </RankingItem>
        ))
      }
    </Ranking>
  )
}

export { Example }
