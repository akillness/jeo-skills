import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/pagination-app.svelte"

const pages = (getHref?: (page: number) => string) =>
  render(App, { props: { getHref } }).body

// Runs with no DOM: any access to window or document during render throws.
describe("pagination server rendering", () => {
  test("the server renders the landmark, the range and the current page", () => {
    const html = pages()
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<nav[^>]*aria-label="Pages"/)
    expect(html).toMatch(/aria-current="page"[^>]*>(<!---->)?5</)
  })

  test("with getHref the server renders links", () => {
    expect(pages((page) => `/results?page=${page}`)).toContain(
      'href="/results?page=6"'
    )
  })
})
