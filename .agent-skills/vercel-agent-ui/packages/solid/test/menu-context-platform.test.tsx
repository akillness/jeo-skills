import { render } from "@solidjs/web"
import { flush } from "solid-js"
import { afterEach, expect, test } from "vitest"
import { Menu, MenuContent, MenuContextTrigger, MenuItem } from "../src/menu"

Object.defineProperty(navigator, "platform", {
  value: "MacIntel",
  configurable: true,
})

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

test("a menu opened only from its context trigger writes Apple shortcuts", async () => {
  const root = document.body.appendChild(document.createElement("div"))
  dispose = render(
    () => (
      <Menu defaultOpen>
        <MenuContextTrigger>Canvas</MenuContextTrigger>
        <MenuContent>
          <MenuItem shortcut="mod+d">Duplicate</MenuItem>
        </MenuContent>
      </Menu>
    ),
    root
  )
  flush()
  await Promise.resolve()
  flush()
  expect(
    document
      .querySelector('[role="menuitem"]')!
      .getAttribute("aria-keyshortcuts")
  ).toBe("Meta+D")
})
