// A dialog's Close action and a toast's buttons hear how they were pressed,
// like Button's handler, for the changes they make after an `await`.
import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import { withSource } from "../src/observe"
import { createToaster } from "../src/toast"
import App from "./apps/close-actions-app.svelte"

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

function render() {
  const log: string[] = []
  const toaster = createToaster<string>()
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, {
    target,
    props: { log: (entry: string) => log.push(entry), toaster },
  })
  cleanup = () => unmount(app)
  flushSync()
  return { log, toaster }
}

const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === name
  )!

test("a dialog's Close action hears how it was pressed", () => {
  const { log } = render()
  withSource("agent", () => buttonNamed("Save").click())
  expect(log).toEqual(["save:agent"])
})

test("a toast's action and cancel buttons hear how they were pressed", () => {
  const { log, toaster } = render()
  toaster("Deleted", {
    duration: Infinity,
    action: {
      label: "Undo",
      onAction: (_event, { source }) => log.push(`undo:${source}`),
    },
  })
  toaster("Saved", {
    duration: Infinity,
    cancel: {
      label: "Keep",
      onCancel: (_event, { source }) => log.push(`keep:${source}`),
    },
  })
  flushSync()
  withSource("agent", () => buttonNamed("Undo").click())
  withSource("keyboard", () => buttonNamed("Keep").click())
  expect(log).toEqual(["undo:agent", "keep:keyboard"])
})
