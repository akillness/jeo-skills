import { definePrimitive } from "@ui-sdk/core"
import { render } from "@solidjs/web"
import { flush } from "solid-js"
import { expect, test } from "vitest"
import { usePart, usePrimitive } from "../src/use-primitive"

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

test("state derived as new objects renders once per change to their values", () => {
  let instance!: ReturnType<typeof plot>
  let renders = 0
  const root = document.createElement("div")
  const dispose = render(() => {
    const handle = usePrimitive(plot, () => ({}))
    instance = handle.instance
    return usePart(handle, "marker", () => ({}), {
      class: (state) => (renders++, `x-${state.point.x}-${state.points[0]!.x}`),
    })
  }, root)
  flush()
  expect(root.querySelector(".x-0-0")).not.toBeNull()
  expect(renders).toBe(1)

  instance.api.move(4)
  flush()
  expect(root.querySelector(".x-4-4")).not.toBeNull()
  expect(renders).toBe(2)

  instance.api.rename("Sprint")
  flush()
  expect(renders).toBe(2)
  dispose()
})
