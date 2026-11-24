// @vitest-environment node
import { renderToString } from "react-dom/server"
import { expect, test } from "vitest"
import {
  Command,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
} from "../src/command"

test("a composed group renders shown on the server while there's no query", () => {
  const html = renderToString(
    <Command>
      <CommandInput aria-label="Search" />
      <CommandList>
        <CommandItem value="loose">Loose</CommandItem>
        <CommandGroup>
          <CommandGroupLabel>Group</CommandGroupLabel>
          <CommandItem value="alpha">Alpha</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
  const group = html.match(/<div[^>]*data-slot="command-group"[^>]*>/)?.[0]
  expect(group).toBeDefined()
  expect(group).not.toMatch(/\shidden/)
})
