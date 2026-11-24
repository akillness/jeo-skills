"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  createNumberInputController,
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/react/number-input"
import { MinusIcon, PlusIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [zoom] = React.useState(createNumberInputController)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => zoom.decrement({ large: true })}>
          Zoom Out
        </button>
        <button type="button" onClick={() => zoom.increment({ large: true })}>
          Zoom In
        </button>
        <button type="button" onClick={() => zoom.setValue(100)}>
          Actual Size
        </button>
        <button
          type="button"
          onClick={() => log(`Zoom is ${zoom.getValue()}%`)}
        >
          Read
        </button>
        <button type="button" onClick={() => zoom.focus()}>
          Focus
        </button>
      </div>
      <Field>
        <FieldLabel>Zoom</FieldLabel>
        <NumberInput
          defaultValue={100}
          min={10}
          max={400}
          step={10}
          format={{ style: "unit", unit: "percent" }}
          controller={zoom}
          onValueChange={(value, details) =>
            log(`Zoom ${value ?? "empty"}% (${details.reason})`)
          }
        >
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
    </div>
  )
}

export { Example }
