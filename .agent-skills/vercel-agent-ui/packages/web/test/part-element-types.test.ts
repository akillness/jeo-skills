// @vitest-environment jsdom
// Part elements are typed like root elements: `querySelector` and
// `createElement` know each part's tag and the props it has as properties.
import type { ValidityKey } from "@ui-sdk/core/field"
import { beforeAll, expect, expectTypeOf, test } from "vitest"
import { defineDialogElements } from "../src/dialog"
import { defineFieldElements } from "../src/field"
import { defineMenuElements } from "../src/menu"
import { defineTabsElements } from "../src/tabs"

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineTabsElements()
  defineMenuElements()
  defineDialogElements()
  defineFieldElements()
})

test("a tab's `disabled` is a typed boolean that reflects", () => {
  document.body.innerHTML = `<ui-tabs><ui-tabs-list><ui-tabs-tab value="a"><button>A</button></ui-tabs-tab></ui-tabs-list></ui-tabs>`
  const tab = document.querySelector("ui-tabs-tab")!
  expectTypeOf(tab.disabled).toEqualTypeOf<boolean>()
  expectTypeOf(tab.value).toEqualTypeOf<string | undefined>()
  tab.disabled = true
  expect(tab.hasAttribute("disabled")).toBe(true)
})

test("a menu item's `closeOnSelect` starts on and writes false", () => {
  const item = document.createElement("ui-menu-item")
  expectTypeOf(item.closeOnSelect).toEqualTypeOf<boolean>()
  expect(item.closeOnSelect).toBe(true)
  item.closeOnSelect = false
  expect(item.getAttribute("close-on-select")).toBe("false")
})

test("a dialog trigger's `payload` is a property of any value", () => {
  const trigger = document.createElement("ui-dialog-trigger")
  expectTypeOf(trigger.payload).toEqualTypeOf<unknown>()
  trigger.payload = { id: 1 }
  expect(trigger.payload).toEqual({ id: 1 })
})

test("a popup content's `container` is the selector its attribute holds", () => {
  expectTypeOf(
    document.createElement("ui-dialog-content").container
  ).toEqualTypeOf<string | undefined>()
})

test("a field error's `match` is a boolean or a validity flag, as its attribute reads", () => {
  const error = document.createElement("ui-field-error")
  expectTypeOf(error.match).toEqualTypeOf<boolean | ValidityKey | undefined>()
  error.setAttribute("match", "valueMissing")
  expect(error.match).toBe("valueMissing")
  error.match = false
  expect(error.getAttribute("match")).toBe("false")
  expect(error.match).toBe(false)
})
