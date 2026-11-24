// @vitest-environment jsdom
// The focused option keeps the listbox's one tab stop when its value changes,
// as the listbox pattern returns focus to the option focused last.
import { createApp, defineComponent, h, nextTick, ref } from "vue"
import { afterEach, expect, test } from "vitest"
import { Listbox, ListboxItem } from "../src/listbox"

Element.prototype.scrollIntoView ??= function () {}

afterEach(() => document.body.replaceChildren())

const settle = async () => {
  await nextTick()
  await new Promise((done) => setTimeout(done, 20))
}

test("the focused option keeps the tab stop and arrow keys when its value changes", async () => {
  const value = ref("b")
  const container = document.body.appendChild(document.createElement("div"))
  createApp(
    defineComponent({
      setup: () => () =>
        h(Listbox, { "aria-label": "Fruit" }, () => [
          h(ListboxItem, { value: "a" }, () => "A"),
          h(ListboxItem, { value: value.value }, () => "B"),
          h(ListboxItem, { value: "c" }, () => "C"),
        ]),
    })
  ).mount(container)
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
  value.value = "b2"
  await settle()
  expect(document.activeElement).toBe(options[1])
  expect(options.map((option) => option.tabIndex)).toEqual([-1, 0, -1])
  await press("ArrowDown")
  expect(document.activeElement).toBe(options[2])
})
