"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const countries = [
  { value: "ar", label: "Argentina", code: "+54" },
  { value: "au", label: "Australia", code: "+61" },
  { value: "at", label: "Austria", code: "+43" },
  { value: "be", label: "Belgium", code: "+32" },
  { value: "br", label: "Brazil", code: "+55" },
  { value: "ca", label: "Canada", code: "+1" },
  { value: "dk", label: "Denmark", code: "+45" },
  { value: "fr", label: "France", code: "+33" },
  { value: "de", label: "Germany", code: "+49" },
  { value: "gr", label: "Greece", code: "+30" },
  { value: "ie", label: "Ireland", code: "+353" },
  { value: "jp", label: "Japan", code: "+81" },
  { value: "es", label: "Spain", code: "+34" },
  { value: "se", label: "Sweden", code: "+46" },
  { value: "ch", label: "Switzerland", code: "+41" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Country</FieldLabel>
      <Select defaultValue="fr">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {countries.map((country) => (
            <SelectItem
              key={country.value}
              value={country.value}
              label={country.label}
            >
              {country.label}
              <span data-slot="hint">{country.code}</span>
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
