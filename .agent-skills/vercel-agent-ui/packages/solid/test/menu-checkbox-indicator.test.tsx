import { render } from "@solidjs/web"
import { createSignal, flush } from "solid-js"
import { afterEach, expect, test } from "vitest"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItemIndicator,
} from "../src/menu"

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

test("a controlled checkbox item's indicator follows its checked prop", () => {
  const [on, setOn] = createSignal(true)
  const root = document.body.appendChild(document.createElement("div"))
  dispose = render(
    () => (
      <Menu defaultOpen>
        <MenuContent>
          <MenuCheckboxItem value="minimap" checked={on()}>
            Minimap
            <MenuItemIndicator keepMounted>✓</MenuItemIndicator>
          </MenuCheckboxItem>
        </MenuContent>
      </Menu>
    ),
    root
  )
  flush()
  const indicator = () =>
    document.querySelector('[data-slot="menu-item-indicator"]')!
  expect(indicator().hasAttribute("data-checked")).toBe(true)
  setOn(false)
  flush()
  expect(indicator().hasAttribute("data-unchecked")).toBe(true)
  expect(indicator().hasAttribute("data-checked")).toBe(false)
})
