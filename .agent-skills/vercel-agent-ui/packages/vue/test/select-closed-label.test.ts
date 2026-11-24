// @vitest-environment jsdom
import { expect, test } from "vitest"
import { createApp, h, nextTick, ref } from "vue"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../src"

Element.prototype.getAnimations ??= () => []

test("a closed select shows its item's label after the label changes", async () => {
  const count = ref(0)
  const el = document.body.appendChild(document.createElement("div"))
  const app = createApp({
    render: () =>
      h(Select, { defaultValue: "a" }, () => [
        h(SelectTrigger, { "aria-label": "Pick" }, () => h(SelectValue)),
        h(SelectContent, null, () =>
          h(SelectItem, { value: "a" }, () => `Unknown · ${count.value}`)
        ),
      ]),
  })
  app.mount(el)
  await new Promise((resolve) => setTimeout(resolve))
  const value = () =>
    el.querySelector('[data-slot="select-value"]')?.textContent
  expect(value()).toBe("Unknown · 0")
  count.value++
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve))
  expect(value()).toBe("Unknown · 1")
  app.unmount()
  el.remove()
})
