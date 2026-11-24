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
  { value: "ca", label: "Canada" },
  { value: "dk", label: "Denmark" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "es", label: "Spain" },
]

const fields = [
  { label: "Billing country", disabled: true },
  { label: "Shipping from", readOnly: true },
  { label: "Shipping to" },
]

function Example() {
  return (
    <div data-slot="stack">
      {fields.map((field) => (
        <Field key={field.label}>
          <FieldLabel>{field.label}</FieldLabel>
          <Select
            defaultValue={field.disabled || field.readOnly ? "fr" : null}
            placeholder="Select a country"
            disabled={field.disabled}
            readOnly={field.readOnly}
          >
            <SelectTrigger>
              <SelectValue />
              <ChevronDownIcon />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem
                  key={country.value}
                  value={country.value}
                  disabled={country.value === "dk"}
                >
                  {country.label}
                  <SelectItemIndicator>
                    <CheckIcon />
                  </SelectItemIndicator>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ))}
    </div>
  )
}

export { Example }
