// @vitest-environment jsdom
// Data rows keep their own components as a filter changes which show.
import { afterEach, expect, test, vi } from "vitest"
import { createApp, defineComponent, h, nextTick, type App } from "vue"
import { Combobox, ComboboxInput } from "../src/combobox"

Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

const settle = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve))
  await nextTick()
}

async function mount(render: () => unknown) {
  const el = document.body.appendChild(document.createElement("div"))
  app = createApp(defineComponent({ setup: () => render }))
  app.mount(el)
  await settle()
  return el
}

test("groups that share a label keep their own rows as a filter changes", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const items = [
    { type: "group" as const, label: "Fruit", items: ["apple", "apricot"] },
    { type: "group" as const, label: "Vegetable", items: ["carrot", "celery"] },
    { type: "group" as const, label: "Fruit", items: ["banana", "blueberry"] },
  ]
  const el = await mount(() =>
    h(Combobox, { items, defaultOpen: true }, () => h(ComboboxInput))
  )
  const input = el.querySelector("input")!
  for (const query of ["ca", "e"]) {
    input.value = query
    input.dispatchEvent(new InputEvent("input", { bubbles: true }))
    await settle()
  }
  const duplicates = warn.mock.calls.filter(([message]) =>
    String(message).includes("Duplicate keys")
  )
  warn.mockRestore()
  expect(duplicates).toEqual([])
  expect(
    [...document.querySelectorAll('[role="option"]')].map(
      (row) => row.textContent
    )
  ).toEqual(["apple", "celery", "blueberry"])
})

test("an item's other fields stay off its element", async () => {
  const items = [
    { value: "a", label: "Apple", innerHTML: "<img src=x>", title: "Injected" },
  ]
  await mount(() =>
    h(Combobox, { items, defaultOpen: true }, () => h(ComboboxInput))
  )
  const option = document.querySelector('[role="option"]')!
  expect(option.textContent).toBe("Apple")
  expect(option.querySelector("img")).toBeNull()
  expect(option.hasAttribute("title")).toBe(false)
})
