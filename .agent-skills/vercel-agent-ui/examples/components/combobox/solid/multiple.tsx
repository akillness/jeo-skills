import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@ui-sdk/solid/combobox"
import { For } from "solid-js"

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
  return (
    <Combobox
      multiple
      defaultValue={["next", "astro"]}
      itemToLabel={frameworkLabel}
    >
      <div data-slot="stack">
        <ComboboxLabel>Frameworks</ComboboxLabel>
        <div data-slot="row">
          <ComboboxChips>
            <ComboboxValue>
              {(state) => (
                <For each={state.value as string[]}>
                  {(value, index) => (
                    <ComboboxChip value={value}>
                      {state.labels[index()]}
                      <ComboboxChipRemove
                        aria-label={`Remove ${state.labels[index()]}`}
                      >
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
                      </ComboboxChipRemove>
                    </ComboboxChip>
                  )}
                </For>
              )}
            </ComboboxValue>
            <ComboboxInput placeholder="Add a framework…" />
          </ComboboxChips>
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
