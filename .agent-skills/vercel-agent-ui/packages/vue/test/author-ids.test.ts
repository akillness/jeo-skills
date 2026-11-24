// @vitest-environment jsdom
// An id passed to a part is its element's, and every reference to the part points at it.
import { createApp, defineComponent, h, nextTick, ref } from "vue"
import { expect, test } from "vitest"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"
import { Toolbar, ToolbarLink } from "../src/toolbar"

Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

function mount(render: () => unknown) {
  const el = document.body.appendChild(document.createElement("div"))
  const app = createApp(defineComponent({ setup: () => render }))
  app.mount(el)
  return { el, unmount: () => (app.unmount(), el.remove()) }
}

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 10))
  await nextTick()
}

test("a dialog's parts keep the ids passed to them, and the dialog points at them", async () => {
  const { el, unmount } = mount(() =>
    h(Dialog, { defaultOpen: true, modal: false }, () => [
      h(DialogTrigger, { id: "mine" }, () => "Edit"),
      h(DialogContent, { id: "sheet" }, () => [
        h(DialogTitle, { id: "heading" }, () => "Profile"),
        h(DialogDescription, { id: "hint" }, () => "Change it."),
      ]),
    ])
  )
  await settle()
  const trigger = el.querySelector("button")!
  const content = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(trigger.id).toBe("mine")
  expect(content.id).toBe("sheet")
  expect(document.querySelector("h2")!.id).toBe("heading")
  expect(document.querySelector("p")!.id).toBe("hint")
  expect(trigger.getAttribute("aria-controls")).toBe("sheet")
  expect(content.getAttribute("aria-labelledby")).toBe("heading")
  expect(content.getAttribute("aria-describedby")).toBe("hint")
  unmount()
})

test("a tab keeps the id passed to it, and its panel is labelled by it", async () => {
  const { el, unmount } = mount(() =>
    h(Tabs, { defaultValue: "a" }, () => [
      h(TabsList, { "aria-label": "Settings" }, () =>
        h(TabsTab, { value: "a", id: "account" }, () => "Account")
      ),
      h(TabsPanel, { value: "a" }, () => "A"),
    ])
  )
  await settle()
  const tab = el.querySelector<HTMLElement>('[role="tab"]')!
  const panel = el.querySelector<HTMLElement>('[role="tabpanel"]')!
  expect(tab.id).toBe("account")
  expect(panel.getAttribute("aria-labelledby")).toBe("account")
  expect(tab.getAttribute("aria-controls")).toBe(panel.id)
  unmount()
})

test("a tab's panel follows the id passed to the tab as it changes", async () => {
  const id = ref("first")
  const { el, unmount } = mount(() =>
    h(Tabs, { defaultValue: "a" }, () => [
      h(TabsList, { "aria-label": "Settings" }, () =>
        h(TabsTab, { value: "a", id: id.value }, () => "Account")
      ),
      h(TabsPanel, { value: "a" }, () => "A"),
    ])
  )
  await settle()
  id.value = "second"
  await settle()
  expect(el.querySelector('[role="tab"]')!.id).toBe("second")
  expect(
    el.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")
  ).toBe("second")
  unmount()
})

test("a part whose key is its id keeps the id on its element", async () => {
  const { el, unmount } = mount(() =>
    h(Toolbar, { "aria-label": "Formatting" }, () =>
      h(ToolbarLink, { id: "docs", href: "#docs" }, () => "Docs")
    )
  )
  await settle()
  expect(el.querySelector("a")!.id).toBe("docs")
  unmount()
})
