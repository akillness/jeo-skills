import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/toggle-ssr-app.svelte"

// Svelte's server output carries hydration comments between elements and text.
const markup = (
  which: "group" | "button" | "submit" | "separator" | "decorative"
) => render(App, { props: { which } }).body.replace(/<!--[^]*?-->/g, "")

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering toggles, buttons and separators", () => {
  test("a toggle group renders one tab stop, on the pressed toggle", () => {
    const html = markup("group")
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="group"')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*>C/)
  })

  test("a button renders as a native button that doesn't submit by default", () => {
    expect(markup("button")).toMatch(/<button[^>]*type="button"/)
    expect(markup("submit")).toMatch(/type="submit"/)
  })

  test("a separator renders its role and orientation", () => {
    expect(markup("separator")).toMatch(
      /role="separator"[^>]*aria-orientation="vertical"/
    )
    expect(markup("decorative")).toContain('role="none"')
  })
})
