// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test } from "vitest"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../src/menu"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []
Element.prototype.scrollIntoView ??= () => {}
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

const settle = () =>
  React.act(() => new Promise((resolve) => setTimeout(resolve, 20)))

async function closeWithEscape(finalFocus?: string) {
  const host = document.body.appendChild(document.createElement("div"))
  root = createRoot(host)
  await React.act(async () =>
    root!.render(
      <>
        <Menu defaultOpen>
          <MenuTrigger>Actions</MenuTrigger>
          <MenuContent finalFocus={finalFocus}>
            <MenuItem value="delete">Delete</MenuItem>
          </MenuContent>
        </Menu>
        <button id="other">Other</button>
      </>
    )
  )
  await settle()
  const item = document.querySelector<HTMLElement>('[role="menuitem"]')!
  item.focus()
  await React.act(async () => {
    item.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  })
  await settle()
  expect(document.querySelector('[role="menu"]')).toBeNull()
  return {
    trigger: host.querySelector("button[aria-haspopup]"),
    other: document.getElementById("other"),
  }
}

describe("where focus goes when a menu closes", () => {
  test("back to the trigger by default", async () => {
    const { trigger } = await closeWithEscape()
    expect(document.activeElement).toBe(trigger)
  })

  test("to the element finalFocus names", async () => {
    const { other } = await closeWithEscape("#other")
    expect(document.activeElement).toBe(other)
  })

  test("nowhere with finalFocus none", async () => {
    const { trigger, other } = await closeWithEscape("none")
    expect(document.activeElement).not.toBe(trigger)
    expect(document.activeElement).not.toBe(other)
  })
})
