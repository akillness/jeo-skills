// @vitest-environment jsdom
// Where Combobox's highlight goes: on open with `autoHighlight: "always"`,
// and as the list changes under a highlight `autoHighlight` placed or the user moved.
import { afterEach, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import type { OptionsOf } from "../src/foundation/kernel/primitive-types"
import { mount } from "../src/testing"
import { rerenderOf } from "../src/testing/mount"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

const markup = `<root>
  <label>Status</label>
  <input>
  <content><list></list></content>
</root>`

function view(options: OptionsOf<typeof combobox>) {
  const mounted = mount(combobox, options, markup)
  mounts.push(mounted)
  ;(mounted.part("input") as HTMLElement).focus()
  return mounted
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test('"always" highlights the selected item when the list opens, and arrows move from it', async () => {
  const combo = view({
    items: ["Backlog", "Todo", "Done"],
    defaultValue: "Todo",
    autoHighlight: "always",
  })
  await combo.keys("ArrowDown")
  await settle()
  expect(combo.state.highlighted).toBe("Todo")
  await combo.keys("ArrowDown")
  expect(combo.state.highlighted).toBe("Done")
})

test('"always" highlights the first item when nothing is selected', async () => {
  const combo = view({
    items: ["Backlog", "Todo", "Done"],
    autoHighlight: "always",
  })
  await combo.keys("ArrowDown")
  await settle()
  expect(combo.state.highlighted).toBe("Backlog")
})

test('"selected" highlights the selected item when the list opens, and arrows move from it', async () => {
  const combo = view({
    items: ["Backlog", "Todo", "Done"],
    defaultValue: "Todo",
    autoHighlight: "selected",
  })
  combo.api.setOpen(true)
  await settle()
  expect(combo.state.highlighted).toBe("Todo")
  await combo.keys("ArrowDown")
  expect(combo.state.highlighted).toBe("Done")
})

test('"selected" highlights nothing of its own when nothing is selected', async () => {
  const combo = view({
    items: ["Backlog", "Todo", "Done"],
    autoHighlight: "selected",
  })
  combo.api.setOpen(true)
  await settle()
  expect(combo.state.highlighted).toBeNull()
  combo.api.setOpen(false)
  await settle()
  await combo.keys("ArrowDown")
  await settle()
  expect(combo.state.highlighted).toBe("Backlog")
})

test("results that arrive while open take the highlight autoHighlight placed", async () => {
  const combo = view({ items: ["Apple"], autoHighlight: true })
  await combo.type("b")
  await settle()
  combo.api.internal.store.set({ items: ["Banana", "Blueberry"] })
  await settle()
  expect(combo.state.highlighted).toBe("Banana")
})

test("items appended while open leave a highlight the user moved", async () => {
  const combo = view({ items: ["Banana", "Blueberry"], autoHighlight: true })
  await combo.type("b")
  await settle()
  await combo.keys("ArrowDown")
  expect(combo.state.highlighted).toBe("Blueberry")
  combo.api.internal.store.set({
    items: ["Banana", "Blueberry", "Boysenberry"],
  })
  await settle()
  expect(combo.state.highlighted).toBe("Blueberry")
})

test("results that keep the first match's item still move the highlight to the new first match", async () => {
  const combo = view({ items: ["Apple", "Apricot"], autoHighlight: true })
  await combo.type("ap")
  await settle()
  expect(combo.state.highlighted).toBe("Apple")
  combo.api.internal.store.set({ items: ["Apex", "Apple"] })
  await settle()
  expect(combo.state.highlighted).toBe("Apex")
})

test("a highlight the user moved back to the first match stays as results arrive", async () => {
  const combo = view({ items: ["Banana", "Blueberry"], autoHighlight: true })
  await combo.type("b")
  await settle()
  await combo.keys("ArrowDown")
  await combo.keys("ArrowUp")
  expect(combo.state.highlighted).toBe("Banana")
  combo.api.internal.store.set({ items: ["Bacon", "Banana", "Blueberry"] })
  await settle()
  expect(combo.state.highlighted).toBe("Banana")
})

test("turning autoHighlight on after typing highlights the best match", async () => {
  const combo = view({
    items: ["Apple", "Banana", "Blueberry"],
    autoHighlight: false,
  })
  await combo.type("b")
  await settle()
  expect(combo.state.highlighted).toBeNull()
  rerenderOf(combo).setOptions({ autoHighlight: true })
  await settle()
  expect(combo.state.highlighted).toBe("Banana")
})

test("arrows still reach unchosen items once a multiple combobox is at maxSelected", async () => {
  const combo = view({
    items: ["Backlog", "Todo", "Done"],
    multiple: true,
    maxSelected: 2,
    defaultValue: ["Backlog", "Todo"],
  })
  await combo.keys("ArrowDown")
  await settle()
  expect(combo.state.highlighted).toBe("Backlog")
  await combo.keys("ArrowDown", "ArrowDown")
  expect(combo.state.highlighted).toBe("Done")
})

test("autoHighlight highlights the match for a controlled query once it arrives", async () => {
  let combo: ReturnType<typeof view>
  combo = view({
    items: ["Apple", "Banana", "Blueberry"],
    autoHighlight: true,
    query: "",
    onQueryChange: (query) =>
      queueMicrotask(() => rerenderOf(combo).setOptions({ query })),
  })
  await combo.type("b")
  await settle()
  expect(combo.state.highlighted).toBe("Banana")
  await combo.type("l")
  await settle()
  expect(combo.state.highlighted).toBe("Blueberry")
})
