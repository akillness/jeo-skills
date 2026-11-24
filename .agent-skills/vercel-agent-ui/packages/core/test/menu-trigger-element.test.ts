// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { menu } from "../src/components/menu/menu"
import { mount } from "../src/testing"

afterEach(() => document.body.replaceChildren())

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

const content = `<content><item value="upgrade">Upgrade</item></content>`

test("a trigger rendered as a span is a button people can tab to", async () => {
  const view = mount(
    menu,
    {},
    `<trigger as="span">Plan: Pro</trigger>${content}`
  )
  await settle()
  const trigger = view.part("trigger")!
  expect(trigger.getAttribute("role")).toBe("button")
  expect(trigger.getAttribute("tabindex")).toBe("0")
  expect(trigger.hasAttribute("type")).toBe(false)
  trigger.focus()
  await view.keys("Enter")
  await settle()
  expect(view.state.open).toBe(true)
  view.unmount()
})

test("a disabled trigger rendered as a span leaves the tab order", async () => {
  const view = mount(
    menu,
    {},
    `<trigger as="span" disabled>Plan: Pro</trigger>${content}`
  )
  await settle()
  const trigger = view.part("trigger")!
  expect(trigger.getAttribute("aria-disabled")).toBe("true")
  expect(trigger.getAttribute("tabindex")).toBe("-1")
  expect(trigger.hasAttribute("disabled")).toBe(false)
  view.unmount()
})

test("a native button and a link keep their own role and tab stop", async () => {
  const view = mount(
    menu,
    {},
    `<trigger id="actions">Actions</trigger><trigger id="plans" as="a" href="/plans">Plans</trigger>${content}`
  )
  await settle()
  const button = view.part("trigger", "actions")!
  const link = view.part("trigger", "plans")!
  expect(button.getAttribute("type")).toBe("button")
  for (const trigger of [button, link]) {
    expect(trigger.hasAttribute("role")).toBe(false)
    expect(trigger.hasAttribute("tabindex")).toBe(false)
  }
  expect(link.hasAttribute("type")).toBe(false)
  view.unmount()
})
