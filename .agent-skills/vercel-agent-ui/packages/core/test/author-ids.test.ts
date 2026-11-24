// @vitest-environment jsdom
// An id an author writes on a part's element wins over the one its slot makes,
// and every reference to that part points at it.
import { expect, test, vi } from "vitest"
import { triggerMenu } from "../src/components/trigger-menu/trigger-menu"
import { applyAttrs, live } from "../src/foundation/kernel/live"
import { field, fieldSet } from "../src/components/field/field"
import {
  attrs,
  bind,
  liveAttrs,
  subscribe,
  takeOwnId,
} from "../src/foundation/kernel/part"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { fakeEditor } from "./fake-editor"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}
Element.prototype.getAnimations ??= () => []

const tabs = definePrimitive({
  name: "tabs",
  state: () => ({ highlighted: "a" }),
  live: ["highlighted"],
  api: () => ({}),
  slots: (slot) => ({
    list: slot({
      live: live((state, { id }) => ({
        "aria-activedescendant": `${id}-tab-${state.highlighted}`,
      })),
    }),
    tab: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { id, props }) => ({
        id: `${id}-tab-${props.value}`,
        "aria-controls": `${id}-panel-${props.value}`,
      }),
    }),
    panel: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { id, props }) => ({
        id: `${id}-panel-${props.value}`,
        "aria-labelledby": `${id}-tab-${props.value}`,
      }),
    }),
    link: slot({ attrs: () => ({ role: "link" }) }),
  }),
})

const element = (id?: string, tag = "div") => {
  const el = document.createElement(tag)
  if (id) {
    el.id = id
  }
  return el
}

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve))
// A changed attribute reaches the kernel a microtask later, which reads it a microtask after that.
const settleChange = () => new Promise((resolve) => setTimeout(resolve))

test("an element's own id wins, and references to its part point at it", async () => {
  const instance = tabs({ id: "t" })
  const tab = instance.part("tab", { value: "a" })
  const panel = instance.part("panel", { value: "a" })
  bind(tab, element("account"))
  bind(panel, element("t-panel-a"))
  await settle()
  expect(attrs(tab)["aria-controls"]).toBe("t-panel-a")
  expect(attrs(panel)["aria-labelledby"]).toBe("account")
})

test("a part's attributes keep the id its slot makes, which the author's replaces on the element", async () => {
  const instance = tabs({ id: "t" })
  const tab = instance.part("tab", { value: "a" })
  bind(tab, element("account"))
  await settle()
  expect(attrs(tab).id).toBe("t-tab-a")
})

test("references follow an author's id while its element is bound, and parts hear both changes", async () => {
  const instance = tabs({ id: "t" })
  const tab = instance.part("tab", { value: "a" })
  const panel = instance.part("panel", { value: "a" })
  let heard = 0
  subscribe(panel, () => heard++)
  const unbind = bind(tab, element("account"))
  await settle()
  expect(heard).toBe(1)
  expect(attrs(panel)["aria-labelledby"]).toBe("account")
  unbind()
  await settle()
  expect(heard).toBe(2)
  expect(attrs(panel)["aria-labelledby"]).toBe("t-tab-a")
})

test("references follow an author's id that changes or goes while its element is bound", async () => {
  const instance = tabs({ id: "t" })
  const panel = instance.part("panel", { value: "a" })
  const el = element("first")
  bind(instance.part("tab", { value: "a" }), el)
  await settle()
  el.id = "second"
  await settleChange()
  expect(attrs(panel)["aria-labelledby"]).toBe("second")
  // What a framework renders once the `id` prop is gone.
  el.id = "t-tab-a"
  await settleChange()
  expect(attrs(panel)["aria-labelledby"]).toBe("t-tab-a")
})

test("a field set points at its legend's and description's author ids as they change", async () => {
  const instance = fieldSet({ id: "s" })
  const set = instance.part("set")
  const legend = element("profile-title")
  const description = element("profile-help")
  bind(instance.part("legend", { id: "profile-title" }), legend)
  bind(instance.part("description", { id: "profile-help" }), description)
  await settleChange()
  expect(attrs(set)).toMatchObject({
    "aria-labelledby": "profile-title",
    "aria-describedby": "profile-help",
  })
  legend.id = "account-title"
  description.id = "account-help"
  await settleChange()
  expect(attrs(set)).toMatchObject({
    "aria-labelledby": "account-title",
    "aria-describedby": "account-help",
  })
})

test("live references follow an author's id too", async () => {
  const instance = tabs({ id: "t" })
  const list = instance.part("list")
  bind(instance.part("tab", { value: "a" }), element("account"))
  await settle()
  expect(liveAttrs(list)["aria-activedescendant"]).toBe("account")
})

test("an id a part takes as it renders names it in the parts rendered after it, with no element bound", () => {
  const instance = tabs({ id: "t" })
  takeOwnId(instance.part("tab", { value: "a" }), "account")
  expect(attrs(instance.part("panel", { value: "a" }))["aria-labelledby"]).toBe(
    "account"
  )
})

test("parts hear once the element of a part that took its id as it rendered binds", async () => {
  const instance = tabs({ id: "t" })
  const panel = instance.part("panel", { value: "a" })
  const tab = instance.part("tab", { value: "a" })
  let heard = 0
  subscribe(panel, () => heard++)
  takeOwnId(tab, "account")
  bind(tab, element("account"))
  await settle()
  expect(heard).toBe(1)
  expect(attrs(panel)["aria-labelledby"]).toBe("account")
})

test("an id a bound part renders with names it once its element carries it", async () => {
  const instance = tabs({ id: "t" })
  const panel = instance.part("panel", { value: "a" })
  const tab = instance.part("tab", { value: "a" })
  const el = element("first")
  bind(tab, el)
  await settle()
  takeOwnId(tab, "second")
  expect(attrs(panel)["aria-labelledby"]).toBe("first")
  el.id = "second"
  await settleChange()
  expect(attrs(panel)["aria-labelledby"]).toBe("second")
})

test("an id a slot reads names its part in place of the one the slot makes without it", () => {
  const instance = field({ id: "f" })
  takeOwnId(instance.part("label", { id: "email-label" }), "email-label")
  expect(attrs(instance.part("control"))["aria-labelledby"]).toBe("email-label")
})

test("an id the server rendered stays until a microtask after the part binds", () => {
  const instance = tabs({ id: "t" })
  const panel = instance.part("panel", { value: "a" })
  bind(instance.part("tab", { value: "a" }), element("account"))
  expect(attrs(panel)["aria-labelledby"]).toBe("t-tab-a")
})

test("a part that points at no id reads no other part's id, so each cell of a grid renders alone", async () => {
  const cellAttrs = vi.fn(
    (state: { active: string }, { key }: { key: string }) => ({
      role: "gridcell",
      "data-active": state.active === key ? "" : undefined,
    })
  )
  const grid = definePrimitive({
    name: "grid",
    state: () => ({ active: "0:0" }),
    api: (context) => ({
      move: (active: string) => context.store.set({ active }),
    }),
    slots: (slot) => ({ cell: slot({ attrs: cellAttrs }) }),
  })
  const instance = grid({ id: "g" })
  const cells = Array.from({ length: 500 }, (_, index) =>
    instance.part("cell", { id: `0:${index}` })
  )
  cells.forEach((cell) => bind(cell, element(cell.key)))
  await settle()
  instance.api.move("0:1")
  cellAttrs.mockClear()
  attrs(cells[1])
  expect(cellAttrs).toHaveBeenCalledTimes(1)
})

test("an id on an element whose slot makes none tells no part", async () => {
  const instance = tabs({ id: "t" })
  let heard = 0
  subscribe(instance.part("panel", { value: "a" }), () => heard++)
  bind(instance.part("link"), element("docs"))
  await settle()
  expect(heard).toBe(0)
})

// A browser's `form.id` returns a control named "id" instead of the attribute,
// which jsdom doesn't do, so the test does it as browsers do.
function formWithIdControl(id?: string) {
  const form = element(id, "form")
  const control = form.appendChild(document.createElement("input"))
  control.name = "id"
  Object.defineProperty(form, "id", { get: () => control })
  return form
}

test("a form's id is its attribute, not a control named id", async () => {
  const instance = tabs({ id: "t" })
  const tab = instance.part("tab", { value: "a" })
  bind(instance.part("panel", { value: "a" }), formWithIdControl("t-panel-a"))
  await settle()
  expect(attrs(tab)["aria-controls"]).toBe("t-panel-a")
  const form = formWithIdControl()
  applyAttrs(form, { id: "t-panel-a" })
  expect(form.getAttribute("id")).toBe("t-panel-a")
})

test("writing attributes keeps an id the element's author wrote", () => {
  const el = element("account")
  applyAttrs(el, { id: "t-tab-a", role: "tab" })
  expect(el.id).toBe("account")
  const plain = element()
  applyAttrs(plain, { id: "t-tab-a" })
  applyAttrs(plain, { id: "t-tab-b" })
  expect(plain.id).toBe("t-tab-b")
  applyAttrs(plain, {})
  expect(plain.hasAttribute("id")).toBe(false)
})

test("writing attributes keeps an id a script set after it wrote its own", () => {
  const el = element()
  applyAttrs(el, { id: "t-tab-a" })
  el.id = "mine"
  applyAttrs(el, { id: "t-tab-a" })
  expect(el.id).toBe("mine")
  applyAttrs(el, {})
  expect(el.id).toBe("mine")
})

// A list that opens binds every option with the id it rendered, so reading
// each back by name would count as every option reading its attributes.
test("a part binding with the id it rendered reads no attribute back", async () => {
  const instance = tabs({ id: "t" })
  const tab = element("t-tab-a")
  const read = vi.spyOn(tab, "getAttribute")
  bind(instance.part("tab", { value: "a" }), tab)
  await settle()
  expect(read).not.toHaveBeenCalled()
  expect(attrs(instance.part("panel", { value: "a" }))["aria-labelledby"]).toBe(
    "t-tab-a"
  )
})

// The count gates read `getAttribute` as the parts a change reached, one read
// per attribute written. See tests/perf/README.md.
test("writing attributes reads each one once, and an id only where one is written", () => {
  const el = element("account")
  const read = vi.spyOn(el, "getAttribute")
  applyAttrs(el, { "aria-valuenow": "5", "data-dragging": "" }, "live:t")
  expect(read.mock.calls.map(([name]) => name)).toEqual([
    "aria-valuenow",
    "data-dragging",
  ])
  read.mockClear()
  applyAttrs(el, { id: "t-tab-a", role: "tab" })
  expect(read.mock.calls.map(([name]) => name)).toEqual(["id", "role"])
})

test("writing attributes replaces an id ui-sdk made, like one a copied element carries", () => {
  const copy = element("ui-sdk-tabs-1-tab-a")
  applyAttrs(copy, { id: "ui-sdk-tabs-4-tab-a" })
  expect(copy.id).toBe("ui-sdk-tabs-4-tab-a")
})

test("a trigger menu points its editor at an option's author id", async () => {
  const editor = Object.assign(fakeEditor(), {
    element: document.body.appendChild(document.createElement("textarea")),
  })
  const instance = triggerMenu({
    id: "menu",
    triggers: [{ char: "@", items: [{ value: "alice", label: "Alice" }] }],
    editor,
  })
  editor.type("@")
  const content = document.body.appendChild(element())
  const list = content.appendChild(element())
  const option = list.appendChild(element("person-alice"))
  bind(instance.part("content"), content)
  bind(instance.part("list"), list)
  bind(instance.part("item", { value: "alice" }), option)
  await settleChange()
  instance.api.internal.onKeyDown(
    new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true })
  )
  expect(editor.element.getAttribute("aria-activedescendant")).toBe(
    "person-alice"
  )
  instance.destroy()
  document.body.replaceChildren()
})

test("writing attributes replaces a label reference to an id ui-sdk made, like one a copied element carries", () => {
  const copy = element()
  copy.setAttribute("aria-labelledby", "ui-sdk-tabs-1-tab-a")
  applyAttrs(copy, { "aria-labelledby": "ui-sdk-tabs-4-tab-a" })
  expect(copy.getAttribute("aria-labelledby")).toBe("ui-sdk-tabs-4-tab-a")
})
