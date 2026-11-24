// @vitest-environment jsdom
// A disabled fieldset reaches a component through the page itself: real
// clicks and keys, the fieldset turning on and off, and the component moving.
import { afterEach, expect, test, vi } from "vitest"
import { button } from "../src/components/button/button"
import { toggleGroup } from "../src/components/toggle/toggle-group"
import { toolbar } from "../src/components/toolbar/toolbar"
import { attrs, bind } from "../src/foundation/kernel/part"
import { createAgent } from "../src/page/agent/agent"
import { mount } from "../src/testing/mount"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

const settle = () => new Promise((resolve) => setTimeout(resolve))

function press(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  el.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    })
  )
  el.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    })
  )
}

function mountButton(parent: HTMLElement) {
  const action = vi.fn()
  const instance = button({ id: "b", action })
  const el = parent.appendChild(document.createElement("span"))
  el.textContent = "Save"
  cleanups.push(bind(instance.part("root", {}), el)!)
  return {
    el,
    action,
    disabled: () => attrs(instance.part("root", {}))["data-disabled"] === "",
  }
}

test("a button rendered as a span runs no action while its fieldset is disabled, and runs it once enabled", async () => {
  const fieldset = document.body.appendChild(document.createElement("fieldset"))
  fieldset.disabled = true
  const { el, action, disabled } = mountButton(fieldset)
  await settle()
  expect(disabled()).toBe(true)
  press(el)
  expect(action).not.toHaveBeenCalled()
  fieldset.disabled = false
  await settle()
  expect(disabled()).toBe(false)
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  expect(action).toHaveBeenCalledOnce()
})

test("a button moved out of a disabled fieldset is enabled without binding again", async () => {
  const fieldset = document.body.appendChild(document.createElement("fieldset"))
  fieldset.disabled = true
  const wrapper = fieldset.appendChild(document.createElement("div"))
  const { el, action, disabled } = mountButton(wrapper)
  await settle()
  expect(disabled()).toBe(true)
  document.body.append(wrapper)
  await settle()
  expect(disabled()).toBe(false)
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  expect(action).toHaveBeenCalledOnce()
})

test("an agent can't change a toggle group inside a disabled fieldset", async () => {
  const mounted = mount(
    toggleGroup,
    {},
    `<fieldset disabled><group aria-label="Format"></group></fieldset>`
  )
  cleanups.push(mounted.unmount)
  await mounted.settle()
  const agent = createAgent()
  const seen = agent.snapshot().filter((entry) => !entry.offPage)
  expect(seen).toHaveLength(1)
  expect(seen[0]).toMatchObject({ disabled: true, actions: [] })
  const outcome = await agent.act({
    steps: [{ ref: seen[0].ref, action: "setValue", args: [["bold"]] }],
  })
  expect(outcome).toMatchObject({ ok: false })
  expect(mounted.api.getValue()).toEqual([])
})

test("an agent can't change a toggle group inside a disabled toolbar", async () => {
  const bar = toolbar({ id: "t", disabled: true })
  const mounted = mount(
    toggleGroup,
    { toolbar: () => bar.api.internal.scopeIn(false) },
    `<group aria-label="Format"></group>`
  )
  cleanups.push(mounted.unmount)
  await mounted.settle()
  const agent = createAgent()
  const seen = agent.snapshot().filter((entry) => !entry.offPage)
  expect(seen).toHaveLength(1)
  expect(seen[0]).toMatchObject({ disabled: true, actions: [] })
  const outcome = await agent.act({
    steps: [{ ref: seen[0].ref, action: "setValue", args: [["bold"]] }],
  })
  expect(outcome).toMatchObject({ ok: false })
  expect(mounted.api.getValue()).toEqual([])
})
