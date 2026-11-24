import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/removed-focus-app.svelte"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

// Chrome fires `focusout` on a focused element as it's removed, while Svelte
// removes the block. jsdom doesn't, so this does it the same way.
const remove = Element.prototype.remove
Element.prototype.remove = function () {
  const focused = document.activeElement
  if (focused && focused !== document.body && this.contains(focused)) {
    focused.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
    )
  }
  remove.call(this)
}

let target: HTMLElement
let app: ReturnType<typeof mount> & { hide: () => void }
afterEach(() => {
  unmount(app)
  target.remove()
})

for (const kind of ["combobox", "date-picker", "trigger-menu"]) {
  test(`removing a ${kind} while its input has focus`, () => {
    target = document.body.appendChild(document.createElement("div"))
    app = mount(App, { target, props: { kind } })
    flushSync()
    const input = target.querySelector<HTMLElement>("input, textarea")!
    input.focus()
    app.hide()
    flushSync()
    expect(target.querySelector("input, textarea")).toBeNull()
  })
}
