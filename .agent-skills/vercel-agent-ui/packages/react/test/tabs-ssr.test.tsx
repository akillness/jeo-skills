// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "../src/tabs"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering tabs", () => {
  test("renders the selected tab as the tab stop and only its panel", () => {
    const html = renderToString(
      <Tabs defaultValue="b">
        <TabsList aria-label="Settings">
          <TabsTab value="a">A</TabsTab>
          <TabsTab value="b">B</TabsTab>
          <TabsIndicator />
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
        <TabsPanel value="b">Panel B</TabsPanel>
      </Tabs>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(
      /aria-selected="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-selected="true"/
    )
    expect(html).toContain("Panel B")
    expect(html).not.toContain("Panel A")
  })

  test("kept panels render hidden", () => {
    const html = renderToString(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTab value="a">A</TabsTab>
          <TabsTab value="b">B</TabsTab>
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
        <TabsPanel value="b" keepMounted>
          Panel B
        </TabsPanel>
      </Tabs>
    )
    expect(html).toMatch(/hidden=""[^>]*>Panel B|<div[^>]*hidden[^>]*>Panel B/)
  })
})
