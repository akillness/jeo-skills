import * as React from "react"
import {
  createChange,
  createReorder,
  createRovingFocus,
  definePrimitive,
  spatialMove,
  type ReorderDraft,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type AlbumState = {
  value: string[]
  focused: string | null
  moving: ReorderDraft | null
}

const album = definePrimitive({
  name: "album",
  state: (): AlbumState => ({
    value: [
      "Dawn",
      "Dune",
      "Fern",
      "Fjord",
      "Glacier",
      "Harbor",
      "Mesa",
      "Reef",
    ],
    focused: null,
    moving: null,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      roving: createRovingFocus<AlbumState, { value: string }>(context, {
        slot: "photo",
        key: "focused",
        move: spatialMove(),
      }),
      reorder: createReorder<AlbumState>(context, {
        slot: "photo",
        key: "value",
        draft: "moving",
        set: (value, details) => change("value", value, details),
        orientation: () => "grid",
      }),
    }
  },
  slots: (slot) => ({
    root: slot<{}, { order: string[] }>({
      state: (state, { api }) => ({ order: api.reorder.order(state) }),
      attrs: () => ({
        role: "listbox",
        "aria-roledescription": "sortable grid",
      }),
    }),
    photo: slot<{ value: string }>({
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

const parts = createParts(album, { root: "div", photo: "div" })

const Album = parts.Root

const AlbumPhoto = parts.Photo

function Example() {
  return (
    <Album aria-label="Album">
      {({ order }) =>
        order.map((photo) => (
          <AlbumPhoto key={photo} value={photo}>
            {photo}
          </AlbumPhoto>
        ))
      }
    </Album>
  )
}

export { Example }
