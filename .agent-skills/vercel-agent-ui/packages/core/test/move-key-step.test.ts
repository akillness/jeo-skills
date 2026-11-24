// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import {
  createChange,
  createMove,
  definePrimitive,
  type MovePoint,
} from "../src/index"
import { bind } from "../src/foundation/kernel/part"

afterEach(() => {
  document.body.innerHTML = ""
})

const board = definePrimitive({
  name: "half-grid",
  state: (options: { defaultPositions: Record<string, MovePoint> }) => ({
    positions: options.defaultPositions,
    moving: null,
  }),
  options: { defaultPositions: "value" },
  live: ["moving"],
  api: (context) => {
    const change = createChange(context)
    return {
      move: createMove(context, {
        key: "positions",
        draft: "moving",
        step: () => 0.5,
        set: (value, details) => change("positions", value, details),
      }),
    }
  },
  slots: (slot) => ({
    item: slot<{ value: string }>({
      props: { value: "string" },
      on: { keydown: (event, { api, key }) => api.move.keydown(event, key) },
    }),
  }),
})

test("Alt with an arrow nudges by a step below 1 and lands on that grid", () => {
  const instance = board({
    id: "b",
    defaultPositions: { a: { x: 4.5, y: 0 } },
  })
  const el = document.createElement("div")
  document.body.append(el)
  bind(instance.part("item", { value: "a" }), el)
  const press = (key: string) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key, altKey: true, bubbles: true })
    )
  press("ArrowRight")
  press("ArrowRight")
  press("ArrowDown")
  expect(instance.get().positions.a).toEqual({ x: 5.5, y: 0.5 })
})
