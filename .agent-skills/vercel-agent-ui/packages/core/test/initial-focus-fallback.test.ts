// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest"
import { dialog } from "../src/components/dialog/dialog"
import { popover } from "../src/components/popover/popover"
import { mount } from "../src/testing"

afterEach(() => document.body.replaceChildren())

const popups = [
  { name: "dialog", component: dialog, title: "<title>Rename</title>" },
  { name: "popover", component: popover, title: "" },
]

describe.each(popups)("$name", ({ component, title }) => {
  test.each([
    ["a disabled button", `<button id="save" disabled>Save</button>`],
    ["an element that can't take focus", `<p id="save">Saved</p>`],
  ])(
    "an initialFocus that lands on %s focuses the content",
    async (_, target) => {
      const view = mount(
        component,
        {},
        `<div><trigger>Open</trigger><content initial-focus="#save">${title}${target}<button>Cancel</button></content></div>`
      )
      view.part("trigger")!.focus()
      await view.keys("Enter")
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(view.state.open).toBe(true)
      expect(document.activeElement).toBe(view.part("content"))
      view.unmount()
    }
  )
})
