// @vitest-environment jsdom
import { flushSync, mount, tick, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/owned-style-app.svelte"

test("a part's style that goes away leaves the element, when the owner styles it itself", async () => {
  const app = mount(App, { target: document.body })
  flushSync()
  const img = document.querySelector("img")!
  expect(img.style.length).toBeGreaterThan(0)
  img.dispatchEvent(new Event("load"))
  flushSync()
  await tick()
  expect(img.getAttribute("style") ?? "").toBe("")
  unmount(app)
})
