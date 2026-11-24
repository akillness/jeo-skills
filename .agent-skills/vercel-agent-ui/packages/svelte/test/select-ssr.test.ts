import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/select-ssr-app.svelte"

const html = (props: Record<string, unknown>) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("select server rendering", () => {
  test("a data select renders its value's label and a hidden input that submits it", () => {
    const body = html({ data: true })
    expect(typeof window).toBe("undefined")
    expect(body).toContain('role="combobox"')
    expect(body).toMatch(/data-slot="select-value"[^>]*>(<!---->)?Pro</)
    expect(body).toMatch(/<textarea[^>]*name="plan"[^>]*>pro<\/textarea>/)
  })

  test("a select with composed items shows the label `itemToLabel` gives before they mount", () => {
    const body = html({
      itemToLabel: (value: string) => (value === "pro" ? "Pro" : "Basic"),
    })
    expect(body).toMatch(/data-slot="select-value"[^>]*>(<!---->)?Pro</)
  })

  // A Vue slot or React children can be read before they render. A snippet
  // can't, so the server shows the value's key until the items mount and
  // say their labels. Pass `items`, `itemToLabel` or `label` on each item
  // for the label in the server HTML.
  test("a select with composed items and no labels shows the value until its items mount", () => {
    const body = html({})
    expect(body).toMatch(/data-slot="select-value"[^>]*>(<!---->)?pro</)
  })
})
