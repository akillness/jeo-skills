import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/navigation-menu-app.svelte"

const menu = (props: { defaultValue?: string; keepMounted?: boolean } = {}) =>
  render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a navigation menu", () => {
  test("a closed menu is a navigation landmark with collapsed buttons and the current link", () => {
    const html = menu()
    expect(typeof window).toBe("undefined")
    // Svelte puts hydration markers before the landmark.
    expect(html).toMatch(/^(<!--[^>]*-->)*<nav[^>]*aria-label="Main"/)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-current="page"')
    expect(html).not.toContain("Analytics")
  })

  test("an open menu renders its panel in place, shown", () => {
    const html = menu({ defaultValue: "products" })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain("Analytics")
  })

  test("a closed panel kept mounted is in the HTML, hidden", () => {
    const html = menu({ keepMounted: true })
    expect(html).toContain("Analytics")
    expect(html).toMatch(/data-slot="navigation-menu-content"[^>]*hidden/)
  })
})
