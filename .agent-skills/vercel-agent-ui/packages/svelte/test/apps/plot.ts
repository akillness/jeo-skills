import { definePrimitive } from "@ui-sdk/core"

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

export { plot }
