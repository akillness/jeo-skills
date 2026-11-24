// @vitest-environment jsdom
// `<ui-button>`'s `action` event says how the button was pressed, for the
// changes a listener makes after an `await`.
import { expect, test } from "vitest"
import type { UiButtonElement } from "../src/events"
import { defineButtonElements } from "../src/button"
import { withSource } from "../src/observe"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

test("the action event's detail says how the button was pressed", async () => {
  defineButtonElements()
  document.body.innerHTML = `<ui-button><button>Save</button></ui-button>`
  await wait()
  const sources: string[] = []
  const host = document.querySelector("ui-button") as UiButtonElement
  host.addEventListener("action", (event) => sources.push(event.detail.source))
  const button = document.querySelector("button")!
  withSource("agent", () => button.click())
  button.click()
  expect(sources).toEqual(["agent", "programmatic"])
})

test("a button moved into a disabled fieldset after it binds ignores presses", async () => {
  defineButtonElements()
  document.body.innerHTML = `<ui-button><span>Save</span></ui-button><fieldset disabled></fieldset>`
  await wait()
  const host = document.querySelector("ui-button")!
  const span = document.querySelector("span")!
  let actions = 0
  host.addEventListener("action", () => actions++)
  span.click()
  expect(actions).toBe(1)
  document.querySelector("fieldset")!.append(host)
  await wait()
  span.click()
  expect(actions).toBe(1)
  expect(span.hasAttribute("data-disabled")).toBe(true)
})

test("a disabled button keeps the author's tabindex once it binds", async () => {
  defineButtonElements()
  document.body.innerHTML = `<ui-button disabled><button tabindex="0">Save</button></ui-button>`
  await wait()
  const button = document.querySelector("button")!
  expect(button.getAttribute("tabindex")).toBe("0")
  expect(button.hasAttribute("aria-disabled")).toBe(false)
  expect(button.hasAttribute("disabled")).toBe(true)
})
