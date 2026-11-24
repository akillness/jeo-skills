"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
  NumberInputScrubArea,
  NumberInputScrubAreaCursor,
} from "@ui-sdk/react/number-input"
import { MinusIcon, MoveHorizontalIcon, PlusIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Field>
      <NumberInput
        defaultValue={1}
        min={1}
        onValueCommit={(value) => log(`Quantity ${value ?? "empty"}`)}
      >
        <NumberInputScrubArea pixelsPerStep={4}>
          <FieldLabel>Quantity</FieldLabel>
          <NumberInputScrubAreaCursor>
            <MoveHorizontalIcon aria-hidden="true" />
          </NumberInputScrubAreaCursor>
        </NumberInputScrubArea>
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
  )
}

export { Example }
