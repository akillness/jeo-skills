import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPage,
  createCommandController,
} from "@ui-sdk/solid/command"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const palette = createCommandController()

function Example() {
  const log = useLog()
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => palette.push("theme")}>
          Open Themes
        </button>
        <button type="button" onClick={() => palette.pop()}>
          Back
        </button>
        <button type="button" onClick={() => palette.setValue("dark")}>
          Highlight Dark
        </button>
        <button type="button" onClick={() => palette.setQuery("li")}>
          Search “li”
        </button>
        <button type="button" onClick={() => palette.run()}>
          Run Highlighted
        </button>
        <button type="button" onClick={() => palette.focus()}>
          Focus
        </button>
      </div>
      <Command controller={palette} onAction={(value) => log(`Ran ${value}`)}>
        <CommandInput aria-label="Search commands" />
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
    </div>
  )
}

export { Example }
