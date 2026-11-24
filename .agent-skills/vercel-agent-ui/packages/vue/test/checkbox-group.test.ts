// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { createApp, h, nextTick, ref, type App } from "vue"
import { Checkbox, CheckboxGroup } from "../src/checkbox"

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

test("a checkbox group disabled and named after mount disables and names its checkboxes", async () => {
  const disabled = ref(false)
  const name = ref<string>()
  const root = document.body.appendChild(document.createElement("form"))
  app = createApp(() =>
    h(
      CheckboxGroup,
      { "aria-label": "Toppings", disabled: disabled.value, name: name.value },
      () => h(Checkbox, { value: "cheese", "aria-label": "Cheese" })
    )
  )
  app.mount(root)
  await nextTick()
  disabled.value = true
  name.value = "toppings"
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve))
  const checkbox = document.querySelector('[role="checkbox"]')!
  const input = document.querySelector<HTMLInputElement>(
    '[data-slot="checkbox-input"]'
  )!
  expect([
    checkbox.getAttribute("aria-disabled"),
    input.disabled,
    input.name,
  ]).toEqual(["true", true, "toppings"])
})
