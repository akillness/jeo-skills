// @vitest-environment jsdom
import { expect, test, vi } from "vitest"
import { popover } from "../src/components/popover/popover"
import { mount } from "../src/testing"

test("a close with nothing to animate leaves no exit to stop at the next open", async () => {
  const view = mount(
    popover,
    {},
    `<trigger>Open</trigger><content>Hello</content>`
  )
  const trigger = view.part("trigger")!
  await view.click(trigger)
  await view.click(trigger)
  expect(view.state.open).toBe(false)
  const removed = vi.spyOn(view.part("content")!, "removeAttribute")
  await view.click(trigger)
  expect(view.state.open).toBe(true)
  expect(removed).not.toHaveBeenCalledWith("data-ending-style")
  view.unmount()
})
