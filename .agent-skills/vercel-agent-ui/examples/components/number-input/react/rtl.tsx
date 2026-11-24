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

function Example() {
  return (
    <div dir="rtl">
      <Field>
        <FieldLabel>الكمية</FieldLabel>
        <NumberInput defaultValue={1} min={0}>
          <NumberInputGroup>
            <NumberInputDecrement aria-label="إنقاص">
              <MinusIcon aria-hidden="true" />
            </NumberInputDecrement>
            <NumberInputControl />
            <NumberInputIncrement aria-label="زيادة">
              <PlusIcon aria-hidden="true" />
            </NumberInputIncrement>
          </NumberInputGroup>
        </NumberInput>
      </Field>
    </div>
  )
}

export { Example }
