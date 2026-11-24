import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import { budgets } from "../../../tests/perf/budgets"
import App from "./apps/fanout-app.svelte"
import { reactive } from "./apps/state.svelte"

// The adapter's fan-out, like packages/core/test/store-fanout.test.ts for the
// store: a change reaches the parts it affects and no others. Same bound at
// every size, so work that grows with the item count fails at the larger one.
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
}
const key = (event: string, target = document.activeElement ?? document.body) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: event,
      bubbles: true,
      cancelable: true,
    })
  )

let target: HTMLElement
let app: ReturnType<typeof mount>
const updated = new Map<string, number>()
async function render(props: {
  n: number
  kind: "select" | "listbox" | "data"
  items?: string[]
}) {
  updated.clear()
  target = document.createElement("div")
  document.body.append(target)
  const reactiveProps = reactive({
    ...props,
    updated: (key: string) => updated.set(key, (updated.get(key) ?? 0) + 1),
  })
  app = mount(App, { target, props: reactiveProps })
  await settle()
  return reactiveProps
}
afterEach(() => {
  unmount(app)
  target.remove()
})

for (const n of [10, 500]) {
  test(`moving the highlight in an open select updates only options that read it (n=${n})`, async () => {
    await render({ n, kind: "select" })
    target.querySelector<HTMLElement>('[data-slot="select-trigger"]')!.click()
    await settle()
    const options = document.querySelectorAll('[role="option"]')
    expect(options).toHaveLength(n)
    updated.clear()
    for (let i = 0; i < 10; i++) {
      key("ArrowDown")
      await settle()
    }
    const plain = [...updated.keys()].filter(
      (name) => Number(name.slice(5)) % 2 === 1
    )
    const watched = [...updated.values()].reduce((sum, count) => sum + count, 0)
    expect(plain, "plain options updated for a highlight change").toEqual([])
    expect(watched).toBeLessThanOrEqual(
      budgets["select.arrow-key"].renders.watched
    )
  })

  test(`selecting one listbox item updates that item and the one that held the tab stop (n=${n})`, async () => {
    await render({ n, kind: "listbox" })
    const options = [...target.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options).toHaveLength(n)
    updated.clear()
    options[2].focus()
    options[2].click()
    await settle()
    expect(options[2].getAttribute("aria-selected")).toBe("true")
    expect([...updated.keys()].sort()).toEqual(["item-1", "item-3"])
  })
}

test("items that change while a select is open keep the list open and follow the new order", async () => {
  const items = ["apple", "banana", "cherry"]
  const props = await render({ n: 3, kind: "select", items })
  target.querySelector<HTMLElement>('[data-slot="select-trigger"]')!.click()
  await settle()
  expect(
    [...document.querySelectorAll('[role="option"]')].map(
      (el) => el.textContent
    )
  ).toEqual(items)
  props.items = [...items].reverse()
  await settle()
  expect(
    [...document.querySelectorAll('[role="option"]')].map(
      (el) => el.textContent
    )
  ).toEqual([...items].reverse())
})

test("items that change while a data select is open keep the list open and follow the new order", async () => {
  const items = ["apple", "banana", "cherry"]
  const props = await render({ n: 3, kind: "data", items })
  target.querySelector<HTMLElement>('[data-slot="select-trigger"]')!.click()
  await settle()
  expect(
    [...document.querySelectorAll('[role="option"]')].map(
      (el) => el.textContent
    )
  ).toEqual(items)
  props.items = [...items].reverse()
  await settle()
  expect(
    [...document.querySelectorAll('[role="option"]')].map(
      (el) => el.textContent
    )
  ).toEqual([...items].reverse())
})
