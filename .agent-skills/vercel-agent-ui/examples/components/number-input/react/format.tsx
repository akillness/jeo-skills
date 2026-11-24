"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
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
    label: "Price",
    defaultValue: 19.99,
    step: 0.01,
    format: { style: "currency", currency: "USD" },
  },
  {
    label: "Discount",
    defaultValue: 0.15,
    step: 0.01,
    format: { style: "percent" },
  },
  {
    label: "Weight",
    defaultValue: 2.5,
    step: 0.1,
    format: { style: "unit", unit: "kilogram" },
  },
] satisfies {
  label: string
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
        </Field>
      ))}
    </div>
  )
}

export { Example }
