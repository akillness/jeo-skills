// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Menu,
  Menubar,
  MenuTrigger,
  Toggle,
  ToggleGroup,
  Toolbar,
  ToolbarButton,
  ToolbarLink,
} from "../src"

const render = (view: () => ReturnType<typeof h>) =>
  renderToString(createSSRApp(view))
const stops = (html: string) => html.match(/tabindex="0"/g)?.length ?? 0

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering toolbars and menubars", () => {
  test("a toolbar renders one tab stop, on its first enabled item, across toggle groups and toggles", async () => {
    const html = await render(() =>
      h(Toolbar, { "aria-label": "Formatting" }, () => [
        h(ToolbarButton, { disabled: true }, () => "Undo"),
        h(ToggleGroup, { defaultValue: ["b"], "aria-label": "Style" }, () => [
          h(Toggle, { value: "a" }, () => "A"),
          h(Toggle, { value: "b" }, () => "B"),
        ]),
        h(Toggle, null, () => "Spellcheck"),
        h(ToolbarLink, { href: "#help" }, () => "Help"),
      ])
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="toolbar"')
    expect(stops(html)).toBe(1)
    expect(html).toMatch(/tabindex="0"[^>]*>A</)
  })

  test("a menubar renders one tab stop, on its first enabled trigger", async () => {
    const html = await render(() =>
      h(Menubar, { "aria-label": "Editor" }, () => [
        h(Menu, null, () => h(MenuTrigger, { disabled: true }, () => "File")),
        h(Menu, null, () => h(MenuTrigger, null, () => "Edit")),
      ])
    )
    expect(html).toContain('role="menubar"')
    expect(stops(html)).toBe(1)
    expect(html).toMatch(/tabindex="0"[^>]*>Edit</)
  })
})
