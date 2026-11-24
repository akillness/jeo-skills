import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import HoverCardApp from "./apps/hover-card-ssr-app.svelte"
import TooltipApp from "./apps/tooltip-ssr-app.svelte"

const tooltip = (variant: "shortcut" | "remote" | "label") =>
  render(TooltipApp, { props: { variant } }).body
const card = (open: boolean) => render(HoverCardApp, { props: { open } }).body

// Runs with no DOM: any access to window or document during render throws.
describe("tooltip server rendering", () => {
  test("a closed tooltip is in the HTML, hidden, and already describes its trigger", () => {
    const body = tooltip("shortcut")
    expect(typeof window).toBe("undefined")
    expect(body).toMatch(/aria-describedby="[^"]+-content"/)
    expect(body).toContain('aria-keyshortcuts="Control+S"')
    expect(body).toContain('role="tooltip"')
    expect(body).toContain("hidden")
    expect(body).toContain("Ctrl+S")
  })

  test("a shortcut inside a trigger connected through a controller renders nothing until the client finds the tooltip", () => {
    const body = tooltip("remote")
    expect(body).toContain("Save")
    expect(body).not.toContain('data-slot="tooltip-shortcut"')
  })

  test("a tooltip that labels its trigger names it from the server HTML", () => {
    const body = tooltip("label")
    expect(body).toMatch(/aria-labelledby="[^"]+-content"/)
    expect(body).not.toContain("aria-describedby")
  })
})

describe("hover card server rendering", () => {
  test("a closed card renders its link only", () => {
    const body = card(false)
    expect(body).toContain('href="/ada"')
    expect(body).not.toContain("Ada Lovelace")
  })

  test("an open card renders its content", () => {
    expect(card(true)).toContain("Ada Lovelace")
  })
})
