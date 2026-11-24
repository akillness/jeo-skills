// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { checkName } from "../src/foundation/text/name-check"

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

const warnings = async (el: HTMLElement) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  checkName(el, "Meter", { component: "meter" })
  await new Promise((resolve) => setTimeout(resolve))
  return warn.mock.calls.length
}

test("a part hidden from assistive tech needs no name", async () => {
  const button = document.body.appendChild(document.createElement("button"))
  button.setAttribute("aria-label", "Context: 23% used")
  const meter = button.appendChild(document.createElement("div"))
  meter.setAttribute("role", "meter")
  meter.setAttribute("aria-hidden", "true")
  expect(await warnings(meter)).toBe(0)
})

test("an unnamed part still warns", async () => {
  const meter = document.body.appendChild(document.createElement("div"))
  meter.setAttribute("role", "meter")
  expect(await warnings(meter)).toBe(1)
})
