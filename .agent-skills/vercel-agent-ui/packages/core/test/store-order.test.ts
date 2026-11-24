import { expect, test } from "vitest"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { tabs } from "../src/components/tabs/tabs"
import { subscribe } from "../src/foundation/kernel/part"
import { selects } from "../src/foundation/kernel/selects"

// A component's own listeners hear every change before any part, narrowed with
// `selects` or not, so what they write in turn is in place before any part looks.
// `expectNoMissedUpdates` catches missed updates, not reordered ones.

const panels = definePrimitive({
  name: "panels",
  state: () => ({ value: "a", exiting: [] as string[] }),
  api({ store }) {
    const heard: string[] = []
    let previous = store.get().value
    store.subscribe(() => {
      const { value } = store.get()
      if (value === previous) {
        return
      }
      const from = previous
      previous = value
      heard.push("api")
      store.set({ exiting: [from] })
    })
    return { heard, select: (value: string) => store.set({ value }) }
  },
  slots: (slot) => ({
    panel: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({
        value: ({ key }) => [key],
        exiting: ({ key }) => [key],
      }),
    }),
  }),
})

test("an api listener writes before the narrowed parts hear a change", () => {
  const instance = panels({ id: "p" })
  for (const value of ["a", "b"]) {
    subscribe(instance.part("panel", { value }), () =>
      instance.api.heard.push(`panel-${value}`)
    )
  }
  instance.api.select("b")
  expect(instance.api.heard).toEqual(["api", "panel-a", "panel-a", "panel-b"])
})

const list = definePrimitive({
  name: "list",
  state: () => ({ highlighted: null as string | null }),
  api: ({ store }) => ({
    highlight: (key: string) => store.set({ highlighted: key }),
  }),
  slots: (slot) => ({
    item: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ highlighted: ({ key }) => [key] }),
    }),
  }),
})

test("a component listener that subscribes after a narrowed part still hears first", () => {
  const instance = list({ id: "l" })
  const heard: string[] = []
  subscribe(instance.part("item", { value: "a" }), () => heard.push("part"))
  instance.subscribe(() => heard.push("component"))
  instance.api.highlight("a")
  expect(heard).toEqual(["component", "part"])
})

const plain = definePrimitive({
  name: "plain",
  state: () => ({ count: 0 }),
  api: ({ store }) => ({
    increment: () => store.set({ count: store.get().count + 1 }),
  }),
  slots: (slot) => ({ root: slot({}) }),
})

test("a component listener that subscribes after a part without selects still hears first", () => {
  const instance = plain({ id: "c" })
  const heard: string[] = []
  subscribe(instance.part("root"), () => heard.push("part"))
  instance.subscribe(() => heard.push("component"))
  instance.api.increment()
  expect(heard).toEqual(["component", "part"])
})

test("a tab panel is exiting by the time any panel hears the switch", () => {
  const instance = tabs({ id: "t", defaultValue: "a" })
  instance.api.internal.registerPanel("a")
  instance.api.internal.registerPanel("b")
  const heard: string[] = []
  for (const value of ["a", "b"]) {
    subscribe(instance.part("panel", { value }), () => {
      const { value: selected, exiting } = instance.get() as {
        value: string
        exiting: string[]
      }
      heard.push(`panel-${value} sees ${selected}, exiting [${exiting}]`)
    })
  }
  instance.api.select("b")
  expect(heard).toEqual([
    "panel-a sees b, exiting [a]",
    "panel-a sees b, exiting [a]",
    "panel-b sees b, exiting [a]",
  ])
})
