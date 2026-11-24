// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { accordion } from "../src/components/accordion/accordion"
import { collapsible } from "../src/components/collapsible/collapsible"
import { triggerKeydown } from "../src/foundation/disclosure/disclosure"
import { bind } from "../src/foundation/kernel/part"
import type { Part } from "../src/foundation/kernel/primitive-types"

afterEach(() => document.body.replaceChildren())

function renderLink(part: Part) {
  const link = document.body.appendChild(document.createElement("a"))
  link.href = "#more"
  bind(part, link)
  return link
}

const space = () =>
  new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })

test("Space on a collapsible trigger rendered as a link toggles it, since it's a button", () => {
  const instance = collapsible({ id: "x" })
  const link = renderLink(instance.part("trigger"))
  expect(link.getAttribute("role")).toBe("button")
  const event = space()
  link.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(instance.api.isOpen()).toBe(true)
})

test("Space on an accordion trigger rendered as a link expands its item", () => {
  const instance = accordion({ id: "a" })
  instance.part("item", { value: "one" })
  const link = renderLink(instance.part("trigger", { value: "one" }))
  link.dispatchEvent(space())
  expect(instance.api.getValue()).toEqual(["one"])
})

test("Space on a link that stays a link is left to the browser", () => {
  const link = document.body.appendChild(document.createElement("a"))
  link.href = "#more"
  const event = space()
  link.addEventListener("keydown", (keydown) => triggerKeydown(keydown, link))
  link.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})
