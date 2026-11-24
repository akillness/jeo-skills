import * as React from "react"
import {
  createChange,
  createReorder,
  createRovingFocus,
  definePrimitive,
  type ReorderDraft,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type QueueState = {
  value: string[]
  focused: string | null
  moving: ReorderDraft | null
}

const songs = Array.from(
  { length: 16 },
  (_, index) => `Track ${String(index + 1).padStart(2, "0")}`
)

const queue = definePrimitive({
  name: "queue",
  state: (): QueueState => ({ value: songs, focused: null, moving: null }),
  api: (context) => {
    const change = createChange(context)
    return {
      roving: createRovingFocus<QueueState, { value: string }>(context, {
        slot: "song",
        key: "focused",
      }),
      reorder: createReorder<QueueState>(context, {
        slot: "song",
        key: "value",
        draft: "moving",
        set: (value, details) => change("value", value, details),
        preview: true,
        createAutoScroll: { edge: 40, speed: 12 },
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
    song: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        role: "option",
        "aria-roledescription": "sortable item",
        "aria-selected": String(state.moving?.key === part.key),
        tabindex: part.api.roving.tabIndex(state, part),
        "data-dragging": part.api.reorder.dragging(state, part.key)
          ? ""
          : undefined,
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

const parts = createParts(queue, { root: "div", song: "div" })

const Queue = parts.Root

const QueueSong = parts.Song

function Example() {
  return (
    <Queue aria-label="Queue">
      {({ order }) =>
        order.map((song) => (
          <QueueSong key={song} value={song}>
            {song}
          </QueueSong>
        ))
      }
    </Queue>
  )
}

export { Example }
