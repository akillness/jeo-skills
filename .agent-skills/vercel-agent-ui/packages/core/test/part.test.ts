import { describe, expect, test } from "vitest"
import {
  attrs,
  bind,
  onProps,
  partState,
  selectedKeys,
} from "../src/foundation/kernel/part"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { selects } from "../src/foundation/kernel/selects"

const list = definePrimitive({
  name: "list",
  state: () => ({ selected: null as string | null }),
  api: () => ({}),
  slots: (slot) => ({
    item: slot<{ label: string; value?: string }, { selected: boolean }>({
      props: { label: "string", value: "string" },
      attrs: (state, { props }) => ({ "aria-label": props.label }),
      state: (state, { props }) => ({
        selected: state.selected === props.value,
      }),
      selects: selects({
        selected: ({ props }) =>
          props.value === undefined ? [] : [props.value],
      }),
    }),
    label: slot({}),
  }),
})

describe("parts", () => {
  test("renders of one key share a part, which reads the newest render's props", () => {
    const instance = list({ id: "l" })
    const first = instance.part("item", { id: "a", label: "First" })
    const last = instance.part("item", { id: "a", label: "Last" })
    expect(last).toBe(first)
    expect(attrs(last)).toEqual({
      "data-slot": "list-item",
      "aria-label": "Last",
    })
  })

  test("reads with the props they're given, like the ones a framework committed", () => {
    const instance = list({ id: "l" })
    const part = instance.part("item", { id: "a", label: "Newest" })
    expect(attrs(part, { id: "a", label: "Committed" })["aria-label"]).toBe(
      "Committed"
    )
    expect(partState(part)).toEqual({ selected: false })
  })

  test("a part's selected keys are empty without selects, and change with the values it selects on", () => {
    const instance = list({ id: "l" })
    expect(selectedKeys(instance.part("label"))).toBe("")
    const part = instance.part("item", { id: "a", label: "A", value: "x" })
    const before = selectedKeys(part)
    instance.part("item", { id: "a", label: "A", value: "y" })
    expect(selectedKeys(part)).not.toBe(before)
  })
})

const finder = definePrimitive({
  name: "finder",
  state: () => ({}),
  api: (context) => ({ find: (key?: string) => context.element("item", key) }),
  slots: (slot) => ({
    item: slot<{ value: string }>({ props: { value: "string" } }),
  }),
})

describe("elements and renders", () => {
  test("element() finds only an element in the page, by key or not", () => {
    const instance = finder({ id: "f" })
    bind(instance.part("item", { value: "a" }), {
      isConnected: false,
    } as HTMLElement)
    expect([instance.api.find("a"), instance.api.find()]).toEqual([
      undefined,
      undefined,
    ])
  })

  test("every onProps listener hears each render", () => {
    const instance = list({ id: "l" })
    const part = instance.part("label")
    const heard: string[] = []
    onProps(part, () => heard.push("first"))
    const stop = onProps(part, () => heard.push("second"))
    instance.part("label")
    stop()
    instance.part("label")
    expect(heard).toEqual(["first", "second", "first"])
  })
})
