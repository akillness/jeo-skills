// @vitest-environment jsdom
// With `virtualFocus`, focus stays on the trigger while the list is open, as
// on a native select, and the trigger points at the highlighted item.
import { afterEach, expect, test } from "vitest"
import { select } from "../src/components/select/select"
import { mount } from "../src/testing/mount"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

const markup = `<root><trigger aria-label="Letter"><value /></trigger><content>
  <item value="a">Alpha</item><item value="b" disabled>Beta</item><item value="c">Gamma</item><item value="d">Delta</item>
</content></root>`

function open(options: Record<string, unknown> = {}) {
  const view = mount(select, { virtualFocus: true, ...options }, markup)
  mounts.push(view)
  const after = document.body.appendChild(document.createElement("button"))
  after.textContent = "After"
  const trigger = view.part("trigger")!
  trigger.focus()
  return {
    view,
    trigger,
    after,
    pointsAt: () => {
      const id = trigger.getAttribute("aria-activedescendant")
      return id ? document.getElementById(id)?.textContent : null
    },
  }
}

test("arrow keys move the highlight while focus stays on the trigger", async () => {
  const { view, trigger, pointsAt } = open({ defaultValue: "a" })
  await view.keys("ArrowDown")
  await view.settle()
  expect(view.state.open).toBe(true)
  expect(document.activeElement).toBe(trigger)
  expect(pointsAt()).toBe("Alpha")
  // Beta is disabled, so the highlight skips it.
  await view.keys("ArrowDown")
  expect(document.activeElement).toBe(trigger)
  expect(pointsAt()).toBe("Gamma")
  await view.keys("End")
  expect(pointsAt()).toBe("Delta")
  await view.keys("Home")
  expect(pointsAt()).toBe("Alpha")
  await view.type("g")
  expect(pointsAt()).toBe("Gamma")
})

test("Enter chooses the highlighted item and closes, with focus still on the trigger", async () => {
  const { view, trigger } = open()
  await view.keys("ArrowDown")
  await view.settle()
  await view.keys("ArrowDown")
  expect(document.activeElement).toBe(trigger)
  await view.keys("Enter")
  await view.settle()
  expect(view.state.open).toBe(false)
  expect(view.api.getValue()).toBe("c")
  expect(document.activeElement).toBe(trigger)
  expect(trigger.hasAttribute("aria-activedescendant")).toBe(false)
})

test("Escape closes without choosing", async () => {
  const { view, trigger } = open({ defaultValue: "a" })
  await view.keys("ArrowDown")
  await view.settle()
  await view.keys("ArrowDown")
  expect(document.activeElement).toBe(trigger)
  await view.keys("Escape")
  await view.settle()
  expect(view.state.open).toBe(false)
  expect(view.api.getValue()).toBe("a")
  expect(document.activeElement).toBe(trigger)
})

test("Tab closes the list and focus moves on from the trigger", async () => {
  const { view, trigger, after } = open()
  await view.keys("ArrowDown")
  await view.settle()
  expect(document.activeElement).toBe(trigger)
  await view.keys("Tab")
  await view.settle()
  expect(view.state.open).toBe(false)
  expect(document.activeElement).toBe(after)
})

test("without it, focus moves onto the highlighted item", async () => {
  const { view, trigger } = open({ virtualFocus: false, defaultValue: "a" })
  await view.keys("ArrowDown")
  await view.settle()
  expect(document.activeElement).toBe(view.part("item", "a"))
  expect(trigger.hasAttribute("aria-activedescendant")).toBe(false)
})

test("keys on the trigger mark the list as used by keyboard after a pointer opened it", async () => {
  const { view, trigger } = open()
  trigger.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" })
  )
  view.api.setOpen(true)
  await view.settle()
  const content = view.part("content")!
  content.setAttribute("data-modality", "pointer")
  await view.keys("ArrowDown")
  expect(content.getAttribute("data-modality")).toBe("keyboard")
})
