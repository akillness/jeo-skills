// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "../src"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering tabs", () => {
  test("renders the selected tab as the tab stop and only its panel", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Tabs, { defaultValue: "b" }, () => [
          h(TabsList, { "aria-label": "Settings" }, () => [
            h(TabsTab, { value: "a" }, () => "A"),
            h(TabsTab, { value: "b" }, () => "B"),
            h(TabsIndicator),
          ]),
          h(TabsPanel, { value: "a" }, () => "Panel A"),
          h(TabsPanel, { value: "b" }, () => "Panel B"),
        ])
      )
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(
      /aria-selected="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-selected="true"/
    )
    expect(html).toContain("Panel B")
    expect(html).not.toContain("Panel A")
  })
})
