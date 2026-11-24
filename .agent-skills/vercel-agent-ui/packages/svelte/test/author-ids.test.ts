// An id passed to a part is its element's, and every reference to the part points at it.
import { flushSync, mount, unmount } from "svelte"
import { afterAll, beforeAll, expect, test } from "vitest"
import App from "./apps/author-ids-app.svelte"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let target: HTMLElement
let app: ReturnType<typeof mount>

beforeAll(async () => {
  target = document.body.appendChild(document.createElement("div"))
  app = mount(App, { target })
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
})

afterAll(() => {
  unmount(app)
  target.remove()
})

test("a dialog's parts keep the ids passed to them, and the dialog points at them", () => {
  const trigger = document.getElementById("mine")!
  const content = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(trigger.localName).toBe("button")
  expect(content.id).toBe("sheet")
  expect(document.querySelector("h2")!.id).toBe("heading")
  expect(content.querySelector("p")!.id).toBe("hint")
  expect(trigger.getAttribute("aria-controls")).toBe("sheet")
  expect(content.getAttribute("aria-labelledby")).toBe("heading")
  expect(content.getAttribute("aria-describedby")).toBe("hint")
})

test("a tab keeps the id passed to it, and its panel is labelled by it", () => {
  const tab = document.querySelector<HTMLElement>('[role="tab"]')!
  const panel = document.querySelector<HTMLElement>('[role="tabpanel"]')!
  expect(tab.id).toBe("account")
  expect(panel.getAttribute("aria-labelledby")).toBe("account")
  expect(tab.getAttribute("aria-controls")).toBe(panel.id)
})

test("a part whose key is its id keeps the id on its element", () => {
  expect(target.querySelector("a")!.id).toBe("docs")
})

test("a tab's panel follows the id passed to the tab as it changes", async () => {
  app.renameTab("billing")
  flushSync()
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
  expect(document.querySelector('[role="tab"]')!.id).toBe("billing")
  expect(
    document.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")
  ).toBe("billing")
})
