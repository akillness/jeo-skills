import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import {
  Autocomplete,
  AutocompleteInput,
  AutocompleteLabel,
} from "../src/autocomplete"

// Runs with no DOM: any access to window or document during render throws.
// Solid renders boolean attributes bare, like `required`.

const inputs = (html: string) => html.match(/<input[^>]*>/g) ?? []

describe("server rendering an autocomplete", () => {
  test("the field holds the text and submits it under its name, before any script runs", () => {
    const html = renderToString(() => (
      <Autocomplete name="fruit" defaultValue="Mango" required>
        <AutocompleteLabel>Fruit</AutocompleteLabel>
        <AutocompleteInput />
      </Autocomplete>
    ))
    expect(typeof window).toBe("undefined")
    const field = inputs(html).find((input) =>
      input.includes('role="combobox"')
    )!
    expect(field).toContain('value="Mango"')
    expect(field).toContain('name="fruit"')
    expect(field).toMatch(/\srequired[\s>]/)
    expect(html).not.toContain('role="listbox"')
  })
})
