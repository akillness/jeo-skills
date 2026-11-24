// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { bind } from "../src/foundation/kernel/part"
import { menu } from "./menu-parts"

afterEach(() => vi.useRealTimers())

const touch = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX: 40,
    clientY: 20,
    bubbles: true,
    cancelable: true,
    ...init,
  })

function view() {
  vi.useFakeTimers()
  const instance = menu({ id: "m" })
  const area = document.body.appendChild(document.createElement("div"))
  const unbind = bind(instance.part("context-trigger", {}), area)
  const unmount = () => {
    unbind()
    instance.destroy()
    area.remove()
  }
  return { area, isOpen: () => instance.get().open, unmount }
}

test("a long press on a context area opens the menu by touch", () => {
  const menu = view()
  menu.area.dispatchEvent(touch("pointerdown"))
  vi.advanceTimersByTime(500)
  expect(menu.isOpen()).toBe(true)
  menu.unmount()
})

test("a finger that moves off to scroll doesn't open the menu", () => {
  const menu = view()
  menu.area.dispatchEvent(touch("pointerdown"))
  document.dispatchEvent(touch("pointermove", { clientY: 60 }))
  vi.advanceTimersByTime(500)
  expect(menu.isOpen()).toBe(false)
  menu.unmount()
})

test("a mouse press held on a context area leaves it to right-click", () => {
  const menu = view()
  menu.area.dispatchEvent(touch("pointerdown", { pointerType: "mouse" }))
  vi.advanceTimersByTime(500)
  expect(menu.isOpen()).toBe(false)
  menu.unmount()
})
