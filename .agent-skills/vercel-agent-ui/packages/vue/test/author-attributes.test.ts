// @vitest-environment jsdom
import { expect, test } from "vitest"
import { createApp, h, nextTick } from "vue"
import { Combobox, ComboboxInput, ComboboxLabel } from "../src/combobox"
import { Field, FieldLabel } from "../src/field"

test("a field's label names a combobox input over the combobox's own label", async () => {
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(() =>
    h(Field, null, () => [
      h(FieldLabel, null, () => "Fruit"),
      h(Combobox, null, () => [
        h(ComboboxLabel, null, () => "Pick one"),
        h(ComboboxInput),
      ]),
    ])
  )
  app.mount(root)
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const label = root.querySelector('[data-slot="field-label"]')!
  expect(root.querySelector("input")!.getAttribute("aria-labelledby")).toBe(
    label.id
  )
  app.unmount()
  root.remove()
})

test("a combobox input inside a labelled field keeps the label reference passed to it", async () => {
  const root = document.createElement("div")
  document.body.append(root)
  const app = createApp(() =>
    h(Field, null, () => [
      h(FieldLabel, null, () => "Fruit"),
      h(Combobox, null, () => [
        h(ComboboxLabel, null, () => "Pick one"),
        h(ComboboxInput, { "aria-labelledby": "mine" }),
      ]),
    ])
  )
  app.mount(root)
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(root.querySelector("input")!.getAttribute("aria-labelledby")).toBe(
    "mine"
  )
  app.unmount()
  root.remove()
})
