// @vitest-environment jsdom
// State set from script, through a live property or a state attribute, commits
// without events, like a native input's `value`. The `api` and people still fire them.
import { beforeAll, expect, test } from "vitest"
import type { UiToggleGroupElement } from "../src/events"
import { defineAccordionElements } from "../src/accordion"
import {
  defineCheckboxElements,
  defineCheckboxGroupElements,
} from "../src/checkbox"
import { defineToggleGroupElements } from "../src/toggle"

;(Element.prototype as { getAnimations?: () => Animation[] }).getAnimations ??=
  () => []
// jsdom has no form values, which a checkbox sets.
ElementInternals.prototype.setFormValue ??= () => {}
ElementInternals.prototype.setValidity ??= () => {}

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

beforeAll(() => defineToggleGroupElements())

async function mount() {
  document.body.innerHTML = `<ui-toggle-group aria-label="Layout" value="list"><ui-toggle value="list"><button>List</button></ui-toggle><ui-toggle value="board"><button>Board</button></ui-toggle></ui-toggle-group>`
  await wait()
  const group = document.body.firstElementChild as UiToggleGroupElement
  const heard: string[][] = []
  group.addEventListener("valuechange", (event) =>
    heard.push(event.detail.value)
  )
  return { group, heard }
}

test("setting the value property commits without an event", async () => {
  const { group, heard } = await mount()
  group.value = ["board"]
  expect(group.value).toEqual(["board"])
  expect(heard).toEqual([])
})

test("setting the value attribute commits without an event", async () => {
  const { group, heard } = await mount()
  group.setAttribute("value", "board")
  expect(group.value).toEqual(["board"])
  expect(heard).toEqual([])
})

test("a page that renders the value back from its listener hears each change once", async () => {
  const { group, heard } = await mount()
  group.addEventListener("valuechange", (event) => {
    group.value = [...event.detail.value]
  })
  group
    .querySelector<HTMLButtonElement>('ui-toggle[value="board"] button')!
    .click()
  expect(heard).toEqual([["board"]])
  expect(group.value).toEqual(["board"])
})

test("the api and presses still fire events", async () => {
  const { group, heard } = await mount()
  group.api.setValue(["board"])
  group
    .querySelector<HTMLButtonElement>('ui-toggle[value="list"] button')!
    .click()
  expect(heard).toEqual([["board"], ["list"]])
})

test("setting an accordion's value fires no openchange on its items", async () => {
  defineAccordionElements()
  document.body.innerHTML = `<ui-accordion><ui-accordion-item value="a"><ui-accordion-header><h3><ui-accordion-trigger><button>A</button></ui-accordion-trigger></h3></ui-accordion-header><ui-accordion-panel>A</ui-accordion-panel></ui-accordion-item></ui-accordion>`
  await wait()
  const root = document.body.firstElementChild as HTMLElement & {
    value: string[]
  }
  const item = root.firstElementChild!
  const heard: string[] = []
  item.addEventListener("openchange", (event) => {
    heard.push("item")
    event.preventDefault()
  })
  root.addEventListener("valuechange", () => heard.push("root"))
  root.value = ["a"]
  expect(root.value).toEqual(["a"])
  expect(heard).toEqual([])
})

test("checking a grouped checkbox from script fires no valuechange on its group", async () => {
  defineCheckboxElements()
  defineCheckboxGroupElements()
  document.body.innerHTML = `<ui-checkbox-group aria-label="Toppings"><ui-checkbox value="cheese"></ui-checkbox><ui-checkbox value="olives"></ui-checkbox></ui-checkbox-group>`
  await wait()
  const group = document.body.firstElementChild as HTMLElement & {
    value: string[]
  }
  const olives = group.lastElementChild as HTMLElement & { checked: boolean }
  const heard: string[] = []
  for (const type of ["input", "change", "checkedchange", "valuechange"]) {
    group.addEventListener(
      type,
      (event) => heard.push(`${type} ${(event.target as Element).localName}`),
      true
    )
  }
  olives.checked = true
  expect(group.value).toEqual(["olives"])
  expect(heard).toEqual([])
})
