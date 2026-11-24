import { flushSync, mount, tick, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/field-hint-ssr-app.svelte"

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

test.each([
  "field-control",
  "input",
  "textarea",
  "checkbox",
  "slider",
  "date-picker",
] as const)(
  "a mounted %s keeps its own description ahead of the field's",
  async (control) => {
    const target = document.body.appendChild(document.createElement("div"))
    const app = mount(App, { target, props: { control } })
    cleanup = () => {
      unmount(app)
      target.remove()
    }
    flushSync()
    await tick()
    flushSync()
    const description = target.querySelector(
      '[data-slot="field-description"]'
    )!.id
    const ids = target
      .querySelector('[aria-describedby^="hint"]')
      ?.getAttribute("aria-describedby")
      ?.split(" ")
    expect(ids?.[0]).toBe("hint")
    expect(ids).toContain(description)
    // A date picker's format hint describes it too.
    const hint = target.querySelector('[data-slot="date-picker-hint"]')
    if (hint) {
      expect(ids).toContain(hint.id)
    }
  }
)
