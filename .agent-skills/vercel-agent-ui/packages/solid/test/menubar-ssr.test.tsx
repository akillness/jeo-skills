import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import { Menu, MenuTrigger } from "../src/menu"
import { Menubar } from "../src/menubar"

const stops = (html: string) => html.match(/tabindex="0"/g)?.length ?? 0

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a menubar", () => {
  test("a menubar renders one tab stop, on its first enabled trigger", () => {
    const html = renderToString(() => (
      <Menubar aria-label="Editor">
        <Menu>
          <MenuTrigger disabled>File</MenuTrigger>
        </Menu>
        <Menu>
          <MenuTrigger>Edit</MenuTrigger>
        </Menu>
      </Menubar>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="menubar"')
    expect(html.match(/role="menuitem"/g)).toHaveLength(2)
    expect(stops(html)).toBe(1)
    expect(html).toMatch(/tabindex="0"[^>]*>Edit</)
  })
})
