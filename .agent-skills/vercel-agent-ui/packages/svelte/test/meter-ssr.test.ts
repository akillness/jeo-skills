import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/meter-ssr-app.svelte"

// Svelte's server output carries hydration comments between elements and text.
const markup = () => render(App).body.replace(/<!--[^]*?-->/g, "")

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a meter", () => {
  test("a meter renders its value, width and variable before hydration", () => {
    const html = markup()
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/role="meter"[^>]*aria-valuenow="3"/)
    expect(html).toContain('aria-valuetext="50%"')
    expect(html).toContain("--meter-value:50%")
    expect(html).toMatch(
      /data-slot="meter-indicator"[^>]*style="[^"]*width:50%/
    )
    expect(html).toContain(">50%</span>")
  })
})
