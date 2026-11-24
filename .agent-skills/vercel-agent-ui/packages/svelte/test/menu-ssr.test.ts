import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/menu-ssr-app.svelte"

const html = (props: Record<string, unknown>) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("menu server rendering", () => {
  test("a closed menu renders its trigger only", () => {
    const body = html({ open: false })
    expect(typeof window).toBe("undefined")
    expect(body).toContain('aria-haspopup="menu"')
    expect(body).toContain('aria-expanded="false"')
    expect(body).not.toContain('role="menu"')
  })

  test("an open menu renders its content with neutral shortcuts", () => {
    const body = html({ open: true })
    expect(body).toContain('role="menu"')
    expect(body).toContain('aria-keyshortcuts="Control+N"')
    expect(body).toContain("Ctrl+N")
  })

  test("data menus render on the server", () => {
    const body = html({
      open: true,
      items: [{ value: "new", label: "New file" }, { type: "separator" }],
    })
    expect(body).toContain('role="menuitem"')
    expect(body).toContain('role="separator"')
  })
})
