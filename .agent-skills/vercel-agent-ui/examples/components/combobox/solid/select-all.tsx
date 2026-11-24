import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxSelectAll,
  ComboboxValue,
} from "@ui-sdk/solid/combobox"
import { For } from "solid-js"

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
    <Combobox multiple defaultValue={["Europe/Paris"]}>
      <div data-slot="stack">
        <ComboboxLabel>Timezones</ComboboxLabel>
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
          <ComboboxInput placeholder="Add timezones…" />
        </ComboboxChips>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No timezones found.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxSelectAll>
            <span>
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
              </svg>
            </span>
            Select all
          </ComboboxSelectAll>
          <For each={timezones}>
            {(group) => (
              <ComboboxGroup>
                <ComboboxGroupLabel>{group.label}</ComboboxGroupLabel>
                <ComboboxSelectAll>
                  {(state) =>
                    state.checked
                      ? `Clear ${group.label}`
                      : `Select all in ${group.label}`
                  }
                </ComboboxSelectAll>
                <For each={group.items}>
                  {(zone) => (
                    <ComboboxItem value={zone.value} label={zone.label}>
                      <span>
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
                      </span>
                      {zone.label}
                    </ComboboxItem>
                  )}
                </For>
              </ComboboxGroup>
            )}
          </For>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
