import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/command-ssr-app.svelte"

// Runs with no DOM: any access to window or document during render throws.
describe("command server rendering", () => {
  test("data commands render ranked for the query, with the field and the list", () => {
    const html = render(App).body
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*value="set"/)
    expect(html).toContain('role="listbox"')
    expect(html).not.toContain("Calendar")
  })
})
