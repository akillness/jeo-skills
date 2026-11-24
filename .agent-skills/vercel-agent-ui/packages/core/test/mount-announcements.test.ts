// @vitest-environment jsdom
// Each mount hears what's announced while it's mounted, whichever mounts come and go.
import { expect, test } from "vitest"
import { announce } from "../src/foundation/platform/announce"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { mount } from "../src/testing/mount"

const plain = definePrimitive({
  name: "plain",
  state: () => ({}),
  api: () => ({}),
  slots: (slot) => ({ root: slot({}) }),
})

test("a mounted primitive still hears announcements after another one unmounts", () => {
  const first = mount(plain, {}, `<root>A</root>`)
  const second = mount(plain, {}, `<root>B</root>`)
  second.unmount()
  announce("Saved")
  expect(first.announced).toEqual(["Saved"])
  expect(second.announced).toEqual([])
  first.unmount()
})

test("once every mount is gone, announcements go to the page's live regions again", () => {
  mount(plain, {}, `<root>A</root>`).unmount()
  announce("Saved")
  expect(document.querySelector("[data-ui-sdk-announcer]")).not.toBeNull()
})
