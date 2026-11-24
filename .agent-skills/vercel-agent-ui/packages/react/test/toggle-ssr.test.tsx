// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Button } from "../src/button"
import { Separator } from "../src/separator"
import { Toggle, ToggleGroup } from "../src/toggle"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering toggles, buttons and separators", () => {
  test("a toggle group renders one tab stop, on the pressed toggle", () => {
    const html = renderToString(
      <ToggleGroup defaultValue={["c"]} aria-label="Alignment">
        <Toggle value="a">A</Toggle>
        <Toggle value="b">B</Toggle>
        <Toggle value="c">C</Toggle>
      </ToggleGroup>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="group"')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*>C/)
  })

  test("a button renders as a native button that doesn't submit by default", () => {
    expect(renderToString(<Button>Save</Button>)).toMatch(
      /<button[^>]*type="button"/
    )
    expect(renderToString(<Button type="submit">Save</Button>)).toMatch(
      /type="submit"/
    )
  })

  test("a separator renders its role and orientation", () => {
    expect(renderToString(<Separator orientation="vertical" />)).toMatch(
      /role="separator"[^>]*aria-orientation="vertical"/
    )
    expect(renderToString(<Separator decorative />)).toContain('role="none"')
  })
})
