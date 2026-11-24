// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { DatePicker } from "../src/date-picker"

const render = (props: Record<string, unknown>) =>
  renderToString(createSSRApp(() => h(DatePicker, props)))

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a date picker", () => {
  test("renders the input with the date's text, the trigger named by it, and the hidden input", async () => {
    const html = await render({
      locale: "en-US",
      defaultValue: "2026-10-20",
      name: "due",
    })
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<input[^>]*type="text"[^>]*value="10\/20\/2026"/)
    expect(html).toContain(
      'aria-label="Choose date, Tuesday, October 20, 2026"'
    )
    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="due"[^>]*value="2026-10-20"/
    )
    expect(html).not.toContain('role="dialog"')
  })

  test("a range renders an input for each end, and submits each under its name", async () => {
    const html = await render({
      locale: "en-US",
      mode: "range",
      defaultValue: ["2026-10-10", "2026-10-16"],
      startName: "start",
      endName: "end",
    })
    expect(html.match(/type="text"/g)).toHaveLength(2)
    expect(html).toMatch(/name="start"[^>]*value="2026-10-10"/)
    expect(html).toMatch(/name="end"[^>]*value="2026-10-16"/)
  })

  test("renders no hidden input without a name", async () => {
    expect(await render({ locale: "en-US" })).not.toContain('type="hidden"')
  })

  test("an open date picker renders its calendar in the dialog", async () => {
    const html = await render({
      locale: "en-US",
      defaultOpen: true,
      defaultMonth: "2026-10",
    })
    expect(html).toContain('role="dialog"')
    expect(html).toContain('role="grid"')
    expect(html).toContain("October 2026")
  })
})
