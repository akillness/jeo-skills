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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import * as React from "react"

const countries = [
  { value: "ar", label: "Argentina", keywords: ["república argentina"] },
  { value: "au", label: "Australia" },
  { value: "at", label: "Austria", keywords: ["österreich"] },
  { value: "be", label: "Belgium", keywords: ["belgië", "belgique"] },
  { value: "br", label: "Brazil", keywords: ["brasil"] },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "dk", label: "Denmark", keywords: ["danmark"] },
  { value: "fi", label: "Finland", keywords: ["suomi"] },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany", keywords: ["deutschland"] },
  { value: "gr", label: "Greece", keywords: ["hellas", "ελλάδα"] },
  { value: "jp", label: "Japan", keywords: ["nippon", "日本"] },
  { value: "nl", label: "Netherlands", keywords: ["holland", "nederland"] },
  { value: "es", label: "Spain", keywords: ["españa"] },
  { value: "se", label: "Sweden", keywords: ["sverige"] },
  {
    value: "ch",
    label: "Switzerland",
    keywords: ["schweiz", "suisse", "svizzera"],
  },
]

function fuzzy(item: { label: string }, query: string) {
  let at = 0
  for (const char of item.label.toLowerCase()) {
    if (char === query[at]?.toLowerCase()) {
      at++
    }
  }
  return at === query.length
}

const filters = {
  contains: "contains",
  startsWith: "startsWith",
  fuzzy,
} as const
const modes = [
  { value: "contains", label: "Contains" },
  { value: "startsWith", label: "Starts with" },
  { value: "fuzzy", label: "Fuzzy" },
]
type Mode = keyof typeof filters

function Example() {
  const [mode, setMode] = React.useState<Mode>("contains")

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={modes}
          value={mode}
          onValueChange={(next) => next && setMode(next as Mode)}
        >
          <SelectLabel>Filter</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {modes.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Combobox filter={filters[mode]}>
        <div data-slot="stack">
          <ComboboxLabel>Country</ComboboxLabel>
          <div data-slot="row">
            <ComboboxInput placeholder="Try “an”, “swd” or “deutschland”" />
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
                keywords={country.keywords}
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
    </div>
  )
}

export { Example }
