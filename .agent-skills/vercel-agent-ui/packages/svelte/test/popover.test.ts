import { createPopoverController } from "@ui-sdk/core/popover"
import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/popover-app.svelte"

const byLabel = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
const press = (key: string) =>
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  )
// Lets the core's microtasks run, like a press opening a popup, then renders.
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
}
let target: HTMLElement
let app: ReturnType<typeof mount>
async function render(props: Record<string, unknown> = {}) {
  target = document.createElement("div")
  document.body.append(target)
  app = mount(App, { target, props })
  await settle()
  return target
}
afterEach(() => {
  unmount(app)
  target.remove()
})

// jsdom has no top layer, so content portals to the body, like in an older browser.
test("Escape closes a popover whose content moved to the body", async () => {
  await render()
  const trigger = target.querySelector<HTMLElement>(
    '[data-slot="popover-trigger"]'
  )!
  trigger.click()
  await settle()
  const content = byLabel("Outer")!
  expect(content.parentElement).toBe(document.body)
  press("Escape")
  await settle()
  expect(byLabel("Outer")).toBeNull()
})

test("a trigger connected through a controller binds once the popover mounts", async () => {
  const controller = createPopoverController()
  await render({ controller, remote: true })
  const remote = [...target.querySelectorAll("button")].find((el) =>
    el.textContent?.startsWith("Share")
  )!
  expect(remote.getAttribute("aria-keyshortcuts")).toMatch(
    /^(Meta|Control)\+E$/
  )
})
