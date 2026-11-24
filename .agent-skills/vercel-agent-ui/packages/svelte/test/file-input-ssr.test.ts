import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import App from "./apps/file-input-ssr-app.svelte"

type Props = {
  which: "named" | "disabled" | "list" | "render" | "forwarded" | "remove"
  files?: File[]
}

// Svelte's server output carries hydration comments between elements and text.
const markup = (props: Props) =>
  render(App, { props }).body.replace(/<!--[^]*?-->/g, "")

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a file input", () => {
  test("a named file input renders a file input with its rules, which submits before hydration", () => {
    const html = markup({ which: "named" })
    expect(typeof window).toBe("undefined")
    expect(html).toContain('data-slot="file-input-dropzone"')
    expect(html).toMatch(
      /<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*multiple[^>]*name="files"[^>]*required/
    )
  })

  test("a disabled file input disables its trigger", () => {
    expect(markup({ which: "disabled" })).toMatch(/<button[^>]*disabled/)
  })

  test("the list renders an item per file, with one tab stop", () => {
    const files = [new File(["x"], "a.png"), new File(["x"], "b.pdf")]
    const html = markup({ which: "list", files })
    expect(html.match(/role="listitem"/g)).toHaveLength(2)
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Remove b.pdf"')
  })

  test("a root rendered through the render snippet still renders its hidden file input", () => {
    const html = markup({ which: "render" })
    expect(html).toContain("<section")
    expect(html).toMatch(/<input[^>]*type="file"[^>]*name="files"/)
  })

  test("a render snippet that renders the root's children renders one file input", () => {
    const html = markup({ which: "forwarded" })
    expect(html).toContain("Browse")
    expect(html.match(/<input[^>]*type="file"/g)).toHaveLength(1)
  })

  test("a remove button given a file removes that file outside an item", () => {
    const file = new File(["x"], "a.png", { type: "image/png" })
    expect(markup({ which: "remove", files: [file] })).toContain(
      'aria-label="Remove a.png"'
    )
  })
})
