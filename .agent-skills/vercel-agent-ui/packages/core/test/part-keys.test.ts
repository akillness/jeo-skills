// @vitest-environment jsdom
// Parts of one slot are told apart by their keys: an id, else a value of any type.
import { afterEach, expect, test, vi } from "vitest"
import { attrs, bind, handlers, ref } from "../src/foundation/kernel/part"
import { definePrimitive } from "../src/foundation/kernel/primitive"

const pressed: unknown[] = []

const list = definePrimitive({
  name: "list",
  state: () => ({}),
  api: () => ({}),
  slots: (slot) => ({
    item: slot<{ value?: unknown; label?: string }>({
      props: { value: "value", label: "string" },
      attrs: (_, { props }) => ({ "aria-label": props.label }),
      press: ({ props }) => pressed.push(props.value),
    }),
    separator: slot({ attrs: () => ({ role: "separator" }) }),
  }),
})

const element = () => document.body.appendChild(document.createElement("div"))
const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve))

afterEach(() => {
  pressed.length = 0
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

test("parts valued 1 and 2 are two parts, and a press reads its own part's props", () => {
  const instance = list({ id: "l" })
  const first = instance.part("item", { value: 1, label: "One" })
  const second = instance.part("item", { value: 2, label: "Two" })
  expect(first).not.toBe(second)
  handlers(first).click!(new Event("click"))
  expect(attrs(first)["aria-label"]).toBe("One")
  expect(pressed).toEqual([1])
})

test("a value that isn't a string keys its part by its text", () => {
  const instance = list({ id: "l" })
  expect(instance.part("item", { value: 1 }).key).toBe("1")
  expect(
    instance.part("item", { value: ["2026-01-01", "2026-01-07"] }).key
  ).toBe("2026-01-01,2026-01-07")
  expect(instance.part("item", { value: false }).key).toBe("false")
  expect(instance.part("item", {}).key).toBe("")
})

test("two elements in the page binding parts of one key warn", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const instance = list({ id: "l" })
  bind(instance.part("item", { value: "a" }), element())
  bind(instance.part("item", { value: "a" }), element())
  await settle()
  expect(warn).toHaveBeenCalledOnce()
  expect(warn.mock.calls[0][0]).toContain(
    'two "item" parts share the key "a". Give each an id or a unique value.'
  )
})

test("a framework's ref handing parts of one key two elements in the page warns", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const instance = list({ id: "l" })
  const host = { by: "framework", attaches: "all" } as const
  ref(instance.part("item", { value: "a" }), host)(element())
  ref(instance.part("item", { value: "a" }), host)(element())
  await settle()
  expect(warn).toHaveBeenCalledOnce()
})

test("an element that replaces one that left the page, or parts with no key, don't warn", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const instance = list({ id: "l" })
  const host = { by: "framework", attaches: "all" } as const
  const callback = ref(instance.part("item", { value: "a" }), host)
  const first = element()
  callback(first)
  first.remove()
  callback(element())
  bind(instance.part("separator"), element())
  bind(instance.part("separator"), element())
  await settle()
  expect(warn).not.toHaveBeenCalled()
})

// A calendar whose week starts on another day moves each weekday header, so
// the header that showed the last column shows the one before it.
test("an update that hands a part to another element before that element's next part binds doesn't warn", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const instance = list({ id: "l" })
  const host = { by: "framework", attaches: "all" } as const
  const last = ref(instance.part("item", { value: "6" }), host)
  const before = ref(instance.part("item", { value: "5" }), host)
  const [moved, other] = [element(), element()]
  last(other)
  last(moved)
  before(other)
  await settle()
  expect(warn).not.toHaveBeenCalled()
})
