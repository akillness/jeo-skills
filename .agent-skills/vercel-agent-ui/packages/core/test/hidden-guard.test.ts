// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { collapsible } from "../src/components/collapsible/collapsible"
import { tabs } from "../src/components/tabs/tabs"
import { bind } from "../src/foundation/kernel/part"

Element.prototype.getAnimations ??= () => []

const guard = () => document.getElementById("ui-sdk-hidden")

function bound(part: Parameters<typeof bind>[0]) {
  const el = document.body.appendChild(document.createElement("div"))
  return bind(part, el, { by: "framework", attaches: "all" })
}

afterEach(() => {
  guard()?.remove()
  document.body.replaceChildren()
})

test("a kept, closed Collapsible panel writes the rule that keeps hidden parts hidden", () => {
  const unbind = bound(
    collapsible({ id: "c" }).part("panel", { keepMounted: true })
  )
  expect(guard()?.textContent).toContain(
    '[data-slot][hidden]:not([hidden="until-found"])'
  )
  expect(guard()?.textContent).toContain("display: none !important")
  unbind()
})

test("an inactive, kept Tabs panel writes the rule", () => {
  const unbind = bound(
    tabs({ id: "t", defaultValue: "a" }).part("panel", {
      value: "b",
      keepMounted: true,
    })
  )
  expect(guard()).not.toBeNull()
  unbind()
})

test("a part that never renders hidden writes no rule", () => {
  const unbind = bound(collapsible({ id: "c" }).part("trigger"))
  expect(guard()).toBeNull()
  unbind()
})
