// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Menu, MenuTrigger } from "../src/menu"
import { Menubar } from "../src/menubar"
import { Tabs, TabsList, TabsTab } from "../src/tabs"
import { Toggle, ToggleGroup } from "../src/toggle"
import { Toolbar, ToolbarButton, ToolbarLink } from "../src/toolbar"

const stops = (html: string) => html.match(/tabindex="0"/g)?.length ?? 0

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering toolbars and menubars", () => {
  test("a toolbar renders one tab stop, on its first enabled item, across toggle groups and toggles", () => {
    const html = renderToString(
      <Toolbar aria-label="Formatting">
        <ToolbarButton disabled>Undo</ToolbarButton>
        <ToggleGroup defaultValue={["b"]} aria-label="Style">
          <Toggle value="a">A</Toggle>
          <Toggle value="b">B</Toggle>
        </ToggleGroup>
        <Toggle>Spellcheck</Toggle>
        <ToolbarLink href="#help">Help</ToolbarLink>
      </Toolbar>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="toolbar"')
    expect(stops(html)).toBe(1)
    expect(html).toMatch(/tabindex="0"[^>]*>A</)
  })

  test("a menubar renders one tab stop, on its first enabled trigger", () => {
    const html = renderToString(
      <Menubar aria-label="Editor">
        <Menu>
          <MenuTrigger disabled>File</MenuTrigger>
        </Menu>
        <Menu>
          <MenuTrigger>Edit</MenuTrigger>
        </Menu>
      </Menubar>
    )
    expect(html).toContain('role="menubar"')
    expect(html.match(/role="menuitem"/g)).toHaveLength(2)
    expect(stops(html)).toBe(1)
    expect(html).toMatch(/tabindex="0"[^>]*>Edit</)
  })

  test("tabs with nothing selected render one tab stop, on the first enabled tab", () => {
    const html = renderToString(
      <Tabs>
        <TabsList aria-label="Settings">
          <TabsTab value="a" disabled>
            A
          </TabsTab>
          <TabsTab value="b">B</TabsTab>
        </TabsList>
      </Tabs>
    )
    expect(stops(html)).toBe(1)
    expect(html).toMatch(/tabindex="0"[^>]*>B</)
  })
})
