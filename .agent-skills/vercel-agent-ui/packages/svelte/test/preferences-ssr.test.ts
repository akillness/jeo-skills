// Preferences on the server: one script first, which puts the saved values
// on their attributes as the page loads, and the defaults in the HTML.
import {
  createColorScheme,
  createLocalStorage,
  createPreference,
} from "@ui-sdk/core"
import { render } from "svelte/server"
import { expect, test } from "vitest"
import App from "./apps/preferences-app.svelte"

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
  const { body } = render(App, {
    props: {
      preferences: [colorScheme, skinTone],
      label: skinTone,
      nonce: 'a"b',
    },
  })
  expect(typeof window).toBe("undefined")
  expect(body.match(/<script/g)).toHaveLength(1)
  expect(body).toMatch(
    /<div[^>]*data-skin-tone="default"[^>]*>(<!--[^>]*-->)*<script nonce="a&#34;b">\(function/
  )
  expect(body).not.toContain("data-color-scheme=")
  expect(body).toContain("Tone: default")
})
