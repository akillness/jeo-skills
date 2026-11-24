// The focused option keeps the listbox's one tab stop when its value changes,
// as the listbox pattern returns focus to the option focused last.
import { render } from "@solidjs/web"
import { createSignal, flush } from "solid-js"
import { afterEach, expect, test } from "vitest"
import { Listbox, ListboxItem } from "../src/listbox"

Element.prototype.scrollIntoView ??= function () {}

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const settle = async () => {
  flush()
  await new Promise((done) => setTimeout(done, 20))
  flush()
}

test("the focused option keeps the tab stop and arrow keys when its value changes", async () => {
  const [value, setValue] = createSignal("b")
  const container = document.body.appendChild(document.createElement("div"))
  dispose = render(
    () => (
      <Listbox aria-label="Fruit">
        <ListboxItem value="a">A</ListboxItem>
        <ListboxItem value={value()}>B</ListboxItem>
        <ListboxItem value="c">C</ListboxItem>
      </Listbox>
    ),
    container
  )
  await settle()
  const options = [
    ...container.querySelectorAll<HTMLElement>('[role="option"]'),
  ]
  const press = async (key: string) => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    )
    await settle()
  }
  options[0].focus()
  await press("ArrowDown")
  expect(document.activeElement).toBe(options[1])
  setValue("b2")
  await settle()
  expect(document.activeElement).toBe(options[1])
  expect(options.map((option) => option.tabIndex)).toEqual([-1, 0, -1])
  await press("ArrowDown")
  expect(document.activeElement).toBe(options[2])
})
