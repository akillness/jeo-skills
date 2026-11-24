import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/accordion-app.svelte"

const html = (props: {
  defaultValue?: string[]
  hiddenUntilFound?: boolean
  keepMounted?: boolean
}) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering an accordion", () => {
  test("renders open panels with their content and leaves closed ones out", () => {
    const body = html({ defaultValue: ["b"] })
    expect(typeof window).toBe("undefined")
    expect(body).toContain("<h3")
    expect(body).toMatch(/aria-expanded="true"[^>]*>(<!---->)?Trigger b/)
    expect(body).toMatch(/aria-expanded="false"[^>]*>(<!---->)?Trigger a/)
    expect(body).toContain("Panel b")
    expect(body).not.toContain("Panel a")
  })

  test("kept panels render hidden", () => {
    expect(html({ defaultValue: ["b"], keepMounted: true })).toMatch(
      /<div[^>]*hidden[^>]*>(<!---->)?Panel a/
    )
  })

  test("findable panels render hidden until found, so find in page works before hydration", () => {
    expect(html({ defaultValue: ["b"], hiddenUntilFound: true })).toMatch(
      /<div[^>]*hidden="until-found"[^>]*>(<!---->)?Panel a/
    )
  })
})
