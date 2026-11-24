import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/progress-ssr-app.svelte"

// Svelte's server output carries hydration comments between elements and text.
const markup = () => render(App).body.replace(/<!--[^]*?-->/g, "")

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a progress bar", () => {
  test("a progress bar renders its value in English until the page's language is known", () => {
    const html = markup()
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-valuetext="50%"')
    expect(html).toContain(">50%</span>")
  })
})
