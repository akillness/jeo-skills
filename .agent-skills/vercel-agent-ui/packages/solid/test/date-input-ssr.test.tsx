import { renderToString } from "@solidjs/web"
import { expect, test } from "vitest"
import { DateInput } from "../src/date-input"
import { TimeInput } from "../src/time-input"

test("the server renders each segment as an input with its value, and the hidden input", () => {
  const html = renderToString(() => (
    <DateInput defaultValue="2026-11-02" name="start" locale="en-US" />
  ))
  expect(html).toContain('role="group"')
  expect(html.match(/role="spinbutton"/g)).toHaveLength(3)
  expect(html).toMatch(/value="11"/)
  expect(html).toMatch(/<input[^>]*name="start"[^>]*value="2026-11-02"/)
})

test("the server renders a time's day period", () => {
  const html = renderToString(() => (
    <TimeInput defaultValue="14:30" locale="en-US" />
  ))
  expect(html).toMatch(/value="PM"/)
})
