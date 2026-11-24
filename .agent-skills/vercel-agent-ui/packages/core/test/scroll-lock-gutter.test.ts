// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { lockScroll } from "../src/foundation/popups/modal"

const root = document.documentElement
const width = (value: number) =>
  Object.defineProperty(root, "clientWidth", { value, configurable: true })

afterEach(() => {
  Reflect.deleteProperty(root, "clientWidth")
})

test("a page without a scrollbar gutter never gets --scrollbar-width", () => {
  width(window.innerWidth)
  const release = lockScroll()
  expect(root.style.overflow).toBe("hidden")
  expect(root.style.getPropertyValue("--scrollbar-width")).toBe("")
  release()
  expect(root.getAttribute("style") ?? "").toBe("")
})

test("a classic scrollbar's width is written for fixed elements, and removed on release", () => {
  width(window.innerWidth - 15)
  const release = lockScroll()
  expect(root.style.getPropertyValue("--scrollbar-width")).toBe("15px")
  release()
  expect(root.style.getPropertyValue("--scrollbar-width")).toBe("")
})
