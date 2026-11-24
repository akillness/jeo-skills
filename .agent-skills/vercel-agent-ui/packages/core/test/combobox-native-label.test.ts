// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { mount } from "../src/testing"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

function view() {
  const mounted = mount(
    combobox,
    { items: ["Backlog", "Done"] },
    `<root><input aria-label="Status"><content><list></list></content></root>`
  )
  mounts.push(mounted)
  return mounted
}

test("a click on a native label for the input leaves the list closed", async () => {
  const combo = view()
  const input = combo.part("input") as HTMLInputElement
  const label = document.body.appendChild(document.createElement("label"))
  label.htmlFor = input.id
  label.textContent = "Status"
  await combo.click(label)
  expect(combo.state.open).toBe(false)
  await combo.click(input)
  expect(combo.state.open).toBe(true)
})

test("a click on the input inside a native label still opens the list", async () => {
  const combo = view()
  const input = combo.part("input") as HTMLInputElement
  const label = document.createElement("label")
  input.before(label)
  label.append("Status ", input)
  await combo.click(input)
  expect(combo.state.open).toBe(true)
})
