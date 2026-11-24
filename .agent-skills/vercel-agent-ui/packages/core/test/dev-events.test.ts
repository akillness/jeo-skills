// @vitest-environment jsdom
// The development check that a change's event is one its reason's type in
// `ReasonVocabulary` admits. It reads event constructors from the window.
import { expect, test, vi } from "vitest"
import { checkEvent } from "../src/foundation/kernel/dev"

test("checks link-press, collapse, timeout and resize against the vocabulary", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const from = { component: "test" }
  checkEvent("link-press", new MouseEvent("click"), from)
  checkEvent("collapse", new KeyboardEvent("keydown"), from)
  checkEvent("timeout", undefined, from)
  checkEvent("resize", undefined, from)
  expect(warn).not.toHaveBeenCalled()
  checkEvent("link-press", new FocusEvent("blur"), from)
  checkEvent("collapse", new FocusEvent("blur"), from)
  checkEvent("timeout", new Event("timeout"), from)
  checkEvent("resize", new Event("resize"), from)
  expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
    expect.stringContaining("reported `link-press` with a FocusEvent"),
    expect.stringContaining("reported `collapse` with a FocusEvent"),
    expect.stringContaining("reported `timeout`"),
    expect.stringContaining("reported `resize`"),
  ])
  warn.mockRestore()
})

test("admits a window blur that is a plain Event, as Chrome sends it", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  checkEvent("window-blur", new Event("blur"), { component: "test" })
  expect(warn).not.toHaveBeenCalled()
  warn.mockRestore()
})
