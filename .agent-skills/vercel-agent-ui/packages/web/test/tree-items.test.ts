// @vitest-environment jsdom
// A page that renders on every change sets `items` again each time. The same
// items render nothing new, and new ones keep focus on the item that had it.
import { beforeAll, expect, test } from "vitest"
import { defineTreeElements } from "../src/tree"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

type TreeElement = HTMLElement & { items: unknown }

const items = (done: string[] = []) => [
  { value: "a", label: `A${done.includes("a") ? " done" : ""}` },
  { value: "b", label: `B${done.includes("b") ? " done" : ""}` },
  { value: "c", label: `C${done.includes("c") ? " done" : ""}` },
]

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineTreeElements()
})

async function mount() {
  document.body.innerHTML = `<ui-tree aria-label="Tasks"></ui-tree>`
  const tree = document.body.firstElementChild as TreeElement
  tree.items = items()
  await wait()
  const item = (value: string) =>
    tree.querySelector<HTMLElement>(`ui-tree-item[value="${value}"]`)!
  return { tree, item }
}

test("setting the same items again keeps every item element", async () => {
  const { tree, item } = await mount()
  const before = item("c")
  tree.items = tree.items
  await wait()
  expect(item("c")).toBe(before)
})

test("new items keep focus on the item that had it", async () => {
  const { tree, item } = await mount()
  item("c").focus()
  expect(document.activeElement).toBe(item("c"))
  tree.items = items(["c"])
  await wait()
  expect(item("c").textContent).toContain("C done")
  expect(document.activeElement).toBe(item("c"))
})

test("checking an item from the keyboard, with a page that renders new items back, keeps focus on it", async () => {
  document.body.innerHTML = `<ui-tree aria-label="Tasks" checkable mode="none"></ui-tree>`
  const tree = document.body.firstElementChild as TreeElement
  tree.items = items()
  tree.addEventListener("checkedchange", (event) => {
    tree.items = items((event as CustomEvent<{ value: string[] }>).detail.value)
  })
  await wait()
  const item = (value: string) =>
    tree.querySelector<HTMLElement>(`ui-tree-item[value="${value}"]`)!
  item("c").focus()
  item("c").dispatchEvent(
    new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })
  )
  await wait()
  expect(item("c").textContent).toContain("C done")
  expect(document.activeElement).toBe(item("c"))
})

test("new items keep focus on a nested item that had it", async () => {
  const nested = (label: string) => [
    { value: "a", label: "A", children: [{ value: "a1", label }] },
  ]
  document.body.innerHTML = `<ui-tree aria-label="Tasks" default-expanded="a"></ui-tree>`
  const tree = document.body.firstElementChild as TreeElement
  tree.items = nested("A1")
  await wait()
  tree.querySelector<HTMLElement>('ui-tree-item[value="a1"]')!.focus()
  tree.items = nested("A1 done")
  await wait()
  expect(document.activeElement?.getAttribute("value")).toBe("a1")
})
