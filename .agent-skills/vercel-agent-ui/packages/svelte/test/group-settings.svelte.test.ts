// A checkbox group's own settings reach its checkboxes when they change after
// mount, like a form disabling its choices while it submits.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/group-settings-app.svelte"

test("a checkbox group disabled and named after mount disables and names its checkboxes", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const props = $state<{ disabled: boolean; name?: string }>({
    disabled: false,
  })
  const app = mount(App, { target, props })
  flushSync()
  await new Promise((done) => setTimeout(done))
  props.disabled = true
  props.name = "toppings"
  flushSync()
  await new Promise((done) => setTimeout(done))
  const checkbox = target.querySelector('[role="checkbox"]')!
  const input = target.querySelector<HTMLInputElement>(
    '[data-slot="checkbox-input"]'
  )!
  expect([
    checkbox.getAttribute("aria-disabled"),
    input.disabled,
    input.name,
  ]).toEqual(["true", true, "toppings"])
  unmount(app)
  target.remove()
})
