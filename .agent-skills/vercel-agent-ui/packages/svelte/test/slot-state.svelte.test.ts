import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/slot-state-app.svelte"

afterEach(() => document.body.replaceChildren())

test("state derived as new objects renders once per change to their values", () => {
  let renders = 0
  const app = mount(App, {
    target: document.body,
    props: { onrender: () => renders++ },
  })
  flushSync()
  const output = () => document.querySelector("output")!.textContent
  expect(output()).toBe("0,0")
  expect(renders).toBe(1)

  app.api.move(4)
  flushSync()
  expect(output()).toBe("4,4")
  expect(renders).toBe(2)

  app.api.rename("Sprint")
  flushSync()
  expect(renders).toBe(2)
  unmount(app)
})
