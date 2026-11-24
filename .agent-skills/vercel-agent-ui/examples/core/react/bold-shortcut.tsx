import * as React from "react"
import {
  ariaKeyshortcuts,
  definePrimitive,
  formatShortcut,
  matchesShortcut,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type BoldState = { bold: boolean }

const shortcut = "mod+b"

const boldText = definePrimitive({
  name: "bold-text",
  state: (): BoldState => ({ bold: false }),
  api: (context) => ({
    toggle: () => context.store.set({ bold: !context.store.get().bold }),
  }),
  slots: (slot) => ({
    root: slot({
      on: {
        keydown: (event, { api }) => {
          if (!matchesShortcut(event, shortcut)) {
            return
          }
          event.preventDefault()
          api.toggle()
        },
      },
    }),
    toggle: slot({
      attrs: (state) => ({
        type: "button",
        "aria-pressed": String(state.bold),
      }),
      press: ({ api }) => api.toggle(),
      bind: (el) =>
        el.setAttribute("aria-keyshortcuts", ariaKeyshortcuts(shortcut)),
    }),
    keys: slot({
      attrs: () => ({ "aria-hidden": "true" }),
      bind: (el) => {
        el.textContent = formatShortcut(shortcut)
      },
    }),
    text: slot<{}, BoldState>({ state: (state) => ({ bold: state.bold }) }),
  }),
})

const parts = createParts(boldText, {
  root: "div",
  toggle: "button",
  keys: "kbd",
  text: "textarea",
})

function Example() {
  return (
    <parts.Root>
      <parts.Toggle>
        Bold
        <parts.Keys />
      </parts.Toggle>
      <parts.Text
        aria-label="Note"
        rows={2}
        defaultValue="Press the shortcut while typing."
      />
    </parts.Root>
  )
}

export { boldText, Example, type BoldState }
