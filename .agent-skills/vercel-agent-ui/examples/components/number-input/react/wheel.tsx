"use client"

import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/react/number-input"
import { MinusIcon, PlusIcon } from "lucide-react"

function Example() {
  return (
    <Field>
      <FieldLabel>Font size</FieldLabel>
      <NumberInput defaultValue={16} min={8} max={72} wheel>
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
      <FieldDescription>Focus the input, then scroll over it.</FieldDescription>
    </Field>
  )
}

export { Example }
