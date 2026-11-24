// A dialog or drawer its parent opens through `open` writes no state of its
// own while Svelte hands the option over, which the setup fails on as a relay,
// and without a title a dialog is named after its trigger.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/controlled-dialog-app.svelte"

// jsdom has no top layer, and no ResizeObserver, which a drawer measures itself with.
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const settle = async () => {
  flushSync()
  await new Promise((done) => setTimeout(done))
  flushSync()
}

for (const kind of ["dialog", "alert dialog"] as const) {
  test(`an untitled ${kind} opened through its prop is named after its trigger`, async () => {
    const target = document.body.appendChild(document.createElement("div"))
    const app = mount(App, { target, props: { kind } })
    flushSync()
    app.set(true)
    await settle()
    const content = target.querySelector(
      '[role="dialog"], [role="alertdialog"]'
    )!
    expect(content.getAttribute("aria-label")).toBe("Edit profile")
    unmount(app)
    target.remove()
  })
}

test("a drawer opened through its prop opens at its default snap point each time", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, { target, props: { kind: "drawer" } })
  flushSync()
  for (const _ of [1, 2]) {
    app.set(true)
    await settle()
    expect(
      target.querySelector('[role="dialog"]')!.getAttribute("data-snap-point")
    ).toBe("content")
    app.set(false)
    await settle()
  }
  unmount(app)
  target.remove()
})
