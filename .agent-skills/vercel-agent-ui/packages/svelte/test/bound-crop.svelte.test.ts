// A cropper its parent controls through `bind:crop` writes no state of its own
// when another option changes, which the setup fails on as a relay.
import { flushSync, mount, unmount } from "svelte"
import { test } from "vitest"
import App from "./apps/bound-crop-app.svelte"

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

test("a bound crop stays put while another option changes", () => {
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, { target })
  flushSync()
  app.toggle()
  flushSync()
  app.toggle()
  flushSync()
  unmount(app)
  target.remove()
})
