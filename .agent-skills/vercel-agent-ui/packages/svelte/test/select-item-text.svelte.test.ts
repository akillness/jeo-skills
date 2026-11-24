// An unkeyed each reuses an item's component for another value, so its text
// follows what it renders now.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import ComboboxApp from "./apps/combobox-item-text-app.svelte"
import App from "./apps/select-item-text-app.svelte"

test("an item's text follows its content when the item is reused", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const props = $state({ items: ["apple", "banana", "cherry"] })
  const app = mount(App, { target, props })
  flushSync()
  await new Promise((done) => setTimeout(done))
  props.items = ["banana", "cherry"]
  flushSync()
  await new Promise((done) => setTimeout(done))
  const options = [...document.querySelectorAll('[role="option"]')]
  expect(options.map((option) => option.textContent?.trim())).toEqual([
    "BANANA",
    "CHERRY",
  ])
  expect(
    options.map((option) =>
      option
        .querySelector("[data-slot='select-item-text']")
        ?.textContent?.trim()
    )
  ).toEqual(["BANANA", "CHERRY"])
  unmount(app)
  target.remove()
})

test("a reused item's text follows its content while a search marks it", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const props = $state({ items: ["banana", "blackberry", "blueberry"] })
  const app = mount(ComboboxApp, { target, props })
  flushSync()
  const input = target.querySelector<HTMLInputElement>('[role="combobox"]')!
  const type = (value: string) => {
    input.value = value
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText" })
    )
    flushSync()
  }
  type("b")
  await new Promise((done) => setTimeout(done))
  type("be")
  props.items = ["blackberry", "blueberry"]
  flushSync()
  await new Promise((done) => setTimeout(done))
  flushSync()
  const texts = [
    ...document.querySelectorAll("[data-slot='combobox-item-text']"),
  ].map((text) => text.textContent?.trim())
  expect(texts).toEqual(["blackberry", "blueberry"])
  unmount(app)
  target.remove()
})
