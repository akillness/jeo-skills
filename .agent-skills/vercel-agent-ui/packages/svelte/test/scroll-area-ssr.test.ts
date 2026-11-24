import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/scroll-area-app.svelte"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a scroll area", () => {
  const html = () => render(App).body

  test("the viewport scrolls and hides native scrollbars already, so they never flash", () => {
    const body = html()
    expect(typeof window).toBe("undefined")
    expect(body).toMatch(
      /data-slot="scroll-area-viewport"[^>]*style="overflow:auto;scrollbar-width:none;?"/
    )
  })

  test("the scrollbar is hidden from screen readers, and from view until the content is measured", () => {
    const body = html()
    expect(body).toMatch(/aria-hidden="true"[^>]*data-orientation="vertical"/)
    expect(body).toMatch(/data-slot="scroll-area-scrollbar"[^>]*display:none/)
  })
})
