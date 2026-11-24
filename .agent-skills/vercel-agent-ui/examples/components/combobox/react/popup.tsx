"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@ui-sdk/react/combobox"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"
import * as React from "react"

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

const countryLabel = (value: string) =>
  countries.find((country) => country.value === value)?.label ?? value

function Example() {
  const [button, setButton] = React.useState<HTMLButtonElement | null>(null)
  const [query, setQuery] = React.useState("")

  return (
    <Combobox
      defaultValue="jp"
      itemToLabel={countryLabel}
      query={query}
      onQueryChange={setQuery}
      onOpenChange={(open) => open && setQuery("")}
      onOpenChangeComplete={(open) => !open && button?.focus()}
    >
      <ComboboxTrigger ref={setButton} aria-label="Country">
        <span>
          <ComboboxValue>
            {(state) => state.label || "Select a country"}
          </ComboboxValue>
        </span>
        <ChevronDownIcon aria-hidden="true" />
      </ComboboxTrigger>
      <ComboboxContent anchor={button}>
        <div data-slot="row">
          <SearchIcon aria-hidden="true" />
          <ComboboxInput
            autoFocus
            aria-label="Search countries"
            placeholder="Search…"
          />
        </div>
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
