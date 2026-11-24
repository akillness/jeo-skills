// @vitest-environment jsdom
// A dialog mounted open, like one an overlay manager opens, has no trigger and
// no open to record where focus was, so it returns focus to what had it as it mounted.
import { afterEach, expect, test } from "vitest"
import { dialog } from "../src/components/dialog/dialog"
import { menu } from "../src/components/menu/menu"
import { mount } from "../src/testing"

afterEach(() => document.body.replaceChildren())

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test("Escape returns focus to what had it when the dialog mounted open", async () => {
  const opener = document.body.appendChild(document.createElement("button"))
  opener.textContent = "Open"
  opener.focus()
  const view = mount(
    dialog,
    { defaultOpen: true },
    `<content><title>Profile</title><close>Close</close></content>`
  )
  await settle()
  expect(view.part("content")!.contains(document.activeElement)).toBe(true)
  await view.keys("Escape")
  await settle()
  expect(view.state.open).toBe(false)
  expect(document.activeElement).toBe(opener)
  view.unmount()
})

test("focus on the page body when it mounted gives it nowhere to return to", async () => {
  const view = mount(
    dialog,
    { defaultOpen: true },
    `<content><title>Profile</title><close>Close</close></content>`
  )
  await settle()
  await view.keys("Escape")
  await settle()
  expect(document.activeElement).toBe(document.body)
  view.unmount()
})

test("a dialog a menu item mounts open returns focus to the menu's trigger", async () => {
  const actions = mount(
    menu,
    {},
    `<trigger>Actions</trigger><content><item value="edit">Edit</item></content>`
  )
  await actions.click(actions.part("trigger")!)
  await settle()
  const item = actions.part("item")!
  let view!: ReturnType<typeof mount<typeof dialog>>
  item.addEventListener(
    "click",
    () => {
      view = mount(
        dialog,
        { defaultOpen: true },
        `<content><title>Edit</title><close>Close</close></content>`
      )
    },
    { capture: true }
  )
  await actions.click(item)
  await settle()
  expect(view.part("content")!.contains(document.activeElement)).toBe(true)
  await view.keys("Escape")
  await settle()
  expect(document.activeElement).toBe(actions.part("trigger"))
  view.unmount()
  actions.unmount()
})

test.each(["with its focus inside", "after a framework removed its element"])(
  "a dialog removed from the page while open returns focus to what had it, %s",
  async (order) => {
    const opener = document.body.appendChild(document.createElement("button"))
    opener.focus()
    const view = mount(
      dialog,
      { defaultOpen: true },
      `<content><title>Profile</title><close>Close</close></content>`
    )
    await settle()
    expect(view.part("content")!.contains(document.activeElement)).toBe(true)
    if (order !== "with its focus inside") {
      view.part("content")!.remove()
    }
    view.unmount()
    await settle()
    expect(document.activeElement).toBe(opener)
  }
)

test("a dialog removed along with what opened it leaves focus alone on the new page", async () => {
  const opener = document.body.appendChild(document.createElement("button"))
  opener.focus()
  const view = mount(
    dialog,
    { defaultOpen: true },
    `<content><title>Profile</title><close>Close</close></content>`
  )
  await settle()
  opener.replaceWith(document.createElement("input"))
  view.unmount()
  await settle()
  expect(document.activeElement).toBe(document.body)
})

test("a dialog removed along with the menu that opened it leaves focus alone on the new page", async () => {
  const actions = mount(
    menu,
    {},
    `<trigger>Actions</trigger><content><item value="edit">Edit</item></content>`
  )
  const app = document.body.appendChild(document.createElement("div"))
  let page: Element = actions.part("trigger")!
  while (page.parentElement !== document.body) {
    page = page.parentElement!
  }
  app.append(page)
  await actions.click(actions.part("trigger")!)
  await settle()
  const item = actions.part("item")!
  let view!: ReturnType<typeof mount<typeof dialog>>
  item.addEventListener(
    "click",
    () => {
      view = mount(
        dialog,
        { defaultOpen: true },
        `<content><title>Edit</title><close>Close</close></content>`
      )
    },
    { capture: true }
  )
  await actions.click(item)
  await settle()
  page.replaceWith(document.createElement("input"))
  view.unmount()
  actions.unmount()
  await settle()
  expect(document.activeElement).toBe(document.body)
})

test("a dialog removed along with the row whose menu opened it moves focus to the next row", async () => {
  const actions = mount(
    menu,
    {},
    `<trigger>Actions</trigger><content><item value="delete">Delete</item></content>`
  )
  const list = document.body.appendChild(document.createElement("ul"))
  let row: Element = actions.part("trigger")!
  while (row.parentElement !== document.body) {
    row = row.parentElement!
  }
  const following = document.createElement("button")
  list.append(row, following)
  await actions.click(actions.part("trigger")!)
  await settle()
  const item = actions.part("item")!
  let view!: ReturnType<typeof mount<typeof dialog>>
  item.addEventListener(
    "click",
    () => {
      view = mount(
        dialog,
        { defaultOpen: true },
        `<content><title>Delete</title><close>Close</close></content>`
      )
    },
    { capture: true }
  )
  await actions.click(item)
  await settle()
  row.remove()
  view.unmount()
  actions.unmount()
  await settle()
  expect(document.activeElement).toBe(following)
})
