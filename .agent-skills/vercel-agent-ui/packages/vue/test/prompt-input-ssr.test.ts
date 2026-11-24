// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  TokenInput,
  TokenInputEditor,
  TriggerMenu,
  TriggerMenuInput,
} from "../src"

const value = ["Explain ", { type: "file", value: "src/a.ts", label: "a.ts" }]

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a prompt input", () => {
  test("a token input renders its value as text and token hosts, and its codec text for the form", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(TokenInput, { defaultValue: value, name: "prompt" }, () => [
            h(TokenInputEditor, {
              "aria-label": "Prompt",
              placeholder: "Ask anything",
            }),
            h(TriggerMenu, { triggers: [{ char: "@", items: [] }] }),
          ]),
      })
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="textbox"')
    expect(html).toContain('contenteditable="true"')
    expect(html).toMatch(/Explain ​<span[^>]*data-token-type="file"/)
    expect(html).toMatch(
      /<textarea[^>]*name="prompt"[^>]*>Explain \[@a\.ts\]\(file:src\/a\.ts\)<\/textarea>/
    )
  })

  test("a trigger menu's textarea says it autocompletes from a list, and stays a textbox", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(TriggerMenu, { triggers: [{ char: "@", items: [] }] }, () =>
            h(TriggerMenuInput, { "aria-label": "Message" })
          ),
      })
    )
    expect(html).toMatch(
      /<textarea[^>]*aria-autocomplete="list"[^>]*aria-haspopup="listbox"/
    )
    expect(html).not.toContain("aria-expanded")
  })
})
