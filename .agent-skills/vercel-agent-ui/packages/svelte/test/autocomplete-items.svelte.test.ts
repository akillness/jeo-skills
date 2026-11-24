// Data that replaces the suggestions while the list is open. The highlight
// settles with the data, in the same pass as the options that carry it: the
// setup fails a test that writes state while options are handed over.
import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/autocomplete-items-app.svelte"

let app: ReturnType<typeof mount> | undefined
afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
})

function render() {
  const highlights: (string | null)[] = []
  const props = $state({
    items: ["Apple", "Apricot", "Banana"],
    onHighlight: (value: string | null) => void highlights.push(value),
  })
  app = mount(App, { target: document.body, props })
  flushSync()
  const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
  )
  flushSync()
  return { props, input, highlights }
}

test("items that drop the highlighted suggestion clear the highlight", () => {
  const { props, input } = render()
  expect(input.getAttribute("aria-activedescendant")).toMatch(/option-Apple$/)
  props.items = ["Peach", "Banana"]
  flushSync()
  expect(input.getAttribute("aria-activedescendant")).toBeNull()
  expect(
    [...document.querySelectorAll('[role="option"]')].map(
      (el) => el.textContent
    )
  ).toEqual(["Peach", "Banana"])
})

test("onHighlight hears the highlight leave with its suggestion", () => {
  const { props, highlights } = render()
  expect(highlights).toEqual(["Apple"])
  props.items = ["Peach", "Banana"]
  flushSync()
  expect(highlights).toEqual(["Apple", null])
})
