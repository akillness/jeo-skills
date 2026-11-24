// The focused option keeps the listbox's one tab stop when its value changes,
// as the listbox pattern returns focus to the option focused last.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/rename-focused-option-app.svelte"

const settle = async () => {
  flushSync()
  await new Promise((done) => setTimeout(done, 20))
  flushSync()
}

test("the focused option keeps the tab stop and arrow keys when its value changes", async () => {
  Element.prototype.scrollIntoView ??= function () {}
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, { target })
  await settle()
  const options = [...target.querySelectorAll<HTMLElement>('[role="option"]')]
  const press = async (key: string) => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    )
    await settle()
  }
  options[0].focus()
  await press("ArrowDown")
  expect(document.activeElement).toBe(options[1])
  app.rename("b2")
  await settle()
  expect(document.activeElement).toBe(options[1])
  expect(options.map((option) => option.tabIndex)).toEqual([-1, 0, -1])
  await press("ArrowDown")
  expect(document.activeElement).toBe(options[2])
  unmount(app)
  target.remove()
})
