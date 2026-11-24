import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "../src/menu"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a menu", () => {
  test("a closed menu renders its trigger only", () => {
    const html = renderToString(() => (
      <Menu>
        <MenuTrigger>File</MenuTrigger>
        <MenuContent>
          <MenuItem value="new">New file</MenuItem>
        </MenuContent>
      </Menu>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="menu"')
  })

  test("an open menu renders its content with neutral shortcuts", () => {
    const html = renderToString(() => (
      <Menu defaultOpen>
        <MenuTrigger>File</MenuTrigger>
        <MenuContent>
          <MenuItem value="new" shortcut="mod+n">
            New file
          </MenuItem>
          <MenuSub>
            <MenuSubTrigger>Share</MenuSubTrigger>
            <MenuSubContent>
              <MenuItem value="email">Email</MenuItem>
            </MenuSubContent>
          </MenuSub>
        </MenuContent>
      </Menu>
    ))
    expect(html).toContain('role="menu"')
    expect(html).toContain('aria-keyshortcuts="Control+N"')
    expect(html).toContain("Ctrl+N")
    expect(html).toContain('aria-expanded="false"')
  })

  test("data menus render on the server", () => {
    const html = renderToString(() => (
      <Menu
        defaultOpen
        items={[{ value: "new", label: "New file" }, { type: "separator" }]}
      >
        <MenuTrigger>File</MenuTrigger>
      </Menu>
    ))
    expect(html).toContain('role="menuitem"')
    expect(html).toContain('role="separator"')
  })
})
