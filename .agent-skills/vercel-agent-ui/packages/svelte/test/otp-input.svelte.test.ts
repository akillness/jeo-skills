// OTPInput splits its props between its root and its input, and passes
// Svelte's attachments, which come under symbol keys, to the root.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/otp-input-attach-app.svelte"

test("an attachment on OTPInput attaches to its root", () => {
  const attached: Element[] = []
  const app = mount(App, {
    target: document.body,
    props: { attach: (el: HTMLElement) => void attached.push(el) },
  })
  flushSync()
  expect(attached).toEqual([document.querySelector('[data-slot="otp-input"]')])
  expect(document.querySelector("input")?.getAttribute("aria-label")).toBe(
    "Code"
  )
  unmount(app)
  document.body.replaceChildren()
})
