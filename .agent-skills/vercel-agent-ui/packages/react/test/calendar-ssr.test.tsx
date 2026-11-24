// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Calendar } from "../src/calendar"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a calendar", () => {
  test("renders the month with one tab stop on the selection, and no today", () => {
    const html = renderToString(<Calendar defaultValue="2026-10-16" />)
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="grid"')
    expect(html).toContain("October 2026")
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toMatch(/tabindex="0"[^>]*data-value="2026-10-16"/)
    expect(html).not.toContain('aria-current="date"')
  })

  test("two months render two grids under one heading", () => {
    const html = renderToString(<Calendar months={2} defaultMonth="2026-10" />)
    expect(html.match(/role="grid"/g)).toHaveLength(2)
    expect(html).toMatch(/October\s–\sNovember 2026/)
  })
})
