// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { navigationMenu } from "../src/components/navigation-menu/navigation-menu"
import { mount } from "../src/testing/mount"

const markup = `<root aria-label="Main"><list>
  <item value="learn"><trigger>Learn</trigger><content><link href="#docs">Docs</link></content></item>
</list><viewport></viewport></root>`

const mounts: { unmount: () => void }[] = []
afterEach(() => mounts.splice(0).forEach((mounted) => mounted.unmount()))

function render(options: { onValueChange?: () => void } = {}) {
  const view = mount(
    navigationMenu,
    { defaultValue: "learn", ...options },
    markup
  )
  mounts.push(view)
  const link = view.root.querySelector<HTMLElement>(
    '[data-slot="navigation-menu-link"]'
  )!
  return { view, link }
}

// A router's handler delegated to the document, like React's, must find the
// link still in its open panel.
test("a pressed link closes the menu once the click has reached every handler", () => {
  const { view, link } = render()
  let openWhenDelegated: boolean | undefined
  const delegated = (event: Event) => {
    event.preventDefault()
    openWhenDelegated = view.api.isOpen()
  }
  document.addEventListener("click", delegated)
  link.click()
  document.removeEventListener("click", delegated)
  expect(openWhenDelegated).toBe(true)
  expect(view.api.isOpen()).toBe(false)
})

test("a pressed link still closes the menu when a handler stops the click", async () => {
  const { view, link } = render()
  link.parentElement!.addEventListener("click", (event) =>
    event.stopPropagation()
  )
  link.click()
  await new Promise((resolve) => setTimeout(resolve))
  expect(view.api.isOpen()).toBe(false)
})

// Vue Test Utils mounts outside the page by default.
test("a pressed link closes a menu outside the page right away", () => {
  const { view, link } = render()
  view.root.parentElement!.remove()
  link.click()
  expect(view.api.isOpen()).toBe(false)
})

test("a link whose own handler unmounts the menu doesn't close it afterward", () => {
  const onValueChange = vi.fn()
  const { link } = render({ onValueChange })
  link.addEventListener("click", () => mounts.pop()!.unmount())
  link.click()
  expect(onValueChange).not.toHaveBeenCalled()
})
