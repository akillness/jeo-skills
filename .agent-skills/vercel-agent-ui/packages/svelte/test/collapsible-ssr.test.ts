import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/collapsible-app.svelte"

const html = (props: {
  defaultOpen?: boolean
  panel?: Record<string, unknown>
}) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a collapsible", () => {
  test("renders an open panel with its content", () => {
    const body = html({ defaultOpen: true })
    expect(typeof window).toBe("undefined")
    expect(body).toMatch(/aria-expanded="true"[^>]*>(<!---->)?Details/)
    expect(body).toContain("Panel")
  })

  test("leaves a closed panel out", () => {
    expect(html({})).not.toContain("Panel")
  })

  test("renders a findable panel as hidden until found, so find in page works before hydration", () => {
    expect(html({ panel: { hiddenUntilFound: true } })).toMatch(
      /<div[^>]*hidden="until-found"[^>]*>(<!---->)?Panel/
    )
  })

  test("prefixes generated ids with ui-sdk-", () => {
    expect(html({ defaultOpen: true })).toMatch(/id="ui-sdk-[^"]+-trigger"/)
  })
})
