import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/token-snippet-app.svelte"

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

test("a token input's tokens follow a new token snippet", () => {
  const target = document.body.appendChild(document.createElement("div"))
  const props = $state({ loud: false })
  const app = mount(App, { target, props })
  cleanup = () => {
    unmount(app)
    target.remove()
  }
  flushSync()
  const shown = () =>
    [...target.querySelectorAll("[data-content]")].map((el) => el.textContent)
  expect(shown()).toEqual(["Ada"])
  props.loud = true
  flushSync()
  expect(shown()).toEqual(["ADA"])
})

test("a token input's tokens show only their snippet, or their label without one", () => {
  const target = document.body.appendChild(document.createElement("div"))
  const props = $state({ loud: false, plain: false })
  const app = mount(App, { target, props })
  cleanup = () => {
    unmount(app)
    target.remove()
  }
  flushSync()
  const hosts = () =>
    [...target.querySelectorAll("[data-slot='token-input-host']")].map(
      (host) => host.textContent
    )
  expect(hosts()).toEqual(["Ada person"])
  props.plain = true
  flushSync()
  expect(hosts()).toEqual(["Ada person"])
  expect(target.querySelector("[data-content]")).toBeNull()
  props.plain = false
  flushSync()
  expect(hosts()).toEqual(["Ada person"])
  expect(target.querySelectorAll("[data-content]")).toHaveLength(1)
})
