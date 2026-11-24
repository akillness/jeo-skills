"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
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

function Example() {
  return (
    <Combobox>
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
          {countries.map((country) => (
            <ComboboxItem
              key={country.value}
              value={country.value}
              label={country.label}
              keywords={country.keywords}
            >
              <ComboboxItemText>
                {(state) =>
                  state.segments.map((segment, index) =>
                    segment.match ? (
                      <mark key={index}>{segment.text}</mark>
                    ) : (
                      segment.text
                    )
                  )
                }
              </ComboboxItemText>
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
