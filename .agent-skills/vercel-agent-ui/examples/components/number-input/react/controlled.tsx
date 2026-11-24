"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
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
  const [value, setValue] = React.useState<number | null>(4)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setValue(4)}>
          Reset to 4
        </button>
        <button type="button" onClick={() => setValue(null)}>
          Clear
        </button>
      </div>
      <Field>
        <FieldLabel>Servings</FieldLabel>
        <NumberInput
          value={value}
          onValueChange={(next, details) => {
            setValue(next)
            log(`Value ${next ?? "empty"} (${details.reason})`)
          }}
          onValueCommit={(next, details) =>
            log(`Committed ${next ?? "empty"} (${details.reason})`)
          }
          min={1}
          max={12}
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
