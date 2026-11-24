import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/menubar-ssr-app.svelte"

const stops = (html: string) => html.match(/tabindex="0"/g)?.length ?? 0

// Runs with no DOM: any access to window or document during render throws.
describe("menubar server rendering", () => {
  test("a menubar renders one tab stop, on its first enabled trigger", () => {
    const body = render(App).body
    expect(typeof window).toBe("undefined")
    expect(body).toContain('role="menubar"')
    expect(stops(body)).toBe(1)
    expect(body).toMatch(/tabindex="0"[^>]*>(<!---->)?Edit</)
  })
})
