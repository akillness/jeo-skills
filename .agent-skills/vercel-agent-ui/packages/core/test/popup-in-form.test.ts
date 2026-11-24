// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { command } from "../src/components/command/command"
import { popover } from "../src/components/popover/popover"
import { mount } from "../src/testing"

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

const nests = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.some((call) => String(call[0]).includes("nests forms"))

test("Enter in a command search with nothing highlighted submits no form", async () => {
  const view = mount(
    command,
    {},
    `<form><input aria-label="Search" /><list><item value="name">Name</item></list></form>`
  )
  const search = view.part("input") as HTMLInputElement
  search.focus()
  search.value = "zzz"
  search.dispatchEvent(new Event("input", { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(view.root.querySelector("[data-highlighted]")).toBe(null)
  const enter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  })
  search.dispatchEvent(enter)
  expect(enter.defaultPrevented).toBe(true)
  view.unmount()
})

test.each([
  ["holding a form, warns", "<form><input /></form>", true],
  ["holding only fields, stays quiet", "<input />", false],
])("a popover rendered inside a form, %s", (_, inner, warned) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const view = mount(
    popover,
    { defaultOpen: true },
    `<form><trigger>Filter</trigger><content>${inner}</content></form>`
  )
  expect(nests(warn)).toBe(warned)
  view.unmount()
})
