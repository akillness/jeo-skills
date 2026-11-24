// @vitest-environment jsdom
// The focused option keeps the listbox's one tab stop when its value changes,
// as the listbox pattern returns focus to the option focused last.
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Listbox, ListboxItem } from "../src/listbox"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.scrollIntoView ??= function () {}

let root: Root | undefined
afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

test("the focused option keeps the tab stop and arrow keys when its value changes", async () => {
  let set!: (value: string) => void
  function App() {
    const [value, setValue] = React.useState("b")
    set = setValue
    return (
      <Listbox aria-label="Fruit">
        <ListboxItem value="a">A</ListboxItem>
        <ListboxItem value={value}>B</ListboxItem>
        <ListboxItem value="c">C</ListboxItem>
      </Listbox>
    )
  }
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(<App />))
  const options = [
    ...container.querySelectorAll<HTMLElement>('[role="option"]'),
  ]
  const press = (key: string) =>
    React.act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      )
    })
  await React.act(async () => options[0].focus())
  await press("ArrowDown")
  expect(document.activeElement).toBe(options[1])
  await React.act(async () => set("b2"))
  await React.act(() => new Promise((done) => setTimeout(done, 20)))
  expect(document.activeElement).toBe(options[1])
  expect(options.map((option) => option.tabIndex)).toEqual([-1, 0, -1])
  await press("ArrowDown")
  expect(document.activeElement).toBe(options[2])
})
