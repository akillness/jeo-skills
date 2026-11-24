// @vitest-environment jsdom
// A popup's title is the heading unless it wraps one, so a heading is never inside a heading.
import { beforeAll, expect, test } from "vitest"
import { defineDialogElements } from "../src/dialog"
import { definePopoverElements } from "../src/popover"

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineDialogElements()
  definePopoverElements()
})

test("a popover's title is a level 2 heading", () => {
  document.body.innerHTML = `<ui-popover open><ui-popover-trigger><button>Edit</button></ui-popover-trigger><ui-popover-content><ui-popover-title>Edit profile</ui-popover-title></ui-popover-content></ui-popover>`
  const title = document.querySelector("ui-popover-title")!
  expect(title.getAttribute("role")).toBe("heading")
  expect(title.getAttribute("aria-level")).toBe("2")
})

test("a popover's title that wraps a heading leaves the heading to it", () => {
  document.body.innerHTML = `<ui-popover open><ui-popover-trigger><button>Edit</button></ui-popover-trigger><ui-popover-content><ui-popover-title><h3>Edit profile</h3></ui-popover-title></ui-popover-content></ui-popover>`
  const title = document.querySelector("ui-popover-title")!
  expect(title.hasAttribute("role")).toBe(false)
  expect(title.hasAttribute("aria-level")).toBe(false)
})

test("a dialog's title that wraps a heading leaves the heading to it", () => {
  document.body.innerHTML = `<ui-dialog open><ui-dialog-trigger><button>Edit</button></ui-dialog-trigger><ui-dialog-content><ui-dialog-title><h2>Profile</h2></ui-dialog-title></ui-dialog-content></ui-dialog>`
  const title = document.querySelector("ui-dialog-title")!
  expect(title.hasAttribute("role")).toBe(false)
  expect(title.hasAttribute("aria-level")).toBe(false)
})
