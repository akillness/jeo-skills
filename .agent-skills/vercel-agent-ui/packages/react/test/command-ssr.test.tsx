// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  Autocomplete,
  AutocompleteInput,
  AutocompleteLabel,
} from "../src/autocomplete"
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPage,
  CommandShortcut,
} from "../src/command"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a command list", () => {
  test("data commands render ranked for the query, with the field and the list", () => {
    const html = renderToString(
      <Command
        items={["Settings", "Calendar", "Reset settings"]}
        defaultQuery="set"
      >
        <CommandInput aria-label="Search commands" />
      </Command>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*value="set"/)
    expect(html).toContain('role="listbox"')
    expect(html.indexOf("Reset settings")).toBeGreaterThan(
      html.indexOf(">Settings<")
    )
    expect(html).not.toContain("Calendar")
  })

  test("only the current page renders, and shortcuts start neutral", () => {
    const html = renderToString(
      <Command defaultPages={["theme"]}>
        <CommandInput aria-label="Search commands" />
        <CommandList>
          <CommandPage>
            <CommandItem value="profile" shortcut="mod+p">
              Profile
              <CommandShortcut />
            </CommandItem>
          </CommandPage>
          <CommandPage value="theme">
            <CommandItem value="dark">Dark</CommandItem>
          </CommandPage>
        </CommandList>
      </Command>
    )
    expect(html).toContain("Dark")
    expect(html).not.toContain("Profile")
  })
})

describe("server rendering an autocomplete", () => {
  test("the field holds the text and submits it under its name, before any script runs", () => {
    const html = renderToString(
      <Autocomplete name="fruit" defaultValue="Mango" required>
        <AutocompleteLabel>Fruit</AutocompleteLabel>
        <AutocompleteInput />
      </Autocomplete>
    )
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*value="Mango"/)
    expect(html).toMatch(/<input[^>]*name="fruit"/)
    expect(html).toMatch(/<input[^>]*required/)
    expect(html).not.toContain('role="listbox"')
  })
})
