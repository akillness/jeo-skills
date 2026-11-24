// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test } from "vitest"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTrigger,
} from "../src/alert-dialog"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../src/menu"
import { Popover, PopoverContent, PopoverTrigger } from "../src/popover"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

type Props = { disabled: boolean; focusableWhenDisabled?: boolean }

const popups: Record<string, (props: Props) => React.ReactNode> = {
  "alert dialog": (props) => (
    <AlertDialog>
      <AlertDialogTrigger {...props}>Delete</AlertDialogTrigger>
      <AlertDialogContent aria-label="Delete">Sure?</AlertDialogContent>
    </AlertDialog>
  ),
  menu: (props) => (
    <Menu>
      <MenuTrigger {...props}>Actions</MenuTrigger>
      <MenuContent>
        <MenuItem value="copy">Copy</MenuItem>
      </MenuContent>
    </Menu>
  ),
  popover: (props) => (
    <Popover>
      <PopoverTrigger {...props}>Details</PopoverTrigger>
      <PopoverContent aria-label="Details">Text</PopoverContent>
    </Popover>
  ),
}

async function renderTrigger(popup: string, props: Props) {
  const host = document.body.appendChild(document.createElement("div"))
  root = createRoot(host)
  await React.act(async () => root!.render(popups[popup](props)))
  return host.querySelector("button")!
}

describe.each(Object.keys(popups))("a disabled %s trigger", (popup) => {
  test("is natively disabled by default", async () => {
    const trigger = await renderTrigger(popup, { disabled: true })
    expect(trigger.disabled).toBe(true)
    expect(trigger.getAttribute("aria-disabled")).toBeNull()
  })

  test("stays focusable with focusableWhenDisabled, and doesn't open", async () => {
    const trigger = await renderTrigger(popup, {
      disabled: true,
      focusableWhenDisabled: true,
    })
    expect(trigger.disabled).toBe(false)
    expect(trigger.getAttribute("aria-disabled")).toBe("true")
    expect(trigger.hasAttribute("data-disabled")).toBe(true)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)
    await React.act(async () => trigger.click())
    expect(trigger.getAttribute("aria-expanded")).not.toBe("true")
  })
})
