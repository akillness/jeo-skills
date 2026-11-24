import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import RenderExample from "../../../examples/components/slider/svelte/render.svelte"
import App from "./apps/slider-ssr-app.svelte"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a slider", () => {
  test("a range renders placed thumbs, their inputs and one form value", () => {
    const html = render(App).body
    expect(typeof window).toBe("undefined")
    expect(html).toContain("inset-inline-start:20%")
    expect(html).toMatch(
      /<input[^>]*type="range"[^>]*aria-label="Minimum"|<input[^>]*aria-label="Minimum"[^>]*type="range"/
    )
    expect(html).toMatch(/<input[^>]*name="price"[^>]*value="20\/80"/)
    expect(html).toContain("20 – 80")
  })

  // The range input reaches a custom thumb as `children`, and is the only thing that takes focus.
  test("the docs' render example keeps its thumb's range input", () => {
    const html = render(RenderExample).body
    const [label, labelId] = html.match(
      /<label[^>]*\sid="([^"]+)"[^>]*>.*?Brightness/
    )!
    const [input, inputId] = html.match(
      /<input[^>]*type="range"[^>]*\sid="([^"]+)"[^>]*>/
    )!
    expect(input).toContain(`aria-labelledby="${labelId}"`)
    expect(label).toContain(`for="${inputId}"`)
  })
})
