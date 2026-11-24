// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { combobox } from "../src/components/combobox/combobox"
import { CREATE } from "../src/components/combobox/combobox-api"
import { listbox } from "../src/components/listbox/listbox-root"
import { mount } from "../src/testing/mount"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
const items = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo", disabled: true },
  { value: "done", label: "Done" },
]

test("a combobox highlights an item from code once its list is open", async () => {
  const heard: unknown[] = []
  const combo = mount(
    combobox,
    { items, onHighlight: (value) => heard.push(value) },
    `<root><label>Status</label><input><content><list></list></content></root>`
  )
  mounts.push(combo)
  expect(combo.api.highlight("done")).toBe(false)
  combo.api.setOpen(true)
  await settle()
  expect(combo.api.highlight("done")).toBe(true)
  expect(combo.api.getHighlighted()).toBe("done")
  expect(heard.at(-1)).toBe("done")
  expect(combo.api.highlight("todo")).toBe(false)
  expect(combo.api.highlight("missing")).toBe(false)
  expect(combo.api.highlight(null)).toBe(true)
  expect(combo.api.getHighlighted()).toBe(null)
})

test("a combobox highlights only the items its query shows, and no action", async () => {
  const combo = mount(
    combobox,
    { items, defaultOpen: true },
    `<root><label>Status</label><input><content><list></list><create></create></content></root>`
  )
  mounts.push(combo)
  combo.api.setQuery("Back")
  await settle()
  expect(combo.api.highlight("done")).toBe(false)
  expect(combo.api.highlight("backlog")).toBe(true)
  combo.api.internal.listbox.highlight(CREATE)
  expect(combo.api.getHighlighted()).toBe(null)
})

test("an autocomplete highlights a suggestion from code once it's open", async () => {
  const auto = mount(
    autocomplete,
    { items: ["Apple", "Banana", "Cherry"], defaultOpen: true },
    `<root><input aria-label="Fruit"><content><list></list></content></root>`
  )
  mounts.push(auto)
  await settle()
  expect(auto.api.highlight("Cherry")).toBe(true)
  expect(auto.api.getHighlighted()).toBe("Cherry")
  expect(auto.state.highlighted).toBe("Cherry")
})

test("a listbox highlights an option from code, or gives it the tab stop while focus is outside", async () => {
  const list = mount(
    listbox,
    { activation: "manual" },
    `<root aria-label="Status"><item value="backlog">Backlog</item><item value="todo" disabled>Todo</item><item value="done">Done</item></root>`
  )
  mounts.push(list)
  await settle()
  expect(list.api.highlight("done")).toBe(true)
  expect(list.api.getHighlighted()).toBe(null)
  expect(list.part("item", "done")!.getAttribute("tabindex")).toBe("0")
  list.part("item", "backlog")!.focus()
  expect(list.api.highlight("done")).toBe(true)
  expect(document.activeElement).toBe(list.part("item", "done"))
  expect(list.api.getHighlighted()).toBe("done")
  expect(list.api.highlight("todo")).toBe(false)
  expect(list.api.getValue()).toBe(null)
})

test("a listbox called from a control that just took focus gives the option the tab stop", async () => {
  const list = mount(
    listbox,
    { activation: "manual" },
    `<root aria-label="Status"><item value="backlog">Backlog</item><item value="done">Done</item></root>`
  )
  mounts.push(list)
  const button = document.body.appendChild(document.createElement("button"))
  button.addEventListener("focus", () => list.api.highlight("done"))
  await settle()
  list.part("item", "backlog")!.focus()
  button.focus()
  await settle()
  expect(document.activeElement).toBe(button)
  expect(list.part("item", "done")!.getAttribute("tabindex")).toBe("0")
})
