import * as React from "react"
import {
  createChange,
  createInlineEdit,
  createRovingFocus,
  definePrimitive,
  selects,
  type ChangeDetails,
  type InlineEditReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type Playlist = { id: string; name: string }

type PlaylistsState = {
  items: Playlist[]
  editing: string | null
  focused: string | null
}

type PlaylistsOptions = {
  defaultItems: Playlist[]
  onItemsChange?: (
    items: Playlist[],
    details: ChangeDetails<InlineEditReason>
  ) => void
}

type PlaylistsItemState = { name: string; editing: boolean }

const playlists = definePrimitive({
  name: "playlists",
  options: { defaultItems: "value", onItemsChange: "callback" },
  state: (options: PlaylistsOptions): PlaylistsState => ({
    items: options.defaultItems,
    editing: null,
    focused: null,
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const roving = createRovingFocus<PlaylistsState, { value: string }>(
      context,
      {
        slot: "item",
        key: "focused",
      }
    )
    const edit = createInlineEdit<PlaylistsState>(context, {
      key: "editing",
      value: (id) =>
        store.get().items.find((item) => item.id === id)?.name ?? "",
      commit: (id, text, details) =>
        !!text.trim() &&
        change(
          "items",
          store
            .get()
            .items.map((item) =>
              item.id === id ? { ...item, name: text.trim() } : item
            ),
          details
        ),
    })
    return { roving, edit }
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "list" }) }),
    item: slot<{ value: string }, PlaylistsItemState>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key }) => ({
        name: state.items.find((item) => item.id === key)?.name ?? "",
        editing: state.editing === key,
      }),
      attrs: (state, part) => ({
        role: "listitem",
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: {
        keydown: (event, { el, api, key }) => {
          if (event.target !== el || api.edit.keydown(event, key)) {
            return
          }
          api.roving.keydown(event, el!)
        },
        dblclick: (event, { api, key }) => api.edit.dblclick(event, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    input: slot({
      attrs: () => ({ "aria-label": "Playlist name" }),
      on: {
        keydown: (event, { api }) => api.edit.inputKeydown(event),
        focusout: (event, { api }) => api.edit.end("focus-out", event),
      },
      bind: (el, { api }) => api.edit.bindInput(el as HTMLInputElement),
    }),
  }),
})

const parts = createParts(playlists, {
  root: "div",
  item: "div",
  input: "input",
})

const Playlists = parts.Root

const PlaylistsItem = parts.Item

const PlaylistsInput = parts.Input

const mixes = [
  { id: "a", name: "Morning run" },
  { id: "b", name: "Deep focus" },
  { id: "c", name: "Road trip" },
  { id: "d", name: "Rainy Sunday" },
]

function Example() {
  return (
    <Playlists aria-label="Playlists" defaultItems={mixes}>
      {mixes.map((mix) => (
        <PlaylistsItem key={mix.id} value={mix.id}>
          {({ name, editing }) => (editing ? <PlaylistsInput /> : name)}
        </PlaylistsItem>
      ))}
    </Playlists>
  )
}

export {
  Example,
  playlists,
  Playlists,
  PlaylistsInput,
  PlaylistsItem,
  type Playlist,
  type PlaylistsItemState,
  type PlaylistsOptions,
  type PlaylistsState,
}
