import * as React from "react"
import {
  createViewport,
  css,
  definePrimitive,
  live,
  type Viewport,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type BoardState = { viewport: Viewport }

type BoardNoteProps = { value: string; x: number; y: number }

const home: Viewport = { x: 0, y: 0, zoom: 1 }

const board = definePrimitive({
  name: "board",
  state: (): BoardState => ({ viewport: home }),
  live: ["viewport"],
  api: (context) => {
    const viewport = createViewport<BoardState>(context, {
      key: "viewport",
      surface: () => context.element("root"),
    })
    return { viewport }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({
        tabindex: "0",
        "aria-roledescription": "board",
        style: css({
          position: "relative",
          overflow: "hidden",
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
    world: slot({
      attrs: () => ({
        style: css({ position: "absolute", left: "0", top: "0" }),
      }),
      live: live<BoardState, any, {}>((state, { api }) => ({
        style: api.viewport.style(state),
      })),
    }),
    note: slot<BoardNoteProps>({
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

const parts = createParts(board, {
  root: "div",
  world: "div",
  note: "div",
  reset: "button",
})

const Board = parts.Root

const BoardWorld = parts.World

const BoardNote = parts.Note

const BoardReset = parts.Reset

const notes = [
  { value: "plan", text: "Plan the launch", x: 24, y: 24 },
  { value: "copy", text: "Write the copy", x: 144, y: 80 },
  { value: "ship", text: "Ship it", x: 40, y: 136 },
  { value: "far", text: "Found me", x: 520, y: 320 },
]

function Example() {
  return (
    <Board aria-label="Board">
      <BoardWorld>
        {notes.map((note) => (
          <BoardNote key={note.value} value={note.value} x={note.x} y={note.y}>
            {note.text}
          </BoardNote>
        ))}
      </BoardWorld>
      <BoardReset data-size="sm">Reset View</BoardReset>
    </Board>
  )
}

export {
  Board,
  board,
  BoardNote,
  BoardReset,
  BoardWorld,
  Example,
  type BoardNoteProps,
  type BoardState,
}
