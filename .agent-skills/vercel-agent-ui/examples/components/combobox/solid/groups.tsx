import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from "@ui-sdk/solid/combobox"
import { For, Show } from "solid-js"

const timezones = [
  {
    label: "Americas",
    items: [
      { value: "America/New_York", label: "New York" },
      { value: "America/Chicago", label: "Chicago" },
      { value: "America/Denver", label: "Denver" },
      { value: "America/Los_Angeles", label: "Los Angeles" },
      { value: "America/Sao_Paulo", label: "São Paulo" },
    ],
  },
  {
    label: "Europe",
    items: [
      { value: "Europe/London", label: "London" },
      { value: "Europe/Paris", label: "Paris" },
      { value: "Europe/Berlin", label: "Berlin" },
      { value: "Europe/Madrid", label: "Madrid" },
    ],
  },
  {
    label: "Asia & Pacific",
    items: [
      { value: "Asia/Tokyo", label: "Tokyo" },
      { value: "Asia/Singapore", label: "Singapore" },
      { value: "Asia/Kolkata", label: "Kolkata" },
      { value: "Australia/Sydney", label: "Sydney" },
    ],
  },
]

function Example() {
  return (
    <Combobox>
      <div data-slot="stack">
        <ComboboxLabel>Timezone</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Search cities…" />
          <ComboboxTrigger aria-label="Show timezones">
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
        <ComboboxEmpty>No cities found.</ComboboxEmpty>
        <ComboboxList>
          <For each={timezones}>
            {(group, index) => (
              <>
                <Show when={index() > 0}>
                  <ComboboxSeparator />
                </Show>
                <ComboboxGroup>
                  <ComboboxGroupLabel>{group.label}</ComboboxGroupLabel>
                  <For each={group.items}>
                    {(item) => (
                      <ComboboxItem value={item.value} label={item.label}>
                        {item.label}
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
                </ComboboxGroup>
              </>
            )}
          </For>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
