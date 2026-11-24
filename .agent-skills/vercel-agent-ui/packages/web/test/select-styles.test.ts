// @vitest-environment jsdom
// The select trigger and clear bind the buttons inside their wrappers, so the
// examples' styles reach those slots as descendants, never as children.
import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeAll, expect, test } from "vitest"
import { defineSelectElements } from "../src/select"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineSelectElements()
})

const wrapped = ["select-trigger", "select-clear"]

test("the trigger's and clear's slots are on the buttons inside their wrappers", async () => {
  document.body.innerHTML = `
    <ui-select default-value="a">
      <div data-slot="row">
        <ui-select-trigger><button></button></ui-select-trigger>
        <ui-select-clear><button aria-label="Clear"></button></ui-select-clear>
      </div>
      <ui-select-content><ui-select-item value="a">A</ui-select-item></ui-select-content>
    </ui-select>`
  await wait()
  const row = document.querySelector('[data-slot="row"]')!
  for (const slot of wrapped) {
    expect(row.querySelector(`[data-slot="${slot}"]`)?.localName).toBe("button")
    expect(row.querySelector(`:scope > [data-slot="${slot}"]`)).toBeNull()
  }
})

test("select.css never reaches the trigger or clear through a child combinator", () => {
  const css = readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../examples/components/select/select.css"
    ),
    "utf8"
  )
  for (const slot of wrapped) {
    expect(css).not.toMatch(new RegExp(`>\\s*\\[data-slot="${slot}"\\]`))
  }
})
