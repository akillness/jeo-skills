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
  ComboboxItemText,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const countries = [
  { value: "ar", label: "Argentina", keywords: ["república argentina"] },
  { value: "au", label: "Australia", keywords: ["oz"] },
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

const recentCountries = [
  {
    type: "group" as const,
    label: "Recent",
    items: [countries[9], countries[12], countries[15]],
  },
]

function Example() {
  return (
    <Combobox
      items={countries}
      emptyItems={recentCountries}
      announcement={(change) =>
        change.type === "results" ? `${change.count} countries match` : null
      }
    >
      <div data-slot="stack">
        <ComboboxLabel>Country</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Search countries…" />
          <ComboboxTrigger aria-label="Show countries">
            <ChevronDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No countries found.</ComboboxEmpty>
        <ComboboxList>
          {(state) =>
            (
              state.items as (
                (typeof countries)[number] | (typeof recentCountries)[number]
              )[]
            ).map((entry) =>
              "items" in entry ? (
                <ComboboxGroup key={entry.label}>
                  <ComboboxGroupLabel>{entry.label}</ComboboxGroupLabel>
                  {entry.items.map((country) => (
                    <ComboboxItem
                      key={country.value}
                      value={country.value}
                      label={country.label}
                    >
                      <ComboboxItemText />
                      <ComboboxItemIndicator>
                        <CheckIcon aria-hidden="true" />
                      </ComboboxItemIndicator>
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              ) : (
                <ComboboxItem
                  key={entry.value}
                  value={entry.value}
                  label={entry.label}
                >
                  <ComboboxItemText />
                  <ComboboxItemIndicator>
                    <CheckIcon aria-hidden="true" />
                  </ComboboxItemIndicator>
                </ComboboxItem>
              )
            )
          }
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
