// @vitest-environment node
import { definePrimitive } from "@ui-sdk/core"
import { menu } from "@ui-sdk/core/menu"
import { menuCheckable, press } from "@ui-sdk/core/renderer"
import { createRenderer } from "vue"
import { describe, expect, test } from "vitest"
import { defineComponent, h, nextTick, ref } from "vue"
import { usePart, usePrimitive } from "../src/use-primitive"

// Just enough of a renderer to mount components in Node: elements keep their
// children, and text nodes their text.
type FakeNode = { text: string; children: FakeNode[]; parent: FakeNode | null }
const fakeNode = (text = ""): FakeNode => ({ text, children: [], parent: null })
const { createApp } = createRenderer<FakeNode, FakeNode>({
  createElement: () => fakeNode(),
  createText: (text) => fakeNode(text),
  createComment: () => fakeNode(),
  setText: (node, text) => (node.text = text),
  setElementText: (node, text) => {
    node.children = []
    node.text = text
  },
  insert(child, parent, anchor) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
  },
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) =>
    node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp() {},
})
const textOf = (node: FakeNode): string =>
  node.text + node.children.map(textOf).join("")

describe("a part's state", () => {
  test("a part that takes another key hears its new key's changes, even when only another component reads its state", async () => {
    let instance: ReturnType<typeof menu> | undefined
    const value = ref("a")
    let state: { checked: boolean } | undefined
    const Item = defineComponent({
      props: { value: { type: String, required: true } },
      setup(props) {
        state = usePart(menu, "checkbox-item", () => ({
          value: props.value,
        })).state
        return () => null
      },
    })
    // Reads the item's state from outside the item, so nothing but that read
    // ties it to the item's props.
    let renders = 0
    const Reader = defineComponent({
      setup: () => () => (renders++, state!.checked ? "checked" : "unchecked"),
    })
    const Menu = defineComponent({
      setup(_, { slots }) {
        instance = usePrimitive(menu, () => ({})).instance
        // The checkbox item parts register their feature when they render.
        instance.use(menuCheckable)
        return () => slots.default?.()
      },
    })
    const root = fakeNode()
    const app = createApp({
      setup: () => () =>
        h(Menu, () => [h(Item, { value: value.value }), h(Reader)]),
    })
    app.mount(root)
    expect(textOf(root)).toBe("unchecked")

    value.value = "b"
    await nextTick()
    press(instance!.part("checkbox-item", { value: "b" }))?.()
    await nextTick()
    expect(textOf(root)).toBe("checked")

    // The old key's changes no longer reach it.
    const before = renders
    press(instance!.part("checkbox-item", { value: "a" }))?.()
    await nextTick()
    expect(renders).toBe(before)
    app.unmount()
  })

  test("state derived as a new array renders once per change to its items", async () => {
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
    let instance: ReturnType<typeof board> | undefined
    let renders = 0
    const Column = defineComponent({
      setup() {
        const column = usePart(board, "column", () => ({ value: "todo" }))
        return () => (
          renders++,
          column.state.cards.map((card) => card.id).join(",")
        )
      },
    })
    const Board = defineComponent({
      setup() {
        instance = usePrimitive(board, () => ({})).instance
        return () => h(Column)
      },
    })
    const root = fakeNode()
    const app = createApp(Board)
    app.mount(root)
    expect(renders).toBe(1)

    instance!.api.add({ id: "a", column: "todo" })
    await nextTick()
    expect(textOf(root)).toBe("a")
    expect(renders).toBe(2)

    // A card elsewhere, or another key, leaves the column's items as they were.
    instance!.api.add({ id: "b", column: "done" })
    instance!.api.rename("Sprint")
    await nextTick()
    expect(renders).toBe(2)
    app.unmount()
  })

  test("state derived as new objects renders once per change to their values", async () => {
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
          state: (state) => ({
            point: { x: state.x },
            points: [{ x: state.x }],
          }),
        }),
      }),
    })
    let instance: ReturnType<typeof plot> | undefined
    let renders = 0
    const Marker = defineComponent({
      setup() {
        const marker = usePart(plot, "marker")
        return () => (
          renders++,
          `${marker.state.point.x},${marker.state.points[0]!.x}`
        )
      },
    })
    const Plot = defineComponent({
      setup() {
        instance = usePrimitive(plot, () => ({})).instance
        return () => h(Marker)
      },
    })
    const root = fakeNode()
    const app = createApp(Plot)
    app.mount(root)
    expect(textOf(root)).toBe("0,0")
    expect(renders).toBe(1)

    instance!.api.move(4)
    await nextTick()
    expect(textOf(root)).toBe("4,4")
    expect(renders).toBe(2)

    instance!.api.rename("Sprint")
    await nextTick()
    expect(renders).toBe(2)
    app.unmount()
  })
})
