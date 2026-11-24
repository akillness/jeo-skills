// @vitest-environment jsdom
// A select trigger shows its value when its content renders nothing, the way
// Vue's own `<slot>` falls back.
import { afterEach, expect, test } from "vitest"
import * as Vue from "vue"
import { compileTemplate } from "vue/compiler-sfc"
import { Select, SelectTrigger, SelectValue } from "../src/select"

Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let app: Vue.App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

function mount(template: string, setup: () => object) {
  const { code } = compileTemplate({
    source: template,
    filename: "select.vue",
    id: "select",
    compilerOptions: { mode: "function" },
  })
  const el = document.body.appendChild(document.createElement("div"))
  app = Vue.createApp({
    components: { Select, SelectTrigger, SelectValue },
    setup,
    render: new Function("Vue", code)(Vue),
  })
  app.mount(el)
  return el
}

test("a select trigger whose content is left out by v-if shows the value", async () => {
  const custom = Vue.ref(false)
  const el = mount(
    `<Select :items="['apple', 'banana']" default-value="banana">
      <SelectTrigger><span v-if="custom">Custom</span></SelectTrigger>
    </Select>`,
    () => ({ custom })
  )
  const trigger = el.querySelector("button")!
  expect(trigger.textContent).toBe("banana")
  custom.value = true
  await Vue.nextTick()
  expect(trigger.textContent).toBe("Custom")
})
