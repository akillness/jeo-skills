// @vitest-environment jsdom
// An id written on a part's element wins over the one the component makes,
// and every reference to that part points at it.
import { expect, test } from "vitest"
import { defineDialogElements } from "../src/dialog"
import { defineTabsElements } from "../src/tabs"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

test("a dialog trigger's button keeps its id, and the dialog points at it", async () => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineDialogElements()
  document.body.innerHTML = `<ui-dialog><ui-dialog-trigger><button id="mine">Edit</button></ui-dialog-trigger><ui-dialog-content id="sheet"><ui-dialog-title id="heading">Profile</ui-dialog-title><ui-dialog-description id="hint">Change it.</ui-dialog-description></ui-dialog-content></ui-dialog>`
  await wait()
  const button = document.querySelector("button")!
  const content = document.querySelector("ui-dialog-content")!
  expect(button.id).toBe("mine")
  expect(document.querySelector("ui-dialog-title")!.id).toBe("heading")
  expect(document.querySelector("ui-dialog-description")!.id).toBe("hint")

  button.click()
  await wait()
  expect(content.id).toBe("sheet")
  expect(button.getAttribute("aria-controls")).toBe("sheet")
  expect(content.getAttribute("aria-labelledby")).toBe("heading")
  expect(content.getAttribute("aria-describedby")).toBe("hint")
  expect(button.id).toBe("mine")
})

test("a tab's button keeps its id, and its panel is labelled by it", async () => {
  defineTabsElements()
  document.body.innerHTML = `<ui-tabs value="a"><ui-tabs-list aria-label="Settings"><ui-tabs-tab value="a"><button id="account">Account</button></ui-tabs-tab><ui-tabs-tab value="b"><button>Password</button></ui-tabs-tab></ui-tabs-list><ui-tabs-panel value="a" id="account-panel">A</ui-tabs-panel><ui-tabs-panel value="b">B</ui-tabs-panel></ui-tabs>`
  await wait()
  const [account, password] = document.querySelectorAll("button")
  const [first, second] = document.querySelectorAll("ui-tabs-panel")
  expect(account.id).toBe("account")
  expect(first.id).toBe("account-panel")
  expect(account.getAttribute("aria-controls")).toBe("account-panel")
  expect(first.getAttribute("aria-labelledby")).toBe("account")
  // A part without an id of its own keeps the one the component makes.
  password.click()
  await wait()
  expect(password.id).toMatch(/-tab-b$/)
  expect(password.getAttribute("aria-controls")).toBe(second.id)
  expect(second.getAttribute("aria-labelledby")).toBe(password.id)
})

test("tabs put back on the page take the new instance's ids", async () => {
  defineTabsElements()
  document.body.innerHTML = `<div><ui-tabs value="a"><ui-tabs-list aria-label="Settings"><ui-tabs-tab value="a"><button>Account</button></ui-tabs-tab></ui-tabs-list><ui-tabs-panel value="a">A</ui-tabs-panel></ui-tabs></div>`
  await wait()
  const tabs = document.querySelector("ui-tabs")!
  const tab = document.querySelector("button")!
  const panel = document.querySelector("ui-tabs-panel")!
  const before = tab.id
  tabs.remove()
  await wait()
  document.querySelector("div")!.append(tabs)
  await wait()
  expect(tab.id).not.toBe(before)
  expect(panel.getAttribute("aria-labelledby")).toBe(tab.id)
  expect(tab.getAttribute("aria-controls")).toBe(panel.id)
})
