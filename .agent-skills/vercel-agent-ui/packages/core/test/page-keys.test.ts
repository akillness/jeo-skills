// @vitest-environment jsdom
// PageUp and PageDown move a list's highlight a page, and stop at its ends
// even where the arrows wrap, as the APG asks.
import { afterEach, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { listbox } from "../src/components/listbox/listbox-root"
import { bindScrollPicker } from "../src/foundation/lists/scroll-picker"
import { mount } from "../src/testing"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

const letters = [..."abcdefghijkl"]

test("a combobox's page keys stop at the ends, and its arrows still wrap", async () => {
  const view = mount(
    combobox,
    { items: letters },
    `<root><label>Letter</label><input><content><list></list></content></root>`
  )
  mounts.push(view)
  ;(view.part("input") as HTMLElement).focus()
  await view.keys("ArrowUp")
  expect(view.state.highlighted).toBe("l")
  await view.keys("PageDown")
  expect(view.state.highlighted).toBe("l")
  await view.keys("PageUp", "PageUp")
  expect(view.state.highlighted).toBe("a")
  await view.keys("ArrowUp")
  expect(view.state.highlighted).toBe("l")
})

const options = letters
  .map((letter) => `<item value="${letter}">${letter}</item>`)
  .join("")

test("a listbox's page keys move a page, and stop at the ends", async () => {
  const view = mount(listbox, {}, `<root aria-label="Letter">${options}</root>`)
  mounts.push(view)
  ;(view.root.querySelector('[role="option"]') as HTMLElement).focus()
  await view.keys("PageDown")
  expect(document.activeElement?.textContent).toBe("k")
  await view.keys("PageDown")
  expect(document.activeElement?.textContent).toBe("l")
  await view.keys("PageUp", "PageUp")
  expect(document.activeElement?.textContent).toBe("a")
})

test("a listbox leaves its page keys to a scroll picker", async () => {
  const view = mount(listbox, {}, `<root aria-label="Letter">${options}</root>`)
  mounts.push(view)
  const unbind = bindScrollPicker(view.root)
  const handled: boolean[] = []
  view.root.addEventListener("keydown", (event) =>
    handled.push(event.defaultPrevented)
  )
  ;(view.root.querySelector('[role="option"]') as HTMLElement).focus()
  await view.keys("PageDown")
  expect(handled).toEqual([false])
  unbind()
})
