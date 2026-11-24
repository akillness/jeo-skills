import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/carousel-app.svelte"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a carousel", () => {
  test("renders the pattern's roles and native snapping, so it pages before hydration", () => {
    const html = render(App).body
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-roledescription="carousel"')
    expect(html).toContain('aria-roledescription="slide"')
    expect(html).toContain("scroll-snap-type:x mandatory")
    expect(html).toMatch(/aria-selected="true"[^>]*>(<!---->)?2</)
    expect(html).not.toContain("inert")
  })
})
