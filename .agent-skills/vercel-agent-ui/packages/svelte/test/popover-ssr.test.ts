import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/popover-ssr-app.svelte"

const html = (props: Record<string, unknown>) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("popover server rendering", () => {
  test("a closed popover renders its trigger only, with its shortcut", () => {
    const body = html({ open: false })
    expect(typeof window).toBe("undefined")
    expect(body).toContain('aria-haspopup="dialog"')
    expect(body).toContain('aria-keyshortcuts="Control+I"')
    expect(body).toMatch(
      /<span[^>]*aria-hidden="true"[^>]*>(<!---->)?⁦Ctrl\+I⁩/
    )
    expect(body).not.toContain('role="dialog"')
  })

  test("an open popover renders its content in place", () => {
    const body = html({ open: true })
    expect(body).toContain('role="dialog"')
    expect(body).toContain("<h2")
  })

  test("a trigger connected through a controller renders as a plain button, without its shortcut", () => {
    const body = html({ remote: true })
    expect(body).toMatch(/<button[^>]*type="button"[^>]*>(<!---->)?Share/)
    expect(body).not.toContain("Ctrl+I")
  })

  test("a disabled trigger whose popover hasn't mounted renders disabled", () => {
    expect(html({ remote: true, disabled: true })).toMatch(
      /<button[^>]*disabled[^>]*>(<!---->)?Share/
    )
  })
})
