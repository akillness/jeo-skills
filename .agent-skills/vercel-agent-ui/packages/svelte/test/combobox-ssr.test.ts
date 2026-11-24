import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/combobox-ssr-app.svelte"

const html = (props: Record<string, unknown>) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("combobox server rendering", () => {
  test("a data combobox renders its value's label in the input and a hidden input that submits it", () => {
    const body = html({ data: true })
    expect(typeof window).toBe("undefined")
    expect(body).toMatch(/<input[^>]*role="combobox"[^>]*value="France"/)
    expect(body).toMatch(/<textarea[^>]*name="country"[^>]*>fr<\/textarea>/)
  })

  test("a data combobox with several values renders a chip and a hidden input per value", () => {
    const body = html({ data: true, multiple: true })
    expect(body.match(/data-slot="combobox-chip"/g)).toHaveLength(2)
    expect(body).toMatch(/data-slot="combobox-chip"[^>]*data-value="br"/)
    expect(body).toMatch(/<input[^>]*name="country"[^>]*value="br"/)
    expect(body).toMatch(/<input[^>]*name="country"[^>]*value="fr"/)
  })

  test("a combobox with composed items shows the label `itemToLabel` gives before they mount", () => {
    const body = html({
      itemToLabel: (value: string) => (value === "fr" ? "France" : "Brazil"),
    })
    expect(body).toMatch(/<input[^>]*role="combobox"[^>]*value="France"/)
  })

  // A Vue slot or React children can be read before they render. A snippet
  // can't, so the server shows the value's key until the items mount and
  // say their labels. Pass `items`, `itemToLabel` or `label` on each item
  // for the label in the server HTML.
  test("a combobox with composed items and no labels shows the value until its items mount", () => {
    const body = html({})
    expect(body).toMatch(/<input[^>]*role="combobox"[^>]*value="fr"/)
  })

  // `presentation="auto"` is decided at open on the client, so the server
  // renders an open list as a popover, and the client's first render matches it.
  test(`"auto" renders the same markup as the default`, () => {
    const body = html({ defaultOpen: true, presentation: "auto" })
    expect(body).toBe(html({ defaultOpen: true }))
    expect(body).not.toContain("-viewport")
  })

  test(`"sheet" renders the content in its viewport, with the header the input moves into`, () => {
    const body = html({ defaultOpen: true, presentation: "sheet" })
    expect(body).toContain('data-slot="combobox-viewport"')
    expect(body).toContain('data-presentation="sheet"')
    expect(body).toContain('data-slot="combobox-header"')
  })
})
