import { render } from "svelte/server"
import { expect, test } from "vitest"
import App from "./apps/date-input-app.svelte"

test("the server renders each segment as an input with its value, and the hidden input", () => {
  const body = render(App, { props: { which: "date" } }).body
  expect(body).toContain('role="group"')
  expect(body.match(/role="spinbutton"/g)).toHaveLength(3)
  expect(body).toMatch(/value="11"/)
  expect(body).toMatch(/<input[^>]*name="start"[^>]*value="2026-11-02"/)
})
