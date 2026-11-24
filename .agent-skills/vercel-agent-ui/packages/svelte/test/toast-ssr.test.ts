import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/toast-ssr-app.svelte"

const html = (props: Record<string, unknown>) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("toast server rendering", () => {
  test("a region renders its empty list, with no landmark until it has toasts", () => {
    const body = html({})
    expect(typeof window).toBe("undefined")
    expect(body).toContain('data-slot="toast-region"')
    expect(body).toContain('data-side="top"')
    expect(body).toContain('data-slot="toast-list"')
    expect(body).not.toContain('role="region"')
  })

  test("the overlay host renders nothing on the server", () => {
    // Only Svelte's block markers, no elements.
    expect(html({ host: true }).replace(/<!--[^]*?-->/g, "")).toBe("")
  })
})
