// A `$state` items array changed in place, like `items.push(...)` or
// `items[0].label = "..."`, reaches what a keyboard or a press does, not only
// what the rows show.
import { flushSync, mount, unmount, type ComponentProps } from "svelte"
import { afterEach, describe, expect, test } from "vitest"
import App from "./apps/data-lists-app.svelte"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

type Row = {
  value: string
  label: string
  disabled?: boolean
  children?: Row[]
}

function render(initial: ComponentProps<typeof App>) {
  const target = document.body.appendChild(document.createElement("div"))
  const props = $state(initial)
  const app = mount(App, { target, props })
  cleanup = () => {
    unmount(app)
    target.remove()
  }
  flushSync()
  return { target, items: props.items as Row[] }
}

const settle = async () => {
  flushSync()
  await new Promise((resolve) => setTimeout(resolve))
  flushSync()
}

const rowNamed = (role: string, name: string) =>
  [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)].find(
    (row) => row.textContent?.trim() === name
  )
const press = (key: string) =>
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true })
  )
const focused = () => document.activeElement?.textContent?.trim()

describe("a data list changed in place", () => {
  test("a listbox won't select an item disabled in place", async () => {
    const picked: unknown[] = []
    const { items } = render({
      component: "Listbox",
      items: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta", disabled: false },
        { value: "c", label: "Gamma" },
      ],
      onValueChange: (value) => picked.push(value),
    })
    items[1].disabled = true
    await settle()
    rowNamed("option", "Beta")!.click()
    await settle()
    expect(picked).toEqual([])
  })

  test("a listbox's End reaches an item pushed in place", async () => {
    const { items } = render({
      component: "Listbox",
      items: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ],
    })
    items.push({ value: "c", label: "Gamma" })
    await settle()
    rowNamed("option", "Alpha")!.focus()
    press("End")
    await settle()
    expect(focused()).toBe("Gamma")
  })

  test("a listbox keeps its rows and focus through a change in place", async () => {
    const { items } = render({
      component: "Listbox",
      items: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ],
    })
    const row = rowNamed("option", "Beta")!
    row.focus()
    items[0].label = "Changed"
    items.push({ value: "c", label: "Gamma" })
    await settle()
    expect(rowNamed("option", "Beta")).toBe(row)
    expect(document.activeElement).toBe(row)
  })

  test("a select's value shows a label changed in place", async () => {
    const { target, items } = render({
      component: "Select",
      items: [{ value: "a", label: "Alpha" }],
    })
    items[0].label = "Changed"
    await settle()
    expect(
      target.querySelector('[data-slot="select-value"]')!.textContent!.trim()
    ).toBe("Changed")
  })

  test("a combobox filters an item pushed in place", async () => {
    const { target, items } = render({
      component: "Combobox",
      items: [{ value: "a", label: "Alpha" }],
    })
    const input = target.querySelector("input")!
    input.value = "Gam"
    input.dispatchEvent(new InputEvent("input", { bubbles: true }))
    await settle()
    items.push({ value: "g", label: "Gamma" })
    await settle()
    expect(
      [...document.querySelectorAll('[role="option"]')].map((row) =>
        row.textContent?.trim()
      )
    ).toEqual(["Gamma"])
  })

  test("a tree's arrow keys reach a child pushed in place", async () => {
    const { items } = render({
      component: "Tree",
      items: [
        {
          value: "a",
          label: "Alpha",
          children: [{ value: "a1", label: "One" }],
        },
      ],
    })
    items[0].children!.push({ value: "a2", label: "Two" })
    await settle()
    const label = (row: Element | null) =>
      row?.querySelector('[data-slot="tree-label"]')?.textContent?.trim()
    const rows = [
      ...document.querySelectorAll<HTMLElement>('[role="treeitem"]'),
    ]
    rows.find((row) => label(row) === "One")!.focus()
    press("ArrowDown")
    await settle()
    expect(label(document.activeElement)).toBe("Two")
  })
})
