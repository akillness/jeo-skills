// A checkbox group counts its checkboxes again once they leave, after Svelte
// destroyed the group with them. That read keeps what the group last had,
// rather than reading a `$derived` of the destroyed component.
import { flushSync, mount, unmount } from "svelte"
import { expect, test, vi } from "vitest"
import App from "./apps/group-leaves-app.svelte"

test("a checkbox group leaving with a new value reads none of its destroyed component", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, { target, props: {} })
  flushSync()
  await new Promise((done) => setTimeout(done))
  app.leave()
  flushSync()
  await new Promise((done) => setTimeout(done))
  expect(
    warn.mock.calls.filter(([message]) =>
      String(message).includes("derived_inert")
    )
  ).toEqual([])
  unmount(app)
  target.remove()
  warn.mockRestore()
})
