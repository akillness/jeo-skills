// @vitest-environment jsdom
import { expect, test, vi } from "vitest"
import { createShortcuts } from "../src/foundation/shortcuts/create-shortcuts"

const press = (repeat: boolean) => {
  const event = new KeyboardEvent("keydown", {
    key: "j",
    code: "KeyJ",
    repeat,
    bubbles: true,
    cancelable: true,
  })
  document.body.dispatchEvent(event)
  return event.defaultPrevented
}

test("a held key runs only a shortcut that opts into repeat", () => {
  const set = createShortcuts()
  const once = vi.fn()
  const off = set.register("j", once)
  press(false)
  expect(press(true)).toBe(false)
  expect(once).toHaveBeenCalledTimes(1)
  off()
  const held = vi.fn()
  set.register("j", held, { repeat: true })
  press(false)
  expect(press(true)).toBe(true)
  expect(held).toHaveBeenCalledTimes(2)
  set.destroy()
})
