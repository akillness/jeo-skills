// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { navigationMenu } from "../src/components/navigation-menu/navigation-menu"
import { mount } from "../src/testing/mount"

const markup = `<root aria-label="Main"><list>
  <item value="learn"><trigger>Learn</trigger><content><link href="#docs">Docs</link></content></item>
  <item><link href="#blog" hidden>Blog</link></item>
  <item value="about"><trigger>About</trigger><content><link href="#team">Team</link></content></item>
</list><viewport></viewport></root>`

const mounts: { unmount: () => void }[] = []
afterEach(() => mounts.splice(0).forEach((mounted) => mounted.unmount()))

test("arrow keys skip a top-level item the bar hides", () => {
  const view = mount(navigationMenu, {}, markup)
  mounts.push(view)
  const [learn, about] = view.root.querySelectorAll<HTMLElement>(
    '[data-slot="navigation-menu-trigger"]'
  )
  learn.focus()
  learn.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
  )
  expect(document.activeElement).toBe(about)
})
