// @vitest-environment jsdom
// A popup's `container` selector is looked up in its own tree, like `for`.
import { expect, test, vi } from "vitest"
import { popupPortal } from "../src/popup"

test("a popup in a shadow root renders into the container in that shadow root", () => {
  document.body.innerHTML = `<div id="target"></div><div id="host"></div>`
  const shadow = document.getElementById("host")!.attachShadow({ mode: "open" })
  shadow.innerHTML = `<div id="target"></div><ui-popover container="#target"></ui-popover>`
  const popover = shadow.querySelector<HTMLElement>("ui-popover")!
  expect(popupPortal.container(popover)).toBe(shadow.getElementById("target"))
})

test("a popup in a shadow root renders into a container outside it when its own tree has none", () => {
  document.body.innerHTML = `<div id="outside"></div><div id="host"></div>`
  const shadow = document.getElementById("host")!.attachShadow({ mode: "open" })
  shadow.innerHTML = `<ui-popover container="#outside"></ui-popover>`
  const popover = shadow.querySelector<HTMLElement>("ui-popover")!
  expect(popupPortal.container(popover)).toBe(
    document.getElementById("outside")
  )
})

test("a container selector that matches nothing warns and renders the popup in place", () => {
  document.body.innerHTML = `<ui-popover container="#missing"></ui-popover>`
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const popover = document.querySelector<HTMLElement>("ui-popover")!
  expect(popupPortal.container(popover)).toBe(null)
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('container="#missing" matches no element yet')
  )
  warn.mockRestore()
})
