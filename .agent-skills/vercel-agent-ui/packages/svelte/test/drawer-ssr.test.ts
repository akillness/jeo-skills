import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/drawer-ssr-app.svelte"

const html = (props: Record<string, unknown>) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("drawer server rendering", () => {
  test("a closed drawer renders its trigger only", () => {
    const body = html({ open: false })
    expect(typeof window).toBe("undefined")
    expect(body).toContain('aria-haspopup="dialog"')
    expect(body).not.toContain('role="dialog"')
  })

  test("an open drawer renders its content in place, modal, at its first snap point", () => {
    const body = html({ open: true })
    expect(body).toContain('role="dialog"')
    expect(body).toContain('aria-modal="true"')
    expect(body).toContain('data-snap-point="0.5"')
    expect(body).toContain("<h2")
  })

  test.each([true, false])(
    "an initially open drawer is interactive at its default snap point with controlled %s",
    (controlled) => {
      const body = html({
        open: true,
        controlled,
        snapPoints: [0.25, 1],
        defaultSnapPoint: 0.25,
        modalAbove: 0.25,
      })
      expect(body).toContain('role="dialog"')
      expect(body).toContain('data-snap-point="0.25"')
      expect(body).toContain("data-interactive")
      expect(body).not.toContain('aria-modal="true"')
    }
  )

  test("an initially controlled snap point above the threshold remains modal", () => {
    const body = html({
      open: true,
      controlled: true,
      snapPoints: [0.25, 1],
      snapPoint: 1,
      defaultSnapPoint: 0.25,
      modalAbove: 0.25,
    })
    expect(body).toContain('data-snap-point="1"')
    expect(body).toContain('aria-modal="true"')
    expect(body).not.toContain("data-interactive")
  })

  test("a logical side renders as its left-to-right edge until the client reads the direction", () => {
    expect(html({ open: true })).toContain('data-side="left"')
  })

  test("a shortcut renders inside a trigger, with neutral names until the client knows its platform", () => {
    const body = html({ shortcut: true })
    expect(body).toContain('aria-keyshortcuts="Control+G"')
    expect(body).toMatch(
      /<span[^>]*aria-hidden="true"[^>]*>(<!---->)?⁦Ctrl\+G⁩/
    )
  })

  test("a shortcut inside a trigger connected through a controller renders nothing until the client finds the drawer", () => {
    const body = html({ remote: true })
    expect(body).toContain("Move goal")
    expect(body).not.toContain('data-slot="drawer-shortcut"')
  })
})
