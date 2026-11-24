import * as React from "react"
import { createUndoStack, definePrimitive, matchesShortcut } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type PixelsState = {
  painted: string[]
  canUndo: boolean
  canRedo: boolean
}

const pixels = definePrimitive({
  name: "pixels",
  state: (): PixelsState => ({ painted: [], canUndo: false, canRedo: false }),
  api: (context) => {
    const { store } = context
    const stack = createUndoStack<string[]>([])
    const show = (painted: string[] | undefined) => {
      if (painted) {
        store.set({ painted })
      }
      store.set({ canUndo: stack.canUndo(), canRedo: stack.canRedo() })
    }
    const api = {
      toggle(cell: string) {
        const { painted } = store.get()
        const next = painted.includes(cell)
          ? painted.filter((other) => other !== cell)
          : [...painted, cell]
        stack.record(next)
        show(next)
      },
      undo: () => show(stack.undo()),
      redo: () => show(stack.redo()),
      keydown(event: KeyboardEvent) {
        if (matchesShortcut(event, "mod+z")) {
          api.undo()
        } else if (
          matchesShortcut(event, "mod+shift+z") ||
          matchesShortcut(event, "control+y")
        ) {
          api.redo()
        } else {
          return
        }
        event.preventDefault()
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot({ on: { keydown: (event, { api }) => api.keydown(event) } }),
    cell: slot<{ value: string }, { painted: boolean }>({
      props: { value: "string" },
      state: (state, { key }) => ({ painted: state.painted.includes(key) }),
      attrs: (state, { key }) => ({
        type: "button",
        "aria-pressed": String(state.painted.includes(key)),
        "data-painted": state.painted.includes(key) ? "" : undefined,
      }),
      press: ({ api, key }) => api.toggle(key),
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
  }),
})

const parts = createParts(pixels, {
  root: "div",
  cell: "button",
  undo: "button",
  redo: "button",
})

const Pixels = parts.Root

const PixelsCell = parts.Cell

const PixelsUndo = parts.Undo

const PixelsRedo = parts.Redo

const cells = Array.from(
  { length: 36 },
  (_, index) => `${Math.floor(index / 6)}:${index % 6}`
)

function Example() {
  return (
    <Pixels>
      <div data-slot="controls">
        <PixelsUndo data-size="sm">Undo</PixelsUndo>
        <PixelsRedo data-size="sm">Redo</PixelsRedo>
      </div>
      <div role="group" aria-label="Pixels" data-slot="undo-grid">
        {cells.map((cell) => (
          <PixelsCell
            key={cell}
            value={cell}
            aria-label={`Row ${Number(cell[0]) + 1}, column ${Number(cell[2]) + 1}`}
          />
        ))}
      </div>
    </Pixels>
  )
}

export {
  Example,
  pixels,
  Pixels,
  PixelsCell,
  PixelsRedo,
  PixelsUndo,
  type PixelsState,
}
