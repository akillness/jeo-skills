import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
} from "@ui-sdk/solid/combobox"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const titles = [
  "Designer",
  "Engineer",
  "Engineering manager",
  "Product manager",
  "Researcher",
]

function Example() {
  const log = useLog()
  const [value, setValue] = createSignal<string | null>(null)

  return (
    <Combobox
      allowCustomValue
      value={value()}
      onValueChange={(next, details) => {
        setValue(next)
        log(`${next ? `“${next}”` : "No title"} (${details.reason})`)
      }}
    >
      <div data-slot="stack">
        <ComboboxLabel>Job title</ComboboxLabel>
        <ComboboxInput placeholder="Type any title…" />
      </div>
      <ComboboxContent>
        <ComboboxEmpty>
          {(state) =>
            state.empty ? `Press Enter to use “${state.query}”.` : null
          }
        </ComboboxEmpty>
        <ComboboxList>
          <For each={titles}>
            {(title) => (
              <ComboboxItem value={title}>
                {title}
                <ComboboxItemIndicator>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </ComboboxItemIndicator>
              </ComboboxItem>
            )}
          </For>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
