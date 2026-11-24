// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { button } from "../src/components/button/button"
import { bind } from "../src/foundation/kernel/part"

afterEach(() => {
  document.body.innerHTML = ""
})

test("Enter and Space press a button rendered as an SVG element", () => {
  const action = vi.fn()
  const instance = button({ id: "node", action })
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  const el = document.createElementNS("http://www.w3.org/2000/svg", "g")
  svg.append(el)
  document.body.append(svg)
  bind(instance.part("root"), el as unknown as HTMLElement)
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
  )
  el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
  el.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }))
  expect(action).toHaveBeenCalledTimes(2)
  instance.destroy()
})
