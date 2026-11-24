// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import * as Vue from "vue"
import { compileTemplate } from "vue/compiler-sfc"
import { createApp, nextTick, type App } from "vue"
import { Field, FieldControl, FieldLabel } from "../src/field"
import { TriggerMenu, TriggerMenuInput } from "../src/trigger-menu"

Element.prototype.getAnimations ??= () => []

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

test("a field control binds a trigger menu input that renders its own #render element", async () => {
  const { code } = compileTemplate({
    source: `
      <TriggerMenu :triggers="[{ char: '@', items: [] }]">
        <Field>
          <FieldLabel>Task</FieldLabel>
          <FieldControl>
            <template #render="{ props }">
              <TriggerMenuInput v-bind="props" placeholder="Type @">
                <template #render="{ props: input }"><input v-bind="input" /></template>
              </TriggerMenuInput>
            </template>
          </FieldControl>
        </Field>
      </TriggerMenu>`,
    filename: "task.vue",
    id: "task",
    compilerOptions: { mode: "function" },
  })
  const el = document.body.appendChild(document.createElement("div"))
  app = createApp({
    components: {
      TriggerMenu,
      Field,
      FieldControl,
      FieldLabel,
      TriggerMenuInput,
    },
    render: new Function("Vue", code)(Vue),
  })
  app.mount(el)
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const input = el.querySelector("input")!
  expect(el.querySelectorAll("input, textarea")).toHaveLength(1)
  expect(input.id).toBeTruthy()
  expect(el.querySelector("label")!.htmlFor).toBe(input.id)
  expect(input.getAttribute("aria-labelledby")).toBe(
    el.querySelector("label")!.id
  )
  expect(input.getAttribute("role")).toBe("combobox")
})
