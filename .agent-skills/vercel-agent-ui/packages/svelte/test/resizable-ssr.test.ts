import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/resizable-app.svelte"

// Runs with no DOM: any access to window, document or storage during render throws.
describe("server rendering a resizable group", () => {
  test("panels take their default size as their basis, and the rest grow into what's left", () => {
    const html = render(App).body
    expect(typeof window).toBe("undefined")
    expect(html).toContain("flex:0 1 var(--resizable-panel-size, 70%)")
    expect(html).toContain("flex:1 1 var(--resizable-panel-size, 0px)")
    expect(html).toContain('aria-orientation="horizontal"')
    expect(html).toContain("flex-direction:column")
  })
})
