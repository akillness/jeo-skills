import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/picker-app.svelte"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering parts from createParts", () => {
  test("renders the root with its options and the element's props", () => {
    const html = render(App, { props: { defaultValue: "pear" } }).body
    expect(html).toMatch(/<div[^>]*role="group"/)
    expect(html).toContain('class="picker"')
    expect(html).toContain('aria-label="Fruit"')
    expect(html).not.toContain("defaultvalue")
    expect(html).toContain("<output>pear</output>")
  })

  test("hands each part its state and keeps slot props off the element", () => {
    const html = render(App, { props: { defaultValue: "pear" } }).body
    expect(html).toMatch(/<div[^>]*data-picked=""[^>]*>[\s\S]*?pear \(picked\)/)
    expect(html).not.toMatch(/<div[^>]*\bvalue="/)
  })

  test("takes a nested part's prop from the part around it", () => {
    const html = render(App, {}).body
    expect(html).toContain('data-value="apple"')
    expect(html).toContain('data-value="pear"')
  })

  test("takes a nested part's prop from the named prop of the part around it", () => {
    const html = render(App, {}).body
    expect(html).toContain('data-item="apple"')
  })

  test("makes an id for an id prop left out", () => {
    const html = render(App, {}).body
    expect(html).toMatch(/<button[^>]*id="[^"]+"/)
  })
})
