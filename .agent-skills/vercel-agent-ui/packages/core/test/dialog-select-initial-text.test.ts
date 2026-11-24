// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { dialog } from "../src/components/dialog/dialog"
import { mount } from "../src/testing"

afterEach(() => document.body.replaceChildren())

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test("opening on a filled text field selects its text", async () => {
  const view = mount(
    dialog,
    { defaultOpen: true },
    `<content><title>Rename</title><input aria-label="Name" value="Spam filter" /></content>`
  )
  await settle()
  const input = view.root.querySelector("input")!
  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 11])
  view.unmount()
})

test("a filled field whose popup is open keeps what was typed", async () => {
  const view = mount(
    dialog,
    { defaultOpen: true },
    `<content><title>Find</title><input role="combobox" aria-expanded="true" aria-label="Country" value="den" /></content>`
  )
  await settle()
  const input = view.root.querySelector("input")!
  expect(document.activeElement).toBe(input)
  expect(input.selectionStart).toBe(input.selectionEnd)
  view.unmount()
})
