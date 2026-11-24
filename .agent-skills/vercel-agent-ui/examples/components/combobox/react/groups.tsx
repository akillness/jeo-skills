"use client"

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
} from "@ui-sdk/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import * as React from "react"

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
            <ChevronDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No cities found.</ComboboxEmpty>
        <ComboboxList>
          {timezones.map((group, index) => (
            <React.Fragment key={group.label}>
              {index > 0 && <ComboboxSeparator />}
              <ComboboxGroup>
                <ComboboxGroupLabel>{group.label}</ComboboxGroupLabel>
                {group.items.map((item) => (
                  <ComboboxItem
                    key={item.value}
                    value={item.value}
                    label={item.label}
                  >
                    {item.label}
                    <ComboboxItemIndicator>
                      <CheckIcon aria-hidden="true" />
                    </ComboboxItemIndicator>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            </React.Fragment>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
