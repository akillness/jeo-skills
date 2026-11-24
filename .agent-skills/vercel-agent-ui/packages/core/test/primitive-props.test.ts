import { describe, expect, test } from "vitest"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import {
  attrs,
  bind,
  present,
  ref as partRef,
  subscribe,
} from "../src/foundation/kernel/part"

// A list of items whose api reads an item's latest props, like a menu
// reading an item's `onSelect` when it's activated.
const list = definePrimitive({
  name: "list",
  state: () => ({ highlighted: null as string | null }),
  api: (context) => ({
    itemProps: (key: string) => context.props("item", key),
  }),
  slots: (slot) => ({
    item: slot<{ label?: string }>({ props: { label: "string" } }),
  }),
})

const element = () => ({ isConnected: true }) as unknown as HTMLElement

const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve))

// What the instance keeps for a part: its props, and its ref, which is the
// same function while it's kept.
function kept(
  instance: ReturnType<typeof list>,
  keys: string[],
  refs: Map<string, unknown>
) {
  return keys.filter(
    (key) =>
      instance.api.itemProps(key) !== undefined ||
      partRef(instance.part("item", { id: key }), { by: "core" }) ===
        refs.get(key)
  )
}

describe("parts that leave", () => {
  test("binding and unbinding 100 parts with new keys keeps nothing of them", async () => {
    const instance = list({ id: "l" })
    const keys = Array.from({ length: 100 }, (_, index) => `item-${index}`)
    const refs = new Map<string, unknown>()
    for (const key of keys) {
      const props = { id: key, label: key }
      attrs(instance.part("item", props))
      const ref = partRef(instance.part("item", props), { by: "core" })
      refs.set(key, ref)
      ref(element())
      const unsubscribe = subscribe(instance.part("item", props), () => {})
      ref(null)
      unsubscribe()
    }
    expect(instance.api.itemProps("item-99")).toEqual({
      id: "item-99",
      label: "item-99",
    })
    await microtask()
    expect(kept(instance, keys, refs)).toEqual([])
  })

  test("a part that binds again in the same task, like a moved element, keeps its props and ref", async () => {
    const instance = list({ id: "l" })
    const props = { id: "a", label: "A" }
    attrs(instance.part("item", props))
    const ref = partRef(instance.part("item", props), { by: "core" })
    ref(element())
    ref(null)
    ref(element())
    await microtask()
    expect(instance.api.itemProps("a")).toBe(props)
    expect(partRef(instance.part("item", props), { by: "core" })).toBe(ref)
  })

  test("an unbound part that still listens, like closed content kept mounted, keeps its props", async () => {
    const instance = list({ id: "l" })
    const props = { id: "a", label: "A" }
    const unsubscribe = subscribe(instance.part("item", props), () => {})
    bind(instance.part("item", props), element())()
    await microtask()
    expect(instance.api.itemProps("a")).toBe(props)
    unsubscribe()
    await microtask()
    expect(instance.api.itemProps("a")).toBeUndefined()
  })

  test("a ref called again after its part was forgotten, like content Suspense showed again, binds with the props it last rendered with", async () => {
    const instance = list({ id: "l" })
    const first = { id: "a", label: "First" }
    const last = { id: "a", label: "Last" }
    partRef(instance.part("item", first), { by: "core" })
    const ref = partRef(instance.part("item", last), { by: "core" })
    const el = element()
    ref(el)
    ref(null)
    await microtask()
    expect(instance.api.itemProps("a")).toBeUndefined()
    ref(el)
    expect(instance.api.itemProps("a")).toBe(last)
    expect(partRef(instance.part("item", last), { by: "core" })).toBe(ref)
  })

  test("a part that renders again before it's forgotten and binds after keeps the props it rendered with", async () => {
    const instance = list({ id: "l" })
    const first = { id: "a", label: "First" }
    const ref = partRef(instance.part("item", first), { by: "core" })
    const el = element()
    ref(el)
    ref(null)
    const again = { id: "a", label: "Again" }
    expect(partRef(instance.part("item", again), { by: "core" })).toBe(ref)
    await microtask()
    ref(el)
    expect(instance.api.itemProps("a")).toBe(again)
  })

  test("a part that subscribes again after it was forgotten gets its props back", async () => {
    const instance = list({ id: "l" })
    const props = { id: "a", label: "A" }
    const part = instance.part("item", props)
    subscribe(part, () => {})()
    await microtask()
    expect(instance.api.itemProps("a")).toBeUndefined()
    subscribe(part, () => {})
    expect(instance.api.itemProps("a")).toBe(props)
  })

  test("a part whose key changes needs a new subscription, so the old key is let go", () => {
    const instance = list({ id: "l" })
    expect(instance.part("item", { id: "a" })).not.toBe(
      instance.part("item", { id: "b" })
    )
  })

  test("a part bound again while it unbinds, like a web component rebinding as its state changes, keeps its element", () => {
    let unbinding = () => {}
    const trigger = definePrimitive({
      name: "trigger",
      state: () => ({}),
      api: (context) => ({ element: () => context.element("trigger") }),
      slots: (slot) => ({ trigger: slot({ bind: () => () => unbinding() }) }),
    })
    const instance = trigger({ id: "t" })
    const el = element()
    const unbind = bind(instance.part("trigger"), el)
    unbinding = () => {
      unbinding = () => {}
      bind(instance.part("trigger"), el)
    }
    unbind()
    expect(instance.api.element()).toBe(el)
  })

  test("a part that never binds, like one rendered on the server, keeps its props", async () => {
    const instance = list({ id: "l" })
    const props = { id: "a", label: "A" }
    present(instance.part("item", props))
    attrs(instance.part("item", props))
    await microtask()
    expect(instance.api.itemProps("a")).toBe(props)
  })
})
