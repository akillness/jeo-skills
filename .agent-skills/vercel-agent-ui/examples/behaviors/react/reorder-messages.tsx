import * as React from "react"
import {
  createChange,
  createReorder,
  createRovingFocus,
  definePrimitive,
  reorderMessage,
  type ReorderDraft,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type TracksState = {
  value: string[]
  focused: string | null
  moving: ReorderDraft | null
}

type TracksOptions = {
  pinned: string
}

const titles: Record<string, string> = {
  intro: "Intro",
  tides: "Tides",
  ember: "Ember",
  static: "Static",
}

const tracks = definePrimitive({
  name: "tracks",
  options: { pinned: "string" },
  state: (_options: TracksOptions): TracksState => ({
    value: ["intro", "tides", "ember", "static"],
    focused: null,
    moving: null,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      roving: createRovingFocus<TracksState, { value: string }>(context, {
        slot: "track",
        key: "focused",
      }),
      reorder: createReorder<TracksState, { value: string }>(context, {
        slot: "track",
        key: "value",
        draft: "moving",
        set: (value, details) => change("value", value, details),
        disabled: (item) => item.key === context.options().pinned,
        label: (key) => titles[key],
        message: (message) =>
          message.type === "move"
            ? `${message.label}, track ${message.position}.`
            : reorderMessage(message),
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
    track: slot<{ value: string }>({
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

const parts = createParts(tracks, { root: "div", track: "div" })

const Tracks = parts.Root

const TracksTrack = parts.Track

const lengths: Record<string, string> = {
  intro: "0:48",
  tides: "3:12",
  ember: "4:05",
  static: "2:37",
}

function Example() {
  return (
    <Tracks pinned="intro" aria-label="Tracks">
      {({ order }) =>
        order.map((track) => (
          <TracksTrack key={track} value={track}>
            {titles[track]}
            <span data-slot="hint">
              {track === "intro" ? "Pinned" : lengths[track]}
            </span>
          </TracksTrack>
        ))
      }
    </Tracks>
  )
}

export { Example }
