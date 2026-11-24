import * as React from "react"
import {
  createChange,
  createLasso,
  definePrimitive,
  live,
  type LassoDraft,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type PhotosState = { selected: string[]; lasso: LassoDraft | null }

type PhotosOptions = {
  locked: string[]
}

const photos = definePrimitive({
  name: "photos",
  options: { locked: "list" },
  state: (_options: PhotosOptions): PhotosState => ({
    selected: [],
    lasso: null,
  }),
  live: ["lasso"],
  api: (context) => {
    const change = createChange(context)
    return {
      lasso: createLasso<PhotosState>(context, {
        slot: "photo",
        draft: "lasso",
        selected: () => context.store.get().selected,
        set: (keys, details) => change("selected", keys, details),
        selectable: (key) => !context.options().locked.includes(key),
        message: (count) =>
          `${count} ${count === 1 ? "photo" : "photos"} selected`,
      }),
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({
        style: "position:relative;touch-action:none;user-select:none",
      }),
      on: {
        pointerdown: (event, { el, api }) =>
          event.target === el && api.lasso.pointerdown(event, el!),
      },
    }),
    photo: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => ({
        "data-selected": state.selected.includes(key) ? "" : undefined,
      }),
      live: live<PhotosState, any, { value: string }>(
        (state, { key, api }) => ({
          "data-lassoed": api.lasso.touches(state, key) ? "" : undefined,
        })
      ),
    }),
    lasso: slot({
      attrs: () => ({ "aria-hidden": "true" }),
      live: live<PhotosState, any, {}>((state, { api }) => ({
        style: api.lasso.style(state),
      })),
    }),
  }),
})

const parts = createParts(photos, { root: "div", photo: "div", lasso: "div" })

const Photos = parts.Root

const PhotosPhoto = parts.Photo

const PhotosLasso = parts.Lasso

const names = ["Beach", "Forest", "City", "Desert", "Lake", "Snow"]
const locked = ["City", "Lake"]

function Example() {
  return (
    <Photos locked={locked} aria-label="Photos">
      {names.map((name) => (
        <PhotosPhoto key={name} value={name}>
          {name}
          {locked.includes(name) && <span data-slot="badge">Locked</span>}
        </PhotosPhoto>
      ))}
      <PhotosLasso />
    </Photos>
  )
}

export {
  Example,
  photos,
  Photos,
  PhotosLasso,
  PhotosPhoto,
  type PhotosOptions,
  type PhotosState,
}
