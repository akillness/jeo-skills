import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import { createToaster } from "../src/toast"
import App from "./apps/toast-action-app.svelte"

// jsdom has no ResizeObserver, which a toast measures itself with.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let cleanup = () => {}
afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

test("an action with its own handler renders for a toast that has no action", () => {
  const log: string[] = []
  const toaster = createToaster<string>()
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, {
    target,
    props: { log: (entry: string) => log.push(entry), toaster },
  })
  cleanup = () => unmount(app)
  toaster("Saved", { duration: Infinity })
  flushSync()
  const action = document.querySelector<HTMLButtonElement>(
    '[data-slot="toast-action"]'
  )
  expect(action?.textContent).toBe("")
  action?.click()
  expect(log).toEqual(["action"])
})
