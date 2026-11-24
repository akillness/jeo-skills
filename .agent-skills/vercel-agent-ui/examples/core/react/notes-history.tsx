import * as React from "react"
import { createUndoStack, definePrimitive, matchesShortcut } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type NotesState = { text: string; canUndo: boolean; canRedo: boolean }

const notes = definePrimitive({
  name: "notes",
  state: (): NotesState => ({ text: "", canUndo: false, canRedo: false }),
  api: (context) => {
    const { store } = context
    const stack = createUndoStack("", { limit: 10, groupDelay: 800 })
    const show = (text: string | undefined) => {
      if (text !== undefined) {
        store.set({ text })
      }
      store.set({ canUndo: stack.canUndo(), canRedo: stack.canRedo() })
    }
    return {
      type(text: string) {
        stack.record(text, { group: "typing" })
        show(text)
      },
      key(event: KeyboardEvent) {
        if (matchesShortcut(event, "mod+shift+z")) {
          show(stack.redo())
        } else if (matchesShortcut(event, "mod+z")) {
          show(stack.undo())
        } else {
          return
        }
        event.preventDefault()
      },
      seal: () => stack.seal(),
      undo: () => show(stack.undo()),
      redo: () => show(stack.redo()),
      fix() {
        stack.map((text) => text.replaceAll("teh", "the"))
        show(store.get().text.replaceAll("teh", "the"))
      },
      clear() {
        stack.reset("")
        show("")
      },
    }
  },
  slots: (slot) => ({
    input: slot({
      attrs: (state) => ({ value: state.text }),
      on: {
        input: (event, { api }) =>
          api.type((event.target as HTMLTextAreaElement).value),
        keydown: (event, { api }) => api.key(event),
        pointerup: (_event, { api }) => api.seal(),
      },
    }),
    undo: slot({
      attrs: (state) => ({
        type: "button",
        disabled: state.canUndo ? undefined : "",
      }),
      press: ({ api }) => api.undo(),
    }),
    redo: slot({
      attrs: (state) => ({
        type: "button",
        disabled: state.canRedo ? undefined : "",
      }),
      press: ({ api }) => api.redo(),
    }),
    fix: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.fix(),
    }),
    clear: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.clear(),
    }),
  }),
})

const parts = createParts(notes, {
  input: "textarea",
  undo: "button",
  redo: "button",
  fix: "button",
  clear: "button",
})

function Example() {
  return (
    <parts.Root>
      <div data-slot="stack">
        <div data-slot="controls">
          <parts.Undo>Undo</parts.Undo>
          <parts.Redo>Redo</parts.Redo>
          <parts.Fix>Fix “teh”</parts.Fix>
          <parts.Clear>Clear</parts.Clear>
        </div>
        <parts.Input
          aria-label="Notes"
          rows={3}
          placeholder="Type a few words, pause, and type more. Try “teh”."
        />
      </div>
    </parts.Root>
  )
}

export { Example, notes, type NotesState }
