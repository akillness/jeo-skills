// Preferences on the server: one script first, which puts the saved values
// on their attributes as the page loads, and the defaults in the HTML.
import {
  createColorScheme,
  createLocalStorage,
  createPreference,
} from "@ui-sdk/core"
import { renderToString } from "@solidjs/web"
import { expect, test } from "vitest"
import { Preferences, usePreference } from "../src/preferences"

test("renders one script first, the defaults on its element, and content from the defaults", () => {
  const colorScheme = createColorScheme({
    storage: createLocalStorage("color-scheme"),
    global: true,
  })
  const skinTone = createPreference({
    values: ["default", "dark"],
    defaultValue: "default",
    attribute: "data-skin-tone",
    storage: createLocalStorage("skin-tone"),
  })
  function Label() {
    const state = usePreference(skinTone)
    return <p>{`Tone: ${state().value}`}</p>
  }
  const html = renderToString(() => (
    <Preferences preferences={[colorScheme, skinTone]} nonce="abc">
      <Label />
    </Preferences>
  ))
  expect(typeof window).toBe("undefined")
  expect(html.match(/<script/g)).toHaveLength(1)
  expect(html).toMatch(
    /<div[^>]*data-skin-tone="default"[^>]*><script[^>]*nonce="abc"[^>]*>\(function/
  )
  expect(html).not.toContain("data-color-scheme=")
  expect(html).toContain("Tone: default")
})
