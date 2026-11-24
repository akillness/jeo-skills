import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/solid/combobox"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "solidstart", label: "SolidStart" },
  { value: "qwik", label: "Qwik City" },
]

const frameworkLabel = (value: string) =>
  frameworks.find((framework) => framework.value === value)?.label ?? value

function Example() {
  const log = useLog()
  const [value, setValue] = createSignal<string | null>("sveltekit")

  return (
    <Combobox
      value={value()}
      onValueChange={(next, details) => {
        setValue(next)
        log(`${next ? frameworkLabel(next) : "Cleared"} (${details.reason})`)
      }}
      itemToLabel={frameworkLabel}
    >
      <div data-slot="stack">
        <ComboboxLabel>Framework</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Select a framework" />
          <ComboboxClear aria-label="Clear framework">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </ComboboxClear>
          <ComboboxTrigger aria-label="Show frameworks">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
        <ComboboxList>
          <For each={frameworks}>
            {(framework) => (
              <ComboboxItem value={framework.value} label={framework.label}>
                {framework.label}
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
