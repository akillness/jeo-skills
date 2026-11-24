import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/autocomplete-ssr-app.svelte"

const html = (props: Record<string, unknown>) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("autocomplete server rendering", () => {
  test("the field renders its text under the autocomplete's name, as the form control", () => {
    const body = html({})
    expect(typeof window).toBe("undefined")
    expect(body).toMatch(/<input[^>]*role="combobox"[^>]*value="Mango"/)
    expect(body).toMatch(/<input[^>]*role="combobox"[^>]*name="fruit"/)
  })

  test("a data autocomplete renders the same field, and no suggestions while closed", () => {
    const body = html({ data: true })
    expect(body).toMatch(/<input[^>]*role="combobox"[^>]*value="Mango"/)
    expect(body).not.toContain('role="option"')
  })

  // `presentation="auto"` is decided at open on the client, so the server
  // renders open suggestions as a popover, and the client's first render matches it.
  test(`"auto" renders the same markup as the default`, () => {
    const body = html({ defaultOpen: true, presentation: "auto" })
    expect(body).toBe(html({ defaultOpen: true }))
    expect(body).not.toContain("-viewport")
  })

  test(`"sheet" renders the content in its viewport, with the header the field moves into`, () => {
    const body = html({ defaultOpen: true, presentation: "sheet" })
    expect(body).toContain('data-slot="autocomplete-viewport"')
    expect(body).toContain('data-presentation="sheet"')
    expect(body).toContain('data-slot="autocomplete-header"')
  })
})
