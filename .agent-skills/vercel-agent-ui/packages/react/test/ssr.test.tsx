// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test, vi } from "vitest"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "../src/menu"
import { TokenInput } from "../src/token-input"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering", () => {
  test("a closed menu renders its trigger only", () => {
    const html = renderToString(
      <Menu>
        <MenuTrigger>File</MenuTrigger>
        <MenuContent>
          <MenuItem value="new">New file</MenuItem>
        </MenuContent>
      </Menu>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="menu"')
  })

  test("an open menu renders its content with neutral shortcuts", () => {
    const html = renderToString(
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
    )
    expect(html).toContain('role="menu"')
    expect(html).toContain('aria-keyshortcuts="Control+N"')
    expect(html).toContain("Ctrl+N")
    expect(html).toContain('aria-expanded="false"')
  })

  test("data menus render on the server", () => {
    const html = renderToString(
      <Menu
        defaultOpen
        items={[{ value: "new", label: "New file" }, { type: "separator" }]}
      >
        <MenuTrigger>File</MenuTrigger>
      </Menu>
    )
    expect(html).toContain('role="menuitem"')
    expect(html).toContain('role="separator"')
  })

  test("components that run layout effects render without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const html = renderToString(
        <>
          <Menu defaultOpen>
            <MenuTrigger>File</MenuTrigger>
            <MenuContent>
              <MenuItem value="new">New file</MenuItem>
            </MenuContent>
          </Menu>
          <TokenInput />
        </>
      )
      expect(html).toContain('role="menu"')
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })

  test("a data menu renders plain strings as items", () => {
    const html = renderToString(
      <Menu defaultOpen items={["Copy", "Paste"]}>
        <MenuTrigger>Edit</MenuTrigger>
      </Menu>
    )
    expect(html.match(/role="menuitem"/g)).toHaveLength(2)
    expect(html).toContain("Copy")
    expect(html).toContain("Paste")
  })
})
