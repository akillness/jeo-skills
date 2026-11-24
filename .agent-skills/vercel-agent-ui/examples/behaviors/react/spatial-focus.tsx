import * as React from "react"
import {
  createRovingFocus,
  definePrimitive,
  selects,
  spatialMove,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type PinboardState = { focused: string | null }

const pinboard = definePrimitive({
  name: "pinboard",
  state: (): PinboardState => ({ focused: null }),
  api: (context) => ({
    roving: createRovingFocus<PinboardState, { value: string }>(context, {
      slot: "note",
      key: "focused",
      move: spatialMove(),
    }),
  }),
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "group" }) }),
    note: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        type: "button",
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: { keydown: (event, { el, api }) => api.roving.keydown(event, el!) },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(pinboard, { root: "div", note: "button" })

const Pinboard = parts.Root

const PinboardNote = parts.Note

const notes = [
  { text: "Call Hollis", x: 8, y: 12 },
  { text: "Ship docs", x: 62, y: 6 },
  { text: "Lunch", x: 36, y: 44 },
  { text: "Review", x: 4, y: 70 },
  { text: "Gym", x: 70, y: 64 },
]

function Example() {
  return (
    <Pinboard aria-label="Notes">
      {notes.map((note) => (
        <PinboardNote
          key={note.text}
          value={note.text}
          style={{ left: `${note.x}%`, top: `${note.y}%` }}
        >
          {note.text}
        </PinboardNote>
      ))}
    </Pinboard>
  )
}

export { Example, pinboard, Pinboard, PinboardNote, type PinboardState }
