import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import {
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
} from "../src/token-input"
import { TriggerMenu, TriggerMenuInput } from "../src/trigger-menu"

const value = ["Explain ", { type: "file", value: "src/a.ts", label: "a.ts" }]

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a prompt input", () => {
  test("a token input renders its value as text and token hosts, and its codec text for the form", () => {
    const html = renderToString(() => (
      <TokenInput defaultValue={value} name="prompt">
        <TokenInputEditor aria-label="Prompt" placeholder="Ask anything" />
        <TriggerMenu triggers={[{ char: "@", items: [] }]} />
      </TokenInput>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="textbox"')
    expect(html).toContain('contenteditable="true"')
    expect(html).toContain('aria-placeholder="Ask anything"')
    expect(html).toMatch(/Explain ​<span[^>]*data-token-type="file"/)
    expect(html).toMatch(
      /<textarea[^>]*name="prompt"[^>]*>Explain \[@a\.ts\]\(file:src\/a\.ts\)<\/textarea>/
    )
    // The list isn't in the page while closed.
    expect(html).not.toContain('role="listbox"')
  })

  test("custom tokens render their label on the server, and nothing into the hosts, which the client owns", () => {
    const html = renderToString(() => (
      <TokenInput
        defaultValue={value}
        renderToken={(token) => (
          <TokenInputToken>{token.label}</TokenInputToken>
        )}
      >
        <TokenInputEditor aria-label="Prompt" />
      </TokenInput>
    ))
    expect(html).toMatch(/data-token-type="file"[^>]*><span>a\.ts<\/span>/)
    expect(html).not.toContain('data-slot="token-input-token"')
  })

  test("a trigger menu's textarea says it autocompletes from a list, and stays a textbox", () => {
    const html = renderToString(() => (
      <TriggerMenu triggers={[{ char: "@", items: [] }]}>
        <TriggerMenuInput aria-label="Message" />
      </TriggerMenu>
    ))
    expect(html).toMatch(
      /<textarea[^>]*aria-autocomplete="list"[^>]*aria-haspopup="listbox"/
    )
    expect(html).not.toContain("aria-expanded")
  })
})
