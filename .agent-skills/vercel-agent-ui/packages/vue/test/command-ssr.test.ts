// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { Autocomplete, AutocompleteInput, Command, CommandInput } from "../src"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering", () => {
  test("data commands render ranked for the query, with the field and the list", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            Command,
            {
              items: ["Settings", "Calendar", "Reset settings"],
              defaultQuery: "set",
            },
            () => [h(CommandInput, { "aria-label": "Search commands" })]
          ),
      })
    )
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*value="set"/)
    expect(html).toContain('role="listbox"')
    expect(html).not.toContain("Calendar")
  })

  test("an autocomplete's field holds the text and submits it under its name", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(Autocomplete, { name: "fruit", defaultValue: "Mango" }, () => [
            h(AutocompleteInput),
          ]),
      })
    )
    expect(html).toMatch(/<input[^>]*value="Mango"/)
    expect(html).toMatch(/<input[^>]*name="fruit"/)
  })
})
