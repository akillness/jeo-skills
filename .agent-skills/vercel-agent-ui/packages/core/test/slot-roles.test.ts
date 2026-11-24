// @vitest-environment jsdom
// What development builds check of a slot's declared role, for definitions
// the types can't see, like JavaScript or a spread slot, and for elements.
import { readdirSync } from "node:fs"
import path from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { definePrimitive, live } from "../src/index"
import { listbox } from "../src/components/listbox/listbox-root"
import { mount } from "../src/testing/mount"
import { partAttrs } from "../src/testing"

const flags = globalThis as { __UI_SDK_STRICT__?: boolean }
const mounts: { unmount: () => void }[] = []

afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
  delete flags.__UI_SDK_STRICT__
  vi.restoreAllMocks()
})

const warnings = () => {
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
  return () => spy.mock.calls.map(([message]) => String(message))
}

// A slot as JavaScript writes it, past the types.
const loose = (slot: object) => slot as never

test("writes the declared role, from state too, over one in attrs", () => {
  const read = warnings()
  const sep = definePrimitive({
    name: "sep",
    state: () => ({ decorative: false }),
    api: ({ store }) => ({ decorate: () => store.set({ decorative: true }) }),
    slots: (slot) => ({
      root: slot({
        role: (state) => (state.decorative ? "none" : "separator"),
        roles: ["none", "separator"],
      }),
      label: slot(loose({ role: "note", attrs: () => ({ role: "status" }) })),
    }),
  })
  const instance = sep({ id: "s" })
  expect(partAttrs(instance.part("root")).role).toBe("separator")
  instance.api.decorate()
  expect(partAttrs(instance.part("root")).role).toBe("none")
  expect(partAttrs(instance.part("label")).role).toBe("note")
  expect(read()).toEqual([
    expect.stringContaining(
      'the "label" part declares its role, and its `attrs` writes one too'
    ),
  ])
})

test("warns once per need a role's slot doesn't meet", () => {
  const read = warnings()
  definePrimitive({
    name: "picker",
    state: () => ({}),
    api: () => ({}),
    slots: (slot) => ({
      list: slot(loose({ role: "listbox", keys: ["ArrowDown"] })),
      item: slot(loose({ role: "option" })),
      typo: slot(loose({ role: "lisbox" })),
      picked: slot(loose({ role: () => "none" })),
    }),
  })
  expect(read()).toEqual([
    expect.stringContaining(
      'the "list" part is a listbox, which lists `keys`, so its slot needs an `on.keydown`'
    ),
    expect.stringContaining(
      'the "item" part is an option, which takes focus, so its slot needs `focus`'
    ),
    expect.stringContaining(
      'the "item" part is an option, which activates, so its slot needs `press`'
    ),
    expect.stringContaining(
      'the "typo" part\'s role "lisbox" isn\'t a WAI-ARIA role'
    ),
    expect.stringContaining(
      'the "picked" part picks its role from state, so its slot lists every role it can pick'
    ),
  ])
})

test("warns about keys no keydown handles, on a role the types don't ask for keys", () => {
  const read = warnings()
  definePrimitive({
    name: "keyed",
    state: () => ({}),
    api: () => ({}),
    slots: (slot) => ({ group: slot({ role: "group", keys: ["Enter"] }) }),
  })
  expect(read()).toEqual([
    expect.stringContaining(
      'the "group" part is a group, which lists `keys`, so its slot needs an `on.keydown`'
    ),
  ])
})

test("warns when a role picked from state isn't one the slot lists", () => {
  const read = warnings()
  const pick = definePrimitive({
    name: "pick",
    state: () => ({}),
    api: () => ({}),
    slots: (slot) => ({
      root: slot(loose({ role: () => "status", roles: ["none"] })),
    }),
  })
  partAttrs(pick({ id: "p" }).part("root"))
  expect(read()).toEqual([
    expect.stringContaining(
      "picked the role \"status\", which its slot's `roles` doesn't list"
    ),
  ])
})

test("warns once about ARIA a part's role doesn't take, or a state it renders without", () => {
  const read = warnings()
  const press = () => {}
  const aria = definePrimitive({
    name: "aria",
    state: () => ({ decorative: false, on: false }),
    api: ({ store }) => ({ decorate: () => store.set({ decorative: true }) }),
    slots: (slot) => ({
      // A role from state: the types can't tell which one, so this checks each.
      line: slot({
        role: (state) => (state.decorative ? "none" : "separator"),
        roles: ["none", "separator"],
        attrs: () => ({ "aria-orientation": "vertical" }),
      }),
      box: slot(loose({ role: "checkbox", focus: "native", press })),
      unset: slot({
        role: "option",
        focus: "roving",
        press,
        attrs: () => ({ "aria-selected": undefined }),
      }),
      range: slot({
        role: "slider",
        focus: "native",
        keys: ["ArrowUp"],
        on: { keydown: () => {} },
        attrs: () => ({ type: "range", "aria-valuenow": undefined }),
      }),
      written: slot({
        role: "option",
        focus: "roving",
        press,
        attrs: () => ({ "aria-selected": undefined }),
        live: live(() => ({ "aria-selected": "false" })),
      }),
    }),
  })
  const instance = aria({ id: "a" })
  for (const name of ["line", "box", "unset", "range", "written"] as const) {
    partAttrs(instance.part(name))
  }
  expect(read()).toEqual([
    expect.stringContaining(
      'the "box" part is a checkbox, which needs `aria-checked`'
    ),
    expect.stringContaining(
      'the "unset" part is an option, which needs `aria-selected`'
    ),
  ])
  instance.api.decorate()
  partAttrs(instance.part("line"))
  partAttrs(instance.part("line"))
  expect(read().slice(2)).toEqual([
    expect.stringContaining(
      'the "line" part is a none, which doesn\'t take `aria-orientation`'
    ),
  ])
})

test("checks the element can take focus the way the slot says", async () => {
  const read = warnings()
  const press = () => {}
  const buttons = definePrimitive({
    name: "buttons",
    state: () => ({}),
    api: () => ({}),
    slots: (slot) => ({
      native: slot({ role: "button", focus: "native", press }),
      roving: slot({
        role: "tab",
        focus: "roving",
        press,
        attrs: () => ({ "aria-selected": "false" }),
      }),
      stop: slot({
        role: "tab",
        focus: "roving",
        press,
        attrs: () => ({ tabindex: "-1", "aria-selected": "false" }),
      }),
    }),
  })
  mounts.push(
    mount(
      buttons,
      {},
      '<native as="button">OK</native><native>Div</native><roving>A</roving><stop>B</stop>'
    )
  )
  await new Promise((done) => setTimeout(done))
  expect(read()).toEqual([
    expect.stringContaining(
      'the "native" part\'s focus is "native", but a <div> doesn\'t take focus on its own'
    ),
    expect.stringContaining(
      'the "roving" part\'s focus is "roving", but its <div> has no tabindex'
    ),
  ])
})

test("throws instead of warning when strict, as in tests", () => {
  flags.__UI_SDK_STRICT__ = true
  expect(() =>
    definePrimitive({
      name: "strict",
      state: () => ({}),
      api: () => ({}),
      slots: (slot) => ({
        item: slot(loose({ role: "option", focus: "roving" })),
      }),
    })
  ).toThrow(
    '[ui-sdk] strict: the "item" part is an option, which activates, so its slot needs `press`.'
  )
})

test("doesn't ask a part that can't take focus now for a tabindex, like a disabled list's option", async () => {
  const read = warnings()
  mounts.push(
    mount(
      listbox,
      { disabled: true },
      '<root aria-label="Fruit"><item value="a">Apple</item></root>'
    )
  )
  await new Promise((done) => setTimeout(done))
  expect(read()).toEqual([])
})

test("listbox declares its roles and what they need", () => {
  const read = warnings()
  const instance = listbox({ id: "l" })
  expect(partAttrs(instance.part("root")).role).toBe("listbox")
  expect(partAttrs(instance.part("item", { value: "a" })).role).toBe("option")
  expect(partAttrs(instance.part("separator")).role).toBe("none")
  expect(read()).toEqual([])
})

test("every component's slots meet what their roles need", async () => {
  const read = warnings()
  const components = path.join(import.meta.dirname, "../src/components")
  for (const file of readdirSync(components, { recursive: true })) {
    if (typeof file === "string" && file.endsWith(".ts")) {
      await import(path.join(components, file))
    }
  }
  expect(read()).toEqual([])
})
