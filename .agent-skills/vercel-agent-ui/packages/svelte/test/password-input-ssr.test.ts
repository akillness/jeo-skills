import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/password-input-app.svelte"

const html = (defaultVisible?: boolean) =>
  render(App, { props: { defaultVisible } }).body

// Runs with no DOM: any access to window or document during render throws.
describe("password input server rendering", () => {
  test("the server renders a password field with its form attributes and a toggle button", () => {
    const body = html()
    expect(typeof window).toBe("undefined")
    expect(body).toContain('type="password"')
    expect(body).toContain('name="password"')
    expect(body).toContain('autocomplete="current-password"')
    expect(body).toMatch(/<button[^>]*type="button"[^>]*aria-pressed="false"/)
  })

  test("a password shown from the start renders as a text field", () => {
    expect(html(true)).toContain('type="text"')
  })
})
