// @vitest-environment jsdom
// A router's link can call `preventDefault()` before the item's handler, and
// React runs both after the element's own listeners. The item still closes the menu.
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../src/menu"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

function Link(props: React.ComponentProps<"a">) {
  return (
    <a
      {...props}
      onClick={(event) => {
        event.preventDefault()
        props.onClick?.(event)
      }}
    />
  )
}

async function mount(onSelect?: (event: Event) => void) {
  const state = { open: true, actions: [] as string[] }
  root = createRoot(document.body.appendChild(document.createElement("div")))
  await React.act(async () =>
    root!.render(
      <Menu
        defaultOpen
        onOpenChange={(open) => (state.open = open)}
        onAction={(value) => state.actions.push(value)}
      >
        <MenuTrigger>Account</MenuTrigger>
        <MenuContent>
          <MenuItem
            value="settings"
            onSelect={onSelect}
            render={<Link href="/settings" />}
          >
            Settings
          </MenuItem>
        </MenuContent>
      </Menu>
    )
  )
  return state
}

const link = () =>
  document.querySelector<HTMLAnchorElement>('a[href="/settings"]')!

test("a link item the router navigates closes the menu and runs its action", async () => {
  const state = await mount()
  await React.act(async () => link().click())
  expect(state.open).toBe(false)
  expect(state.actions).toEqual(["settings"])
})

test("onSelect can still keep the menu open", async () => {
  const state = await mount((event) => event.preventDefault())
  await React.act(async () => link().click())
  expect(state.open).toBe(true)
  expect(state.actions).toEqual([])
})
