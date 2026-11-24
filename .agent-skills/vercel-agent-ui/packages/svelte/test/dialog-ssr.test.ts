import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/dialog-ssr-app.svelte"

const html = (props: Record<string, unknown>) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("dialog server rendering", () => {
  test("a closed dialog renders its trigger only, with its shortcut", () => {
    const body = html({ open: false })
    expect(typeof window).toBe("undefined")
    expect(body).toContain('aria-haspopup="dialog"')
    expect(body).toContain('aria-keyshortcuts="Control+K"')
    expect(body).toContain("Ctrl+K")
    expect(body).not.toContain('role="dialog"')
  })

  test("an open dialog renders its content in place", () => {
    const body = html({ open: true })
    expect(body).toContain('role="dialog"')
    expect(body).toContain('aria-modal="true"')
    expect(body).toContain("<h2")
  })

  test("a shortcut inside a trigger connected through a controller renders nothing until the client finds the dialog", () => {
    const body = html({ remote: true })
    expect(body).toContain("Search")
    expect(body).not.toContain('data-slot="dialog-shortcut"')
  })

  test("an open alert dialog renders its role", () => {
    expect(html({ alert: true })).toContain('role="alertdialog"')
  })

  // `presentation="auto"` is decided at open on the client, so the server
  // renders an open dialog as a dialog, the same markup as without the option.
  test('"auto" renders the same markup as the default', () => {
    const body = html({ open: true, presentation: "auto" })
    expect(body).toBe(html({ open: true }))
    expect(body).not.toContain("-viewport")
  })

  test('"sheet" renders the content in its viewport', () => {
    const body = html({ open: true, presentation: "sheet" })
    expect(body).toContain('data-slot="dialog-viewport"')
    expect(body).toContain('data-presentation="sheet"')
  })
})
