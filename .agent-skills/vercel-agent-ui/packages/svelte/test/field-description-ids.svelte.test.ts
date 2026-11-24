import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/field-descriptions-app.svelte"

let app: ReturnType<typeof mount> | undefined

afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
})

test("each description gets an id of its own, and the control names them all", async () => {
  app = mount(App, { target: document.body })
  flushSync()
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
  const names = document
    .querySelector("input")!
    .getAttribute("aria-describedby")!
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent)
  expect(names).toEqual(["First", "Second"])
})
