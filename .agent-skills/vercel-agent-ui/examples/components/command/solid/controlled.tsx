import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPage,
} from "@ui-sdk/solid/command"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

function Example() {
  const [value, setValue] = createSignal<string | null>("dark")
  const [query, setQuery] = createSignal("")
  const [pages, setPages] = createSignal(["theme"])
  const log = useLog()
  return (
    <Command
      value={value()}
      onValueChange={(next, details) => {
        setValue(next)
        log(`Highlighted ${next ?? "nothing"} (${details.reason})`)
      }}
      query={query()}
      onQueryChange={(next, details) => {
        setQuery(next)
        log(`Query “${next}” (${details.reason})`)
      }}
      pages={pages()}
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
          <For each={themes}>
            {(theme) => (
              <CommandItem value={theme.value}>{theme.label}</CommandItem>
            )}
          </For>
        </CommandPage>
      </CommandList>
    </Command>
  )
}

export { Example }
