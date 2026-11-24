// A navigation menu whose value the parent binds writes no state of its own
// while Svelte hands the value over, which the setup fails on as a relay.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/bound-navigation-menu-app.svelte"

// jsdom has no top layer.
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

const settle = async () => {
  flushSync()
  await new Promise((done) => setTimeout(done))
  flushSync()
}

for (const viewport of [true, false]) {
  test(`a bound value opens, switches and closes it (${viewport ? "viewport" : "no viewport"})`, async () => {
    const target = document.body.appendChild(document.createElement("div"))
    const app = mount(App, { target, props: { viewport } })
    const expanded = () =>
      [...target.querySelectorAll('[aria-expanded="true"]')].map((trigger) =>
        trigger.textContent?.trim()
      )
    await settle()
    for (const value of ["a", "b", null, "b", null]) {
      app.set(value)
      await settle()
      expect(expanded()).toEqual(value === null ? [] : [value])
    }
    unmount(app)
    target.remove()
  })
}
