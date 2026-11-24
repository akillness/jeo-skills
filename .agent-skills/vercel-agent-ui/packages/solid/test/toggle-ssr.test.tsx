import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import { Toggle, ToggleGroup, ToggleIcon } from "../src/toggle"
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarInput,
  ToolbarLink,
  ToolbarSeparator,
} from "../src/toolbar"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering toggles and toolbars", () => {
  test("a toggle group renders one tab stop, on the pressed toggle", () => {
    const html = renderToString(() => (
      <ToggleGroup defaultValue={["c"]} aria-label="Alignment">
        <Toggle value="a">A</Toggle>
        <Toggle value="b">B</Toggle>
        <Toggle value="c">C</Toggle>
      </ToggleGroup>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="group"')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*>C/)
  })

  test("a toggle renders as a button that isn't a submit, with its icon hidden from screen readers", () => {
    const html = renderToString(() => (
      <Toggle defaultPressed aria-label="Bold">
        <ToggleIcon>B</ToggleIcon>
      </Toggle>
    ))
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-pressed="true"/)
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>B</)
  })

  test("a toolbar renders one tab stop, on its first item, and its toggles join it", () => {
    const html = renderToString(() => (
      <Toolbar aria-label="Formatting">
        <ToggleGroup defaultValue={["bold"]} aria-label="Style" multiple>
          <Toggle value="bold">Bold</Toggle>
          <Toggle value="italic">Italic</Toggle>
        </ToggleGroup>
        <ToolbarSeparator />
        <ToolbarGroup aria-label="History" disabled>
          <ToolbarButton>Undo</ToolbarButton>
        </ToolbarGroup>
        <ToolbarInput aria-label="Comment" />
        <ToolbarLink href="#help">Help</ToolbarLink>
      </Toolbar>
    ))
    expect(html).toContain('role="toolbar"')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toMatch(/tabindex="0"[^>]*>Bold/)
    expect(html).toMatch(/role="separator"[^>]*aria-orientation="vertical"/)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Undo/)
    expect(html).toMatch(/<a[^>]*tabindex="-1"[^>]*href="#help"/)
  })
})
