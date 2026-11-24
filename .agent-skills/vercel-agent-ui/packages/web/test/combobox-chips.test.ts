// @vitest-environment jsdom
// A chips part renders a chip per value until the page renders chips of its
// own, even when the page's chip list starts empty.
import { beforeAll, expect, test } from "vitest"
import { defineComboboxElements } from "../src/combobox"
import type { UiComboboxElement } from "../src/events"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineComboboxElements()
})

async function mount() {
  document.body.innerHTML = `
    <ui-combobox multiple>
      <ui-combobox-label>Labels</ui-combobox-label>
      <ui-combobox-chips><ui-combobox-input><input /></ui-combobox-input></ui-combobox-chips>
      <ui-combobox-content>
        <ui-combobox-list>
          <ui-combobox-item value="bug">Bug</ui-combobox-item>
          <ui-combobox-item value="docs">Docs</ui-combobox-item>
        </ui-combobox-list>
      </ui-combobox-content>
    </ui-combobox>`
  await wait()
  const combobox = document.querySelector("ui-combobox") as UiComboboxElement
  const chips = () =>
    Array.from(combobox.querySelectorAll("ui-combobox-chip")).map(
      (chip) => chip.textContent
    )
  return { combobox, chips }
}

test("an empty chips part renders a chip for each value", async () => {
  const { combobox, chips } = await mount()
  combobox.api.setValue(["bug", "docs"])
  await wait()
  expect(chips()).toEqual(["Bug×", "Docs×"])
})

test("the page's own chips stay as the page rendered them, though its list started empty", async () => {
  const { combobox, chips } = await mount()
  const part = combobox.querySelector("ui-combobox-chips")!
  combobox.addEventListener("valuechange", (event) => {
    for (const chip of part.querySelectorAll(".page")) {
      chip.remove()
    }
    for (const value of event.detail.value as string[]) {
      const chip = document.createElement("ui-combobox-chip")
      chip.className = "page"
      chip.setAttribute("value", value)
      chip.textContent = `#${value}`
      part.prepend(chip)
    }
  })
  combobox.api.setValue(["bug"])
  expect(chips()).toEqual(["#bug"])
  combobox.api.setValue(["bug", "docs"])
  expect(chips()).toEqual(["#docs", "#bug"])
})

test("the page's own chips inside a wrapper stay as the page rendered them", async () => {
  const { combobox, chips } = await mount()
  const part = combobox.querySelector("ui-combobox-chips")!
  const wrapper = document.createElement("div")
  part.prepend(wrapper)
  combobox.addEventListener("valuechange", (event) => {
    wrapper.replaceChildren(
      ...(event.detail.value as string[]).map((value) => {
        const chip = document.createElement("ui-combobox-chip")
        chip.setAttribute("value", value)
        chip.textContent = `#${value}`
        return chip
      })
    )
  })
  combobox.api.setValue(["bug"])
  await wait()
  expect(chips()).toEqual(["#bug"])
  combobox.api.setValue(["bug", "docs"])
  await wait()
  expect(chips()).toEqual(["#bug", "#docs"])
})

test("the page's own chips stay alone when the page renders them after setting the value", async () => {
  const { combobox, chips } = await mount()
  const part = combobox.querySelector("ui-combobox-chips")!
  ;(combobox as unknown as { value: string[] }).value = ["bug"]
  const chip = document.createElement("ui-combobox-chip")
  chip.setAttribute("value", "bug")
  chip.textContent = "#bug"
  part.prepend(chip)
  await wait()
  expect(chips()).toEqual(["#bug"])
})
