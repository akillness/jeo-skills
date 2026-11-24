import * as React from "react"
import {
  createViewport,
  css,
  definePrimitive,
  live,
  type Viewport,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type MapState = { viewport: Viewport }

type MapNoteProps = { value: string; x: number; y: number }

const home: Viewport = { x: 0, y: 0, zoom: 1 }

const map = definePrimitive({
  name: "map",
  state: (): MapState => ({ viewport: home }),
  live: ["viewport"],
  api: (context) => {
    const viewport = createViewport<MapState>(context, {
      key: "viewport",
      surface: () => context.element("root"),
    })
    return { viewport }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({
        tabindex: "0",
        "aria-roledescription": "map",
        style: css({
          position: "relative",
          overflow: "clip",
          "touch-action": "none",
        }),
      }),
      on: {
        wheel: (event, { api }) => api.viewport.wheel(event),
        pointerdown: (event, { el, api }) =>
          event.target === el && api.viewport.pointerdown(event),
        keydown: (event, { api }) => api.viewport.keydown(event),
      },
    }),
    pane: slot({
      attrs: () => ({
        style: css({
          position: "absolute",
          inset: "0",
          overflow: "scroll",
          "scrollbar-width": "none",
          "touch-action": "none",
          "pointer-events": "none",
        }),
      }),
      bind: (el, { api }) => api.viewport.bindFindable(el),
    }),
    world: slot({
      attrs: () => ({
        style: css({
          position: "absolute",
          left: "0",
          top: "0",
          "pointer-events": "auto",
        }),
      }),
      live: live<MapState, any, {}>((state, { api }) => ({
        style: api.viewport.style(state),
      })),
    }),
    note: slot<MapNoteProps>({
      props: { value: "string", x: "number", y: "number" },
      attrs: (_state, { props }) => ({
        style: css({
          position: "absolute",
          left: `${props.x}px`,
          top: `${props.y}px`,
        }),
      }),
    }),
    reset: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) =>
        api.viewport.setViewport(home, { reason: "imperative", event }),
    }),
  }),
})

const parts = createParts(map, {
  root: "div",
  pane: "div",
  world: "div",
  note: "div",
  reset: "button",
})

const notes = [
  { value: "harbor", text: "Harbor", x: 112, y: 88 },
  { value: "east", text: "East lighthouse", x: 760, y: 96 },
  { value: "south", text: "South lighthouse", x: 120, y: 640 },
  { value: "west", text: "West lighthouse", x: -560, y: 80 },
  { value: "north", text: "North lighthouse", x: 104, y: -480 },
]

function Example() {
  return (
    <div data-slot="stack">
      <p data-slot="hint">
        Search <span data-slot="viewport-term">lighthouse</span> with ⌘F or
        Ctrl+F
      </p>
      <parts.Root aria-label="Map">
        <parts.Pane>
          <parts.World>
            {notes.map((note) => (
              <parts.Note
                key={note.value}
                value={note.value}
                x={note.x}
                y={note.y}
              >
                {note.text}
              </parts.Note>
            ))}
          </parts.World>
        </parts.Pane>
        <parts.Reset data-size="sm">Reset View</parts.Reset>
      </parts.Root>
    </div>
  )
}

export { Example }
