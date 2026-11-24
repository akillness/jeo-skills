// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { definePrimitive } from "@ui-sdk/core"
import { usePart, usePrimitive, type PrimitiveHandle } from "../src/primitive"

// A part's state may derive a new array on every read, like one column's
// cards filtered from all of them. It renders when the items change, not on
// every read.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

type Card = { id: string; column: string }

const board = definePrimitive({
  name: "derived-state",
  state: (_options: {}) => ({ cards: [] as Card[], title: "" }),
  api: ({ store }) => ({
    add: (card: Card) => store.set({ cards: [...store.get().cards, card] }),
    rename: (title: string) => store.set({ title }),
  }),
  slots: (slot) => ({
    column: slot<{ value: string }, { cards: Card[] }>({
      props: { value: "string" },
      state: (state, { key }) => ({
        cards: state.cards.filter((card) => card.column === key),
      }),
    }),
  }),
})

let root: Root | undefined
let handle: PrimitiveHandle<typeof board> | undefined
let renders = 0

function Column() {
  return usePart(
    handle!,
    "column",
    { value: "todo" },
    {
      children: (state) => {
        renders++
        return state.cards.map((card) => card.id).join(",")
      },
    }
  )
}

function Example() {
  handle = usePrimitive(board, {})
  return <Column />
}

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

test("state derived as a new array renders once per change to its items", async () => {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(<Example />))
  expect(renders).toBe(1)

  await React.act(async () => handle!.api.add({ id: "a", column: "todo" }))
  expect(container.textContent).toBe("a")
  expect(renders).toBe(2)

  // A card elsewhere, or another key, leaves the column's items as they were.
  await React.act(async () => handle!.api.add({ id: "b", column: "done" }))
  await React.act(async () => handle!.api.rename("Sprint"))
  expect(renders).toBe(2)
})

type Point = { x: number }

const plot = definePrimitive({
  name: "derived-objects",
  state: (_options: {}) => ({ x: 0, title: "" }),
  api: ({ store }) => ({
    move: (x: number) => store.set({ x }),
    rename: (title: string) => store.set({ title }),
  }),
  slots: (slot) => ({
    marker: slot<{}, { point: Point; points: Point[] }>({
      state: (state) => ({ point: { x: state.x }, points: [{ x: state.x }] }),
    }),
  }),
})

test("state derived as new objects renders once per change to their values", async () => {
  let plotHandle: PrimitiveHandle<typeof plot> | undefined
  let markerRenders = 0
  function Marker() {
    return usePart(
      plotHandle!,
      "marker",
      {},
      {
        children: (state) => {
          markerRenders++
          return `${state.point.x},${state.points[0]!.x}`
        },
      }
    )
  }
  function Plot() {
    plotHandle = usePrimitive(plot, {})
    return <Marker />
  }
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(<Plot />))
  expect(container.textContent).toBe("0,0")
  expect(markerRenders).toBe(1)

  await React.act(async () => plotHandle!.api.move(4))
  expect(container.textContent).toBe("4,4")
  expect(markerRenders).toBe(2)

  await React.act(async () => plotHandle!.api.rename("Sprint"))
  expect(markerRenders).toBe(2)
})

type GraphNode = { x: number; self?: GraphNode }

// A node that points at itself, built anew on every read.
const graph = definePrimitive({
  name: "derived-cycles",
  state: (_options: {}) => ({ x: 0, title: "" }),
  api: ({ store }) => ({
    move: (x: number) => store.set({ x }),
    rename: (title: string) => store.set({ title }),
  }),
  slots: (slot) => ({
    node: slot<{}, { node: GraphNode }>({
      state: (state) => {
        const node: GraphNode = { x: state.x }
        node.self = node
        return { node }
      },
    }),
  }),
})

test("state derived as new cyclic objects renders once per change, without overflowing", async () => {
  let graphHandle: PrimitiveHandle<typeof graph> | undefined
  let nodeRenders = 0
  function NodePart() {
    return usePart(
      graphHandle!,
      "node",
      {},
      {
        children: (state) => {
          nodeRenders++
          return String(state.node.self!.x)
        },
      }
    )
  }
  function Graph() {
    graphHandle = usePrimitive(graph, {})
    return <NodePart />
  }
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(<Graph />))
  expect(container.textContent).toBe("0")
  expect(nodeRenders).toBe(1)

  await React.act(async () => graphHandle!.api.move(3))
  expect(container.textContent).toBe("3")
  expect(nodeRenders).toBe(2)

  await React.act(async () => graphHandle!.api.rename("Sprint"))
  expect(nodeRenders).toBe(2)
})
