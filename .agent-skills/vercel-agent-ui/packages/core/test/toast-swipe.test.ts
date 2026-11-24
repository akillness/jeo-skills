// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { toastRegion } from "../src/components/toast/toast"
import { createToaster } from "../src/components/toast/toaster"

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
Element.prototype.getAnimations ??= () => []

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.replaceChildren()
})

const pointer =
  (pointerType: string) =>
  (type: string, y: number, pointerId = 1) =>
    new PointerEvent(type, {
      clientX: 0,
      clientY: y,
      pointerId,
      pointerType,
      isPrimary: pointerId === 1,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      bubbles: true,
    })
const touch = pointer("touch")
const mouse = pointer("mouse")

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

// A toast at the bottom of the page, which swipes down to dismiss.
function mountToast() {
  const toaster = createToaster()
  const region = toastRegion({ id: "r", toaster })
  const disconnect = region.api.internal.connect()
  const id = toaster("Saved", { duration: Infinity })
  const el = document.body.appendChild(document.createElement("div"))
  const unbind = region.api.internal.bindToast(el, id)
  cleanups.push(unbind, disconnect, () => region.destroy())
  return { region, el }
}

test("a second finger can't start another swipe of a toast while one swipes it", async () => {
  const { el } = mountToast()
  el.dispatchEvent(touch("pointerdown", 0))
  document.dispatchEvent(touch("pointermove", 20))
  document.dispatchEvent(touch("pointermove", 30))
  await frame()
  const offset = el.style.getPropertyValue("--toast-swipe-y")
  expect(offset).not.toBe("")
  el.dispatchEvent(touch("pointerdown", 0, 2))
  document.dispatchEvent(touch("pointermove", 60, 2))
  document.dispatchEvent(touch("pointermove", 90, 2))
  await frame()
  expect(el.style.getPropertyValue("--toast-swipe-y")).toBe(offset)
})

test("a swipe cut short by its region going away lets go of the toast", async () => {
  const { region, el } = mountToast()
  el.dispatchEvent(touch("pointerdown", 0))
  document.dispatchEvent(touch("pointermove", 20))
  await frame()
  expect(el.hasAttribute("data-swiping")).toBe(true)
  region.destroy()
  expect(el.hasAttribute("data-swiping")).toBe(false)
  // The pointer no longer reaches it.
  document.dispatchEvent(touch("pointermove", 80))
  await frame()
  expect(el.style.getPropertyValue("--toast-swipe-y")).not.toBe("80px")
})

// jsdom has no layout: every point lands on the toast's text.
function pressOnText(text: Text) {
  const range = document.createRange()
  range.selectNodeContents(text)
  document.caretRangeFromPoint = () => range
  Range.prototype.getClientRects = () =>
    [{ left: 0, right: 100, top: 0, bottom: 20 }] as unknown as DOMRectList
  cleanups.push(() => {
    delete (document as Partial<Document>).caretRangeFromPoint
    delete (Range.prototype as Partial<Range>).getClientRects
  })
}

test.each([
  ["swipes a toast from text that can't be selected", "none", true],
  ["leaves text that can be selected to select", "auto", false],
])("a mouse drag %s", async (_, userSelect, swipes) => {
  const { el } = mountToast()
  el.style.userSelect = userSelect
  const title = el.appendChild(document.createElement("span"))
  pressOnText(title.appendChild(document.createTextNode("Saved")))
  title.dispatchEvent(mouse("pointerdown", 0))
  document.dispatchEvent(mouse("pointermove", 20))
  document.dispatchEvent(mouse("pointermove", 30))
  await frame()
  expect(el.hasAttribute("data-swiping")).toBe(swipes)
})
