"use client"

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
    <NumberInput defaultValue={1} min={0}>
      <NumberInputGroup>
        <NumberInputDecrement aria-label="Decrease">
          <MinusIcon aria-hidden="true" />
        </NumberInputDecrement>
        <NumberInputControl aria-label="Quantity" />
        <NumberInputIncrement aria-label="Increase">
          <PlusIcon aria-hidden="true" />
        </NumberInputIncrement>
      </NumberInputGroup>
    </NumberInput>
  )
}

export { Example }
