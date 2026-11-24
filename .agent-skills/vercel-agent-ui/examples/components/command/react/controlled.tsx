import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPage,
} from "@ui-sdk/react/command"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

function Example() {
  const [value, setValue] = React.useState<string | null>("dark")
  const [query, setQuery] = React.useState("")
  const [pages, setPages] = React.useState(["theme"])
  const log = useLog()
  return (
    <Command
      value={value}
      onValueChange={(next, details) => {
        setValue(next)
        log(`Highlighted ${next ?? "nothing"} (${details.reason})`)
      }}
      query={query}
      onQueryChange={(next, details) => {
        setQuery(next)
        log(`Query “${next}” (${details.reason})`)
      }}
      pages={pages}
      onPagesChange={(next, details) => {
        setPages(next)
        log(`Pages [${next.join(", ")}] (${details.reason})`)
      }}
      onAction={(next) => log(`Ran ${next}`)}
    >
      <CommandInput aria-label="Search themes" placeholder="Search themes…" />
      <CommandList>
        <CommandPage>
          <CommandItem value="theme" page="theme">
            Change theme…
          </CommandItem>
        </CommandPage>
        <CommandPage value="theme">
          {themes.map((theme) => (
            <CommandItem key={theme.value} value={theme.value}>
              {theme.label}
            </CommandItem>
          ))}
        </CommandPage>
      </CommandList>
    </Command>
  )
}

export { Example }
