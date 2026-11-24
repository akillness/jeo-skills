// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { tabs } from "../src/components/tabs/tabs"
import { bind } from "../src/foundation/kernel/part"

afterEach(() => document.body.replaceChildren())

// The tab with "general" bound, as an adapter binds it, while "billing" hasn't.
async function bindGeneral() {
  const instance = tabs({ id: "settings", defaultValue: "billing" })
  const list = document.body.appendChild(document.createElement("div"))
  const tab = list.appendChild(document.createElement("button"))
  const unbind = [
    bind(instance.part("list"), list),
    bind(instance.part("tab", { value: "general" }), tab),
  ]
  await Promise.resolve()
  return {
    value: () => instance.get().value,
    destroy: () => {
      unbind.forEach((leave) => leave())
      instance.destroy()
    },
  }
}

test("a default tab the server streamed in keeps the selection until it hydrates", async () => {
  const streamed = document.body.appendChild(document.createElement("button"))
  streamed.id = "settings-tab-billing"
  const view = await bindGeneral()
  expect(view.value()).toBe("billing")
  view.destroy()
})

test("without the default's tab in the page, the first tab stands in", async () => {
  const view = await bindGeneral()
  expect(view.value()).toBe("general")
  view.destroy()
})
