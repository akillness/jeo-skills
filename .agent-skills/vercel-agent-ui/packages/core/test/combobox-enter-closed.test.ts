// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { mount } from "../src/testing"

afterEach(() => document.body.replaceChildren())

const markup = `<chips><input aria-label="Tags"></input></chips><content><list></list></content>`

function enter(input: HTMLElement) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  })
  input.dispatchEvent(event)
  return event
}

test("Enter adds typed text as a chip while the app keeps the list closed", async () => {
  const view = mount(
    combobox,
    {
      multiple: true,
      allowCustomValue: true,
      defaultValue: [],
      onOpenChange: (open, details) => open && details.cancel(),
    },
    markup
  )
  const input = view.part("input") as HTMLInputElement
  input.focus()
  await view.type("alpha")
  expect(view.state.open).toBe(false)
  const event = enter(input)
  expect(view.api.getValue()).toEqual(["alpha"])
  expect(view.state.query).toBe("")
  expect(event.defaultPrevented).toBe(true)
  view.unmount()
})

test("Enter in an empty closed chip field is left to the form", async () => {
  const view = mount(
    combobox,
    { multiple: true, allowCustomValue: true, defaultValue: [] },
    markup
  )
  const input = view.part("input") as HTMLInputElement
  input.focus()
  expect(enter(input).defaultPrevented).toBe(false)
  view.unmount()
})

test("Enter adds the typed text, not a suggestion nobody saw, while the list is kept closed", async () => {
  const view = mount(
    combobox,
    {
      multiple: true,
      allowCustomValue: true,
      autoHighlight: true,
      items: ["alpha", "alps"],
      defaultValue: [],
      onOpenChange: (open, details) => open && details.cancel(),
    },
    markup
  )
  const input = view.part("input") as HTMLInputElement
  input.focus()
  await view.type("al")
  expect(view.state.open).toBe(false)
  enter(input)
  expect(view.api.getValue()).toEqual(["al"])
  view.unmount()
})
