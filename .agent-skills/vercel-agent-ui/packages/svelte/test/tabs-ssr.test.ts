import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/tabs-app.svelte"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering tabs", () => {
  test("renders the selected tab as the tab stop and only its panel", () => {
    const html = render(App, { props: { defaultValue: "b" } }).body
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(
      /aria-selected="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-selected="true"/
    )
    expect(html).toContain("Panel B")
    expect(html).not.toContain("Panel A")
  })
})
