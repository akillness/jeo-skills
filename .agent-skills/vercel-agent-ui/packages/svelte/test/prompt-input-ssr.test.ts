import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/prompt-input-ssr-app.svelte"

const html = (props: Record<string, unknown>) => render(App, { props }).body

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a prompt input", () => {
  test("a token input renders its value as text and token hosts, and its codec text for the form", () => {
    const body = html({ input: true })
    expect(typeof window).toBe("undefined")
    expect(body).toContain('role="textbox"')
    expect(body).toContain('contenteditable="true"')
    expect(body).toMatch(/Explain ​<span[^>]*data-token-type="file"/)
    expect(body).toMatch(
      /<textarea[^>]*name="prompt"[^>]*>Explain \[@a\.ts\]\(file:src\/a\.ts\)<\/textarea>/
    )
  })

  test("a trigger menu's textarea says it autocompletes from a list, and stays a textbox", () => {
    const body = html({})
    expect(body).toMatch(
      /<textarea[^>]*aria-autocomplete="list"[^>]*aria-haspopup="listbox"/
    )
    expect(body).not.toContain("aria-expanded")
  })
})
