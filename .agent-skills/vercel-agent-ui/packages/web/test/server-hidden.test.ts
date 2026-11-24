// @vitest-environment jsdom
// A part whose visibility the primitive controls owns its `hidden`, so one the
// server wrote goes when the part shows, at upgrade or later.
import { afterEach, expect, test } from "vitest"
import { defineCollapsibleElements } from "../src/collapsible"
import { defineTabsElements } from "../src/tabs"

// A panel still opening when its test ends would finish after the page is gone.
afterEach(() => document.body.replaceChildren())

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))
;(Element.prototype as { getAnimations?: () => Animation[] }).getAnimations ??=
  () => []

const tabs = (value: string) =>
  `<ui-tabs value="${value}"><ui-tabs-list aria-label="Settings"><ui-tabs-tab value="a"><button>Account</button></ui-tabs-tab><ui-tabs-tab value="b"><button>Password</button></ui-tabs-tab></ui-tabs-list><ui-tabs-panel value="a">A</ui-tabs-panel><ui-tabs-panel value="b" hidden>B</ui-tabs-panel></ui-tabs>`

test("a tabs panel the server hid shows when it's selected at upgrade", async () => {
  defineTabsElements()
  document.body.innerHTML = tabs("b")
  await wait()
  const [first, second] = document.querySelectorAll("ui-tabs-panel")
  expect(second.hasAttribute("hidden")).toBe(false)
  expect(first.hasAttribute("hidden")).toBe(true)
})

test("a tabs panel the server hid shows when it's selected later", async () => {
  defineTabsElements()
  document.body.innerHTML = tabs("a")
  await wait()
  const second = document.querySelectorAll("ui-tabs-panel")[1]
  expect(second.hasAttribute("hidden")).toBe(true)
  document.querySelectorAll("button")[1].click()
  await wait()
  expect(second.hasAttribute("hidden")).toBe(false)
})

test("a collapsible panel the server hid shows when it opens", async () => {
  defineCollapsibleElements()
  document.body.innerHTML = `<ui-collapsible><ui-collapsible-trigger><button>Files</button></ui-collapsible-trigger><ui-collapsible-panel hidden>Files</ui-collapsible-panel></ui-collapsible>`
  await wait()
  const panel = document.querySelector("ui-collapsible-panel")!
  document.querySelector("button")!.click()
  await wait()
  expect(panel.hasAttribute("hidden")).toBe(false)
})
