// @vitest-environment jsdom
// A trigger with `for` connects to the popup it names, even inside another popup of the same kind.
import { afterEach, expect, test, vi } from "vitest"
import { defineDialogElements } from "../src/dialog"
import { definePopoverElements } from "../src/popover"

Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

afterEach(() => document.body.replaceChildren())

type Popup = HTMLElement & { open: boolean }

test.each([
  { name: "dialog", define: defineDialogElements },
  { name: "popover", define: definePopoverElements },
])(
  "a $name trigger inside one $name opens the one its `for` names",
  async ({ name, define }) => {
    define()
    document.body.innerHTML = `
    <ui-${name} id="around"><ui-${name}-trigger for="other"><button id="trigger">Open</button></ui-${name}-trigger></ui-${name}>
    <ui-${name} id="other"><ui-${name}-content id="other-content"></ui-${name}-content></ui-${name}>`
    await wait()
    const trigger = document.getElementById("trigger")!
    trigger.click()
    await wait()
    const open = (id: string) => (document.getElementById(id) as Popup).open
    expect({ other: open("other"), around: open("around") }).toEqual({
      other: true,
      around: false,
    })
    expect(trigger.getAttribute("aria-controls")).toBe("other-content")
  }
)

const popover = (id: string) =>
  `<ui-popover id="${id}"><ui-popover-content></ui-popover-content></ui-popover>`

test("a trigger opens the popover its `for` names when the popover is rendered after it", async () => {
  definePopoverElements()
  document.body.innerHTML = `<ui-popover-trigger for="later"><button id="trigger">Open</button></ui-popover-trigger><div id="popups"></div>`
  await wait()
  document.getElementById("popups")!.innerHTML = popover("later")
  await wait()
  document.getElementById("trigger")!.click()
  await wait()
  expect((document.getElementById("later") as Popup).open).toBe(true)
})

test("a trigger whose `for` names a popover not rendered yet doesn't warn", async () => {
  definePopoverElements()
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  document.body.innerHTML = `<ui-popover-trigger for="later"><button>Open</button></ui-popover-trigger>`
  await wait()
  expect(warn).not.toHaveBeenCalled()
  warn.mockRestore()
})

test("a trigger opens the popover its `for` names after the popover is rendered again", async () => {
  definePopoverElements()
  document.body.innerHTML = `<ui-popover-trigger for="profile"><button id="trigger">Open</button></ui-popover-trigger><div id="popups">${popover("profile")}</div>`
  await wait()
  document.getElementById("popups")!.innerHTML = popover("profile")
  await wait()
  document.getElementById("trigger")!.click()
  await wait()
  expect((document.getElementById("profile") as Popup).open).toBe(true)
})

test("a trigger opens the popover its `for` names after the popover leaves the page and comes back", async () => {
  definePopoverElements()
  document.body.innerHTML = `<ui-popover-trigger for="profile"><button id="trigger">Open</button></ui-popover-trigger><div id="popups">${popover("profile")}</div>`
  await wait()
  const popup = document.getElementById("profile") as Popup
  popup.remove()
  await wait()
  document.getElementById("popups")!.append(popup)
  await wait()
  document.getElementById("trigger")!.click()
  await wait()
  expect(popup.open).toBe(true)
})
