// @vitest-environment jsdom
// A list that renders some of the items itself, like a virtualized one,
// keeps them in whichever order the list, its rows and `items` arrive.
import { beforeAll, expect, test } from "vitest"
import type { UiSelectElement } from "../src/events"
import { defineSelectElements } from "../src/select"

const items = Array.from({ length: 50 }, (_, index) => ({
  value: `item-${index}`,
  label: `Item ${index}`,
}))

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineSelectElements()
})

function mount() {
  document.body.innerHTML = `
    <ui-select>
      <ui-select-trigger><button></button></ui-select-trigger>
      <ui-select-content>
        <ui-select-list><div></div></ui-select-list>
      </ui-select-content>
    </ui-select>`
  const select = document.querySelector("ui-select") as UiSelectElement
  const rows = document.querySelector("ui-select-list > div")!
  const renderRows = () => {
    for (const [index, item] of items.slice(0, 5).entries()) {
      rows.insertAdjacentHTML(
        "beforeend",
        `<ui-select-item value="${item.value}" label="${item.label}" index="${index}">${item.label}</ui-select-item>`
      )
    }
  }
  const options = () => Array.from(document.querySelectorAll("ui-select-item"))
  return { select, renderRows, options }
}

test("a list keeps the rows it renders inside a wrapper when items are set after them", async () => {
  const { select, renderRows, options } = mount()
  renderRows()
  select.items = items
  await wait()
  expect(options()).toHaveLength(5)
  expect(options()[0].getAttribute("aria-setsize")).toBe("50")
})

test("items rendered from data leave once the list renders rows of its own", async () => {
  const { select, renderRows, options } = mount()
  select.items = items
  await wait()
  expect(options()).toHaveLength(50)
  renderRows()
  await wait()
  expect(options()).toHaveLength(5)
  expect(options()[0].getAttribute("aria-setsize")).toBe("50")
})
