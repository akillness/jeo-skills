// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { menu } from "../src/components/menu/menu"
import { select } from "../src/components/select/select"
import { mount } from "../src/testing"

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

const pointer = (type: string) =>
  new PointerEvent(type, {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: 10,
    clientY: 10,
    bubbles: true,
    cancelable: true,
    composed: true,
  })

// The release happened at once, but its handler runs 300ms later, on a page
// busy rendering what the press opened, and lands on what now covers the trigger.
function clickOnBusyPage(trigger: HTMLElement, covering: Element) {
  const down = pointer("pointerdown")
  const up = pointer("pointerup")
  trigger.dispatchEvent(down)
  const now = performance.now()
  vi.spyOn(performance, "now").mockReturnValue(now + 300)
  covering.dispatchEvent(up)
}

test("a click on a busy page keeps the menu it opened", async () => {
  const view = mount(
    menu,
    {},
    `<trigger>File</trigger><content><item value="new">New</item></content>`
  )
  await settle()
  clickOnBusyPage(view.part("trigger")!, document.body)
  await settle()
  expect(view.state.open).toBe(true)
  view.unmount()
})

test("a click on a busy page doesn't choose the option that opened under it", async () => {
  const view = mount(
    select,
    {},
    `<trigger><value></value></trigger><content><item value="a">A</item></content>`
  )
  await settle()
  clickOnBusyPage(view.part("trigger")!, view.part("item", "a")!)
  await settle()
  expect(view.state.open).toBe(true)
  expect(view.state.value).toBe(null)
  view.unmount()
})
