// @vitest-environment jsdom
import { expect, test, vi } from "vitest"
import { pushLayer } from "../src/foundation/platform/layers"
import { createShortcuts } from "../src/foundation/shortcuts/create-shortcuts"

const escape = () =>
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
  )

const openLayer = (onEscape: () => void) => {
  const el = document.body.appendChild(document.createElement("div"))
  const pop = pushLayer({
    el,
    contains: (target) => el.contains(target),
    active: () => true,
    modal: false,
    onEscape,
  })
  return () => {
    pop()
    el.remove()
  }
}

test("Escape goes to an open layer before a page shortcut that listened first", () => {
  const shortcuts = createShortcuts()
  const shortcut = vi.fn()
  const off = shortcuts.register("escape", shortcut)
  const layer = vi.fn()
  const close = openLayer(layer)
  escape()
  expect(layer).toHaveBeenCalledOnce()
  expect(shortcut).not.toHaveBeenCalled()
  close()
  escape()
  expect(shortcut).toHaveBeenCalledOnce()
  off()
})
