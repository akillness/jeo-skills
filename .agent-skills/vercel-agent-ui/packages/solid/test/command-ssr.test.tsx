import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
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
    const html = renderToString(() => (
      <Command
        items={["Settings", "Calendar", "Reset settings"]}
        defaultQuery="set"
      >
        <CommandInput aria-label="Search commands" />
      </Command>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*value="set"/)
    expect(html).toContain('role="listbox"')
    expect(html.indexOf("Reset settings")).toBeGreaterThan(
      html.indexOf(">Settings<")
    )
    expect(html).not.toContain("Calendar")
  })

  test("only the current page renders, and shortcuts start neutral", () => {
    const html = renderToString(() => (
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
    ))
    expect(html).toContain("Dark")
    expect(html).not.toContain("Profile")
  })

  test("a composed list renders once, beside the input, not again as a data list", () => {
    const html = renderToString(() => (
      <Command items={["Settings"]}>
        <CommandInput aria-label="Search commands" />
        <CommandList>
          <CommandItem value="profile">Profile</CommandItem>
        </CommandList>
      </Command>
    ))
    expect(html.match(/role="listbox"/g)).toHaveLength(1)
    expect(html).toContain("Profile")
  })
})
