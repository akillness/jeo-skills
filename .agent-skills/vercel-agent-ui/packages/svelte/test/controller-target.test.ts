// A trigger given another controller keeps its element and binds it to the new popover.
import { createMenuController } from "@ui-sdk/core/menu"
import { createPopoverController } from "@ui-sdk/core/popover"
import { createSelectController } from "@ui-sdk/core/select"
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import SwapApp from "./apps/controller-swap-app.svelte"
import App from "./apps/controller-target-app.svelte"

// Lets the core's microtasks run, like a press opening a popup, then renders.
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
}

test("a trigger given another controller opens that controller's popover and lets go of the first", async () => {
  const first = createPopoverController()
  const second = createPopoverController()
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, { target, props: { first, second } })
  await settle()
  app.swap()
  await settle()
  const trigger = target.querySelector("button")!
  first.open()
  await settle()
  expect(trigger.getAttribute("aria-expanded")).toBe("false")
  first.close()
  trigger.click()
  await settle()
  expect(second.isOpen()).toBe(true)
  expect(first.isOpen()).toBe(false)
  unmount(app)
  target.remove()
})

test("a focused trigger keeps its element and its focus when its controller changes", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, {
    target,
    props: {
      first: createPopoverController(),
      second: createPopoverController(),
    },
  })
  await settle()
  const before = target.querySelector("button")!
  before.focus()
  app.swap()
  await settle()
  const after = target.querySelector("button")!
  expect({
    same: after === before,
    focused: document.activeElement === after,
  }).toEqual({
    same: true,
    focused: true,
  })
  unmount(app)
  target.remove()
})

test("a select trigger given another controller keeps its element and shows that select's value", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const selects = [
    createSelectController<string>(),
    createSelectController<string>(),
  ] as const
  const menus = [createMenuController(), createMenuController()] as const
  const app = mount(SwapApp, {
    target,
    props: { selects: [...selects], menus: [...menus] },
  })
  await settle()
  const before = target.querySelector<HTMLElement>("[aria-label=Fruit]")!
  before.focus()
  app.swap()
  await settle()
  const after = target.querySelector<HTMLElement>("[aria-label=Fruit]")!
  expect({
    same: after === before,
    focused: document.activeElement === after,
    text: after.textContent,
  }).toEqual({
    same: true,
    focused: true,
    text: "Pear",
  })
  unmount(app)
  target.remove()
})

test("a context menu area given another controller keeps its element and opens that controller's menu", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const selects = [
    createSelectController<string>(),
    createSelectController<string>(),
  ] as const
  const menus = [createMenuController(), createMenuController()] as const
  const app = mount(SwapApp, {
    target,
    props: { selects: [...selects], menus: [...menus] },
  })
  await settle()
  const before = target.querySelector("[data-testid=area]")!
  app.swap()
  await settle()
  const after = target.querySelector("[data-testid=area]")!
  after.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 5,
      clientY: 5,
    })
  )
  await settle()
  expect({
    same: after === before,
    first: menus[0].isOpen(),
    second: menus[1].isOpen(),
  }).toEqual({
    same: true,
    first: false,
    second: true,
  })
  unmount(app)
  target.remove()
})
