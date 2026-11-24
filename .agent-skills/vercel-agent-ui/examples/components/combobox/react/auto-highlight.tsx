"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const countries = [
  { value: "ar", label: "Argentina" },
  { value: "au", label: "Australia" },
  { value: "at", label: "Austria" },
  { value: "be", label: "Belgium" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "dk", label: "Denmark" },
  { value: "fi", label: "Finland" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "gr", label: "Greece" },
  { value: "jp", label: "Japan" },
  { value: "nl", label: "Netherlands" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
  { value: "ch", label: "Switzerland" },
]

function Example() {
  return (
    <Combobox autoHighlight>
      <div data-slot="stack">
        <ComboboxLabel>Country</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Type “sw” and press Enter" />
          <ComboboxTrigger aria-label="Show countries">
            <ChevronDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No countries found.</ComboboxEmpty>
        <ComboboxList>
          {countries.map((country) => (
            <ComboboxItem
              key={country.value}
              value={country.value}
              label={country.label}
            >
              {country.label}
              <ComboboxItemIndicator>
                <CheckIcon aria-hidden="true" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
