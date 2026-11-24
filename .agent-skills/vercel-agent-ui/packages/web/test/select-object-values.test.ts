// @vitest-environment jsdom
// A select item's `value` is a property too, so it can hold an object that
// `isItemEqualToValue` matches, with its attribute as the fallback.
import { beforeAll, expect, test } from "vitest"
import type { UiSelectElement } from "../src/events"
import { defineSelectElements } from "../src/select"

type Member = { id: number; name: string }

const members: Member[] = [
  { id: 1, name: "Hollis Grant" },
  { id: 2, name: "Inès Moreau" },
]

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineSelectElements()
})

async function mount() {
  document.body.innerHTML = `
    <ui-select>
      <ui-select-trigger><button></button></ui-select-trigger>
      <ui-select-content>
        <ui-select-item>Hollis Grant<ui-select-item-indicator>✓</ui-select-item-indicator></ui-select-item>
        <ui-select-item>Inès Moreau<ui-select-item-indicator>✓</ui-select-item-indicator></ui-select-item>
      </ui-select-content>
    </ui-select>`
  const select = document.querySelector("ui-select") as UiSelectElement
  const items = Array.from(document.querySelectorAll("ui-select-item"))
  select.itemToValue = (member) => String((member as Member).id)
  select.itemToLabel = (member) => (member as Member).name
  select.isItemEqualToValue = (item, value) =>
    (item as Member).id === (value as Member).id
  items.forEach((item, index) => (item.value = members[index]))
  await wait()
  return { select, items, button: document.querySelector("button")! }
}

test("an item holding an object matches an equal value through isItemEqualToValue, with its check shown", async () => {
  const { select, items, button } = await mount()
  select.value = { ...members[1] }
  await wait()
  expect(items.map((item) => item.getAttribute("aria-selected"))).toEqual([
    "false",
    "true",
  ])
  expect(
    items[1]
      .querySelector("ui-select-item-indicator")!
      .hasAttribute("data-selected")
  ).toBe(true)
  expect(button.textContent).toBe("Inès Moreau")
})

test("choosing an item holding an object sets that object as the value", async () => {
  const { select, items, button } = await mount()
  const values: unknown[] = []
  select.addEventListener("valuechange", (event) =>
    values.push(event.detail.value)
  )
  button.click()
  await wait()
  items[0].click()
  await wait()
  expect(values).toEqual([members[0]])
  expect(values[0]).toBe(members[0])
})

test("an item's value reads its attribute until the property is set", async () => {
  document.body.innerHTML = `<ui-select><ui-select-item value="hollis">Hollis Grant</ui-select-item></ui-select>`
  const item = document.querySelector("ui-select-item")!
  expect(item.value).toBe("hollis")
  item.value = members[0]
  expect(item.value).toBe(members[0])
})
