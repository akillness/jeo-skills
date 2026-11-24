// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { createApp, h, nextTick, type App } from "vue"
import { Field, FieldDescription, Input } from "../src"

const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  document.body.replaceChildren()
})

test("each description gets an id of its own, and the control names them all", async () => {
  const el = document.body.appendChild(document.createElement("div"))
  const app = createApp(() =>
    h(Field, null, () => [
      h(FieldDescription, null, () => "First"),
      h(Input),
      h(FieldDescription, null, () => "Second"),
    ])
  )
  apps.push(app)
  app.mount(el)
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const names = el
    .querySelector("input")!
    .getAttribute("aria-describedby")!
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent)
  expect(names).toEqual(["First", "Second"])
})
