// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, test } from "vitest"
import { Field, FieldLabel } from "../src/field"
import { Select, SelectTrigger, SelectValue } from "../src/select"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  document.body.replaceChildren()
})

test("a select in a Field keeps the Field's label as its name", async () => {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () =>
    root!.render(
      <Field>
        <FieldLabel>Fruit</FieldLabel>
        <Select items={["Apple", "Pear"]}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>
      </Field>
    )
  )
  await React.act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  const trigger = container.querySelector<HTMLElement>('[role="combobox"]')!
  const label = container.querySelector('[data-slot="field-label"]')!
  expect(trigger.getAttribute("aria-labelledby")?.split(" ")).toContain(
    label.id
  )
})

test("a trigger named by its own aria-labelledby keeps it, on the server too", async () => {
  const app = (
    <>
      <span id="fruit">Fruit</span>
      <Select items={["Apple", "Pear"]}>
        <SelectTrigger aria-labelledby="fruit">
          <SelectValue />
        </SelectTrigger>
      </Select>
    </>
  )
  expect(renderToString(app)).toContain('aria-labelledby="fruit"')
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(app))
  await React.act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  expect(
    container
      .querySelector('[role="combobox"]')!
      .getAttribute("aria-labelledby")
  ).toBe("fruit")
})

const listNaming = () => {
  const list = document.querySelector('[role="listbox"]')!
  return [list.getAttribute("aria-label"), list.getAttribute("aria-labelledby")]
}

test("a list open from the start takes the name its trigger was given", async () => {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () =>
    root!.render(
      <Select items={["Apple", "Pear"]} defaultOpen>
        <SelectTrigger aria-label="Fruit">
          <SelectValue />
        </SelectTrigger>
      </Select>
    )
  )
  await React.act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  expect(listNaming()).toEqual(["Fruit", null])
})

test("a list opened in a Field takes the Field's label as its name", async () => {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () =>
    root!.render(
      <Field>
        <FieldLabel>Fruit</FieldLabel>
        <Select items={["Apple", "Pear"]}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>
      </Field>
    )
  )
  await React.act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  await React.act(async () =>
    container.querySelector<HTMLElement>('[role="combobox"]')!.click()
  )
  await React.act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  expect(listNaming()).toEqual(["Fruit", null])
})
