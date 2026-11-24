// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { popover } from "../src/components/popover/popover"
import { mount } from "../src/testing/mount"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never
Element.prototype.animate ??= function () {
  return {
    finished: Promise.resolve(),
    onfinish: null,
    cancel() {},
    finish() {},
    pause() {},
    play() {},
    commitStyles() {},
  } as never
}

let arrive = () => {}
const arrived = new Promise<void>((resolve) => (arrive = resolve))
vi.mock("../src/foundation/popups/sheet-presentation", async (original) => {
  await arrived
  return original()
})

afterEach(() => document.body.replaceChildren())

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

test("content in the page before a sheet opens stays hidden until the sheet code has loaded", async () => {
  const view = mount(
    popover,
    { presentation: "sheet" },
    `<root><trigger>Open</trigger><viewport><content keepMounted>Hello</content></viewport></root>`
  )
  const content = view.part("content")!
  expect(content.hidden).toBe(true)

  view.api.open()
  await settle()
  expect(view.state.mounted).toBe(true)
  expect(content.hidden).toBe(true)

  arrive()
  await vi.waitFor(() => expect(content.hidden).toBe(false))
  view.unmount()
})
