// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { dialog } from "../src/components/dialog/dialog"
import { mount } from "../src/testing/mount"

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  unmount = undefined
  document.body.replaceChildren()
})

const tab = (el: Element) => {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    bubbles: true,
    cancelable: true,
  })
  el.dispatchEvent(event)
  return event
}

// A modal dialog makes the page behind it inert, which a DOM made for tests doesn't do itself.
test("Tab steps onto a radio group in a dialog whose checked radio is behind it, in every engine", async () => {
  const view = mount(
    dialog,
    {},
    `<div><trigger>Rename</trigger><input type="radio" name="speed" aria-label="Page speed" checked inert></input><content><title>Rename</title><close>Close</close><input type="radio" name="speed" aria-label="Standard"></input><input type="radio" name="speed" aria-label="Express"></input></content></div>`
  )
  unmount = view.unmount
  await view.click(view.part("trigger")!)
  const close = view.part("close")!
  close.focus()
  const event = tab(close)
  expect(event.defaultPrevented).toBe(true)
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Standard")
})

test("Tab leaves a radio group in a dialog the way the browser does", async () => {
  const view = mount(
    dialog,
    {},
    `<div><trigger>Rename</trigger><input type="radio" name="speed" aria-label="Page speed" checked inert></input><content><title>Rename</title><close>Close</close><input type="radio" name="speed" aria-label="Standard"></input><input type="radio" name="speed" aria-label="Express"></input><input type="radio" name="size" aria-label="Small"></input><input type="radio" name="size" aria-label="Large"></input><button>Save</button></content></div>`
  )
  unmount = view.unmount
  await view.click(view.part("trigger")!)
  for (const label of ["Standard", "Small"]) {
    const radio = document.querySelector<HTMLElement>(
      `[aria-label="${label}"]`
    )!
    radio.focus()
    expect(tab(radio).defaultPrevented).toBe(false)
  }
})
