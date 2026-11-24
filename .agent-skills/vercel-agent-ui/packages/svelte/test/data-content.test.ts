// A data select or menu renders its own content once the app's content leaves.
import { createMenuController } from "@ui-sdk/core/menu"
import { createSelectController } from "@ui-sdk/core/select"
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/data-content-app.svelte"

// Lets the core's microtasks run, like a press opening a popup, then renders.
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
}

const texts = (target: Element, selector: string) =>
  [...target.ownerDocument.querySelectorAll(selector)].map((element) =>
    element.textContent?.trim()
  )

test("a data select renders its items once the app's SelectContent is removed", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const select = createSelectController<string>()
  const app = mount(App, {
    target,
    props: { select, menu: createMenuController() },
  })
  await settle()
  app.dropOwn()
  await settle()
  void select.open()
  await settle()
  expect(texts(target, "[role=option]")).toEqual(["Apple", "Pear"])
  unmount(app)
  target.remove()
})

test("a data menu renders its items once the app's MenuContent is removed", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const menu = createMenuController()
  const app = mount(App, {
    target,
    props: { select: createSelectController<string>(), menu },
  })
  await settle()
  app.dropOwn()
  await settle()
  void menu.open()
  await settle()
  expect(texts(target, "[role=menuitem]")).toEqual(["Copy", "Paste"])
  unmount(app)
  target.remove()
})
