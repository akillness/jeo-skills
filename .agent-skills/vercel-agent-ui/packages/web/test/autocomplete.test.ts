// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { defineAutocompleteElements } from "../src/autocomplete"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

afterEach(() => document.body.replaceChildren())

test("an autocomplete's submit reaches the host of the shadow root it renders in", async () => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineAutocompleteElements()
  const host = document.body.appendChild(document.createElement("div"))
  const root = host.attachShadow({ mode: "closed" })
  // jsdom has no adopted style sheets.
  Object.defineProperty(root, "adoptedStyleSheets", {
    value: [],
    writable: true,
  })
  root.innerHTML = `<form><ui-autocomplete><ui-autocomplete-input><input aria-label="Search" /></ui-autocomplete-input></ui-autocomplete></form>`
  await wait()
  let heard: string | undefined
  host.addEventListener(
    "submit",
    (event: Event) => {
      heard = (event as CustomEvent<{ value: string }>).detail.value
      event.preventDefault()
    },
    { capture: true }
  )
  const input = root.querySelector("input")!
  input.value = "kiwi"
  input.dispatchEvent(new InputEvent("input", { bubbles: true }))
  const enter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  })
  input.dispatchEvent(enter)
  expect(heard).toBe("kiwi")
  expect(enter.defaultPrevented).toBe(true)
})
