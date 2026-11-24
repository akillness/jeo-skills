// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallRow,
  WaterfallRowHeader,
  type WaterfallData,
} from "../src"

const items: WaterfallData = [
  {
    value: "page",
    label: "GET /",
    start: 0,
    duration: 1000,
    children: [{ value: "api", label: "GET /api", start: 500, duration: 500 }],
  },
]

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a waterfall", () => {
  test("renders rows with their place, the bar's times and the axis's ticks", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Waterfall, { "aria-label": "Requests", items }, () => [
          h(WaterfallAxis, { maxTicks: 3 }),
          ...["page", "api"].map((value) =>
            h(WaterfallRow, { key: value, value }, () => [
              h(WaterfallRowHeader, null, () => value),
              h(WaterfallBar),
            ])
          ),
        ])
      )
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="treegrid"')
    expect(html).toContain('aria-level="2"')
    expect(html).toContain("--waterfall-start:50%")
    expect(html).toContain('aria-label="Starts at 500 ms, lasts 500 ms"')
    expect(html).toContain(">0.5 sec<")
    // The nested row renders hidden while its parent is collapsed.
    expect(html).toMatch(
      /hidden[^>]*id="[^"]*-row-api"|id="[^"]*-row-api"[^>]*hidden/
    )
  })

  test("renders a row for every span without content", async () => {
    const html = await renderToString(
      createSSRApp(() => h(Waterfall, { "aria-label": "Requests", items }))
    )
    expect(html.match(/role="row"/g)).toHaveLength(2)
    expect(html).toContain("GET /api")
  })
})
