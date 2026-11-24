import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/avatar-ssr-app.svelte"

// Svelte's server output carries hydration comments between elements and text.
const markup = () => render(App).body.replace(/<!--[^]*?-->/g, "")

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering an avatar", () => {
  test("an avatar renders its fallback, and its image hidden so it starts loading", () => {
    const html = markup()
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<img[^>]*src="\/ada.png"[^>]*aria-hidden="true"/)
    expect(html).toContain(">AL</span>")
  })
})
