"use client"

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
} from "@ui-sdk/react/combobox"
import { CheckIcon, MinusIcon, XIcon } from "lucide-react"

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
            {(state) =>
              (state.value as string[]).map((value, index) => (
                <ComboboxChip key={value} value={value}>
                  {state.labels[index]}
                  <ComboboxChipRemove
                    aria-label={`Remove ${state.labels[index]}`}
                  >
                    <XIcon aria-hidden="true" />
                  </ComboboxChipRemove>
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxInput placeholder="Add timezones…" />
        </ComboboxChips>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No timezones found.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxSelectAll>
            <span>
              <CheckIcon aria-hidden="true" />
              <MinusIcon aria-hidden="true" />
            </span>
            Select all
          </ComboboxSelectAll>
          {timezones.map((group) => (
            <ComboboxGroup key={group.label}>
              <ComboboxGroupLabel>{group.label}</ComboboxGroupLabel>
              <ComboboxSelectAll>
                {(state) =>
                  state.checked
                    ? `Clear ${group.label}`
                    : `Select all in ${group.label}`
                }
              </ComboboxSelectAll>
              {group.items.map((zone) => (
                <ComboboxItem
                  key={zone.value}
                  value={zone.value}
                  label={zone.label}
                >
                  <span>
                    <ComboboxItemIndicator>
                      <CheckIcon aria-hidden="true" />
                    </ComboboxItemIndicator>
                  </span>
                  {zone.label}
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
