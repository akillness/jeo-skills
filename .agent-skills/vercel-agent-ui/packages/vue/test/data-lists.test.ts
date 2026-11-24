// @vitest-environment jsdom
// A `reactive` items array changed in place, like `items.push(...)` or
// `items[0].label = "..."`, reaches what a keyboard or a press does, not only
// what the rows show, while a list replaced or left alone works as before.
import { afterEach, describe, expect, test } from "vitest"
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  type App,
} from "vue"
import { Combobox, ComboboxInput } from "../src/combobox"
import { Listbox } from "../src/listbox"
import { Select, SelectTrigger } from "../src/select"
import { Tree } from "../src/tree"

Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

type Row = { value: string; label: string; disabled?: boolean }

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

async function mount(render: () => unknown) {
  const el = document.body.appendChild(document.createElement("div"))
  app = createApp(defineComponent({ setup: () => render }))
  app.mount(el)
  await settle()
  return el
}

const settle = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve))
  await nextTick()
}

const rowNamed = (role: string, name: string) =>
  [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)].find(
    (row) => row.textContent === name
  )
const press = (key: string) =>
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true })
  )
const focused = () => document.activeElement?.textContent

describe("a data list changed in place", () => {
  test("a listbox won't select an item disabled in place", async () => {
    const items = reactive<Row[]>([
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta", disabled: false },
      { value: "c", label: "Gamma" },
    ])
    const picked: unknown[] = []
    await mount(() =>
      h(Listbox, {
        "aria-label": "Letters",
        items,
        onValueChange: (value: unknown) => picked.push(value),
      })
    )
    items[1].disabled = true
    await settle()
    rowNamed("option", "Beta")!.click()
    await settle()
    expect(picked).toEqual([])
  })

  test("a listbox's End reaches an item pushed in place", async () => {
    const items = reactive<Row[]>([
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ])
    await mount(() => h(Listbox, { "aria-label": "Letters", items }))
    items.push({ value: "c", label: "Gamma" })
    await settle()
    rowNamed("option", "Alpha")!.focus()
    press("End")
    await settle()
    expect(focused()).toBe("Gamma")
  })

  test("a listbox keeps its rows and focus through a change in place", async () => {
    const items = reactive<Row[]>([
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ])
    await mount(() => h(Listbox, { "aria-label": "Letters", items }))
    const row = rowNamed("option", "Beta")!
    row.focus()
    items[0].label = "Changed"
    items.push({ value: "c", label: "Gamma" })
    await settle()
    expect(rowNamed("option", "Beta")).toBe(row)
    expect(document.activeElement).toBe(row)
  })

  test("a select's value shows a label changed in place", async () => {
    const items = reactive<Row[]>([{ value: "a", label: "Alpha" }])
    await mount(() => h(Select, { items, value: "a" }, () => h(SelectTrigger)))
    items[0].label = "Changed"
    await settle()
    expect(
      document.querySelector('[data-slot="select-value"]')!.textContent
    ).toBe("Changed")
  })

  test("a combobox filters an item pushed in place", async () => {
    const items = reactive(["apple", "banana"])
    const el = await mount(() =>
      h(Combobox, { items, defaultOpen: true }, () => h(ComboboxInput))
    )
    const input = el.querySelector("input")!
    input.value = "ch"
    input.dispatchEvent(new InputEvent("input", { bubbles: true }))
    await settle()
    items.push("cherry")
    await settle()
    expect(
      [...document.querySelectorAll('[role="option"]')].map(
        (row) => row.textContent
      )
    ).toEqual(["cherry"])
  })

  test("a tree's arrow keys reach a child pushed in place", async () => {
    const items = reactive<
      { value: string; label: string; children?: Row[] }[]
    >([
      { value: "a", label: "Alpha", children: [{ value: "a1", label: "One" }] },
    ])
    await mount(() =>
      h(Tree, { "aria-label": "Letters", items, defaultExpanded: ["a"] })
    )
    items[0].children!.push({ value: "a2", label: "Two" })
    await settle()
    const label = (row: Element | null) =>
      row?.querySelector('[data-slot="tree-label"]')?.textContent
    const rows = [
      ...document.querySelectorAll<HTMLElement>('[role="treeitem"]'),
    ]
    rows.find((row) => label(row) === "One")!.focus()
    press("ArrowDown")
    await settle()
    expect(label(document.activeElement)).toBe("Two")
  })
})
