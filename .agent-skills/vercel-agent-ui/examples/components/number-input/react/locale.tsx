"use client"

import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import {
  NumberInput,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
  NumberInputControl,
} from "@ui-sdk/react/number-input"
import { MinusIcon, PlusIcon } from "lucide-react"

const fields = [
  {
    label: "Preis",
    locale: "de-DE",
    defaultValue: 1234.5,
    step: 0.01,
    format: { style: "currency", currency: "EUR" },
  },
  {
    label: "Budget",
    locale: "en-IN",
    defaultValue: 1234567,
    step: 1000,
    format: { style: "currency", currency: "INR", maximumFractionDigits: 0 },
  },
] satisfies {
  label: string
  locale: string
  defaultValue: number
  step: number
  format: Intl.NumberFormatOptions
}[]

function Example() {
  return (
    <div data-slot="stack">
      {fields.map(({ label, ...options }) => (
        <Field key={label}>
          <FieldLabel>{label}</FieldLabel>
          <NumberInput {...options} min={0}>
            <NumberInputGroup>
              <NumberInputDecrement aria-label="Decrease">
                <MinusIcon aria-hidden="true" />
              </NumberInputDecrement>
              <NumberInputControl />
              <NumberInputIncrement aria-label="Increase">
                <PlusIcon aria-hidden="true" />
              </NumberInputIncrement>
            </NumberInputGroup>
          </NumberInput>
          <FieldDescription>Formatted for {options.locale}.</FieldDescription>
        </Field>
      ))}
    </div>
  )
}

export { Example }
